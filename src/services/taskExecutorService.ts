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
   * 执行任务工作流
   * @param taskId 任务ID
   * @returns 执行结果对象，包含执行状态和总结信息
   * todo 核心流程，重点思考调试
   */
  async executeTask(taskId: string, options: { skipAuthCheck?: boolean } = {}): Promise<{
    success: boolean;
    summary?: string;
    status: string;
    steps?: any[];
    error?: string;
  }> {
    try {
      logger.info(`🚀 开始执行任务 [任务ID: ${taskId}]`);
      
      // 获取任务详情
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`❌ 任务不存在 [ID: ${taskId}]`);
        return {
          success: false,
          status: 'failed',
          error: '任务不存在'
        };
      }
      
      logger.info(`📋 任务详情: [标题: ${task.title}, 用户ID: ${task.userId}]`);
      
      // 检查是否所有需要授权的MCP都已验证
      if (!options.skipAuthCheck) {
        const allVerified = await this.mcpAuthService.checkAllMCPsVerified(taskId);
        if (!allVerified) {
          logger.error(`❌ 任务执行失败: 有MCP未验证授权 [任务ID: ${taskId}]`);
          await taskExecutorDao.updateTaskResult(taskId, 'failed', {
            error: '任务执行失败: 请先验证所有必要的MCP授权'
          });
          return {
            success: false,
            status: 'failed',
            error: '任务执行失败: 请先验证所有必要的MCP授权'
          };
        }
        logger.info(`✅ 所有MCP授权已验证 [任务ID: ${taskId}]`);
      } else {
        logger.info(`- 授权检查已跳过 [任务ID: ${taskId}]`);
      }
      
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
        return {
          success: false,
          status: 'failed',
          error: '任务执行失败: 没有有效的工作流, 请先调用任务分析接口 /api/task/:id/analyze'
        };
      }
      
      logger.info(`📊 工作流步骤总数: ${mcpWorkflow.workflow.length} [任务ID: ${taskId}]`);
      
      // 初始化工作流结果
      const workflowResults: any[] = [];
      
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
      return {
        success: true,
        status: 'completed',
        summary: resultSummary,
        steps: workflowResults
      };
    } catch (error) {
      logger.error(`任务执行过程中发生错误 [任务ID: ${taskId}]:`, error);
      
      // 使用DAO更新任务状态为失败
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
      
      // 处理MCP名称映射，将'playwright-mcp-service'映射到'playwright'
      let actualMcpName = mcpName;
      if (mcpName === 'playwright-mcp-service') {
        actualMcpName = 'playwright';
        logger.info(`MCP名称映射: 将'playwright-mcp-service'映射为'playwright'`);
      }

      // 使用mcpManager而不是httpAdapter调用工具
      const result = await this.mcpManager.callTool(actualMcpName, toolName, input);

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
        new SystemMessage(`你是一位专业的任务总结工作者，你的职责是将复杂的工作流执行结果总结为详细但易于理解的报告。
请根据原始任务需求和执行结果，生成一个全面的报告，包括以下内容：

1. 任务执行概述 - 总步骤数、成功步骤数、失败步骤数
2. 成功完成的操作和获得的结果
3. 如果有任何步骤失败，详细说明失败原因和影响
4. 总体任务成果和价值
5. 对用户的建议（如适用）

请注意，这个总结将直接呈现给用户，应当使用友好的语言和格式，确保用户能够理解任务执行的完整过程和结果。
避免技术术语，但要保持专业性和准确性。请特别强调任务为用户带来的价值和成果。`),
        new HumanMessage(`任务内容: ${taskContent}

执行统计:
- 总步骤数: ${stepResults.length}
- 成功步骤数: ${successSteps}
- 失败步骤数: ${failedSteps}

步骤详情:
${stepDetails}

请针对以上任务执行情况，生成一份完整的执行报告，重点说明这个任务为用户做了什么，达成了哪些具体成果。`)
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
      const mcpWorkflow = task.mcpWorkflow;
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
          
          // 处理MCP名称映射，将'playwright-mcp-service'映射到'playwright'
          let actualMcpName = mcpName;
          if (mcpName === 'playwright-mcp-service') {
            actualMcpName = 'playwright';
            logger.info(`流式执行中的MCP名称映射: 将'playwright-mcp-service'映射为'playwright'`);
          }
          
          // 确保输入是对象类型
          const inputObj = typeof input === 'string' ? { text: input } : input;
          
          // 调用MCP工具
          const stepResult = await this.mcpManager.callTool(actualMcpName, actionName, inputObj);
          
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
        new SystemMessage(`你是一位专业的任务总结工作者，你的职责是将复杂的工作流执行结果总结为详细但易于理解的报告。
请根据原始任务需求和执行结果，生成一个全面的报告，包括以下内容：

1. 任务执行概述 - 总步骤数、成功步骤数、失败步骤数
2. 成功完成的操作和获得的结果
3. 如果有任何步骤失败，详细说明失败原因和影响
4. 总体任务成果和价值
5. 对用户的建议（如适用）

请注意，这个总结将直接呈现给用户，应当使用友好的语言和格式，确保用户能够理解任务执行的完整过程和结果。
避免技术术语，但要保持专业性和准确性。请特别强调任务为用户带来的价值和成果。`),
        new HumanMessage(`任务内容: ${taskContent}

执行统计:
- 总步骤数: ${stepResults.length}
- 成功步骤数: ${successSteps}
- 失败步骤数: ${failedSteps}

步骤详情:
${stepDetails}

请针对以上任务执行情况，生成一份完整的执行报告，重点说明这个任务为用户做了什么，达成了哪些具体成果。`)
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
} 