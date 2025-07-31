import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getTaskService } from './taskService.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageType, MessageIntent, MessageStepType } from '../models/conversation.js';

/**
 * 工作流步骤 - 基于TaskAnalysisService构建的结构
 */
export interface WorkflowStep {
  step: number;
  mcp: string;
  action: string;
  input?: any;
  // 增强字段
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  attempts?: number;
  maxRetries?: number;
}

/**
 * 增强的工作流状态
 */
export interface EnhancedWorkflowState {
  taskId: string;
  originalQuery: string;
  workflow: WorkflowStep[];
  currentStepIndex: number;
  executionHistory: Array<{
    stepNumber: number;
    mcpName: string;
    action: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: Date;
  }>;
  dataStore: Record<string, any>;
  isComplete: boolean;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
}

/**
 * 增强的智能Task执行引擎
 * 专注于执行已构建的MCP工作流，结合Agent引擎的智能化优势
 */
export class EnhancedIntelligentTaskEngine {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpToolAdapter: MCPToolAdapter;
  private mcpAuthService: MCPAuthService;
  private taskService: any;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o',
      temperature: 0.1,
    });

    this.mcpManager = new MCPManager();
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    this.mcpAuthService = new MCPAuthService();
    this.taskService = getTaskService();
  }

  /**
   * 增强的Task流式执行 - 基于已构建的工作流
   */
  async *executeWorkflowEnhanced(
    taskId: string,
    mcpWorkflow: any
  ): AsyncGenerator<{ event: string; data: any }, boolean, unknown> {
    logger.info(`🚀 Starting enhanced workflow execution [Task: ${taskId}]`);

    // 🔧 验证工作流结构
    if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
      yield {
        event: 'error',
        data: { 
          message: 'No valid workflow found. Please run task analysis first.',
          details: 'The task must be analyzed to generate a workflow before execution.'
        }
      };
      return false;
    }

    // 🔧 发送执行开始事件 - 统一字段结构，与Agent引擎一致
    yield {
      event: 'execution_start',
      data: {
        taskId,
        // 🔧 统一字段：添加agentName，与Agent引擎一致
        agentName: 'WorkflowEngine',
        timestamp: new Date().toISOString(),
        message: `Starting enhanced workflow execution with ${mcpWorkflow.workflow.length} steps...`,
        mode: 'enhanced',
        workflowInfo: {
          totalSteps: mcpWorkflow.workflow.length,
          mcps: mcpWorkflow.mcps?.map((mcp: any) => mcp.name) || []
        }
      }
    };

    // 🔧 初始化增强的工作流状态
    const state: EnhancedWorkflowState = {
      taskId,
      originalQuery: '', // 从task获取
      workflow: mcpWorkflow.workflow.map((step: any, index: number) => ({
        ...step,
        status: 'pending',
        attempts: 0,
        maxRetries: 2
      })),
      currentStepIndex: 0,
      executionHistory: [],
      dataStore: {},
      isComplete: false,
      totalSteps: mcpWorkflow.workflow.length,
      completedSteps: 0,
      failedSteps: 0
    };

    try {
      // 🔧 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (task) {
        state.originalQuery = task.content;
      }

      // 🔧 准备执行环境
      await this.prepareWorkflowExecution(taskId, state, mcpWorkflow);

      // 🔧 主执行循环 - 逐步执行工作流
      yield {
        event: 'workflow_execution_start',
        data: { 
          message: 'Starting workflow step execution...',
          totalSteps: state.totalSteps,
          workflow: state.workflow.map(step => ({
            step: step.step,
            mcp: step.mcp,
            action: step.action,
            status: step.status
          }))
        }
      };

      for (let i = 0; i < state.workflow.length; i++) {
        const currentStep = state.workflow[i];
        state.currentStepIndex = i;

        logger.info(`🧠 Executing workflow step ${currentStep.step}: ${currentStep.mcp}.${currentStep.action}`);

        // 🔧 预处理参数：智能参数处理，如果input为空，尝试从上下文推导
        let processedInput = currentStep.input || {};
        if (!currentStep.input && state.dataStore.lastResult) {
          processedInput = this.inferStepInputFromContext(currentStep, state);
        }

        // 🔧 确定工具类型和智能描述 - 与Agent引擎一致
        const isLLMTool = currentStep.mcp === 'llm' || currentStep.mcp.toLowerCase().includes('llm');
        const toolType = isLLMTool ? 'llm' : 'mcp';
        const mcpName = isLLMTool ? null : currentStep.mcp;
        
        // 🔧 生成简单的expectedOutput和reasoning
        const expectedOutput = isLLMTool 
          ? `AI analysis and processing for ${currentStep.action}`
          : `Execute ${currentStep.action} on ${currentStep.mcp}`;
        const reasoning = `Workflow step ${currentStep.step}`;

        // 🔧 执行当前步骤（带重试机制）- 传递预处理的参数
        const executionResult = await this.executeWorkflowStepWithRetry(currentStep, state, processedInput);

        // 🔧 发送步骤开始事件 - 使用实际执行的参数，与Agent引擎一致
        const stepId = `workflow_step_${currentStep.step}_${Date.now()}`;
        yield {
          event: 'step_executing',
          data: {
            step: currentStep.step,
            tool: currentStep.action,
            // 🔧 统一字段：使用agentName而不是taskId，与Agent引擎一致
            agentName: 'WorkflowEngine',
            message: `Executing workflow step ${currentStep.step}: ${currentStep.mcp}.${currentStep.action}`,
            toolDetails: {
              toolType: toolType,
              toolName: currentStep.action,
              mcpName: mcpName,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: executionResult.actualArgs || processedInput,
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            }
          }
        };

        // 🔧 记录执行历史
        const historyEntry = {
          stepNumber: currentStep.step,
          mcpName: currentStep.mcp,
          action: currentStep.action,
          success: executionResult.success,
          result: executionResult.result,
          error: executionResult.error,
          timestamp: new Date()
        };
        state.executionHistory.push(historyEntry);

        // 🔧 发送原始结果事件 - 统一字段结构，与Agent引擎一致
        yield {
          event: 'step_raw_result',
          data: {
            step: currentStep.step,
            success: executionResult.success,
            // 🔧 统一字段：只使用result，删除重复的rawResult字段
            result: executionResult.result,
            // 🔧 统一字段：使用agentName而不是taskId，与Agent引擎一致
            agentName: 'WorkflowEngine',
            executionDetails: {
              toolType: toolType,
              toolName: currentStep.action,
              mcpName: mcpName,
              rawResult: executionResult.result,
              success: executionResult.success,
              error: executionResult.error,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: executionResult.actualArgs || currentStep.input || {},
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString(),
              attempts: currentStep.attempts || 1
            }
          }
        };

        // 🔧 存储原始结果消息
        await this.saveStepRawResult(taskId, currentStep.step, currentStep, executionResult.result, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning);

        // 🔧 格式化结果处理
        let formattedResult = '';
        if (executionResult.success && executionResult.result) {
          formattedResult = await this.generateFormattedResult(
            executionResult.result,
            currentStep.mcp,
            currentStep.action
          );

          // 🔧 发送格式化结果事件 - 统一字段结构，与Agent引擎一致
          yield {
            event: 'step_formatted_result',
            data: {
              step: currentStep.step,
              success: true,
              // 🔧 统一字段：只使用formattedResult，删除重复的result字段
              formattedResult: formattedResult,
              // 🔧 统一字段：使用agentName而不是taskId，与Agent引擎一致
              agentName: 'WorkflowEngine',
              formattingDetails: {
                toolType: toolType,
                toolName: currentStep.action,
                mcpName: mcpName,
                originalResult: executionResult.result,
                formattedResult: formattedResult,
                // 🔧 使用实际执行的参数，与Agent引擎一致
                args: executionResult.actualArgs || currentStep.input || {},
                expectedOutput: expectedOutput,
                reasoning: reasoning,
                processingInfo: {
                  originalDataSize: JSON.stringify(executionResult.result).length,
                  formattedDataSize: formattedResult.length,
                  processingTime: new Date().toISOString(),
                  // 🔧 统一字段：添加needsFormatting标识，与Agent引擎一致
                  needsFormatting: true
                },
                timestamp: new Date().toISOString()
              }
            }
          };

          // 🔧 存储格式化结果消息
          await this.saveStepFormattedResult(taskId, currentStep.step, currentStep, formattedResult, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning);

          // 🔧 更新数据存储
          state.dataStore[`step_${currentStep.step}_result`] = executionResult.result;
          state.dataStore.lastResult = executionResult.result;
        }

        // 🔧 更新步骤状态
        if (executionResult.success) {
          currentStep.status = 'completed';
          state.completedSteps++;
          
          // 🔧 发送step_complete事件 - 统一字段结构，与Agent引擎一致
          yield {
            event: 'step_complete',
            data: {
              step: currentStep.step,
              success: true,
              result: executionResult.result, // 原始结果用于上下文传递
              formattedResult: formattedResult || executionResult.result, // 格式化结果供前端显示
              rawResult: executionResult.result,
              // 🔧 统一字段：添加agentName和message，与Agent引擎一致
              agentName: 'WorkflowEngine',
              message: `WorkflowEngine completed step ${currentStep.step} successfully`,
              // 🔧 保留工作流特有的进度信息
              progress: {
                completed: state.completedSteps,
                total: state.totalSteps,
                percentage: Math.round((state.completedSteps / state.totalSteps) * 100)
              }
            }
          };
        } else {
          currentStep.status = 'failed';
          state.failedSteps++;

          // 🔧 发送MCP连接错误事件（如果适用）
          if (this.isMCPConnectionError(executionResult.error || '')) {
            yield {
              event: 'mcp_connection_error',
              data: {
                mcpName: currentStep.mcp,
                step: currentStep.step,
                errorType: 'CONNECTION_FAILED',
                message: executionResult.error,
                timestamp: new Date().toISOString()
              }
            };
          }

          // 🔧 发送step_error事件 - 统一字段结构，与Agent引擎一致
          yield {
            event: 'step_error',
            data: {
              step: currentStep.step,
              success: false,
              error: executionResult.error,
              mcpName: currentStep.mcp,
              action: currentStep.action,
              // 🔧 统一字段：添加agentName和message，与Agent引擎一致
              agentName: 'WorkflowEngine',
              message: `WorkflowEngine failed at step ${currentStep.step}`,
              attempts: currentStep.attempts || 1
            }
          };
        }
      }

      // 🔧 检查完成状态
      state.isComplete = state.completedSteps > 0; // 至少有一步成功就算部分完成

      // 🔧 生成最终结果
      const finalResult = this.generateWorkflowFinalResult(state);
      
      yield {
        event: 'final_result',
        data: {
          finalResult,
          success: state.completedSteps > 0,
          executionSummary: {
            totalSteps: state.totalSteps,
            completedSteps: state.completedSteps,
            failedSteps: state.failedSteps,
            successRate: Math.round((state.completedSteps / state.totalSteps) * 100)
          }
        }
      };

      // 🔧 保存最终结果
      await this.saveWorkflowFinalResult(taskId, state, finalResult);

      return state.completedSteps > 0;

    } catch (error) {
      logger.error(`❌ Enhanced workflow execution failed:`, error);
      
      yield {
        event: 'task_execution_error',
        data: {
          message: 'Enhanced workflow execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      };

      return false;
    }
  }

  /**
   * 准备工作流执行环境
   */
  private async prepareWorkflowExecution(taskId: string, state: EnhancedWorkflowState, mcpWorkflow: any): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // 🔧 确保工作流中用到的MCP已连接
      const requiredMCPs = [...new Set(state.workflow.map(step => step.mcp))];
      if (requiredMCPs.length > 0) {
        logger.info(`📡 Ensuring required MCPs are connected: ${requiredMCPs.join(', ')}`);
        await this.ensureWorkflowMCPsConnected(task.userId, taskId, requiredMCPs);
      }
    } catch (error) {
      logger.error('Failed to prepare workflow execution:', error);
      throw error;
    }
  }

  /**
   * 确保工作流的MCP已连接 - 同步Agent引擎的完整权限校验逻辑
   */
  private async ensureWorkflowMCPsConnected(userId: string, taskId: string, mcpNames: string[]): Promise<void> {
    try {
      logger.info(`Ensuring MCP connections for workflow execution (User: ${userId}), required MCPs: ${mcpNames.join(', ')}`);

      // 🔧 获取任务信息以获取工作流MCP配置
      const task = await this.taskService.getTaskById(taskId);
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      for (const mcpName of mcpNames) {
        try {
          logger.info(`🔗 Ensuring MCP ${mcpName} is connected for workflow execution`);
          
          // 检查MCP是否已连接
          const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
          const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);
          
          if (!isConnected) {
            logger.info(`MCP ${mcpName} not connected for user ${userId}, attempting to connect for workflow task...`);
            
            // 🔧 获取MCP配置
            const { getPredefinedMCP } = await import('./predefinedMCPs.js');
            const mcpConfig = getPredefinedMCP(mcpName);
            
            if (!mcpConfig) {
              throw new Error(`MCP ${mcpName} configuration not found`);
            }

            // 🔧 从工作流中查找MCP信息（同步Agent引擎逻辑）
            const mcpInfo = mcpWorkflow?.mcps?.find((mcp: any) => mcp.name === mcpName) || { name: mcpName, authRequired: mcpConfig.authRequired };

            let authenticatedMcpConfig = mcpConfig;

            // 🔧 使用工作流中的authRequired标识 - 同步Agent引擎
            if (mcpInfo.authRequired) {
              // 获取用户认证信息
              const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpName);
              if (!userAuth || !userAuth.isVerified || !userAuth.authData) {
                throw new Error(`User authentication not found or not verified for MCP ${mcpName}. Please authenticate this MCP service first.`);
              }

              // 动态注入认证信息
              const dynamicEnv = { ...mcpConfig.env };
              if (mcpConfig.env) {
                for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
                  if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                    dynamicEnv[envKey] = userAuth.authData[envKey];
                    logger.info(`Injected authentication for ${envKey} in MCP ${mcpName} for user ${userId}`);
                  }
                }
              }

              // 创建带认证信息的MCP配置
              authenticatedMcpConfig = {
                ...mcpConfig,
                env: dynamicEnv
              };
            } else {
              logger.info(`MCP ${mcpName} does not require authentication, using default configuration`);
            }

            // 🔧 使用connectPredefined方法实现多用户隔离
            const connected = await this.mcpManager.connectPredefined(authenticatedMcpConfig, userId);
            if (!connected) {
              throw new Error(`Failed to connect to MCP ${mcpName} for user ${userId}`);
            }

            logger.info(`✅ Successfully connected MCP ${mcpName} for user ${userId} and workflow task`);
          } else {
            logger.info(`✅ MCP ${mcpName} already connected for user ${userId}`);
          }
        } catch (error) {
          logger.error(`Failed to ensure MCP connection for ${mcpName} (User: ${userId}):`, error);
          throw new Error(`Failed to connect required MCP service ${mcpName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.info(`✅ All required MCP services connected for workflow execution (User: ${userId})`);
    } catch (error) {
      logger.error('Failed to ensure workflow MCPs connected:', error);
      throw error;
    }
  }

  /**
   * 带重试机制的步骤执行
   */
  private async executeWorkflowStepWithRetry(step: WorkflowStep, state: EnhancedWorkflowState, input: any): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    actualArgs?: any;
  }> {
    let lastError = '';
    
    for (let attempt = 1; attempt <= (step.maxRetries || 2) + 1; attempt++) {
      step.attempts = attempt;
      
      try {
        logger.info(`🔧 Executing ${step.mcp}.${step.action} (attempt ${attempt})`);
        
        const result = await this.executeWorkflowStep(step, state, input);
        
        if (result.success) {
          logger.info(`✅ Step ${step.step} execution successful on attempt ${attempt}`);
          return result;
        } else {
          lastError = result.error || 'Unknown error';
          logger.warn(`⚠️ Step ${step.step} failed on attempt ${attempt}: ${lastError}`);
          
          if (attempt <= (step.maxRetries || 2)) {
            logger.info(`🔄 Retrying step ${step.step} (${attempt}/${step.maxRetries || 2})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 递增延迟
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Step ${step.step} execution error on attempt ${attempt}:`, error);
        
        if (attempt <= (step.maxRetries || 2)) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    return { success: false, error: lastError };
  }

  /**
   * 执行单个工作流步骤
   */
  private async executeWorkflowStep(step: WorkflowStep, state: EnhancedWorkflowState, input: any): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    actualArgs?: any;
  }> {
    try {
      const task = await this.taskService.getTaskById(state.taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // 🔧 支持LLM工具和MCP工具
      const isLLMTool = step.mcp === 'llm' || step.mcp.toLowerCase().includes('llm');
      
      if (isLLMTool) {
        // LLM工具执行
        logger.info(`🤖 Calling LLM with action: ${step.action}`);
        logger.info(`📝 Input: ${JSON.stringify(input, null, 2)}`);
        
        const prompt = `Execute ${step.action} with the following input: ${JSON.stringify(input, null, 2)}`;
        const response = await this.llm.invoke([new SystemMessage(prompt)]);
        const result = response.content as string;
        
        logger.info(`✅ LLM ${step.action} execution successful`);
        return { success: true, result, actualArgs: input };
      } else {
        // MCP工具执行
        logger.info(`📡 Calling MCP ${step.mcp} with action: ${step.action}`);
        logger.info(`📝 Input: ${JSON.stringify(input, null, 2)}`);

        const result = await this.mcpToolAdapter.callTool(
          step.mcp,
          step.action,
          input,
          task.userId
        );

        logger.info(`✅ MCP ${step.mcp} execution successful`);
        return { success: true, result, actualArgs: input };
      }

    } catch (error) {
      logger.error(`❌ Workflow step execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 从上下文推导步骤输入参数
   */
  private inferStepInputFromContext(step: WorkflowStep, state: EnhancedWorkflowState): any {
    // 基于上一步的结果和当前动作智能推导参数
    const lastResult = state.dataStore.lastResult;
    const action = step.action.toLowerCase();
    
    // 简单的推导逻辑，可以根据需要扩展
    if (lastResult && typeof lastResult === 'object') {
      if (action.includes('tweet') && lastResult.text) {
        return { content: lastResult.text };
      }
      if (action.includes('search') && lastResult.query) {
        return { query: lastResult.query };
      }
      if (action.includes('get') && lastResult.id) {
        return { id: lastResult.id };
      }
    }
    
    return {};
  }

  /**
   * 生成格式化结果
   */
  private async generateFormattedResult(rawResult: any, mcpName: string, action: string): Promise<string> {
    try {
      const prompt = `Format the following MCP result for better readability:

**MCP**: ${mcpName}
**Action**: ${action}
**Raw Result**: ${JSON.stringify(rawResult, null, 2)}

Please format this result in a clear, user-friendly way with appropriate markdown formatting.`;

      const response = await this.llm.invoke([new SystemMessage(prompt)]);
      return response.content as string;
    } catch (error) {
      logger.error('Failed to format result:', error);
      return JSON.stringify(rawResult, null, 2);
    }
  }

  /**
   * 检查是否为MCP连接错误
   */
  private isMCPConnectionError(error: string): boolean {
    const lowerError = error.toLowerCase();
    return lowerError.includes('mcp') || 
           lowerError.includes('connection') || 
           lowerError.includes('auth') ||
           lowerError.includes('not connected');
  }

  /**
   * 生成工作流最终结果
   */
  private generateWorkflowFinalResult(state: EnhancedWorkflowState): string {
    const successRate = Math.round((state.completedSteps / state.totalSteps) * 100);
    
    let summary = `Workflow execution completed with ${successRate}% success rate.\n\n`;
    summary += `**Execution Summary:**\n`;
    summary += `- Total Steps: ${state.totalSteps}\n`;
    summary += `- Completed: ${state.completedSteps}\n`;
    summary += `- Failed: ${state.failedSteps}\n\n`;
    
    if (state.completedSteps > 0) {
      summary += `**Successful Steps:**\n`;
      state.executionHistory
        .filter(entry => entry.success)
        .forEach(entry => {
          summary += `- Step ${entry.stepNumber}: ${entry.mcpName}.${entry.action} ✅\n`;
        });
    }
    
    if (state.failedSteps > 0) {
      summary += `\n**Failed Steps:**\n`;
      state.executionHistory
        .filter(entry => !entry.success)
        .forEach(entry => {
          summary += `- Step ${entry.stepNumber}: ${entry.mcpName}.${entry.action} ❌ (${entry.error})\n`;
        });
    }
    
    return summary;
  }

  /**
   * 保存步骤原始结果消息
   */
  private async saveStepRawResult(taskId: string, stepNumber: number, step: WorkflowStep, rawResult: any, actualArgs: any, toolType: string, mcpName: string | null, expectedOutput: string, reasoning: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 🔧 只存储结果内容，不包含描述性文本，与Agent引擎一致
        const rawContent = JSON.stringify(rawResult, null, 2);

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: rawContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: `${step.mcp}.${step.action}`,
            taskPhase: 'execution',
            contentType: 'raw_result',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: step.action,
              mcpName: mcpName,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: actualArgs || step.input || {},
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            },
            executionDetails: {
              rawResult: rawResult,
              success: true,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: actualArgs || step.input || {},
              processingInfo: {
                originalDataSize: JSON.stringify(rawResult).length,
                processingTime: new Date().toISOString()
              }
            }
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }
    } catch (error) {
      logger.error(`Failed to save workflow step raw result:`, error);
    }
  }

  /**
   * 保存步骤格式化结果消息
   */
  private async saveStepFormattedResult(taskId: string, stepNumber: number, step: WorkflowStep, formattedResult: string, actualArgs: any, toolType: string, mcpName: string | null, expectedOutput: string, reasoning: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 🔧 只存储格式化结果内容，不包含描述性文本，与Agent引擎一致
        const formattedContent = formattedResult;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: formattedContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: `${step.mcp}.${step.action}`,
            taskPhase: 'execution',
            contentType: 'formatted_result',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: step.action,
              mcpName: mcpName,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: actualArgs || step.input || {},
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            },
            formattingDetails: {
              formattedResult: formattedResult,
              success: true,
              // 🔧 使用实际执行的参数，与Agent引擎一致
              args: actualArgs || step.input || {},
              processingInfo: {
                formattedDataSize: formattedResult.length,
                processingTime: new Date().toISOString(),
                needsFormatting: true
              }
            }
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }
    } catch (error) {
      logger.error(`Failed to save workflow step formatted result:`, error);
    }
  }

  /**
   * 保存任务最终结果
   */
  private async saveWorkflowFinalResult(taskId: string, state: EnhancedWorkflowState, finalResult: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: `Workflow Final Result:\n\n${finalResult}`,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.SUMMARY,
            stepName: 'Workflow Completion',
            taskPhase: 'completion',
            isComplete: true,
            executionSummary: {
              totalSteps: state.totalSteps,
              completedSteps: state.completedSteps,
              failedSteps: state.failedSteps,
              successRate: Math.round((state.completedSteps / state.totalSteps) * 100)
            }
          }
        });
        await conversationDao.incrementMessageCount(task.conversationId);
      }
    } catch (error) {
      logger.error('Failed to save workflow final result:', error);
    }
  }


}

/**
 * 增强的智能Task服务 - 基于工作流执行
 */
export class EnhancedIntelligentTaskService {
  private engine: EnhancedIntelligentTaskEngine;
  private taskService: any;

  constructor() {
    this.engine = new EnhancedIntelligentTaskEngine();
    this.taskService = getTaskService();
  }

  /**
   * 执行增强的智能Task - 基于已构建的工作流
   */
  async executeTaskEnhanced(
    taskId: string,
    stream: (data: any) => void,
    skipAnalysisCheck: boolean = false
  ): Promise<boolean> {
    try {
      logger.info(`⚡ Starting enhanced workflow-based task execution [Task: ${taskId}]`);

      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }

      // 检查是否已有工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!skipAnalysisCheck && (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0)) {
        stream({ 
          event: 'error', 
          data: { 
            message: 'No workflow found. Please analyze the task first.',
            details: 'Call /api/task/:id/analyze to generate a workflow before execution.'
          } 
        });
        return false;
      }

      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });

      // 使用增强引擎执行工作流
      const executionGenerator = this.engine.executeWorkflowEnhanced(taskId, mcpWorkflow);

      let finalSuccess = false;

      for await (const result of executionGenerator) {
        // 转发所有事件到流
        stream(result);
        
        // 记录最终执行结果
        if (result.event === 'final_result') {
          finalSuccess = result.data.success;
        }
      }

      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(
        taskId, 
        finalSuccess ? 'completed' : 'failed'
      );

      logger.info(`✅ Enhanced workflow execution completed [Task: ${taskId}, Success: ${finalSuccess}]`);
      return finalSuccess;

    } catch (error) {
      logger.error(`❌ Enhanced workflow execution failed:`, error);
      
      stream({
        event: 'error',
        data: {
          message: 'Enhanced workflow execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      });

      await taskExecutorDao.updateTaskStatus(taskId, 'failed');
      return false;
    }
  }
}

// 导出单例实例
export const enhancedIntelligentTaskService = new EnhancedIntelligentTaskService(); 