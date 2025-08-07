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
    
    // 🔧 CRITICAL DEBUG: 确认进入Enhanced引擎
    logger.info(`🚨 ENHANCED ENGINE STARTED - Task: ${taskId}`);
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

    // 🧠 智能任务复杂度分析
    const task = await this.taskService.getTaskById(taskId);
    const taskQuery = task?.content || '';
    const taskComplexity = await this.analyzeTaskComplexity(taskQuery, mcpWorkflow.workflow.length);
    
    logger.info(`🎯 Task complexity analysis: ${taskComplexity.type} (${taskComplexity.recommendedObservation})`);

    // 🔧 根据复杂度调整执行策略
    const shouldObserveEveryStep = taskComplexity.type !== 'simple_query';

    // 🔧 发送执行开始事件 - 对齐传统任务执行事件名称
    yield {
      event: 'execution_start',
      data: {
        taskId,
        agentName: 'WorkflowEngine',
        taskComplexity: taskComplexity.type,
        observationStrategy: taskComplexity.recommendedObservation,
        timestamp: new Date().toISOString(),
        message: `Starting execution...`,
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

      // 🔧 移除workflow_execution_start事件，直接开始步骤执行

      for (let i = 0; i < state.workflow.length; i++) {
        const currentStep = state.workflow[i];
        state.currentStepIndex = i;

        logger.info(`🧠 Executing workflow step ${currentStep.step}: ${currentStep.mcp}.${currentStep.action}`);

        // 🔧 预处理参数：智能参数处理，使用LLM判断是否需要重新推断
        let processedInput = currentStep.input || {};
        
        // 🧠 使用LLM智能判断是否需要重新推断输入
        const shouldReinferInput = await this.shouldReinferStepInput(currentStep, state, processedInput);
        
        if (!currentStep.input || shouldReinferInput || state.dataStore.lastResult) {
          logger.info(`🔄 Inferring step input from context (LLM判断需要重新推断: ${shouldReinferInput})`);
          processedInput = await this.inferStepInputFromContext(currentStep, state);
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
            logger.info(`🔍 Inferring tool name for step ${currentStep.step}: ${currentStep.mcp}.${currentStep.action}`);
            actualToolName = await this.inferActualToolName(currentStep.mcp, currentStep.action, processedInput, task.userId);
            logger.info(`✅ Tool name inference completed: ${actualToolName}`);
          }
        }

        // 🔧 生成简单的expectedOutput和reasoning（使用实际工具名称）
        const expectedOutput = isLLMTool 
          ? `AI analysis and processing for ${actualToolName}`
          : `Execute ${actualToolName} on ${currentStep.mcp}`;
        const reasoning = `Workflow step ${currentStep.step}`;

        // 🔧 发送步骤开始事件 - 对齐传统任务执行事件名称
        const stepId = `workflow_step_${currentStep.step}_${Date.now()}`;
        yield {
          event: 'step_executing',
          data: {
            step: currentStep.step,
            mcpName: mcpName || currentStep.mcp,
            actionName: actualToolName,
            input: JSON.stringify(processedInput),
            agentName: 'WorkflowEngine',
            message: `WorkflowEngine is executing step ${currentStep.step}: ${actualToolName}`,
            // 🔧 与Agent引擎完全一致的toolDetails结构
            toolDetails: {
              toolType: toolType,
              toolName: actualToolName,
              mcpName: mcpName,
              args: processedInput,
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            }
          }
        };

        // 🔧 执行当前步骤（带重试机制）- 传递预处理的参数和实际工具名称
        logger.info(`🔄 Starting execution for step ${currentStep.step} with tool: ${actualToolName}`);
        const executionResult = await this.executeWorkflowStepWithRetry(currentStep, state, processedInput, actualToolName);
        logger.info(`📋 Execution result:`, {
          success: executionResult.success,
          hasResult: !!executionResult.result,
          resultSize: executionResult.result ? JSON.stringify(executionResult.result).length : 0,
          error: executionResult.error || 'none'
        });

        // 🔧 CRITICAL: 检查是否到达了后续处理阶段
        logger.info(`🎯 REACHED POST-EXECUTION PROCESSING - Step ${currentStep.step}`);

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

        // 🔧 重要调试：检查executionResult的结构
        logger.info(`🔍 CRITICAL DEBUG - executionResult:`, {
          success: executionResult.success,
          hasResult: !!executionResult.result,
          resultType: typeof executionResult.result,
          resultKeys: executionResult.result ? Object.keys(executionResult.result) : 'no result'
        });

        // 🔧 发送step_raw_result事件（新增事件）
        if (executionResult.success && executionResult.result) {
          logger.info(`🎯 CRITICAL DEBUG - Conditions met, yielding step_raw_result`);
          
          yield {
            event: 'step_raw_result',
            data: {
              step: currentStep.step,
              success: true,
              result: executionResult.result,  // 原始MCP数据结构
              agentName: 'WorkflowEngine',
              executionDetails: {
                toolType: toolType,
                toolName: actualToolName,
                mcpName: mcpName,
                // 🔧 移除rawResult重复 - 数据已在上面的result字段中
                args: executionResult.actualArgs || currentStep.input || {},
                expectedOutput: expectedOutput,
                timestamp: new Date().toISOString()
              }
            }
          };

          // 🔧 异步保存原始结果，避免阻塞流式响应
          this.saveStepRawResult(taskId, currentStep.step, currentStep, executionResult.result, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning, actualToolName).catch(error => {
            logger.error(`Failed to save step raw result:`, error);
          });
        }

        // 🔧 流式格式化结果处理（参考Agent引擎）
        let formattedResult = '';
        if (executionResult.success && executionResult.result) {
          // 🔧 流式格式化：先发送流式格式化块（仅对MCP工具）
          if (toolType === 'mcp') {
            const formatGenerator = this.formatAndStreamTaskResult(
              executionResult.result,
              currentStep.mcp,
              actualToolName
            );

            // 🔧 使用前端对应的事件名称
            if (currentStep.step === state.totalSteps) {
              // 最后一步：发送step_start事件然后使用summary_chunk事件
              yield {
                event: 'step_start',
                data: {
                  message: `Running ${mcpName || ''} - ${actualToolName || ''}`,
                  agentName: 'WorkflowEngine'
                }
              };
              
              for await (const chunk of formatGenerator) {
                yield {
                  event: 'summary_chunk',
                  data: {
                    content: chunk,
                    agentName: 'WorkflowEngine'
                  }
                };
              }
            } else {
              // 中间步骤：暂时跳过流式输出，只保留最终格式化结果
            }
          }

          // 🔧 生成完整的格式化结果用于存储和最终事件
          formattedResult = await this.generateFormattedResult(
            executionResult.result,
            currentStep.mcp,
            actualToolName
          );

          // 🔧 移除step_formatted_result事件，前端不需要

          // 🔧 异步保存格式化结果，避免阻塞流式响应
          this.saveStepFormattedResult(taskId, currentStep.step, currentStep, formattedResult, executionResult.actualArgs, toolType, mcpName, expectedOutput, reasoning, actualToolName).catch(error => {
            logger.error(`Failed to save step formatted result:`, error);
          });

          // 🔧 更新数据存储
          state.dataStore[`step_${currentStep.step}_result`] = executionResult.result;
          state.dataStore.lastResult = executionResult.result;
        }

        // 🔧 更新步骤状态
        if (executionResult.success) {
          currentStep.status = 'completed';
          state.completedSteps++;
          
          // 🔧 发送step_complete事件 - 对齐传统任务执行格式
          yield {
            event: 'step_complete',
            data: {
              step: currentStep.step,
              success: true,
              result: formattedResult || executionResult.result, // 格式化结果供前端显示
              rawResult: executionResult.result, // 保留原始MCP结果供调试
              // 🔧 保留智能引擎的增强字段
              agentName: 'WorkflowEngine',
              message: `WorkflowEngine completed step ${currentStep.step} successfully`,
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

          // 🔧 发送step_error事件 - 简化格式
          yield {
            event: 'step_error',
            data: {
              step: currentStep.step,
              error: executionResult.error,
              agentName: 'WorkflowEngine'
            }
          };
        }

        // 🎯 与Agent引擎保持一致：使用智能观察阶段判断完成
        let shouldContinue = true;

        // 🔧 执行成功后进行智能观察判断（与Agent引擎一致）
        if (executionResult.success) {
          logger.info(`🔍 Task performing intelligent observation after step ${i + 1}`);
          
          const observationResult = await this.taskObservationPhase(state, taskComplexity);
          
          if (!observationResult.shouldContinue) {
            logger.info(`🎯 Task determined complete after intelligent observation`);
            shouldContinue = false;
            
            // 发送任务完成事件
            yield {
              event: 'task_observation_complete',
              data: {
                step: i + 1,
                message: 'Task determined complete by intelligent observation',
                reasoning: observationResult.newObjective || 'Task requirements fulfilled',
                taskComplete: true
              }
            };
          } else if (observationResult.newObjective) {
            logger.info(`🎯 Task next objective: ${observationResult.newObjective}`);
          }
        }

        // 🔧 移除task_observation事件，前端不需要
        
        // 🔄 简化动态规划逻辑（保留工作流适应能力但减少复杂度）
        let shouldAdaptWorkflow = false;
        
        // 只在失败时考虑工作流适应
        if (!executionResult.success && i < state.workflow.length - 2) {
          shouldAdaptWorkflow = await this.shouldAdaptWorkflow(state, currentStep);
        }
        
        if (shouldAdaptWorkflow) {
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
            
            // 🔧 移除workflow_adapted事件，前端不需要
            
            logger.info(`✅ Workflow adapted: ${adaptedWorkflow.length} new steps planned`);
          }
        }
        
        // 🎯 直接完成检测：如果判断任务已完成，立即退出
        if (!shouldContinue) {
          logger.info(`🏁 Task completion detected, stopping workflow execution`);
          break;
        }
      }

      // 🔧 检查完成状态
      state.isComplete = state.completedSteps > 0; // 至少有一步成功就算部分完成

      // 🔧 生成最终结果
      const finalResult = this.generateWorkflowFinalResult(state);
      const overallSuccess = state.completedSteps > 0;
      
      // 🔧 发送generating_summary事件
      yield {
        event: 'generating_summary',
        data: {
          message: 'Generating summary...',
          agentName: 'WorkflowEngine'
        }
      };

      // 🔧 发送workflow_complete事件
      yield {
        event: 'workflow_complete',
        data: {
          message: 'Workflow completed',
          agentName: 'WorkflowEngine'
        }
      };

      // 🔧 发送task_complete事件
      yield {
        event: 'task_complete',
        data: {
          agentName: 'WorkflowEngine'
        }
      };

      // 🔧 保存最终结果
      await this.saveWorkflowFinalResult(taskId, state, finalResult);

      return state.completedSteps > 0;

    } catch (error) {
      logger.error(`❌ Enhanced workflow execution failed:`, error);
      
      yield {
        event: 'error',
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
              console.log(`\n🔧 === MCP Auth Injection Debug (Enhanced Engine) ===`);
              console.log(`MCP Name: ${mcpName}`);
              console.log(`User ID: ${userId}`);
              console.log(`Task ID: ${taskId}`);
              console.log(`Auth Data Keys: ${Object.keys(userAuth.authData)}`);
              console.log(`Auth Params: ${JSON.stringify(mcpConfig.authParams, null, 2)}`);
              console.log(`Env Config: ${JSON.stringify(mcpConfig.env, null, 2)}`);
              
              const dynamicEnv = { ...mcpConfig.env };
              if (mcpConfig.env) {
                for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
                  console.log(`Checking env var: ${envKey} = "${envValue}"`);
                  
                  // 🔧 改进：检查用户认证数据中是否有对应的键
                  let authValue = userAuth.authData[envKey];
                  
                  // 🔧 如果直接键名不存在，尝试从authParams映射中查找
                  if (!authValue && mcpConfig.authParams && mcpConfig.authParams[envKey]) {
                    const authParamKey = mcpConfig.authParams[envKey];
                    authValue = userAuth.authData[authParamKey];
                    console.log(`🔧 Trying authParams mapping: ${envKey} -> ${authParamKey}, value: "${authValue}"`);
                  }
                  
                  if ((!envValue || envValue === '') && authValue) {
                    dynamicEnv[envKey] = authValue;
                    console.log(`✅ Injected ${envKey} = "${authValue}"`);
                    logger.info(`Injected authentication for ${envKey} in MCP ${mcpName} for user ${userId}`);
                  } else {
                    console.log(`❌ Not injecting ${envKey}: envValue="${envValue}", authValue: "${authValue}"`);
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

        // 🔧 新增：智能参数转换，确保参数名与工具 schema 匹配
        let convertedInput = await this.convertParametersForMCP(step.mcp, toolName, input, task.userId);
        
        // 🔧 NEW: 使用LLM进行智能内容转换，防止占位符问题
        convertedInput = await this.convertParametersWithLLM(toolName, convertedInput, step.mcp, task.userId);
        logger.info(`📝 Final Converted Input: ${JSON.stringify(convertedInput, null, 2)}`);

        // 🔧 NEW: Twitter工作流智能修复 - 检测并修复publish_draft无draft_id的问题
        const { finalToolName, finalInput } = await this.handleTwitterWorkflowFix(
          step.mcp, 
          toolName, 
          convertedInput, 
          state, 
          task.userId
        );

        const result = await this.mcpToolAdapter.callTool(
          step.mcp,
          finalToolName,
          finalInput,
          task.userId
        );

        // 🔧 新增：x-mcp自动发布处理（与Agent引擎保持一致）
        const finalResult = await this.handleXMcpAutoPublish(step.mcp, finalToolName, result, task.userId);
        
        logger.info(`✅ MCP ${step.mcp} execution successful - returning original MCP structure`);
        return { success: true, result: finalResult, actualArgs: input };
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
   * 🧠 使用LLM智能判断是否需要重新推断步骤输入
   */
  private async shouldReinferStepInput(step: WorkflowStep, state: EnhancedWorkflowState, currentInput: any): Promise<boolean> {
    try {
      const judgmentPrompt = `You are an expert data quality analyst. Your task is to determine if step input data contains placeholders, incomplete information, or needs to be re-inferred from previous results.

**Current Step:**
- Action: ${step.action}
- MCP: ${step.mcp}
- Current Input: ${JSON.stringify(currentInput, null, 2)}

**Previous Execution Results:**
${state.executionHistory.length > 0 ? state.executionHistory.map((entry, index) => `
Step ${entry.stepNumber}: ${entry.action}
- Success: ${entry.success}
- Result Available: ${entry.result ? 'Yes' : 'No'}
${entry.result ? `- Result Preview: ${JSON.stringify(entry.result, null, 2).substring(0, 500)}...` : ''}
`).join('\n') : 'No previous results available'}

**Data Store:**
${JSON.stringify(state.dataStore, null, 2)}

**INTELLIGENT ANALYSIS:**

Analyze the current input and determine if it needs to be re-inferred. Consider:

1. **Placeholder Detection**: Does the input contain obvious placeholders, template text, or incomplete data?
2. **Relevance Check**: Is the current input appropriate for the intended action?
3. **Data Dependency**: Should this step use data from previous steps instead of the current input?
4. **Completeness**: Is the input sufficient and meaningful for the tool to execute successfully?

**Examples of inputs that NEED re-inference:**
- Contains "[Insert", "placeholder", "template", "example"
- Generic descriptive text instead of actual data
- Empty or null required parameters
- Mismatched data types for the action
- References to unavailable data

**Examples of inputs that are GOOD:**
- Actual data values that match the tool requirements
- Properly formatted parameters
- Real content ready for processing
- Complete and meaningful data

**CRITICAL THINKING:**
- If previous steps have produced useful results, should this step use that data instead?
- Does the current input look like it was generated by a template rather than extracted from real data?
- Would a reasonable person consider this input ready for tool execution?

**OUTPUT FORMAT (JSON only):**
{
  "shouldReinfer": true/false,
  "reasoning": "Detailed explanation of why re-inference is or isn't needed",
  "confidence": 0.0-1.0
}

Analyze the data quality now:`;

      const response = await this.llm.invoke([new SystemMessage(judgmentPrompt)]);
      const responseText = response.content.toString().trim();
      
      try {
        let cleanedJson = responseText;
        cleanedJson = cleanedJson.replace(/```json\s*|\s*```/g, '');
        
        const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const judgment = JSON.parse(jsonMatch[0]);
          
          logger.info(`🧠 LLM Input Quality Judgment:`, {
            shouldReinfer: judgment.shouldReinfer,
            reasoning: judgment.reasoning,
            confidence: judgment.confidence
          });
          
          return judgment.shouldReinfer === true;
        }
      } catch (parseError) {
        logger.warn(`⚠️ Failed to parse LLM judgment, defaulting to safe re-inference: ${parseError}`);
      }
      
      // 降级方案：如果解析失败，检查是否有前一步的结果可用
      return state.dataStore.lastResult !== undefined;
      
    } catch (error) {
      logger.error(`❌ Input quality judgment failed: ${error}`);
      // 降级方案：如果判断失败，检查是否有前一步的结果
      return state.dataStore.lastResult !== undefined;
    }
  }

  /**
   * 从上下文推导步骤输入参数
   */
  private async inferStepInputFromContext(step: WorkflowStep, state: EnhancedWorkflowState): Promise<any> {
    // 🔧 使用LLM进行智能参数推导，防止生成占位符
    const lastResult = state.dataStore.lastResult;
    const action = step.action.toLowerCase();
    
    if (!lastResult) {
      return {};
    }
    
    try {
      // 使用LLM智能提取实际数据
      const inferencePrompt = `You are an expert data extraction assistant. Your task is to extract ACTUAL DATA from the previous step result to create appropriate input parameters for the next action.

**Previous Step Result:**
${JSON.stringify(lastResult, null, 2)}

**Next Action:** ${step.action}
**MCP Service:** ${step.mcp}

**CRITICAL RULES:**
1. **NEVER use placeholders or descriptions** - always extract ACTUAL DATA
2. **Extract real content** from the previous result
3. **If data exists**: Use it directly, never summarize or describe it
4. **If no relevant data**: Return empty object {}, never use descriptive text
5. **DO NOT generate** "[Insert Data Here]" or similar placeholders

**EXAMPLES OF CORRECT EXTRACTION:**
- If previous result contains "Hello world" → use "Hello world"
- If previous result contains {"content": "Bitcoin up 5%"} → use "Bitcoin up 5%"
- If previous result has array of data → extract the relevant items
- If previous result has URLs/links → include them

**EXAMPLES OF WRONG BEHAVIOR:**
- NEVER: Use placeholder text or templates
- NEVER: Use descriptive summaries instead of actual data
- NEVER: Use generic examples or sample data
- NEVER: Use incomplete or missing information
- NEVER: Use data that doesn't match the action requirements

**SMART EXTRACTION RULES:**
- For tweet/post actions: Extract actual text content
- For search actions: Extract search terms or queries
- For publish actions: Extract content to be published OR draft_id if available
- For data analysis: Extract the actual data points
- For publish_draft actions: Extract draft_id from previous create_draft result, if no draft_id available, return empty object

**OUTPUT FORMAT:**
Return a JSON object with the extracted parameters:
{
  "parameterName": "actual_extracted_value"
}

Extract the actual data now:`;

      const response = await this.llm.invoke([new SystemMessage(inferencePrompt)]);
      const responseText = response.content.toString().trim();
      
      // 解析LLM响应
      let extractedParams;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedParams = JSON.parse(jsonMatch[0]);
        } else {
          extractedParams = JSON.parse(responseText);
        }
      } catch (parseError) {
        logger.warn(`❌ Failed to parse LLM inference response, using fallback: ${parseError}`);
        extractedParams = this.fallbackInferenceLogic(step, lastResult);
      }
      
      logger.info(`🔍 Inferred input parameters: ${JSON.stringify(extractedParams, null, 2)}`);
      return extractedParams;
      
    } catch (error) {
      logger.error(`❌ Smart inference failed, using fallback logic: ${error}`);
      return this.fallbackInferenceLogic(step, lastResult);
    }
  }
  
  /**
   * 降级推导逻辑
   */
  private fallbackInferenceLogic(step: WorkflowStep, lastResult: any): any {
    const action = step.action.toLowerCase();
    
    // 简单的降级推导逻辑
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
      if (action.includes('publish') && lastResult.content) {
        return { content: lastResult.content };
      }
      // 通用情况：提取第一个字符串值
      const firstStringValue = this.extractFirstStringValue(lastResult);
      if (firstStringValue) {
        return { content: firstStringValue };
      }
    }
    
    return {};
  }
  
  /**
   * 提取对象中第一个有意义的字符串值
   */
  private extractFirstStringValue(obj: any): string | null {
    if (typeof obj === 'string') {
      return obj;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.length > 0 && !key.toLowerCase().includes('id')) {
          return value;
        }
      }
    }
    
    return null;
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
   * 🧠 智能任务复杂度分析（针对任务引擎优化）
   */
  private async analyzeTaskComplexity(
    query: string, 
    workflowSteps: number
  ): Promise<{
    type: 'simple_query' | 'medium_task' | 'complex_workflow';
    recommendedObservation: 'fast' | 'balanced' | 'thorough';
    shouldCompleteEarly: boolean;
    reasoning: string;
  }> {
    try {
      // 🔍 基于模式的快速分析
      const quickAnalysis = this.quickTaskComplexityAnalysis(query, workflowSteps);
      if (quickAnalysis) {
        return quickAnalysis;
      }

      // 🧠 LLM深度分析（用于边缘情况）
      const analysisPrompt = `Analyze the task complexity for workflow execution and recommend observation strategy.

**User Query**: "${query}"
**Workflow Steps**: ${workflowSteps} steps

**Task Types:**
1. **SIMPLE_QUERY** (Direct data requests):
   - "Show me...", "Get current...", "What is..."
   - Single data point requests
   - Basic information lookup
   - Observation: Fast - complete after first success

2. **MEDIUM_TASK** (Multi-step operations):
   - "Compare X and Y", "Analyze trends"
   - Data processing and basic analysis
   - Sequential operations with dependencies
   - Observation: Balanced - observe key checkpoints

3. **COMPLEX_WORKFLOW** (Comprehensive tasks):
   - Multi-source analysis with transformations
   - Complex decision workflows
   - Extensive data processing chains
   - Observation: Thorough - observe every step

**OUTPUT FORMAT (JSON only):**
{
  "type": "simple_query|medium_task|complex_workflow",
  "recommended_observation": "fast|balanced|thorough",
  "should_complete_early": true/false,
  "reasoning": "Brief explanation of complexity assessment"
}`;

      const response = await this.llm.invoke([new SystemMessage(analysisPrompt)]);
      const content = response.content as string;
      
      // 解析LLM响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type || 'medium_task',
          recommendedObservation: parsed.recommended_observation || 'balanced',
          shouldCompleteEarly: parsed.should_complete_early || false,
          reasoning: parsed.reasoning || 'LLM analysis completed'
        };
      }
    } catch (error) {
      logger.warn(`Task complexity analysis failed: ${error}`);
    }

    // 默认中等复杂度
    return {
      type: 'medium_task',
      recommendedObservation: 'balanced',
      shouldCompleteEarly: false,
      reasoning: 'Default complexity analysis'
    };
  }

  /**
   * 🔍 快速模式匹配复杂度分析（针对任务引擎）
   */
  private quickTaskComplexityAnalysis(
    query: string, 
    workflowSteps: number
  ): {
    type: 'simple_query' | 'medium_task' | 'complex_workflow';
    recommendedObservation: 'fast' | 'balanced' | 'thorough';
    shouldCompleteEarly: boolean;
    reasoning: string;
  } | null {
    const lowerQuery = query.toLowerCase().trim();

    // 🟢 简单查询模式 (1-2 steps, fast completion)
    const simplePatterns = [
      /^(show me|get|fetch|what is|current|latest)\s/,
      /^(how much|how many|price of|value of)\s/,
      /^(status of|info about|details of)\s/,
      /\b(index|price|value|status|information)\s*(of|for)?\s*\w+$/,
      /^(get current|show current|fetch latest)\s/
    ];

    if (simplePatterns.some(pattern => pattern.test(lowerQuery)) || workflowSteps <= 2) {
      return {
        type: 'simple_query',
        recommendedObservation: 'fast',
        shouldCompleteEarly: true,
        reasoning: 'Direct data query - fast completion after first success'
      };
    }

    // 🟡 中等任务模式 (3-5 steps, balanced observation)
    const mediumPatterns = [
      /\b(compare|analyze|calculate|process)\b/,
      /\b(then|after|next|followed by)\b/,
      /\b(both|all|multiple|several)\b/,
      /\band\s+\w+\s+(also|too|as well)/,
      /\b(summary|report|overview)\b/
    ];

    if (mediumPatterns.some(pattern => pattern.test(lowerQuery)) || (workflowSteps >= 3 && workflowSteps <= 5)) {
      return {
        type: 'medium_task',
        recommendedObservation: 'balanced',
        shouldCompleteEarly: false,
        reasoning: 'Multi-step task requiring balanced observation'
      };
    }

    // 🔴 复杂工作流模式 (6+ steps, thorough observation)
    const complexPatterns = [
      /\b(workflow|pipeline|process.*step)\b/,
      /\b(first.*then.*finally|step.*step.*step)\b/,
      /\b(comprehensive|detailed|thorough)\s+(analysis|report|study)\b/,
      /\b(multiple.*and.*then)\b/,
      /\b(optimize|automate|integrate)\b/
    ];

    if (complexPatterns.some(pattern => pattern.test(lowerQuery)) || workflowSteps > 5 || lowerQuery.length > 100) {
      return {
        type: 'complex_workflow',
        recommendedObservation: 'thorough',
        shouldCompleteEarly: false,
        reasoning: 'Complex multi-step workflow requiring thorough observation'
      };
    }

    return null; // 需要LLM深度分析
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
  state: EnhancedWorkflowState,
  taskComplexity?: { type: string; recommendedObservation: string; shouldCompleteEarly: boolean; reasoning: string }
): Promise<{
  shouldContinue: boolean;
  shouldAdaptWorkflow: boolean;
  adaptationReason?: string;
  newObjective?: string;
}> {
  try {
    const observerPrompt = this.buildTaskObserverPrompt(state, taskComplexity);
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
 * 🔧 构建任务观察提示词（智能复杂度感知）
 */
private buildTaskObserverPrompt(
  state: EnhancedWorkflowState,
  taskComplexity?: { type: string; recommendedObservation: string; shouldCompleteEarly: boolean; reasoning: string }
): string {
  return `You are analyzing whether sufficient work has been completed to answer the user's question.

## 📋 USER'S ORIGINAL QUESTION
"${state.originalQuery}"

## 📊 EXECUTION ANALYSIS

### Execution History
${state.executionHistory.map(step => `
**Step ${step.stepNumber}**: ${step.action}
- Status: ${step.success ? '✅ Success' : '❌ Failed'}
- MCP: ${step.mcpName}
- Data Retrieved: ${step.success && step.result ? 'Yes' : 'No'}
${step.success && step.result ? `- Raw Result Data: ${JSON.stringify(step.result, null, 2)}` : ''}
${step.error ? `- Error: ${step.error}` : ''}
`).join('\n')}

### Critical Analysis Required
**🔍 DETAILED COMPARISON NEEDED**:

1. **Parse the user's original request** - What EXACTLY did they ask for?
2. **Analyze the collected data** - What have we actually obtained so far?
3. **Gap Analysis** - What is missing between request and current data?

**🚨 CRITICAL**: For requests mentioning multiple items/users/targets:
- Count how many were requested vs how many we have data for
- Example: User asks for "A, B, C, D" but we only have data for "A, B" → INCOMPLETE!

## 🧠 INTELLIGENT ANALYSIS REQUIRED

**Critical Questions**: 
1. Does the collected data contain the specific information requested by the user?
2. Can you identify and extract the exact answer from the available data?
3. Is the data recent, relevant, and sufficient in scope?

**For "${state.originalQuery}"**:
**INTELLIGENT ANALYSIS**:
Analyze the user's original request: "${state.originalQuery}"

Ask yourself:
1. What EXACTLY did the user ask for?
2. What are the KEY COMPONENTS that must be completed?
3. Are there multiple parts/targets/items mentioned?
4. What is the END GOAL the user wants to achieve?
5. Has that end goal been fully achieved with current data/actions?

**CRITICAL THINKING** (Be extremely thorough):
- Count EXACTLY what the user requested vs what we have
- Don't assume "some data = complete" - verify COMPLETENESS
- For multi-target requests: ALL targets must be processed
- Examine each result summary above: does it contain the requested information?
- Ask: "Would a reasonable person consider this request fully satisfied?"
- If user asked for data on 8 users but we only have 2 → CLEARLY INCOMPLETE
- If user asked for posting/publishing but only collected data → INCOMPLETE
- Use logical reasoning: partial completion ≠ task completion

## 🎯 DECISION LOGIC

**🧠 USE YOUR INTELLIGENCE TO JUDGE**:
- Read the user's original request carefully
- Look at what has been accomplished so far
- Consider whether a reasonable person would say "this request has been fulfilled"
- Don't be overly strict, but also don't accept partial completion as full success
- If the user asked for multiple things, check if ALL of them have been addressed
- If the user asked for an action (like posting), check if that action actually happened

**DECISION GUIDELINES**:
✅ Mark COMPLETE if: EVERY SINGLE item/user/target in the original request has been processed
❌ Mark CONTINUE if: ANY item/user/target from the original request is missing

**🚨 MANDATORY CHECK**: 
- Count total items requested in original query
- Count total items successfully processed  
- If numbers don't match → MUST continue
- Example: 8 users requested, 3 users processed → 5 still missing → CONTINUE!

**OUTPUT FORMAT (JSON only)**:
{
  "shouldContinue": true/false,
  "reasoning": "Focus on whether the specific user question can be answered with available data",
  "newObjective": "If continue, what specific missing information is needed?",
  "shouldAdaptWorkflow": false
}

**🚨 THINK LIKE A HUMAN**: 
Would a reasonable person consider this request fulfilled based on what has been accomplished? 
Use your intelligence and common sense to make the judgment.`;
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
    let jsonText = content.trim();
    jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
    jsonText = jsonText.replace(/```\s*|\s*```/g, '');
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        shouldContinue: parsed.shouldContinue !== false,
        shouldAdaptWorkflow: parsed.shouldAdaptWorkflow === true,
        adaptationReason: parsed.reasoning,
        newObjective: parsed.newObjective
      };
    }
  } catch (error) {
    logger.warn(`Task observation parsing failed: ${error}`);
  }
  
  // 降级方案
  return { 
    shouldContinue: true, 
    shouldAdaptWorkflow: false 
  };
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
      // 🔧 纯粹的格式转换：JSON → Markdown（智能长度控制）
      const dataString = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
      const isLongData = dataString.length > 3000; // 超过3000字符认为是长数据
      
      const formatPrompt = `Convert this JSON data to clean, readable Markdown format. Output the formatted Markdown directly without any code blocks or wrappers.

**Data to format:**
${dataString}

**Formatting rules:**
- Convert JSON structure to clear Markdown
- Use tables for object data when helpful
- Use lists for arrays
- Make long numbers readable with commas
- Output the formatted Markdown directly
- DO NOT wrap in code blocks or backticks
- DO NOT add explanations or descriptions

${isLongData ? `
**IMPORTANT - Data Length Control:**
This is a large dataset. Apply smart filtering:
- Show only the most important/commonly used fields
- For blockchain data: show hash, number, gasUsed, gasLimit, miner, timestamp, parentHash
- Skip verbose fields like logsBloom, extraData, mix_hash unless they contain short meaningful values
- For large objects: show top 10-15 most relevant fields
- Always prioritize user-actionable or identifying information
- Keep the output concise and focused
` : `
**Standard formatting:**
- Keep ALL original data values
- Format all available fields
`}
- ONLY return the formatted data`;


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
      const dataString = JSON.stringify(rawResult, null, 2);
      // 🔧 移除长数据判断限制，允许处理任意长度的数据
      const isLongData = false; // dataString.length > 3000; // 移除3000字符限制
      
      const prompt = `Convert this JSON data to clean, readable Markdown format. Output the formatted Markdown directly without any code blocks or wrappers.

**Data to format:**
${dataString}

**Formatting rules:**
- Convert JSON structure to clear Markdown
- Use tables for object data when helpful
- Use lists for arrays
- Make long numbers readable with commas
- Output the formatted Markdown directly
- DO NOT wrap in code blocks or backticks
- DO NOT add explanations or descriptions

${isLongData ? `
**IMPORTANT - Data Length Control:**
This is a large dataset. Apply smart filtering:
- Show only the most important/commonly used fields
- For blockchain data: show hash, number, gasUsed, gasLimit, miner, timestamp, parentHash
- Skip verbose fields like logsBloom, extraData, mix_hash unless they contain short meaningful values
- For large objects: show top 10-15 most relevant fields
- Always prioritize user-actionable or identifying information
- Keep the output concise and focused
` : `
**Standard formatting:**
- Keep ALL original data values
- Format all available fields
`}
- ONLY return the formatted data`;

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
        // 🔧 与Agent引擎完全一致的content格式和metadata结构
        const toolName = actualToolName || step.action;
        const rawContent = `WorkflowEngine Step ${stepNumber} Raw Result: ${toolName}

${JSON.stringify(rawResult, null, 2)}`;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: rawContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: toolName,
            taskPhase: 'execution',
            contentType: 'raw_result',
            agentName: 'WorkflowEngine',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: toolName,
              mcpName: mcpName,
              args: actualArgs || step.input || {},
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            },
            executionDetails: {
              rawResult: rawResult,
              success: true,
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
        // 🔧 与Agent引擎完全一致的content格式和metadata结构
        const toolName = actualToolName || step.action;
        const resultType = toolType === 'llm' ? 'LLM Result' : 'Formatted Result';
        const formattedContent = `WorkflowEngine Step ${stepNumber} ${resultType}: ${toolName}

${formattedResult}`;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: formattedContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: stepNumber,
            stepName: toolName,
            taskPhase: 'execution',
            contentType: 'formatted_result',
            agentName: 'WorkflowEngine',
            isComplete: true,
            toolDetails: {
              toolType: toolType,
              toolName: toolName,
              mcpName: mcpName,
              args: actualArgs || step.input || {},
              expectedOutput: expectedOutput,
              reasoning: reasoning,
              timestamp: new Date().toISOString()
            },
            executionDetails: {
              formattedResult: formattedResult,
              success: true,
              processingInfo: {
                formattedDataSize: formattedResult.length,
                processingTime: new Date().toISOString()
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

  /**
   * 🎯 检查任务是否已收集足够数据（参考Agent引擎的直接判断方法）
   */
  private async hasTaskCollectedSufficientData(state: EnhancedWorkflowState): Promise<boolean> {
    // 基于数据存储和执行历史的快速判断
    const hasSuccessfulSteps = state.completedSteps > 0;
    const hasUsefulData = Object.keys(state.dataStore).length > 1; // 除了 lastResult 还有其他数据
    
    return hasSuccessfulSteps && hasUsefulData;
  }

  /**
   * 🎯 快速任务完成检查（参考Agent引擎的简化判断逻辑）
   */
  // 🔧 移除硬编码的快速完成检查，现在使用智能观察阶段

  /**
   * 🎯 简化的工作流适应判断（减少复杂度）
   */
  private async shouldAdaptWorkflow(state: EnhancedWorkflowState, currentStep: WorkflowStep): Promise<boolean> {
    // 简化的适应判断：只在连续失败时适应
    const recentFailures = state.executionHistory
      .slice(-2) // 最近2步
      .filter(step => !step.success);
    
    return recentFailures.length >= 2; // 连续2步失败才适应
  }

  /**
   * 🔧 新增：为 MCP 转换参数，确保参数名与工具 schema 匹配
   */
  private async convertParametersForMCP(mcpName: string, toolName: string, input: any, userId: string): Promise<any> {
    try {
      logger.info(`🔄 Converting parameters for MCP tool: ${mcpName}.${toolName}`);

      // 获取 MCP 工具的 schema
      const mcpTools = await this.mcpManager.getTools(mcpName, userId);
      const targetTool = mcpTools.find(tool => tool.name === toolName);
      
      if (!targetTool || !targetTool.inputSchema) {
        logger.info(`🔍 No schema found for ${mcpName}.${toolName}, returning original input`);
        return input;
      }

      // 执行参数名转换
      const convertedParams = this.preprocessParameterNames(input, targetTool.inputSchema);
      
      if (JSON.stringify(convertedParams) !== JSON.stringify(input)) {
        logger.info(`🔧 Parameters converted for ${mcpName}.${toolName}: ${JSON.stringify(input)} → ${JSON.stringify(convertedParams)}`);
      }

      return convertedParams;

    } catch (error) {
      logger.error(`❌ Parameter conversion failed for ${mcpName}.${toolName}:`, error);
      return input; // 回退到原始输入
    }
  }

  /**
   * 🔧 使用LLM进行智能参数转换，防止占位符问题（复制自AgentIntelligentEngine）
   */
  private async convertParametersWithLLM(toolName: string, originalArgs: any, mcpName: string, userId: string): Promise<any> {
    try {
      logger.info(`🔄 Converting parameters for tool: ${toolName}`);

      // 获取MCP工具信息
      const mcpTools = await this.mcpManager.getTools(mcpName, userId);
      
      // 🔧 新增：预处理参数名映射（camelCase 到 snake_case）
      const preprocessedArgs = this.preprocessParameterNames(originalArgs, mcpTools[0]?.inputSchema);
      if (JSON.stringify(preprocessedArgs) !== JSON.stringify(originalArgs)) {
        logger.info(`🔧 Parameter names preprocessed: ${JSON.stringify(originalArgs)} → ${JSON.stringify(preprocessedArgs)}`);
      }

      // 构建智能参数转换提示词
      const conversionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform parameters for MCP tool calls.

CONTEXT:
- Tool to call: ${toolName}
- MCP Service: ${mcpName}
- Input parameters: ${JSON.stringify(preprocessedArgs, null, 2)}
- Available tools with their schemas:
${mcpTools.map(tool => {
  const schema = tool.inputSchema || {};
  return `
Tool: ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema: ${JSON.stringify(schema, null, 2)}
`;
}).join('\n')}

TRANSFORMATION PRINCIPLES:
1. **Use exact tool name**: ${toolName}
2. **Transform parameters**: Convert input into correct format for the tool
3. **CRITICAL: Use exact parameter names from the schema**: 
   - ALWAYS check the inputSchema and use the exact parameter names shown
   - For example, if the schema shows "text" as parameter name, use "text" NOT "tweet" or other variations
   - Match the exact property names shown in the inputSchema
4. **EXTRACT REAL DATA FROM CONTEXT**: 
   - If previous step results are available: Extract the ACTUAL CONTENT, never use placeholders
   - Look for real text, summaries, data in the previous results
   - Use the exact content from previous step, not descriptions like "Summary of @user's tweets"
   - Example: If previous result contains "Here's the summary: Bitcoin price is up 5%" → use "Bitcoin price is up 5%"
5. **Handle missing data intelligently**: 
   - CRITICAL: NEVER use placeholders or descriptions - always extract ACTUAL DATA
   - For required data: Find and extract the real content from the input or previous results
   - If actual data exists: Use it directly, never summarize or describe it
   - If data is truly missing: Return empty string or null, never use descriptive text
   - DO NOT use hardcoded examples, templates, or placeholder descriptions

CRITICAL TWITTER RULES:
- Twitter has a HARD 280 character limit!
- Count ALL characters including spaces, emojis, URLs, hashtags
- If content is too long, you MUST:
  1. Use abbreviations (e.g., "w/" for "with")
  2. Shorten usernames (e.g., "@user" instead of full names)
  3. Remove less important details
  4. Keep URLs whenever possible as they are valuable references
  5. If URLs must be removed due to length, prefer keeping the most important ones
- For threads: First tweet should be <250 chars to leave room for thread numbering
- PRIORITY: Always try to include original tweet URLs when space allows

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "toolName": "${toolName}",
  "inputParams": { /* transformed parameters using EXACT parameter names from the tool's input schema */ },
  "reasoning": "brief explanation of parameter transformation"
}

CRITICAL CONTENT EXTRACTION:
- When previous step results contain actual content: EXTRACT THE REAL TEXT, never use placeholders
- Example: If previous contains "Summary: Bitcoin is trending up 5%" → use "Bitcoin is trending up 5%"
- NEVER use "[Insert summary here]" or "Latest tweet content from @user" - extract actual content!
- ALWAYS extract and include tweet URLs/links when available in the source data
- Format URLs efficiently to save characters (use bit.ly style if needed)

IMPORTANT: Always use exact parameter names from the inputSchema, ensure Twitter content is under 280 characters, and EXTRACT REAL CONTENT from previous results!

Transform the data now:`;

      const response = await this.llm.invoke([new SystemMessage(conversionPrompt)]);

      let conversion;
      try {
        const responseText = response.content.toString().trim();
        logger.info(`🔍 === LLM Parameter Conversion Debug ===`);
        logger.info(`🔍 Raw LLM Response: ${responseText}`);
        
        // 清理JSON响应
        let cleanedJson = responseText;
        cleanedJson = cleanedJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // 提取完整JSON
        const extractedJson = this.extractCompleteJson(cleanedJson);
        if (extractedJson) {
          cleanedJson = extractedJson;
        }
        
        conversion = JSON.parse(cleanedJson);
        logger.info(`🔍 Parsed Conversion: ${JSON.stringify(conversion, null, 2)}`);
      } catch (parseError) {
        logger.error(`❌ Failed to parse parameter conversion response: ${response.content}`);
        logger.error(`❌ Parse error: ${parseError}`);
        logger.info(`🔍 Falling back to preprocessedArgs: ${JSON.stringify(preprocessedArgs, null, 2)}`);
        return preprocessedArgs; // 回退到预处理后的参数
      }

      const convertedParams = conversion.inputParams || preprocessedArgs;
      
      logger.info(`🔍 === Parameter Conversion Results ===`);
      logger.info(`🔍 Original Args: ${JSON.stringify(originalArgs, null, 2)}`);
      logger.info(`🔍 Converted Params: ${JSON.stringify(convertedParams, null, 2)}`);
      logger.info(`🔍 Conversion reasoning: ${conversion.reasoning || 'No reasoning provided'}`);
      logger.info(`🔍 =====================================`);
      
      return convertedParams;

    } catch (error) {
      logger.error(`❌ Parameter conversion failed:`, error);
      return originalArgs; // 回退到原始参数
    }
  }

  /**
   * Twitter工作流智能修复：检测并修复publish_draft无draft_id的问题
   */
  private async handleTwitterWorkflowFix(
    mcpName: string,
    toolName: string,
    input: any,
    state: EnhancedWorkflowState,
    userId?: string
  ): Promise<{ finalToolName: string; finalInput: any }> {
    // 只处理x-mcp的publish_draft操作
    const normalizedMcpName = this.normalizeMCPName(mcpName);
    if (normalizedMcpName !== 'x-mcp' || toolName !== 'publish_draft') {
      return { finalToolName: toolName, finalInput: input };
    }

    logger.info(`🔍 Twitter工作流检查: 检测到publish_draft操作`);

    // 检查是否有有效的draft_id
    const hasDraftId = input && input.draft_id && input.draft_id.trim() !== '';
    
    if (hasDraftId) {
      logger.info(`✅ Twitter工作流检查: 发现有效的draft_id="${input.draft_id}"`);
      return { finalToolName: toolName, finalInput: input };
    }

    // 检查是否有内容需要发布
    const hasContent = this.extractContentFromState(state);
    if (!hasContent) {
      logger.warn(`⚠️ Twitter工作流检查: 没有发现可发布的内容`);
      return { finalToolName: toolName, finalInput: input };
    }

    logger.info(`🔄 Twitter工作流修复: publish_draft缺少draft_id，切换到create_draft_thread`);
    
    // 从state中提取内容并创建thread
    const content = this.extractContentFromState(state);
    
    // 使用LLM优化内容为Twitter thread格式
    const optimizedContent = await this.optimizeContentForTwitterThread(content || '', userId);
    
    const threadInput = {
      content: optimizedContent
    };

    logger.info(`📝 Twitter工作流修复: 切换工具从 "${toolName}" 到 "create_draft_thread"`);
    logger.info(`📝 Twitter工作流修复: 新输入参数: ${JSON.stringify(threadInput, null, 2)}`);

    return { 
      finalToolName: 'create_draft_thread', 
      finalInput: threadInput 
    };
  }

  /**
   * 使用LLM优化内容为Twitter thread格式
   */
  private async optimizeContentForTwitterThread(content: string, userId?: string): Promise<string> {
    if (!content || content.trim().length === 0) {
      return content;
    }

    try {
      const optimizationPrompt = `You are a social media content optimization expert. Your task is to transform the provided content into an engaging Twitter thread format.

**Original Content:**
${content}

**Optimization Rules:**
1. **Character Limit**: Each tweet in the thread must be under 280 characters
2. **Thread Structure**: Start with "🧵 Thread" or similar indicator
3. **Engagement**: Use emojis, hashtags, and engaging language
4. **Clarity**: Break complex information into digestible chunks
5. **URLs**: Preserve any URLs from the original content
6. **Numbering**: Use 1/n, 2/n format if content is long enough for multiple tweets

**Output Requirements:**
- If content is under 250 characters: Return as single optimized tweet
- If content is longer: Structure as a thread with clear breaks
- Maintain the key information and insights from original content
- Make it engaging and Twitter-appropriate

Transform the content now:`;

      const response = await this.llm.invoke([new SystemMessage(optimizationPrompt)]);
      const optimizedContent = response.content.toString().trim();
      
      logger.info(`📝 Twitter内容优化: 原始长度=${content.length}, 优化后长度=${optimizedContent.length}`);
      
      return optimizedContent;
      
    } catch (error) {
      logger.error(`❌ Twitter内容优化失败:`, error);
      // 如果优化失败，返回原始内容的截断版本
      return content.length > 250 ? content.substring(0, 247) + '...' : content;
    }
  }

  /**
   * 从执行状态中提取可发布的内容
   */
  private extractContentFromState(state: EnhancedWorkflowState): string | null {
    // 检查dataStore中的内容
    if (state.dataStore.lastResult) {
      const lastResult = state.dataStore.lastResult;
      
      // 尝试提取文本内容
      if (typeof lastResult === 'string') {
        return lastResult;
      }
      
      if (lastResult && typeof lastResult === 'object') {
        // 检查常见的内容字段
        if (lastResult.content) return lastResult.content;
        if (lastResult.text) return lastResult.text;
        if (lastResult.summary) return lastResult.summary;
        if (lastResult.result) return lastResult.result;
        
        // 检查MCP格式的content数组
        if (lastResult.content && Array.isArray(lastResult.content)) {
          for (const item of lastResult.content) {
            if (item && item.text) {
              return item.text;
            }
          }
        }
        
        // 如果是复杂对象，将其转换为可读文本
        return JSON.stringify(lastResult, null, 2);
      }
    }
    
    // 检查执行历史中的最新数据
    if (state.executionHistory.length > 0) {
      const lastStep = state.executionHistory[state.executionHistory.length - 1];
      if (lastStep.success && lastStep.result) {
        const result = lastStep.result;
        
        if (typeof result === 'string') {
          return result;
        }
        
        if (result && typeof result === 'object') {
          if (result.content) return result.content;
          if (result.text) return result.text;
          if (result.summary) return result.summary;
          
          // 转换为可读文本
          return JSON.stringify(result, null, 2);
        }
      }
    }
    
    return null;
  }

  /**
   * x-mcp自动发布处理：当create_draft_tweet或create_draft_thread成功后自动发布
   * 🔧 与AgentIntelligentEngine保持完全一致
   */
  private async handleXMcpAutoPublish(
    mcpName: string, 
    toolName: string, 
    result: any, 
    userId?: string
  ): Promise<any> {
    // 🔧 添加详细调试信息
    const normalizedMcpName = this.normalizeMCPName(mcpName);
    logger.info(`🔍 EnhancedEngine X-MCP Auto-publish Check: mcpName="${mcpName}", normalizedMcpName="${normalizedMcpName}", toolName="${toolName}"`);
    
    // 只处理x-mcp的草稿创建操作
    if (normalizedMcpName !== 'x-mcp') {
      logger.info(`❌ EnhancedEngine X-MCP Auto-publish: Normalized MCP name "${normalizedMcpName}" is not "x-mcp", skipping auto-publish`);
      return result;
    }

    // 检查是否是草稿创建操作
    if (!toolName.includes('create_draft')) {
      logger.info(`❌ EnhancedEngine X-MCP Auto-publish: Tool name "${toolName}" does not include "create_draft", skipping auto-publish`);
      return result;
    }

    try {
      logger.info(`🔄 X-MCP Auto-publish: Detected ${toolName} completion, attempting auto-publish...`);

      // 提取draft_id - 与Agent引擎完全一致的逻辑
      let draftId = null;
      if (result && typeof result === 'object') {
        // 尝试从不同的结果格式中提取draft_id
        if (result.draft_id) {
          draftId = result.draft_id;
        } else if (result.content && Array.isArray(result.content)) {
          // MCP标准格式
          for (const content of result.content) {
            if (content.text) {
              try {
                const parsed = JSON.parse(content.text);
                if (parsed.draft_id) {
                  draftId = parsed.draft_id;
                  break;
                } else if (Array.isArray(parsed)) {
                  // 🔧 处理解析成功但是数组结构的情况
                  for (const nestedItem of parsed) {
                    if (nestedItem && nestedItem.text) {
                      const innerText = nestedItem.text;
                      const innerMatch = this.extractDraftIdFromText(innerText);
                      if (innerMatch) {
                        draftId = innerMatch;
                        logger.info(`📝 EnhancedEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
                        break;
                      }
                    }
                  }
                  if (draftId) break;
                }
              } catch {
                // 🔧 修复：处理嵌套JSON结构和文本提取
                let text = content.text;
                
                // 🔧 处理双重嵌套的JSON情况：text字段本身是JSON字符串
                try {
                  // 尝试解析text作为JSON数组
                  const nestedArray = JSON.parse(text);
                  if (Array.isArray(nestedArray)) {
                    // 遍历嵌套数组，寻找包含draft信息的文本
                    for (const nestedItem of nestedArray) {
                      if (nestedItem && nestedItem.text) {
                        const innerText = nestedItem.text;
                        // 先尝试从内层文本提取draft_id
                        const innerMatch = this.extractDraftIdFromText(innerText);
                        if (innerMatch) {
                          draftId = innerMatch;
                          logger.info(`📝 EnhancedEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
                          break;
                        }
                      }
                    }
                  }
                } catch {
                  // 如果不是JSON，继续用原文本进行模式匹配
                }
                
                // 如果嵌套解析没有找到，用原文本进行模式匹配
                if (!draftId) {
                  draftId = this.extractDraftIdFromText(text);
                  if (draftId) {
                    logger.info(`📝 EnhancedEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from text pattern matching`);
                  }
                }
                
                if (draftId) break;
              }
            }
          }
        }
      }
      
      // 🔧 修复：处理字符串类型的result
      if (!draftId && typeof result === 'string') {
        // 从字符串结果中提取
        try {
          const parsed = JSON.parse(result);
          if (parsed.draft_id) {
            draftId = parsed.draft_id;
          }
        } catch {
          // 🔧 修复：处理嵌套JSON和字符串文本中提取draft ID
          draftId = this.extractDraftIdFromText(result);
          if (draftId) {
            logger.info(`📝 EnhancedEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from string pattern matching`);
          }
        }
      }

      if (!draftId) {
        logger.warn(`⚠️ X-MCP Auto-publish: Could not extract draft_id from result: ${JSON.stringify(result)}`);
        return result;
      }

      logger.info(`📝 X-MCP Auto-publish: Extracted draft_id: ${draftId}`);

      // 调用publish_draft
      logger.info(`🚀 X-MCP Auto-publish: Publishing draft ${draftId}...`);
      
      const publishInput = { draft_id: draftId };
      logger.info(`📝 EnhancedEngine X-MCP Auto-publish INPUT: ${JSON.stringify(publishInput, null, 2)}`);
      
      const publishResult = await this.mcpToolAdapter.callTool(
        normalizedMcpName,
        'publish_draft',
        publishInput,
        userId
      );
      
      logger.info(`📤 EnhancedEngine X-MCP Auto-publish OUTPUT: ${JSON.stringify(publishResult, null, 2)}`);

      logger.info(`✅ X-MCP Auto-publish: Successfully published draft ${draftId}`);

      // 返回合并的结果 - 与Agent引擎完全一致
      return {
        draft_creation: result,
        auto_publish: publishResult,
        combined_result: `Draft created and published successfully. Draft ID: ${draftId}`,
        draft_id: draftId,
        published: true
      };

    } catch (error) {
      logger.error(`❌ X-MCP Auto-publish failed:`, error);
      
      // 即使发布失败，也返回原始的草稿创建结果 - 与Agent引擎完全一致
      return {
        draft_creation: result,
        auto_publish_error: error instanceof Error ? error.message : String(error),
        combined_result: `Draft created successfully but auto-publish failed. You may need to publish manually.`,
        published: false
      };
    }
  }

  /**
   * 从文本中提取draft_id的辅助方法 - 与Agent引擎完全一致
   */
  private extractDraftIdFromText(text: string): string | null {
    const patterns = [
      /draft[_-]?id["\s:]*([^"\s,}]+)/i,                    // draft_id: "xxx" 
      /with\s+id\s+([a-zA-Z0-9_.-]+\.json)/i,               // "with ID thread_draft_xxx.json"
      /created\s+with\s+id\s+([a-zA-Z0-9_.-]+\.json)/i,     // "created with ID xxx.json"
      /id[:\s]+([a-zA-Z0-9_.-]+\.json)/i,                   // "ID: xxx.json" 或 "ID xxx.json"
      /([a-zA-Z0-9_.-]*draft[a-zA-Z0-9_.-]*\.json)/i        // 任何包含draft的.json文件
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * 标准化MCP名称 - 与Agent引擎完全一致
   */
  private normalizeMCPName(mcpName: string): string {
    const nameMapping: Record<string, string> = {
      'twitter': 'twitter-client-mcp',
      'github': 'github-mcp',
      'coinmarketcap': 'coinmarketcap-mcp',
      'crypto': 'coinmarketcap-mcp',
      'web': 'brave-search-mcp',
      'search': 'brave-search-mcp',
      'x-mcp': 'x-mcp'  // 🔧 添加x-mcp的映射
    };

    return nameMapping[mcpName.toLowerCase()] || mcpName;
  }

  /**
   * 🔧 新增：预处理参数名（camelCase 到 snake_case）
   */
  private preprocessParameterNames(originalArgs: any, inputSchema: any): any {
    if (!originalArgs || typeof originalArgs !== 'object') {
      return originalArgs;
    }

    const schemaProperties = inputSchema.properties || {};
    const expectedParamNames = Object.keys(schemaProperties);
    
    logger.info(`🔧 Preprocessing parameters, expected: [${expectedParamNames.join(', ')}]`);

    const processedArgs: any = {};
    
    for (const [key, value] of Object.entries(originalArgs)) {
      let mappedKey = key;
      
      // 检查是否需要 camelCase -> snake_case 转换
      if (!expectedParamNames.includes(key)) {
        const snakeCaseKey = this.camelToSnakeCase(key);
        if (expectedParamNames.includes(snakeCaseKey)) {
          mappedKey = snakeCaseKey;
          logger.info(`🔧 Parameter name mapped: ${key} -> ${mappedKey}`);
        }
      }
      
      processedArgs[mappedKey] = value;
    }

    return processedArgs;
  }

  /**
   * 🔧 新增：camelCase 转 snake_case
   */
  private camelToSnakeCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
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
        // 🔧 发送错误事件
        stream({ 
          event: 'error', 
          data: { 
            message: 'Task not found'
          }
        });
        return false;
      }

      // 检查是否已有工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!skipAnalysisCheck && (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0)) {
        // 🔧 发送错误事件
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
      // 🔧 发送状态更新事件
      stream({ 
        event: 'status_update', 
        data: { 
          status: 'in_progress'
        }
      });

      // 使用增强引擎执行工作流
      const executionGenerator = this.engine.executeWorkflowEnhanced(taskId, mcpWorkflow);

      let finalSuccess = false;

      for await (const result of executionGenerator) {
        // 🔧 直接流式传输原始事件，不包装
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

      // 🔧 发送执行完成事件
      stream({
        event: 'task_execution_complete',
        data: {
          success: finalSuccess,
          message: finalSuccess ? 
            'Task execution completed successfully' : 
            'Task execution failed'
        }
      });

      logger.info(`✅ Enhanced workflow execution completed [Task: ${taskId}, Success: ${finalSuccess}]`);
      return finalSuccess;

    } catch (error) {
      logger.error(`❌ Enhanced workflow execution failed:`, error);
      
      // 🔧 发送错误事件
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