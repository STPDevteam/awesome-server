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
        
        // 🔧 预先推断实际工具名称
        let actualToolName = currentStep.action;
        if (!isLLMTool) {
          const task = await this.taskService.getTaskById(state.taskId);
          if (task) {
            actualToolName = await this.inferActualToolName(currentStep.mcp, currentStep.action, processedInput, task.userId);
          }
        }

        // 🔧 生成简单的expectedOutput和reasoning（使用实际工具名称）
        const expectedOutput = isLLMTool 
          ? `AI analysis and processing for ${actualToolName}`
          : `Execute ${actualToolName} on ${currentStep.mcp}`;
        const reasoning = `Workflow step ${currentStep.step}`;

        // 🔧 发送步骤开始事件 - 使用实际推断的工具名称，与Agent引擎一致
        const stepId = `workflow_step_${currentStep.step}_${Date.now()}`;
        yield {
          event: 'step_executing',
          data: {
            step: currentStep.step,
            tool: actualToolName,
            // 🔧 统一字段：使用agentName而不是taskId，与Agent引擎一致
            agentName: 'WorkflowEngine',
            message: `Executing workflow step ${currentStep.step}: ${currentStep.mcp}.${actualToolName}`,
            toolDetails: {
              toolType: toolType,
              toolName: actualToolName,
              mcpName: mcpName,
              // 🔧 使用预处理的参数
              args: processedInput,
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            }
          }
        };

        // 🔧 执行当前步骤（带重试机制）- 传递预处理的参数和实际工具名称
        const executionResult = await this.executeWorkflowStepWithRetry(currentStep, state, processedInput, actualToolName);

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
            toolName: actualToolName,
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

        // 🔧 流式格式化结果处理（参考Agent引擎）- 先处理流式事件，避免大数据阻塞
        let formattedResult = '';
        if (executionResult.success && executionResult.result) {
          // 🔧 流式格式化：先发送流式格式化块（仅对MCP工具）
          if (toolType === 'mcp') {
            const formatGenerator = this.formatAndStreamTaskResult(
              executionResult.result,
              currentStep.mcp,
              actualToolName
            );

            for await (const chunk of formatGenerator) {
              yield {
                event: 'step_result_chunk',
                data: {
                  step: currentStep.step,
                  chunk,
                  agentName: 'WorkflowEngine'
                }
              };
            }
          }

          // 🔧 生成完整的格式化结果用于存储和最终事件
          formattedResult = await this.generateFormattedResult(
            executionResult.result,
            currentStep.mcp,
            actualToolName
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
            toolName: actualToolName,
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

          // 🔧 更新数据存储
          state.dataStore[`step_${currentStep.step}_result`] = executionResult.result;
          state.dataStore.lastResult = executionResult.result;
        }

        // 🔧 数据库保存操作放在最后，避免大数据JSON.stringify阻塞流式事件
        // 与Agent引擎保持一致的执行顺序
        try {
          // 存储原始结果消息
          await this.saveStepRawResult(taskId, currentStep.step, currentStep, executionResult.result, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning, actualToolName);
          
          // 存储格式化结果消息
          if (formattedResult) {
            await this.saveStepFormattedResult(taskId, currentStep.step, currentStep, formattedResult, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning, actualToolName);
          }
        } catch (dbError) {
          // 🔧 数据库保存失败不应该影响任务继续执行
          logger.error(`❌ Failed to save step results to database:`, dbError);
          // 继续执行，不中断流程
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

        // 🧠 任务观察阶段 - 与Agent引擎一致，每步执行后都进行观察
        logger.info(`🔍 Performing task observation after step ${currentStep.step}...`);
        
        const observation = await this.taskObservationPhase(state);
        
        // 发送观察结果事件
        yield {
          event: 'task_observation',
          data: {
            taskId,
            stepIndex: i,
            shouldContinue: observation.shouldContinue,
            shouldAdaptWorkflow: observation.shouldAdaptWorkflow,
            adaptationReason: observation.adaptationReason,
            agentName: 'WorkflowEngine',
            timestamp: new Date().toISOString()
          }
        };
        
        // 🔄 如果需要调整工作流，进行动态规划
        if (observation.shouldAdaptWorkflow) {
          logger.info(`🧠 Initiating dynamic workflow adaptation...`);
          
          const currentContext = this.buildCurrentContext(state);
          const planningResult = await this.taskDynamicPlanningPhase(state, currentContext);
          
          if (planningResult.success && planningResult.adaptedSteps) {
            // 用动态规划的步骤替换剩余工作流
            const adaptedWorkflow = planningResult.adaptedSteps.map((adaptedStep, index) => ({
              ...adaptedStep,
              step: i + index + 1,
              status: 'pending' as const,
              attempts: 0,
              maxRetries: 2
            }));
            
            // 更新工作流：保留已完成的步骤，替换剩余步骤
            state.workflow = [
              ...state.workflow.slice(0, i + 1),
              ...adaptedWorkflow
            ];
            state.totalSteps = state.workflow.length;
            
            // 发送工作流调整事件
            yield {
              event: 'workflow_adapted',
              data: {
                taskId,
                reason: observation.adaptationReason,
                adaptedAt: i + 1,
                newSteps: adaptedWorkflow.length,
                totalSteps: state.totalSteps,
                agentName: 'WorkflowEngine',
                timestamp: new Date().toISOString()
              }
            };
            
            logger.info(`✅ Workflow adapted: ${adaptedWorkflow.length} new steps planned`);
          }
        }
        
        // 如果观察认为应该停止，则提前完成任务
        if (!observation.shouldContinue) {
          logger.info(`🏁 Task observation indicates completion, stopping workflow execution`);
          break;
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
  private async executeWorkflowStepWithRetry(step: WorkflowStep, state: EnhancedWorkflowState, input: any, actualToolName?: string): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    actualArgs?: any;
  }> {
    let lastError = '';
    const toolName = actualToolName || step.action;
    
    for (let attempt = 1; attempt <= (step.maxRetries || 2) + 1; attempt++) {
      step.attempts = attempt;
      
      try {
        logger.info(`🔧 Executing ${step.mcp}.${toolName} (attempt ${attempt})`);
        
        const result = await this.executeWorkflowStep(step, state, input, actualToolName);
        
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
  private async executeWorkflowStep(step: WorkflowStep, state: EnhancedWorkflowState, input: any, actualToolName?: string): Promise<{
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
        const toolName = actualToolName || step.action;
        logger.info(`🤖 Calling LLM with action: ${toolName}`);
        logger.info(`📝 Input: ${JSON.stringify(input, null, 2)}`);
        
        const prompt = `Execute ${toolName} with the following input: ${JSON.stringify(input, null, 2)}`;
        const response = await this.llm.invoke([new SystemMessage(prompt)]);
        const result = response.content as string;
        
        logger.info(`✅ LLM ${toolName} execution successful`);
        return { success: true, result, actualArgs: input };
      } else {
        // MCP工具执行 - 使用预推断的实际工具名称
        let toolName = actualToolName;
        if (!toolName) {
          try {
            toolName = await this.inferActualToolName(step.mcp, step.action, input, task.userId);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`❌ Failed to infer tool name for MCP ${step.mcp} action ${step.action}: ${errorMessage}`);
            throw error;
          }
        }
        
        logger.info(`📡 Calling MCP ${step.mcp} with action: ${step.action} (resolved to: ${toolName})`);
        logger.info(`📝 Input: ${JSON.stringify(input, null, 2)}`);

        const result = await this.mcpToolAdapter.callTool(
          step.mcp,
          toolName,
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
   * 智能推断实际工具名称：使用LLM将描述性文本转换为实际的MCP工具名称 (参考Agent引擎的通用做法)
   */
  private async inferActualToolName(mcpName: string, action: string, input: any, userId: string): Promise<string> {
    try {
      // 获取MCP的可用工具列表
      const tools = await this.mcpManager.getTools(mcpName, userId);
      
      if (!tools || tools.length === 0) {
        logger.warn(`🔍 No tools found for MCP ${mcpName}, using original action: ${action}`);
        return action;
      }
      
      const toolNames = tools.map((tool: any) => tool.name);
      logger.info(`🔍 Available tools for ${mcpName}: ${toolNames.join(', ')}`);
      
      // 1. 首先检查action是否已经是有效的工具名称
      if (toolNames.includes(action)) {
        logger.info(`✅ Action "${action}" is already a valid tool name`);
        return action;
      }
      
      // 2. 使用LLM进行智能工具名称推断 (通用方法，参考Agent引擎)
      const toolInferencePrompt = `You are an expert tool name matcher. The requested action "${action}" needs to be mapped to an actual tool name from MCP service "${mcpName}".

CONTEXT:
- Requested action: ${action}
- Input parameters: ${JSON.stringify(input, null, 2)}
- MCP Service: ${mcpName}
- Available tools with descriptions:
${tools.map((tool: any) => {
  return `
Tool: ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema: ${JSON.stringify(tool.inputSchema || {}, null, 2)}
`;
}).join('\n')}

MATCHING PRINCIPLES:
1. **Find functionally equivalent tool**: Select the tool that can accomplish the same objective as the requested action
2. **Consider semantic meaning**: Match based on functionality, not just text similarity
3. **Use exact tool names**: Return the exact tool name from the available list
4. **Prioritize best match**: Choose the most appropriate tool for the requested action

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "toolName": "exact_tool_name_from_available_list",
  "reasoning": "why this tool was selected for the requested action"
}

Select the best matching tool now:`;

      const response = await this.llm.invoke([new SystemMessage(toolInferencePrompt)]);
      
      try {
        const responseText = response.content.toString().trim();
        logger.info(`🔍 === LLM Tool Inference Debug ===`);
        logger.info(`🔍 Original Action: ${action}`);
        logger.info(`🔍 Raw LLM Response: ${responseText}`);
        
        // 🔧 使用Agent引擎相同的JSON清理逻辑
        let cleanedJson = responseText;
        
        // 移除Markdown代码块标记
        cleanedJson = cleanedJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // 🔧 使用Agent引擎的JSON提取逻辑
        const extractedJson = this.extractCompleteJson(cleanedJson);
        if (extractedJson) {
          cleanedJson = extractedJson;
        }
        
        const inference = JSON.parse(cleanedJson);
        const selectedTool = inference.toolName;
        
        if (selectedTool && toolNames.includes(selectedTool)) {
          logger.info(`✅ LLM selected tool: ${selectedTool} (${inference.reasoning})`);
          return selectedTool;
        } else {
          logger.warn(`⚠️ LLM selected invalid tool: ${selectedTool}, falling back to first available`);
        }
        
      } catch (parseError) {
        logger.error(`❌ Failed to parse LLM tool inference response: ${response.content}`);
        logger.error(`❌ Parse error: ${parseError}`);
      }
      
      // 3. 如果LLM推断失败，使用第一个工具作为默认值
      if (toolNames.length > 0) {
        logger.warn(`🔍 Using first available tool as fallback: ${toolNames[0]}`);
        return toolNames[0];
      }
      
      // 4. 最后的fallback
      logger.warn(`🔍 No tools available for MCP ${mcpName}, using original action: ${action}`);
      return action;
      
    } catch (error) {
      logger.error(`❌ Error inferring tool name for ${mcpName}.${action}:`, error);
      return action; // 如果推断失败，返回原始action
    }
  }

  /**
   * 提取完整JSON对象 (从Agent引擎复制)
   */
  private extractCompleteJson(text: string): string | null {
    // 查找第一个 '{' 的位置
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
      return null;
    }
    
    // 从 '{' 开始，手动匹配大括号以找到完整的JSON对象
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          
          // 当大括号计数为0时，我们找到了完整的JSON对象
          if (braceCount === 0) {
            const jsonString = text.substring(startIndex, i + 1);
            logger.info(`🔧 Extracted complete JSON: ${jsonString}`);
            return jsonString;
          }
        }
      }
    }
    
    // 如果没有找到完整的JSON对象，返回null
    logger.warn(`⚠️ Could not find complete JSON object`);
    return null;
  }

  /**
 * 🧠 新增：动态规划阶段（参考Agent引擎，使任务引擎也具备智能规划能力）
 */
private async taskDynamicPlanningPhase(
  state: EnhancedWorkflowState,
  currentContext: string
): Promise<{
  success: boolean;
  adaptedSteps?: Array<{
    step: number;
    mcp: string;
    action: string;
    input?: any;
    reasoning?: string;
  }>;
  error?: string;
}> {
  try {
    // 🔧 获取当前可用的MCP和执行历史
    const availableMCPs = await this.getAvailableMCPsForPlanning(state.taskId);
    const executionHistory = this.buildExecutionHistory(state);
    
    const plannerPrompt = this.buildTaskPlannerPrompt(state, availableMCPs, currentContext, executionHistory);

    // 🔄 使用LLM进行动态规划
    const response = await this.llm.invoke([new SystemMessage(plannerPrompt)]);
    const adaptedSteps = this.parseTaskPlan(response.content.toString());

    return { success: true, adaptedSteps };
  } catch (error) {
    logger.error('Task dynamic planning failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * 🧠 新增：任务观察阶段（参考Agent引擎，智能分析当前进度和调整策略）
 */
private async taskObservationPhase(
  state: EnhancedWorkflowState
): Promise<{
  shouldContinue: boolean;
  shouldAdaptWorkflow: boolean;
  adaptationReason?: string;
  newObjective?: string;
}> {
  try {
    const observerPrompt = this.buildTaskObserverPrompt(state);
    const response = await this.llm.invoke([new SystemMessage(observerPrompt)]);
    
    return this.parseTaskObservation(response.content.toString());
  } catch (error) {
    logger.error('Task observation failed:', error);
    return { 
      shouldContinue: true, 
      shouldAdaptWorkflow: false 
    };
  }
}

/**
 * 🔧 构建任务规划提示词
 */
private buildTaskPlannerPrompt(
  state: EnhancedWorkflowState,
  availableMCPs: any[],
  currentContext: string,
  executionHistory: string
): string {
  return `You are an intelligent task workflow planner. Based on the current execution context and available tools, dynamically plan the optimal next steps.

**Current Task**: ${state.originalQuery}

**Execution Context**: ${currentContext}

**Available MCP Tools**:
${JSON.stringify(availableMCPs.map(mcp => ({
  name: mcp.name,
  description: mcp.description,
  capabilities: mcp.predefinedTools?.map((tool: any) => tool.name) || []
})), null, 2)}

**Previous Execution History**:
${executionHistory}

**Current Workflow Progress**: ${state.completedSteps}/${state.totalSteps} steps completed

**Instructions**:
1. Analyze what has been accomplished so far
2. Identify what still needs to be done to complete the original task
3. Plan the optimal next steps using available MCP tools
4. Consider efficiency and logical flow
5. Adapt based on previous results

Respond with valid JSON in this exact format:
{
  "analysis": "Brief analysis of current progress and what's needed",
  "adapted_steps": [
    {
      "step": 1,
      "mcp": "mcp_name",
      "action": "Clear description of what this step will accomplish",
      "input": {"actual": "parameters"},
      "reasoning": "Why this step is needed now"
    }
  ],
  "planning_reasoning": "Detailed explanation of the planning logic"
}`;
}

/**
 * 🔧 构建任务观察提示词
 */
private buildTaskObserverPrompt(state: EnhancedWorkflowState): string {
  const completedStepsInfo = state.executionHistory
    .filter(step => step.success)
    .map(step => `Step ${step.stepNumber}: ${step.action} -> Success`)
    .join('\n');
    
  const failedStepsInfo = state.executionHistory
    .filter(step => !step.success)
    .map(step => `Step ${step.stepNumber}: ${step.action} -> Failed: ${step.error}`)
    .join('\n');

  return `You are an intelligent task execution observer analyzing workflow progress after each step. Make smart decisions about continuation, completion, and adaptation.

**Original Task**: ${state.originalQuery}

**Current Progress**: Step ${state.currentStepIndex + 1}/${state.totalSteps} (${Math.round(((state.currentStepIndex + 1) / state.totalSteps) * 100)}%)

**Execution Summary**:
- Completed Steps: ${state.completedSteps}
- Failed Steps: ${state.failedSteps}
- Current Step: ${state.currentStepIndex + 1}

**Recent Completed Steps**:
${completedStepsInfo || 'None yet'}

**Recent Failed Steps**:
${failedStepsInfo || 'None'}

**Available Results & Data**:
${JSON.stringify(state.dataStore, null, 2)}

**Observation Guidelines**:
1. **Task Completion Analysis**: Evaluate if the original task objective has been achieved with current results
2. **Progress Assessment**: Consider the quality and relevance of completed steps
3. **Failure Impact**: Assess how failed steps affect overall task completion
4. **Workflow Efficiency**: Determine if the remaining planned steps are still optimal
5. **Early Completion**: Identify if sufficient results exist to complete the task early
6. **Adaptation Needs**: Detect if the workflow should be adapted based on current context

**Decision Criteria**:
- CONTINUE: Task not complete, current workflow is optimal
- STOP EARLY: Task objective achieved with current results
- ADAPT: Task not complete, but workflow needs modification

Respond with valid JSON:
{
  "should_continue": true/false,
  "should_adapt_workflow": true/false,
  "adaptation_reason": "Reason for adaptation if needed",
  "new_objective": "Adjusted objective if adaptation needed",
  "completion_analysis": "Analysis of current task completion status",
  "confidence_score": 0.0-1.0,
  "observation_reasoning": "Detailed step-by-step reasoning for this decision"
}`;
}

/**
 * 🔧 解析任务规划结果
 */
private parseTaskPlan(content: string): Array<{
  step: number;
  mcp: string;
  action: string;
  input?: any;
  reasoning?: string;
}> {
  try {
    const cleanedContent = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();
    
    const parsed = JSON.parse(cleanedContent);
    return parsed.adapted_steps || [];
  } catch (error) {
    logger.error('Failed to parse task plan:', error);
    return [];
  }
}

/**
 * 🔧 解析任务观察结果
 */
private parseTaskObservation(content: string): {
  shouldContinue: boolean;
  shouldAdaptWorkflow: boolean;
  adaptationReason?: string;
  newObjective?: string;
} {
  try {
    const cleanedContent = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();
    
    const parsed = JSON.parse(cleanedContent);
    
    return {
      shouldContinue: parsed.should_continue !== false,
      shouldAdaptWorkflow: parsed.should_adapt_workflow === true,
      adaptationReason: parsed.adaptation_reason,
      newObjective: parsed.new_objective
    };
  } catch (error) {
    logger.error('Failed to parse task observation:', error);
    logger.error('Raw observation content:', content);
    return { 
      shouldContinue: true, 
      shouldAdaptWorkflow: false 
    };
  }
}

/**
 * 🔧 获取可用于规划的MCP列表
 */
private async getAvailableMCPsForPlanning(taskId: string): Promise<any[]> {
  try {
    const task = await this.taskService.getTaskById(taskId);
    if (task?.mcpWorkflow?.mcps) {
      return task.mcpWorkflow.mcps;
    }
    return [];
  } catch (error) {
    logger.error('Failed to get available MCPs for planning:', error);
    return [];
  }
}

  /**
   * 🔧 构建执行历史摘要
   */
  private buildExecutionHistory(state: EnhancedWorkflowState): string {
    if (state.executionHistory.length === 0) {
      return 'No previous execution history.';
    }
    
    return state.executionHistory
      .map(step => `Step ${step.stepNumber}: ${step.action} -> ${step.success ? 'Success' : 'Failed'}`)
      .join('\n');
  }

  /**
   * 🔧 构建当前执行上下文
   */
  private buildCurrentContext(state: EnhancedWorkflowState): string {
    const completedSteps = state.executionHistory.filter(step => step.success);
    const failedSteps = state.executionHistory.filter(step => !step.success);
    
    let context = `Current execution context for task: ${state.originalQuery}\n\n`;
    
    // 进度概览
    context += `Progress Overview:\n`;
    context += `- Completed: ${state.completedSteps}/${state.totalSteps} steps\n`;
    context += `- Failed: ${state.failedSteps} steps\n`;
    context += `- Current step index: ${state.currentStepIndex}\n\n`;
    
    // 已完成的步骤和结果
    if (completedSteps.length > 0) {
      context += `Successfully completed steps:\n`;
      completedSteps.forEach(step => {
        const resultSummary = typeof step.result === 'string' 
          ? step.result.substring(0, 100) + '...'
          : JSON.stringify(step.result).substring(0, 100) + '...';
        context += `- Step ${step.stepNumber}: ${step.action} -> ${resultSummary}\n`;
      });
      context += '\n';
    }
    
    // 失败的步骤
    if (failedSteps.length > 0) {
      context += `Failed steps:\n`;
      failedSteps.forEach(step => {
        context += `- Step ${step.stepNumber}: ${step.action} -> Error: ${step.error}\n`;
      });
      context += '\n';
    }
    
    // 可用数据
    if (Object.keys(state.dataStore).length > 0) {
      context += `Available data in context:\n`;
      Object.keys(state.dataStore).forEach(key => {
        context += `- ${key}: ${typeof state.dataStore[key]}\n`;
      });
    }
    
    return context;
  }

/**
 * 🔧 新增：流式格式化任务结果（参考Agent引擎实现）
 */
  private async *formatAndStreamTaskResult(
    rawResult: any,
    mcpName: string,
    toolName: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      // 🔧 注意：此方法仅用于MCP工具的格式化，LLM工具已经返回格式化内容
      const formatPrompt = `Please format the following MCP tool execution result into a clear, readable markdown format.

**Tool Information:**
- MCP Service: ${mcpName}
- Tool/Action: ${toolName}

**Raw Result:**
${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}

**Format Requirements:**
1. Use proper markdown formatting (headers, lists, code blocks, etc.)
2. Make the content easy to read and understand
3. Highlight important information
4. Structure the data logically
5. If the result contains data, format it in tables or lists
6. If it's an error, clearly explain what happened
7. Keep the formatting professional and clean

Format the result now:`;

      // 使用流式LLM生成格式化结果
      const stream = await this.llm.stream([new SystemMessage(formatPrompt)]);

      for await (const chunk of stream) {
        if (chunk.content) {
          yield chunk.content as string;
        }
      }
    } catch (error) {
      logger.error(`Failed to format task result:`, error);
      // 降级处理：返回基本格式化
      const fallbackResult = `### ${toolName} 执行结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
      yield fallbackResult;
    }
  }

  /**
   * 生成格式化结果（非流式，用于存储）
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
  private async saveStepRawResult(taskId: string, stepNumber: number, step: WorkflowStep, rawResult: any, actualArgs: any, toolType: string, mcpName: string | null, expectedOutput: string, reasoning: string, actualToolName?: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 🔧 只存储结果内容，不包含描述性文本，与Agent引擎一致
        const rawContent = JSON.stringify(rawResult, null, 2);
        const toolName = actualToolName || step.action;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: rawContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: `${step.mcp}.${toolName}`,
            taskPhase: 'execution',
            contentType: 'raw_result',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: toolName,
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
  private async saveStepFormattedResult(taskId: string, stepNumber: number, step: WorkflowStep, formattedResult: string, actualArgs: any, toolType: string, mcpName: string | null, expectedOutput: string, reasoning: string, actualToolName?: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 🔧 只存储格式化结果内容，不包含描述性文本，与Agent引擎一致
        const formattedContent = formattedResult;
        const toolName = actualToolName || step.action;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: formattedContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: `${step.mcp}.${toolName}`,
            taskPhase: 'execution',
            contentType: 'formatted_result',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: toolName,
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