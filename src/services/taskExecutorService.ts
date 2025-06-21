import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { Task } from '../models/task.js';
import { MCPManager } from './mcpManager.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getTaskService } from './taskService.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { OfficialMCPAdapter } from './officialMcpAdapter.js';
import { SimpleMCPAdapter } from './simpleMcpAdapter.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { TaskStepResult, TaskExecutionResult, WorkflowExecutionStatus } from '../models/taskExecution.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * 任务执行器服务
 * 负责执行MCP工作流并生成结果
 */
export class TaskExecutorService {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpAuthService: MCPAuthService;
  private mcpAdapter: MCPToolAdapter | OfficialMCPAdapter | SimpleMCPAdapter;
  
  constructor(mcpManager: MCPManager, mcpAuthService: MCPAuthService) {
    this.mcpManager = mcpManager;
    this.mcpAuthService = mcpAuthService;
    
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.TASK_EXECUTION_MODEL || 'gpt-4o',
      temperature: 0.3,
      configuration: {
        httpAgent: agent, // ✅ 使用代理关键设置
      },
    });
    
    // 根据环境选择适配器
    const adapterType = process.env.MCP_ADAPTER_TYPE || 'simple';
    
    if (adapterType === 'simple') {
      // 使用SimpleMCPAdapter，它会根据环境自动选择stdio或HTTP模式
      this.mcpAdapter = new SimpleMCPAdapter();
      logger.info('TaskExecutorService使用SimpleMCPAdapter，自动选择适当模式');
    } else if (adapterType === 'official') {
      // 使用官方适配器
      this.mcpAdapter = new OfficialMCPAdapter(mcpManager);
      logger.info('TaskExecutorService使用OfficialMCPAdapter');
    } else {
      // 使用默认适配器
      this.mcpAdapter = new MCPToolAdapter(mcpManager);
      logger.info('TaskExecutorService使用MCPToolAdapter');
    }
  }
  
  /**
   * 执行任务工作流
   * @param taskId 任务ID
   * @returns 是否执行成功
   * todo 核心流程，重点思考调试
   */
  async executeTask(taskId: string): Promise<boolean> {
    try {
      logger.info(`🚀 开始执行任务 [任务ID: ${taskId}]`);
      
      // 获取任务详情
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`❌ 任务不存在 [ID: ${taskId}]`);
        return false;
      }
      
      logger.info(`📋 任务详情: [标题: ${task.title}, 用户ID: ${task.userId}]`);
      
      // 检查是否所有需要授权的MCP都已验证
      // todo 检查是否冗余
      const allVerified = await this.mcpAuthService.checkAllMCPsVerified(taskId);
      if (!allVerified) {
        logger.error(`❌ 任务执行失败: 有MCP未验证授权 [任务ID: ${taskId}]`);
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: '任务执行失败: 请先验证所有必要的MCP授权'
        });
        return false;
      }
      
      logger.info(`✅ 所有MCP授权已验证 [任务ID: ${taskId}]`);
      
      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      logger.info(`📝 任务状态已更新为 'in_progress' [任务ID: ${taskId}]`);
      
      // 获取任务的工作流
      const mcpWorkflow = task.mcpWorkflow;
      if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
        logger.error(`❌ 任务执行失败: 没有有效的工作流 [任务ID: ${taskId}]`);
        // 确保使用对象而非字符串
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: '任务执行失败: 没有有效的工作流, 请先调用任务分析接口 /api/task/:id/analyze'
        });
        return false;
      }
      
      logger.info(`📊 工作流步骤总数: ${mcpWorkflow.workflow.length} [任务ID: ${taskId}]`);
      
      // 初始化工作流结果
      const workflowResults: any[] = [];
      
      // 连接所有工作流中用到的MCP
      const mcpsToConnect = new Set(mcpWorkflow.workflow.map(step => step.mcp));
      logger.info(`🔌 需要连接的MCP: ${Array.from(mcpsToConnect).join(', ')} [任务ID: ${taskId}]`);
      
      const connectedMCPs: Record<string, boolean> = {};
      
      // 根据适配器类型处理MCP连接
      if (this.mcpAdapter instanceof SimpleMCPAdapter) {
        logger.info(`🔄 使用SimpleMCPAdapter连接MCP [模式: ${(this.mcpAdapter as SimpleMCPAdapter).getStats().mode}]`);
        // SimpleMCPAdapter会自动处理连接
        for (const mcpName of mcpsToConnect) {
          try {
            // 获取该MCP的授权信息
            const authData = await this.mcpAuthService.getUserMCPAuth(task.userId, mcpName);
            if (authData && authData.isVerified) {
              logger.info(`🔑 获取到MCP授权数据 [MCP: ${mcpName}]`);
              // 构建授权参数
              const authArgs: string[] = [];
              const authEnv: Record<string, string> = {};
              
              if (authData.authData) {
                // 将授权数据转换为命令行参数和环境变量
                for (const [key, value] of Object.entries(authData.authData)) {
                  if (key.includes('TOKEN') || key.includes('KEY')) {
                    authEnv[key] = value; // 敏感信息放入环境变量
                    logger.info(`🔐 添加敏感授权环境变量 [MCP: ${mcpName}, 键: ${key}]`);
                  } else {
                    authArgs.push(`--${key.toLowerCase()}`, value); // 普通参数作为命令行参数
                    logger.info(`🔧 添加授权命令行参数 [MCP: ${mcpName}, 参数: --${key.toLowerCase()}]`);
                  }
                }
              }
              
              // 使用SimpleMCPAdapter连接MCP
              logger.info(`🔌 开始连接MCP [MCP: ${mcpName}]`);
              await this.mcpAdapter.connectMCP(mcpName.toLowerCase(), `path/to/${mcpName.toLowerCase()}-mcp`, authArgs, authEnv);
              connectedMCPs[mcpName] = true;
              logger.info(`✅ MCP连接成功 [MCP: ${mcpName}]`);
            }
          } catch (error) {
            logger.error(`❌ 连接MCP失败 [MCP: ${mcpName}]:`, error);
            connectedMCPs[mcpName] = false;
          }
        }
      } else {
        logger.info(`🔄 使用传统MCPManager连接MCP`);
        // 使用传统的MCPManager连接
        for (const mcpName of mcpsToConnect) {
          try {
            // 获取该MCP的授权信息
            const authData = await this.mcpAuthService.getUserMCPAuth(task.userId, mcpName);
            if (authData && authData.isVerified) {
              logger.info(`🔑 获取到MCP授权数据 [MCP: ${mcpName}]`);
              // 构建授权参数
              const authArgs: string[] = [];
              const authEnv: Record<string, string> = {};
              
              if (authData.authData) {
                // 将授权数据转换为命令行参数和环境变量
                for (const [key, value] of Object.entries(authData.authData)) {
                  if (key.includes('TOKEN') || key.includes('KEY')) {
                    authEnv[key] = value; // 敏感信息放入环境变量
                    logger.info(`🔐 添加敏感授权环境变量 [MCP: ${mcpName}, 键: ${key}]`);
                  } else {
                    authArgs.push(`--${key.toLowerCase()}`, value); // 普通参数作为命令行参数
                    logger.info(`🔧 添加授权命令行参数 [MCP: ${mcpName}, 参数: --${key.toLowerCase()}]`);
                  }
                }
              }
              
              // 连接MCP
              logger.info(`🔌 开始连接MCP [MCP: ${mcpName}]`);
              await this.mcpManager.connect(mcpName.toLowerCase(), `path/to/${mcpName.toLowerCase()}-mcp`, authArgs, authEnv);
              connectedMCPs[mcpName] = true;
              logger.info(`✅ MCP连接成功 [MCP: ${mcpName}]`);
            }
          } catch (error) {
            logger.error(`❌ 连接MCP失败 [MCP: ${mcpName}]:`, error);
            connectedMCPs[mcpName] = false;
          }
        }
      }
      
      // 分步执行工作流
      let finalResult = null;
      for (const step of mcpWorkflow.workflow) {
        const stepNumber = step.step;
        const mcpName = step.mcp;
        const actionName = step.action;
        const input = step.input || task.content;
        
        // 检查MCP是否已连接
        if (!connectedMCPs[mcpName]) {
          const errorMsg = `步骤${stepNumber}执行失败: MCP ${mcpName} 未连接`;
          logger.error(errorMsg);
          
          // 使用DAO记录步骤失败结果
          await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
          
          workflowResults.push({
            step: stepNumber,
            success: false,
            error: errorMsg
          });
          continue;
        }
        
        try {
          logger.info(`执行工作流步骤${stepNumber}: ${mcpName} - ${actionName}`);
          
          // 调用MCP工具
          let stepResult: any;
          try {
            stepResult = await this.callMCPTool(mcpName, actionName, input);
          } catch (error) {
            logger.error(`步骤${stepNumber}执行失败:`, error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // 使用DAO记录步骤失败结果
            await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
            
            workflowResults.push({
              step: stepNumber,
              success: false,
              error: errorMsg
            });
            continue;
          }
          
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
        }
      }
      
      // 生成最终结果摘要
      const resultSummary = await this.generateResultSummary(task.content, workflowResults);
      
      // 使用DAO更新任务结果
      await taskExecutorDao.updateTaskResult(taskId, 'completed', {
        summary: resultSummary,
        steps: workflowResults,
        finalResult: finalResult
      });
      
      logger.info(`任务执行完成 [任务ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`任务执行过程中发生错误 [任务ID: ${taskId}]:`, error);
      
      // 使用DAO更新任务状态为失败
      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return false;
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

      let result;
      // 根据适配器类型调用不同的方法
      if (this.mcpAdapter instanceof SimpleMCPAdapter) {
        // 使用SimpleMCPAdapter的callMCPTool方法
        logger.info(`🔄 使用SimpleMCPAdapter调用MCP工具 [模式: ${(this.mcpAdapter as SimpleMCPAdapter).getStats().mode}]`);
        result = await this.mcpAdapter.callMCPTool(mcpName.toLowerCase(), toolName, input);
      } else if (this.mcpAdapter instanceof OfficialMCPAdapter) {
        // 对于官方适配器，仍然使用MCPManager
        logger.info(`🔄 使用OfficialMCPAdapter调用MCP工具`);
        result = await this.mcpManager.callTool(mcpName.toLowerCase(), toolName, input);
      } else {
        // 默认使用MCPManager
        logger.info(`🔄 使用MCPManager调用MCP工具`);
        result = await this.mcpManager.callTool(mcpName.toLowerCase(), toolName, input);
      }

      logger.info(`📤 MCP工具返回结果: ${JSON.stringify(result, null, 2)}`);
      logger.info(`✅ MCP工具调用成功 [MCP: ${mcpName}, 工具: ${toolName}]`);
      
      return result;
    } catch (error) {
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
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位专业的任务总结工作者，你的职责是将复杂的工作流执行结果总结为简洁明了的摘要。
请根据原始任务需求和执行结果，生成一个全面但简洁的摘要，突出以下几点：
1. 任务是否成功完成
2. 主要成果和发现
3. 如果有任何步骤失败，简要说明失败原因
4. 整体结论和建议（如适用）

请使用清晰、专业的语言，避免技术术语，确保用户容易理解。`),
        new SystemMessage(`工作流执行结果：${JSON.stringify(stepResults, null, 2)}`),
        new HumanMessage(taskContent)
      ]);
      
      return response.content.toString();
    } catch (error) {
      logger.error('生成结果摘要失败:', error);
      return '无法生成结果摘要，请查看详细的步骤结果。';
    }
  }

  /**
   * 流式执行任务工作流
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送进度和结果
   * @returns 是否执行成功
   */
  async executeTaskStream(taskId: string, stream: (data: any) => void): Promise<boolean> {
    try {
      logger.info(`开始流式执行任务 [任务ID: ${taskId}]`);
      
      // 发送任务开始信息
      stream({ 
        event: 'task_start', 
        data: { taskId, timestamp: new Date().toISOString() } 
      });
      
      // 获取任务详情
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`任务不存在 [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: '任务不存在' } });
        return false;
      }
      
      // 检查是否所有需要授权的MCP都已验证
      const allVerified = await this.mcpAuthService.checkAllMCPsVerified(taskId);
      if (!allVerified) {
        const errorMsg = '任务执行失败: 有MCP未验证授权';
        logger.error(`${errorMsg} [任务ID: ${taskId}]`);
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: errorMsg
        });
        stream({ event: 'error', data: { message: errorMsg } });
        return false;
      }
      
      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });
      
      // 获取任务的工作流
      const mcpWorkflow = task.mcpWorkflow;
      if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
        const errorMsg = '任务执行失败: 没有有效的工作流, 请先调用任务分析接口 /api/task/:id/analyze';
        logger.error(`任务执行失败: 没有有效的工作流 [任务ID: ${taskId}]`);
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: errorMsg
        });
        stream({ event: 'error', data: { message: errorMsg } });
        return false;
      }
      
      // 初始化工作流结果
      const workflowResults: any[] = [];
      
      // 连接所有工作流中用到的MCP
      stream({ event: 'connecting_mcps', data: { message: '正在连接MCP工具...' } });
      
      const mcpsToConnect = new Set(mcpWorkflow.workflow.map(step => step.mcp));
      const connectedMCPs: Record<string, boolean> = {};
      
      for (const mcpName of mcpsToConnect) {
        try {
          // 获取该MCP的授权信息
          const authData = await this.mcpAuthService.getUserMCPAuth(task.userId, mcpName);
          if (authData && authData.isVerified) {
            stream({ 
              event: 'mcp_connecting', 
              data: { mcpName, message: `正在连接${mcpName}...` } 
            });
            
            // 构建授权参数
            const authArgs: string[] = [];
            const authEnv: Record<string, string> = {};
            
            if (authData.authData) {
              // 将授权数据转换为命令行参数和环境变量
              for (const [key, value] of Object.entries(authData.authData)) {
                if (key.includes('TOKEN') || key.includes('KEY')) {
                  authEnv[key] = value; // 敏感信息放入环境变量
                } else {
                  authArgs.push(`--${key.toLowerCase()}`, value); // 普通参数作为命令行参数
                }
              }
            }
            
            // 连接MCP
            await this.mcpManager.connect(mcpName.toLowerCase(), `path/to/${mcpName.toLowerCase()}-mcp`, authArgs, authEnv);
            connectedMCPs[mcpName] = true;
            stream({ 
              event: 'mcp_connected', 
              data: { mcpName, success: true }
            });
          }
        } catch (error) {
          logger.error(`连接MCP失败 [MCP: ${mcpName}]:`, error);
          connectedMCPs[mcpName] = false;
          stream({ 
            event: 'mcp_connected', 
            data: { 
              mcpName, 
              success: false, 
              error: error instanceof Error ? error.message : String(error) 
            }
          });
        }
      }
      
      // 分步执行工作流
      stream({ 
        event: 'workflow_start', 
        data: { 
          total_steps: mcpWorkflow.workflow.length,
          message: '开始执行工作流...'
        }
      });
      
      let finalResult = null;
      for (const step of mcpWorkflow.workflow) {
        const stepNumber = step.step;
        const mcpName = step.mcp;
        const actionName = step.action;
        const input = step.input || task.content;
        
        // 发送步骤开始信息
        stream({ 
          event: 'step_start', 
          data: { 
            step: stepNumber, 
            total: mcpWorkflow.workflow.length,
            mcpName, 
            action: actionName 
          } 
        });
        
        // 检查MCP是否已连接
        if (!connectedMCPs[mcpName]) {
          const errorMsg = `步骤${stepNumber}执行失败: MCP ${mcpName} 未连接`;
          logger.error(errorMsg);
          
          // 使用DAO记录步骤失败结果
          await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
          
          workflowResults.push({
            step: stepNumber,
            success: false,
            error: errorMsg
          });
          
          stream({ 
            event: 'step_complete', 
            data: { 
              step: stepNumber,
              success: false,
              error: errorMsg 
            } 
          });
          continue;
        }
        
        try {
          logger.info(`执行工作流步骤${stepNumber}: ${mcpName} - ${actionName}`);
          
          // 调用MCP工具
          let stepResult: any;
          try {
            // 发送工具调用开始信息
            stream({ 
              event: 'tool_call_start', 
              data: { 
                step: stepNumber,
                mcpName, 
                action: actionName 
              } 
            });
            
            stepResult = await this.callMCPTool(mcpName, actionName, input);
            
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
            logger.error(`步骤${stepNumber}执行失败:`, error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // 使用DAO记录步骤失败结果
            await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
            
            workflowResults.push({
              step: stepNumber,
              success: false,
              error: errorMsg
            });
            
            // 发送步骤失败信息
            stream({ 
              event: 'step_complete', 
              data: { 
                step: stepNumber,
                success: false,
                error: errorMsg 
              } 
            });
            continue;
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
          
          // 发送步骤失败信息
          stream({ 
            event: 'step_complete', 
            data: { 
              step: stepNumber,
              success: false,
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
      
      // 创建流式LLM实例
      const streamingLlm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: process.env.TASK_EXECUTION_MODEL || 'gpt-4o',
        temperature: 0.3,
        streaming: true,
        configuration: {
          httpAgent: agent, // ✅ 使用代理关键设置
        },
      });
      
      // 创建消息
      const messages = [
        new SystemMessage(`你是一位专业的任务总结工作者，你的职责是将复杂的工作流执行结果总结为简洁明了的摘要。
请根据原始任务需求和执行结果，生成一个全面但简洁的摘要，突出以下几点：
1. 任务是否成功完成
2. 主要成果和发现
3. 如果有任何步骤失败，简要说明失败原因
4. 整体结论和建议（如适用）

请使用清晰、专业的语言，避免技术术语，确保用户容易理解。`),
        new SystemMessage(`工作流执行结果：${JSON.stringify(stepResults, null, 2)}`),
        new HumanMessage(taskContent)
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
      streamCallback('无法流式生成结果摘要，请查看详细的步骤结果。');
    }
  }
} 