import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { Task } from '../models/task.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getTaskService } from './taskService.js';
import { HTTPMCPAdapter } from './httpMcpAdapter.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { TaskStepResult, TaskExecutionResult, WorkflowExecutionStatus } from '../models/taskExecution.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { MCPManager } from './mcpManager.js';
import { mcpInfoService } from './mcpInfoService.js';
import { MCPInfo } from '../models/mcp.js';

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * Task Executor Service
 * Responsible for executing MCP workflows and generating results
 */
export class TaskExecutorService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;
  private httpAdapter: HTTPMCPAdapter;
  private mcpManager: MCPManager;
  
  constructor(httpAdapter: HTTPMCPAdapter, mcpAuthService: MCPAuthService, mcpManager: MCPManager) {
    this.httpAdapter = httpAdapter;
    this.mcpAuthService = mcpAuthService;
    this.mcpManager = mcpManager;
    
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.TASK_EXECUTION_MODEL || 'gpt-4o',
      temperature: 0.3,
      // configuration: {
      //   httpAgent: agent, // ✅ 使用代理关键设置
      // },
    });
  }
  
  /**
   * Execute task workflow
   * @param taskId Task ID
   * @returns Execution result object, including execution status and summary information
   * todo Core process, focus on debugging
   */
  async executeTask(taskId: string, options: { skipAuthCheck?: boolean } = {}): Promise<{
    success: boolean;
    summary?: string;
    status: string;
    steps?: any[];
    error?: string;
  }> {
    try {
      logger.info(`🚀 Starting task execution [Task ID: ${taskId}]`);
      
      // Get task details
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`❌ Task not found [ID: ${taskId}]`);
        return {
          success: false,
          status: 'failed',
          error: 'Task not found'
        };
      }
      
      logger.info(`📋 Task details: [Title: ${task.title}, User ID: ${task.userId}]`);
      
      // Check if all required MCPs are verified
      if (!options.skipAuthCheck) {
        const allVerified = await this.mcpAuthService.checkAllMCPsVerified(taskId);
        if (!allVerified) {
          logger.error(`❌ Task execution failed: Some MCPs are not verified [Task ID: ${taskId}]`);
          await taskExecutorDao.updateTaskResult(taskId, 'failed', {
            error: 'Task execution failed: Please verify all required MCP authorizations first'
          });
          return {
            success: false,
            status: 'failed',
            error: 'Task execution failed: Please verify all required MCP authorizations first'
          };
        }
        logger.info(`✅ All MCP authorizations verified [Task ID: ${taskId}]`);
      } else {
        logger.info(`- Authorization check skipped [Task ID: ${taskId}]`);
      }
      
      // Update task status
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      logger.info(`📝 Task status updated to 'in_progress' [Task ID: ${taskId}]`);
      
      // Get task workflow
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
        logger.error(`❌ Task execution failed: No valid workflow [Task ID: ${taskId}]`);
        // Ensure using object instead of string
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: 'Task execution failed: No valid workflow, please call the task analysis API /api/task/:id/analyze first'
        });
        return {
          success: false,
          status: 'failed',
          error: 'Task execution failed: No valid workflow, please call the task analysis API /api/task/:id/analyze first'
        };
      }
      
      logger.info(`📊 Total workflow steps: ${mcpWorkflow.workflow.length} [Task ID: ${taskId}]`);
      
      // Initialize workflow results
      const workflowResults: any[] = [];
      
      // Execute workflow step by step
      let finalResult = null;
      for (const step of mcpWorkflow.workflow) {
        const stepNumber = step.step;
        const mcpName = step.mcp;
        const actionName = step.action;
        let input = step.input || task.content;

        // If input is a JSON string, try to parse it
        try {
          if (typeof input === 'string' && input.startsWith('{') && input.endsWith('}')) {
            input = JSON.parse(input);
          }
        } catch (e) {
          logger.warn(`Input for step ${stepNumber} is not a valid JSON string, will be processed as regular string: ${input}`);
        }
        
        try {
          logger.info(`Executing workflow step ${stepNumber}: ${mcpName} - ${actionName}`);
          
          // Call MCP tool
          let stepResult: any;
          try {
            stepResult = await this.callMCPTool(mcpName, actionName, input);
          } catch (error) {
            logger.error(`Step ${stepNumber} execution failed:`, error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Use DAO to record step failure result
            await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
            
            workflowResults.push({
              step: stepNumber,
              success: false,
              error: errorMsg
            });
            continue;
          }
          
          // Handle different return formats from different adapters
          const processedResult = this.processToolResult(stepResult);
          
          // Use DAO to record step success result
          await taskExecutorDao.saveStepResult(taskId, stepNumber, true, processedResult);
          
          // Record step result
          workflowResults.push({
            step: stepNumber,
            success: true,
            result: processedResult
          });
          
          // Use the last step result as final result
          if (stepNumber === mcpWorkflow.workflow.length) {
            finalResult = processedResult;
          }
        } catch (error) {
          logger.error(`Error executing step ${stepNumber}:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // Use DAO to record step failure result
          await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
          
          workflowResults.push({
            step: stepNumber,
            success: false,
            error: errorMsg
          });
        }
      }
      
      // Generate final result summary
      const resultSummary = await this.generateResultSummary(task.content, workflowResults);
      
      // Use DAO to update task result
      await taskExecutorDao.updateTaskResult(taskId, 'completed', {
        summary: resultSummary,
        steps: workflowResults,
        finalResult: finalResult
      });
      
      logger.info(`Task execution completed [Task ID: ${taskId}]`);
      return {
        success: true,
        status: 'completed',
        summary: resultSummary,
        steps: workflowResults
      };
    } catch (error) {
      logger.error(`Error occurred during task execution [Task ID: ${taskId}]:`, error);
      
      // Use DAO to update task status to failed
      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 调用MCP工具
   * 实际应用中应该调用mcpManager中的方法
   */
  private async callMCPTool(mcpName: string, toolName: string, input: any): Promise<any> {
    try {
      logger.info(`🔍 开始调用MCP工具 [MCP: ${mcpName}, 工具: ${toolName}]`);
      logger.info(`📥 MCP工具输入参数: ${JSON.stringify(input, null, 2)}`);

      console.log(`\n==== MCP调用详情 ====`);
      console.log(`时间: ${new Date().toISOString()}`);
      console.log(`MCP服务: ${mcpName}`);
      console.log(`工具名称: ${toolName}`);
      console.log(`输入参数: ${JSON.stringify(input, null, 2)}`);
      
      // 标准化MCP名称
      let actualMcpName = this.normalizeMCPName(mcpName);
      if (actualMcpName !== mcpName) {
        logger.info(`MCP名称映射: 将'${mcpName}'映射为'${actualMcpName}'`);
      }

      // 处理工具名称 - 处理中文工具名称的情况
      let actualToolName = toolName;
      if (actualMcpName === '12306-mcp') {
        // 12306-mcp工具名称映射表 - 使用连字符格式
        const toolNameMap: Record<string, string> = {
          '获取当前日期': 'get-current-date',
          '查询车站信息': 'get-stations-code-in-city',
          '查询列车时刻表': 'get-train-route-stations',
          '查询余票信息': 'get-tickets',
          '查询中转余票': 'get-interline-tickets',
          '获取城市车站代码': 'get-station-code-of-citys',
          '获取车站代码': 'get-station-code-by-names',
          '获取电报码车站信息': 'get-station-by-telecode'
        };
        
        // 映射工具名称
        if (toolNameMap[toolName]) {
          actualToolName = toolNameMap[toolName];
          logger.info(`工具名称映射: 将'${toolName}'映射为'${actualToolName}'`);
        }
      }

      // 处理参数映射和转换
      if (actualMcpName === '12306-mcp') {
        // 对于get-tickets工具，确保参数名称正确
        if (actualToolName === 'get-tickets') {
          // 检查是否存在中文参数名称，并转换为英文参数名称
          const paramMap: Record<string, string> = {
            '日期': 'date',
            '出发地': 'fromStation',
            '目的地': 'toStation',
            '出发站': 'fromStation',
            '到达站': 'toStation',
            '车次类型': 'trainFilterFlags',
            '排序方式': 'sortFlag',
            '逆序': 'sortReverse',
            '限制数量': 'limitedNum'
          };
          
          // 创建新的参数对象
          const newParams: Record<string, any> = { ...input };
          
          // 转换参数名称
          for (const key in input) {
            if (paramMap[key]) {
              newParams[paramMap[key]] = input[key];
              delete newParams[key];
            }
          }
          
          // 如果出发地和目的地是城市名而不是车站代码，需要先查询车站代码
          if (newParams.fromStation && !newParams.fromStation.match(/^[A-Z]{3}$/)) {
            try {
              // 查询出发地车站代码
              const fromStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-of-citys', {
                citys: newParams.fromStation
              });
              if (fromStationResult.content && fromStationResult.content[0].data && fromStationResult.content[0].data[0]) {
                newParams.fromStation = fromStationResult.content[0].data[0].station_code;
              }
            } catch (error: any) {
              logger.error(`查询出发地车站代码失败: ${error.message}`);
            }
          }
          
          if (newParams.toStation && !newParams.toStation.match(/^[A-Z]{3}$/)) {
            try {
              // 查询目的地车站代码
              const toStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-of-citys', {
                citys: newParams.toStation
              });
              if (toStationResult.content && toStationResult.content[0].data && toStationResult.content[0].data[0]) {
                newParams.toStation = toStationResult.content[0].data[0].station_code;
              }
            } catch (error: any) {
              logger.error(`查询目的地车站代码失败: ${error.message}`);
            }
          }
          
          // 如果没有日期参数，或者日期参数不是标准格式，添加当前日期
          if (!newParams.date || !newParams.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            try {
              const dateResult = await this.mcpManager.callTool(actualMcpName, 'get-current-date', {});
              if (dateResult.content && dateResult.content[0].text) {
                const currentDate = dateResult.content[0].text;
                
                // 处理相对日期
                if (newParams.date) {
                  const relativeDateText = newParams.date.toLowerCase();
                  if (relativeDateText.includes('明天') || relativeDateText.includes('tomorrow')) {
                    // 计算明天的日期
                    const tomorrow = new Date(currentDate);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    newParams.date = tomorrow.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                  } else if (relativeDateText.includes('后天') || relativeDateText.includes('day after tomorrow')) {
                    // 计算后天的日期
                    const dayAfterTomorrow = new Date(currentDate);
                    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
                    newParams.date = dayAfterTomorrow.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                  } else if (relativeDateText.includes('大后天')) {
                    // 计算大后天的日期
                    const threeDaysLater = new Date(currentDate);
                    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
                    newParams.date = threeDaysLater.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                  } else {
                    // 默认使用当前日期
                    newParams.date = currentDate;
                    logger.info(`无法解析日期"${relativeDateText}"，使用当前日期"${newParams.date}"`);
                  }
                } else {
                  // 如果没有日期参数，使用当前日期
                  newParams.date = currentDate;
                }
              }
            } catch (error: any) {
              logger.error(`获取当前日期失败: ${error.message}`);
            }
          }
          
          // 使用新的参数对象
          input = newParams;
        }
        
        // 对于get-train-route-stations工具，确保参数名称正确
        if (actualToolName === 'get-train-route-stations') {
          // 检查是否存在中文参数名称，并转换为英文参数名称
          const paramMap: Record<string, string> = {
            '车次': 'trainNo',
            '出发站电报码': 'fromStationTelecode',
            '到达站电报码': 'toStationTelecode',
            '出发日期': 'departDate',
            '出发地': 'fromStation',
            '目的地': 'toStation'
          };
          
          // 创建新的参数对象
          const newParams: Record<string, any> = { ...input };
          
          // 转换参数名称
          for (const key in input) {
            if (paramMap[key]) {
              newParams[paramMap[key]] = input[key];
              delete newParams[key];
            }
          }
          
          // 如果有出发地和目的地但没有电报码，需要先查询
          const fromStation = newParams.fromStation || (input as Record<string, any>)['出发地'];
          if (fromStation && !newParams.fromStationTelecode) {
            try {
              // 查询出发地电报码
              const fromStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-by-names', {
                stationNames: fromStation
              });
              if (fromStationResult.content && fromStationResult.content[0].data && fromStationResult.content[0].data[0]) {
                newParams.fromStationTelecode = fromStationResult.content[0].data[0].telecode;
              }
            } catch (error: any) {
              logger.error(`查询出发地电报码失败: ${error.message}`);
            }
          }
          
          const toStation = newParams.toStation || (input as Record<string, any>)['目的地'];
          if (toStation && !newParams.toStationTelecode) {
            try {
              // 查询目的地电报码
              const toStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-by-names', {
                stationNames: toStation
              });
              if (toStationResult.content && toStationResult.content[0].data && toStationResult.content[0].data[0]) {
                newParams.toStationTelecode = toStationResult.content[0].data[0].telecode;
              }
            } catch (error: any) {
              logger.error(`查询目的地电报码失败: ${error.message}`);
            }
          }
          
          // 如果没有出发日期参数，或者日期参数不是标准格式，添加当前日期
          if (!newParams.departDate || !newParams.departDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            try {
              const dateResult = await this.mcpManager.callTool(actualMcpName, 'get-current-date', {});
              if (dateResult.content && dateResult.content[0].text) {
                const currentDate = dateResult.content[0].text;
                
                // 处理相对日期
                if (newParams.departDate) {
                  const relativeDateText = newParams.departDate.toLowerCase();
                  if (relativeDateText.includes('明天') || relativeDateText.includes('tomorrow')) {
                    // 计算明天的日期
                    const tomorrow = new Date(currentDate);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    newParams.departDate = tomorrow.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                  } else if (relativeDateText.includes('后天') || relativeDateText.includes('day after tomorrow')) {
                    // 计算后天的日期
                    const dayAfterTomorrow = new Date(currentDate);
                    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
                    newParams.departDate = dayAfterTomorrow.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                  } else if (relativeDateText.includes('大后天')) {
                    // 计算大后天的日期
                    const threeDaysLater = new Date(currentDate);
                    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
                    newParams.departDate = threeDaysLater.toISOString().split('T')[0];
                    logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                  } else {
                    // 默认使用当前日期
                    newParams.departDate = currentDate;
                    logger.info(`无法解析日期"${relativeDateText}"，使用当前日期"${newParams.departDate}"`);
                  }
                } else {
                  // 如果没有日期参数，使用当前日期
                  newParams.departDate = currentDate;
                }
              }
            } catch (error: any) {
              logger.error(`获取当前日期失败: ${error.message}`);
            }
          }
          
          // 如果没有trainNo，无法继续
          if (!newParams.trainNo) {
            throw new Error('缺少必要参数：trainNo（车次编号）');
          }
          
          // 使用新的参数对象
          input = newParams;
        }
      }

      // 检查MCP是否已连接
      const connectedMCPs = this.mcpManager.getConnectedMCPs();
      const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
      
      // 如果未连接，尝试连接
      if (!isConnected) {
        logger.info(`MCP ${actualMcpName} 未连接，尝试连接...`);
        
        // 从predefinedMCPs获取MCP配置
        const { getPredefinedMCP } = await import('../services/predefinedMCPs.js');
        const mcpConfig = getPredefinedMCP(actualMcpName);
        
        if (!mcpConfig) {
          logger.error(`未找到MCP ${actualMcpName} 的配置信息`);
          throw new Error(`MCP ${actualMcpName} configuration not found`);
        }
        
        // 连接MCP
        const connected = await this.mcpManager.connectPredefined(mcpConfig);
        if (!connected) {
          logger.error(`连接MCP ${actualMcpName} 失败`);
          throw new Error(`Failed to connect to MCP ${actualMcpName}`);
        }
        
        logger.info(`MCP ${actualMcpName} 连接成功`);
      }

      // 使用mcpManager而不是httpAdapter调用工具
      const result = await this.mcpManager.callTool(actualMcpName, actualToolName, input);

      console.log(`\n==== MCP调用结果 ====`);
      console.log(`状态: 成功`);
      console.log(`返回数据: ${JSON.stringify(result, null, 2)}`);

      logger.info(`📤 MCP工具返回结果: ${JSON.stringify(result, null, 2)}`);
      logger.info(`✅ MCP工具调用成功 [MCP: ${mcpName}, 工具: ${toolName}]`);
      
      return result;
    } catch (error) {
      console.log(`\n==== MCP调用错误 ====`);
      console.log(`状态: 失败`);
      console.log(`错误信息: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`错误详情: ${JSON.stringify(error, null, 2)}`);

      logger.error(`❌ 调用MCP工具失败 [${mcpName}/${toolName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 处理工具返回结果
   * @param rawResult 原始返回结果
   */
  private processToolResult(rawResult: any): any {
    if (!rawResult) return null;
    
    logger.info(`🔍 处理MCP工具原始返回结果: ${JSON.stringify(rawResult, null, 2)}`);
    
    // 处理不同类型的返回结果
    let processedResult;
    if (rawResult.content) {
      if (Array.isArray(rawResult.content)) {
        // 如果是数组，转换为字符串
        processedResult = JSON.stringify(rawResult.content, null, 2);
      } else if (typeof rawResult.content === 'object') {
        // 如果是对象，检查是否有 text 字段
        if (rawResult.content.text) {
          processedResult = rawResult.content.text;
        } else {
          processedResult = JSON.stringify(rawResult.content, null, 2);
        }
      } else {
        processedResult = String(rawResult.content);
      }
    } else {
      processedResult = JSON.stringify(rawResult, null, 2);
    }
    
    logger.info(`📤 MCP工具处理后结果: ${processedResult}`);
    return processedResult;
  }
  
  /**
   * 生成任务结果摘要
   * @param taskContent 任务内容
   * @param stepResults 步骤结果
   */
  private async generateResultSummary(taskContent: string, stepResults: any[]): Promise<string> {
    try {
      logger.info('生成任务结果摘要');
      
      // 计算成功和失败步骤数
      const successSteps = stepResults.filter(step => step.success).length;
      const failedSteps = stepResults.length - successSteps;
      
      // 准备步骤结果详情
      const stepDetails = stepResults.map(step => {
        if (step.success) {
          return `步骤${step.step}: 成功执行 - ${typeof step.result === 'string' && step.result.length > 100 ? 
            step.result.substring(0, 100) + '...' : step.result}`;
        } else {
          return `步骤${step.step}: 执行失败 - ${step.error}`;
        }
      }).join('\n');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional task summary specialist responsible for summarizing complex workflow execution results into detailed yet easy-to-understand reports.
Please generate a comprehensive report based on the original task requirements and execution results, including the following:

1. Task execution overview - total steps, successful steps, failed steps
2. Successfully completed operations and results achieved
3. If any steps failed, detailed explanation of the failure reasons and impacts
4. Overall task outcomes and value
5. Recommendations for the user (if applicable)

Please note that this summary will be presented directly to the user and should use friendly language and formatting to ensure the user understands the complete process and results of the task execution.
Avoid technical jargon while maintaining professionalism and accuracy. Please especially emphasize the value and outcomes the task has delivered to the user.`),
        new HumanMessage(`Task content: ${taskContent}

Execution statistics:
- Total steps: ${stepResults.length}
- Successful steps: ${successSteps}
- Failed steps: ${failedSteps}

Step details:
${stepDetails}

Based on the above task execution information, please generate a complete execution report, focusing on what this task has done for the user and what specific outcomes have been achieved.`)
      ]);
      
      return response.content.toString();
    } catch (error) {
      logger.error('生成结果摘要失败:', error);
      return `任务执行完成，共执行了${stepResults.length}个步骤，成功${stepResults.filter(s => s.success).length}个，失败${stepResults.filter(s => !s.success).length}个。请查看详细的步骤结果了解更多信息。`;
    }
  }

  /**
   * 流式执行任务工作流
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送执行结果
   * @returns 是否执行成功
   */
  async executeTaskStream(taskId: string, stream: (data: any) => void): Promise<boolean> {
    try {
      logger.info(`🚀 开始流式执行任务 [任务ID: ${taskId}]`);
      
      // 发送执行开始信息
      stream({ 
        event: 'execution_start', 
        data: { taskId, timestamp: new Date().toISOString() } 
      });
      
      // 获取任务详情
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`❌ 任务不存在 [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: '任务不存在' } });
        return false;
      }
      
      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });
      
      // 获取任务的工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
        logger.error(`❌ 任务执行失败: 没有有效的工作流 [任务ID: ${taskId}]`);
        
        stream({ 
          event: 'error', 
          data: { 
            message: '任务执行失败: 没有有效的工作流',
            details: '请先调用任务分析接口 /api/task/:id/analyze'
          } 
        });
        
        // 更新任务状态为失败
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: '任务执行失败: 没有有效的工作流, 请先调用任务分析接口'
        });
        
        return false;
      }
      
      // 初始化工作流结果
      const workflowResults: any[] = [];
      
      // 检查 mcpManager 是否已初始化
      if (!this.mcpManager) {
        logger.error(`❌ mcpManager 未初始化，无法执行任务 [任务ID: ${taskId}]`);
        stream({ 
          event: 'error', 
          data: { 
            message: '任务执行失败: MCP管理器未初始化',
            details: '服务器配置错误，请联系管理员'
          } 
        });
        
        // 更新任务状态为失败
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: '任务执行失败: MCP管理器未初始化'
        });
        
        return false;
      }
      
      // 分步执行工作流
      let finalResult = null;
      for (const step of mcpWorkflow.workflow) {
        const stepNumber = step.step;
        const mcpName = step.mcp;
        const actionName = step.action;
        let input = step.input || task.content;
        
        // 如果input是JSON字符串，尝试解析它
        try {
          if (typeof input === 'string' && input.startsWith('{') && input.endsWith('}')) {
            input = JSON.parse(input);
          }
        } catch (e) {
          logger.warn(`步骤 ${stepNumber} 的输入不是有效的JSON字符串，将作为普通字符串处理: ${input}`);
        }
        
        // 发送步骤开始信息
        stream({ 
          event: 'step_start', 
          data: { 
            step: stepNumber,
            mcpName,
            actionName,
            input: typeof input === 'object' ? JSON.stringify(input) : input
          } 
        });
        
        try {
          logger.info(`执行工作流步骤${stepNumber}: ${mcpName} - ${actionName}`);
          
          // 标准化MCP名称
          let actualMcpName = this.normalizeMCPName(mcpName);
          if (actualMcpName !== mcpName) {
            logger.info(`流式执行中的MCP名称映射: 将'${mcpName}'映射为'${actualMcpName}'`);
          }
          
          // 处理工具名称 - 处理中文工具名称的情况
          let actualActionName = actionName;
          if (actualMcpName === '12306-mcp') {
            // 12306-mcp工具名称映射表 - 使用连字符格式
            const toolNameMap: Record<string, string> = {
              '获取当前日期': 'get-current-date',
              '查询车站信息': 'get-stations-code-in-city',
              '查询列车时刻表': 'get-train-route-stations',
              '查询余票信息': 'get-tickets',
              '查询中转余票': 'get-interline-tickets',
              '获取城市车站代码': 'get-station-code-of-citys',
              '获取车站代码': 'get-station-code-by-names',
              '获取电报码车站信息': 'get-station-by-telecode'
            };
            
            // 映射工具名称
            if (toolNameMap[actionName]) {
              actualActionName = toolNameMap[actionName];
              logger.info(`流式执行中的工具名称映射: 将'${actionName}'映射为'${actualActionName}'`);
            }
          }
          
          // 处理参数映射和转换
          if (actualMcpName === '12306-mcp') {
            // 对于get-tickets工具，确保参数名称正确
            if (actualActionName === 'get-tickets') {
              // 检查是否存在中文参数名称，并转换为英文参数名称
              const paramMap: Record<string, string> = {
                '日期': 'date',
                '出发地': 'fromStation',
                '目的地': 'toStation',
                '出发站': 'fromStation',
                '到达站': 'toStation',
                '车次类型': 'trainFilterFlags',
                '排序方式': 'sortFlag',
                '逆序': 'sortReverse',
                '限制数量': 'limitedNum'
              };
              
              // 创建新的参数对象
              const newParams: Record<string, any> = { ...input };
              
              // 转换参数名称
              for (const key in input) {
                if (paramMap[key]) {
                  newParams[paramMap[key]] = input[key];
                  delete newParams[key];
                }
              }
              
              // 如果出发地和目的地是城市名而不是车站代码，需要先查询车站代码
              if (newParams.fromStation && !newParams.fromStation.match(/^[A-Z]{3}$/)) {
                try {
                  // 查询出发地车站代码
                  const fromStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-of-citys', {
                    citys: newParams.fromStation
                  });
                  if (fromStationResult.content && fromStationResult.content[0].data && fromStationResult.content[0].data[0]) {
                    newParams.fromStation = fromStationResult.content[0].data[0].station_code;
                  }
                } catch (error: any) {
                  logger.error(`查询出发地车站代码失败: ${error.message}`);
                }
              }
              
              if (newParams.toStation && !newParams.toStation.match(/^[A-Z]{3}$/)) {
                try {
                  // 查询目的地车站代码
                  const toStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-of-citys', {
                    citys: newParams.toStation
                  });
                  if (toStationResult.content && toStationResult.content[0].data && toStationResult.content[0].data[0]) {
                    newParams.toStation = toStationResult.content[0].data[0].station_code;
                  }
                } catch (error: any) {
                  logger.error(`查询目的地车站代码失败: ${error.message}`);
                }
              }
              
              // 如果没有日期参数，或者日期参数不是标准格式，添加当前日期
              if (!newParams.date || !newParams.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                try {
                  const dateResult = await this.mcpManager.callTool(actualMcpName, 'get-current-date', {});
                  if (dateResult.content && dateResult.content[0].text) {
                    const currentDate = dateResult.content[0].text;
                    
                    // 处理相对日期
                    if (newParams.date) {
                      const relativeDateText = newParams.date.toLowerCase();
                      if (relativeDateText.includes('明天') || relativeDateText.includes('tomorrow')) {
                        // 计算明天的日期
                        const tomorrow = new Date(currentDate);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        newParams.date = tomorrow.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                      } else if (relativeDateText.includes('后天') || relativeDateText.includes('day after tomorrow')) {
                        // 计算后天的日期
                        const dayAfterTomorrow = new Date(currentDate);
                        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
                        newParams.date = dayAfterTomorrow.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                      } else if (relativeDateText.includes('大后天')) {
                        // 计算大后天的日期
                        const threeDaysLater = new Date(currentDate);
                        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
                        newParams.date = threeDaysLater.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.date}"`);
                      } else {
                        // 默认使用当前日期
                        newParams.date = currentDate;
                        logger.info(`无法解析日期"${relativeDateText}"，使用当前日期"${newParams.date}"`);
                      }
                    } else {
                      // 如果没有日期参数，使用当前日期
                      newParams.date = currentDate;
                    }
                  }
                } catch (error: any) {
                  logger.error(`获取当前日期失败: ${error.message}`);
                }
              }
              
              // 使用新的参数对象
              input = newParams;
            }
            
            // 对于get-train-route-stations工具，确保参数名称正确
            if (actualActionName === 'get-train-route-stations') {
              // 检查是否存在中文参数名称，并转换为英文参数名称
              const paramMap: Record<string, string> = {
                '车次': 'trainNo',
                '出发站电报码': 'fromStationTelecode',
                '到达站电报码': 'toStationTelecode',
                '出发日期': 'departDate',
                '出发地': 'fromStation',
                '目的地': 'toStation'
              };
              
              // 创建新的参数对象
              const newParams: Record<string, any> = { ...input };
              
              // 转换参数名称
              for (const key in input) {
                if (paramMap[key]) {
                  newParams[paramMap[key]] = input[key];
                  delete newParams[key];
                }
              }
              
              // 如果有出发地和目的地但没有电报码，需要先查询
              const fromStation = newParams.fromStation || (input as Record<string, any>)['出发地'];
              if (fromStation && !newParams.fromStationTelecode) {
                try {
                  // 查询出发地电报码
                  const fromStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-by-names', {
                    stationNames: fromStation
                  });
                  if (fromStationResult.content && fromStationResult.content[0].data && fromStationResult.content[0].data[0]) {
                    newParams.fromStationTelecode = fromStationResult.content[0].data[0].telecode;
                  }
                } catch (error: any) {
                  logger.error(`查询出发地电报码失败: ${error.message}`);
                }
              }
              
              const toStation = newParams.toStation || (input as Record<string, any>)['目的地'];
              if (toStation && !newParams.toStationTelecode) {
                try {
                  // 查询目的地电报码
                  const toStationResult = await this.mcpManager.callTool(actualMcpName, 'get-station-code-by-names', {
                    stationNames: toStation
                  });
                  if (toStationResult.content && toStationResult.content[0].data && toStationResult.content[0].data[0]) {
                    newParams.toStationTelecode = toStationResult.content[0].data[0].telecode;
                  }
                } catch (error: any) {
                  logger.error(`查询目的地电报码失败: ${error.message}`);
                }
              }
              
              // 如果没有出发日期参数，或者日期参数不是标准格式，添加当前日期
              if (!newParams.departDate || !newParams.departDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                try {
                  const dateResult = await this.mcpManager.callTool(actualMcpName, 'get-current-date', {});
                  if (dateResult.content && dateResult.content[0].text) {
                    const currentDate = dateResult.content[0].text;
                    
                    // 处理相对日期
                    if (newParams.departDate) {
                      const relativeDateText = newParams.departDate.toLowerCase();
                      if (relativeDateText.includes('明天') || relativeDateText.includes('tomorrow')) {
                        // 计算明天的日期
                        const tomorrow = new Date(currentDate);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        newParams.departDate = tomorrow.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                      } else if (relativeDateText.includes('后天') || relativeDateText.includes('day after tomorrow')) {
                        // 计算后天的日期
                        const dayAfterTomorrow = new Date(currentDate);
                        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
                        newParams.departDate = dayAfterTomorrow.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                      } else if (relativeDateText.includes('大后天')) {
                        // 计算大后天的日期
                        const threeDaysLater = new Date(currentDate);
                        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
                        newParams.departDate = threeDaysLater.toISOString().split('T')[0];
                        logger.info(`将相对日期"${relativeDateText}"转换为"${newParams.departDate}"`);
                      } else {
                        // 默认使用当前日期
                        newParams.departDate = currentDate;
                        logger.info(`无法解析日期"${relativeDateText}"，使用当前日期"${newParams.departDate}"`);
                      }
                    } else {
                      // 如果没有日期参数，使用当前日期
                      newParams.departDate = currentDate;
                    }
                  }
                } catch (error: any) {
                  logger.error(`获取当前日期失败: ${error.message}`);
                }
              }
              
              // 如果没有trainNo，无法继续
              if (!newParams.trainNo) {
                throw new Error('缺少必要参数：trainNo（车次编号）');
              }
              
              // 使用新的参数对象
              input = newParams;
            }
          }
          
          // 检查MCP是否已连接
          const connectedMCPs = this.mcpManager.getConnectedMCPs();
          const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
          
          // 如果未连接，尝试连接
          if (!isConnected) {
            logger.info(`流式执行: MCP ${actualMcpName} 未连接，尝试连接...`);
            
            // 从predefinedMCPs获取MCP配置
            const { getPredefinedMCP } = await import('../services/predefinedMCPs.js');
            const mcpConfig = getPredefinedMCP(actualMcpName);
            
            if (!mcpConfig) {
              logger.error(`未找到MCP ${actualMcpName} 的配置信息`);
              throw new Error(`MCP ${actualMcpName} configuration not found`);
            }
            
            // 连接MCP
            const connected = await this.mcpManager.connectPredefined(mcpConfig);
            if (!connected) {
              logger.error(`连接MCP ${actualMcpName} 失败`);
              throw new Error(`Failed to connect to MCP ${actualMcpName}`);
            }
            
            logger.info(`MCP ${actualMcpName} 连接成功`);
            
            // 发送MCP连接成功消息
            stream({ 
              event: 'mcp_connected', 
              data: { 
                mcpName: actualMcpName,
                message: `成功连接到 ${actualMcpName} 服务`
              } 
            });
          }
          
          // 确保输入是对象类型
          const inputObj = typeof input === 'string' ? { text: input } : input;
          
          // 调用MCP工具
          const stepResult = await this.mcpManager.callTool(actualMcpName, actualActionName, inputObj);
          
          // 处理不同适配器可能有的不同返回格式
          const processedResult = this.processToolResult(stepResult);
          
          // 使用DAO记录步骤成功结果
          await taskExecutorDao.saveStepResult(taskId, stepNumber, true, processedResult);
          
          // 记录步骤结果
          workflowResults.push({
            step: stepNumber,
            success: true,
            result: processedResult
          });
          
          // 发送步骤完成信息
          stream({ 
            event: 'step_complete', 
            data: { 
              step: stepNumber,
              success: true,
              result: processedResult
            } 
          });
          
          // 最后一步的结果作为最终结果
          if (stepNumber === mcpWorkflow.workflow.length) {
            finalResult = processedResult;
          }
        } catch (error) {
          logger.error(`步骤${stepNumber}执行出错:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // 使用DAO记录步骤失败结果
          await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
          
          workflowResults.push({
            step: stepNumber,
            success: false,
            error: errorMsg
          });
          
          // 发送步骤错误信息
          stream({ 
            event: 'step_error', 
            data: { 
              step: stepNumber,
              error: errorMsg
            } 
          });
        }
      }
      
      // 生成结果摘要，使用流式生成
      stream({ event: 'generating_summary', data: { message: '正在生成结果摘要...' } });
      await this.generateResultSummaryStream(task.content, workflowResults, (summaryChunk) => {
        stream({ 
          event: 'summary_chunk', 
          data: { content: summaryChunk } 
        });
      });
      
      // 工作流完成
      stream({ 
        event: 'workflow_complete', 
        data: { 
          success: true,
          message: '任务执行完成'
        }
      });
      
      // 更新任务状态为完成
      await taskExecutorDao.updateTaskResult(taskId, 'completed', {
        summary: '任务执行完成',
        steps: workflowResults,
        finalResult
      });
      
      // 发送任务完成信息
      stream({ event: 'task_complete', data: { taskId } });
      
      logger.info(`任务执行完成 [任务ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`任务执行过程中发生错误 [任务ID: ${taskId}]:`, error);
      
      // 使用DAO更新任务状态为失败
      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 发送错误信息
      stream({ 
        event: 'error', 
        data: { 
          message: '任务执行失败', 
          details: error instanceof Error ? error.message : String(error)
        } 
      });
      
      return false;
    }
  }
  
  /**
   * 流式生成结果摘要
   * @param taskContent 任务内容
   * @param stepResults 步骤结果
   * @param streamCallback 流式回调函数
   */
  private async generateResultSummaryStream(
    taskContent: string, 
    stepResults: any[], 
    streamCallback: (chunk: string) => void
  ): Promise<void> {
    try {
      logger.info('流式生成任务结果摘要');
      
      // 计算成功和失败步骤数
      const successSteps = stepResults.filter(step => step.success).length;
      const failedSteps = stepResults.length - successSteps;
      
      // 准备步骤结果详情
      const stepDetails = stepResults.map(step => {
        if (step.success) {
          return `步骤${step.step}: 成功执行 - ${typeof step.result === 'string' && step.result.length > 100 ? 
            step.result.substring(0, 100) + '...' : step.result}`;
        } else {
          return `步骤${step.step}: 执行失败 - ${step.error}`;
        }
      }).join('\n');
      
      // 创建流式LLM实例
      const streamingLlm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: process.env.TASK_EXECUTION_MODEL || 'gpt-4o',
        temperature: 0.3,
        streaming: true,
        // configuration: {
        //   httpAgent: agent, // ✅ 使用代理关键设置
        // },
      });
      
      // 创建消息
      const messages = [
        new SystemMessage(`You are a professional task summary specialist responsible for summarizing complex workflow execution results into detailed yet easy-to-understand reports.
Please generate a comprehensive report based on the original task requirements and execution results, including the following:

1. Task execution overview - total steps, successful steps, failed steps
2. Successfully completed operations and results achieved
3. If any steps failed, detailed explanation of the failure reasons and impacts
4. Overall task outcomes and value
5. Recommendations for the user (if applicable)

Please note that this summary will be presented directly to the user and should use friendly language and formatting to ensure the user understands the complete process and results of the task execution.
Avoid technical jargon while maintaining professionalism and accuracy. Please especially emphasize the value and outcomes the task has delivered to the user.`),
        new HumanMessage(`Task content: ${taskContent}

Execution statistics:
- Total steps: ${stepResults.length}
- Successful steps: ${successSteps}
- Failed steps: ${failedSteps}

Step details:
${stepDetails}

Based on the above task execution information, please generate a complete execution report, focusing on what this task has done for the user and what specific outcomes have been achieved.`)
      ];
      
      // 获取流
      const stream = await streamingLlm.stream(messages);
      
      // 处理流的内容
      for await (const chunk of stream) {
        if (chunk.content) {
          // 修复类型错误，确保内容为字符串
          const chunkText = typeof chunk.content === 'string' 
            ? chunk.content 
            : JSON.stringify(chunk.content);
          
          streamCallback(chunkText);
        }
      }
    } catch (error) {
      logger.error('流式生成结果摘要失败:', error);
      streamCallback(`任务执行完成，共执行了${stepResults.length}个步骤，成功${stepResults.filter(s => s.success).length}个，失败${stepResults.filter(s => !s.success).length}个。请查看详细的步骤结果了解更多信息。`);
    }
  }

  /**
   * 映射MCP名称，确保名称一致性
   * @param mcpName 原始MCP名称
   * @returns 标准化的MCP名称
   */
  private normalizeMCPName(mcpName: string): string {
    // MCP名称映射表 - 与mcpInfoService中的名称保持一致
    const mcpNameMap: Record<string, string> = {
      'playwright-mcp-service': 'playwright',
      'coingecko-server': 'coingecko-mcp',
      'coingecko-mcp-service': 'coingecko-mcp',
      'x-mcp-server': 'x-mcp',
      'github-mcp-server': 'github',
      'evm-mcp-server': 'evm-mcp',
      'evm-mcp-service': 'evm-mcp',
      'dune-mcp-server': 'dune-mcp',
      'coinmarketcap-mcp-service': 'coinmarketcap-mcp',
      'defillama-mcp-service': 'mcp-server-defillama',
      'rug-check-mcp-service': 'rug-check-mcp',
      'chainlink-feeds-mcp-service': 'chainlink-feeds-mcp',
      'crypto-feargreed-mcp-service': 'crypto-feargreed-mcp',
      'whale-tracker-mcp-service': 'whale-tracker-mcp',
      'dexscreener-mcp-service': 'dexscreener-mcp',
      '12306-mcp-service': '12306-mcp'
    };
    
    // 尝试在mcpInfoService中查找MCP
    const allMcps = mcpInfoService.getAllMCPs();
    const exactMatch = allMcps.find((mcp: any) => mcp.name === mcpName);
    if (exactMatch) {
      return mcpName; // 如果在mcpInfoService中找到完全匹配，直接返回
    }
    
    // 否则使用映射表
    return mcpNameMap[mcpName] || mcpName;
  }
} 