import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getPredefinedMCP } from './predefinedMCPs.js';
import { Agent } from '../models/agent.js';
import { getTaskService } from './taskService.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageType, MessageIntent, MessageStepType } from '../models/conversation.js';
import { resolveUserLanguage, getLanguageInstruction, SupportedLanguage } from '../utils/languageDetector.js';

/**
 * Agent执行计划
 */
export interface AgentExecutionPlan {
  tool: string;                    
  toolType: 'llm' | 'mcp';        
  mcpName?: string;               
  args: Record<string, any>;      
  expectedOutput: string;         
  reasoning: string;              
  agentContext: string;           // Agent上下文信息
}

/**
 * Agent执行步骤
 */
export interface AgentExecutionStep {
  stepNumber: number;
  plan: AgentExecutionPlan;
  result: any;
  success: boolean;
  error?: string;
  timestamp: Date;
  agentName: string;              // 执行的Agent名称
  stepId: string;                 // 步骤唯一ID
}

/**
 * Agent工作流状态
 */
export interface AgentWorkflowState {
  taskId: string;
  agentId: string;
  agentName: string;
  originalQuery: string;
  currentObjective: string;
  executionHistory: AgentExecutionStep[];
  dataStore: Record<string, any>;  // Agent数据存储
  currentPlan: AgentExecutionPlan | null;
  isComplete: boolean;
  maxIterations: number;
  currentIteration: number;
  errors: string[];
  lastError: string | null;
  // 🔧 简化：只保留失败处理
  failureHistory: FailureRecord[];    // 失败记录和处理策略
  userLanguage?: SupportedLanguage;   // 🌍 用户语言
}

/**
 * 🔧 新增：任务组件定义
 */
export interface TaskComponent {
  id: string;                    // 组件唯一ID
  type: 'data_collection' | 'data_processing' | 'action_execution' | 'analysis' | 'output';
  description: string;           // 组件描述
  isCompleted: boolean;         // 是否已完成
  completedStepNumbers: number[]; // 完成此组件的步骤号
  dependencies: string[];        // 依赖的其他组件ID
  requiredData: string[];       // 需要的数据类型
  outputData: string[];         // 产出的数据类型
}

/**
 * 🔧 新增：失败记录定义
 */
export interface FailureRecord {
  stepNumber: number;
  tool: string;
  error: string;
  attemptCount: number;
  lastAttemptTime: Date;
  suggestedStrategy: 'retry' | 'alternative' | 'skip' | 'manual_intervention';
  maxRetries: number;
}

/**
 * Agent专用智能引擎 - 为Agent交互专门设计
 */
export class AgentIntelligentEngine {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpToolAdapter: MCPToolAdapter;
  private mcpAuthService: MCPAuthService;
  private taskService: any;
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
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
   * Agent专用流式执行 - 原生支持Agent事件流格式
   */
  async *executeAgentTask(
    taskId: string,
    query: string,
    maxIterations: number = 20,  // 🔧 提高上限，作为安全网
    userLanguage?: SupportedLanguage  // 🌍 用户语言
  ): AsyncGenerator<{ event: string; data: any }, boolean, unknown> {
    logger.info(`🤖 Starting Agent intelligent execution [Task: ${taskId}, Agent: ${this.agent.name}]`);

    // 🧠 智能执行：动态判断，不预设步数限制
    logger.info(`🎯 Starting intelligent execution (max ${maxIterations} steps if needed)`);

    // 🔧 Agent专用：发送execution_start事件
    yield {
      event: 'execution_start',
      data: {
        taskId,
        agentName: this.agent.name,
        maxSteps: maxIterations,
        timestamp: new Date().toISOString(),
        message: `Starting intelligent execution with ${this.agent.name}...`
      }
    };

    // 🧠 移除预设任务分解，采用动态智能规划
    
    // 初始化Agent工作流状态
    const state: AgentWorkflowState = {
      taskId,
      agentId: this.agent.id,
      agentName: this.agent.name,
      originalQuery: query,
      currentObjective: query,
      executionHistory: [],
      dataStore: {},
      currentPlan: null,
      isComplete: false,
      maxIterations: maxIterations,
      currentIteration: 0,
      errors: [],
      lastError: null,
      // 🔧 简化：只保留必要的跟踪字段
      failureHistory: [],
      userLanguage  // 🌍 用户语言
    };

    let stepCounter = 0;
    
    // 🧠 智能进展监控
    let progressMonitor = {
      lastProgressStep: 0,
      consecutiveFailures: 0,
      stagnationCount: 0,
      repeatedActions: new Map<string, number>()
    };

    try {
      // 🔧 获取任务并应用Agent的MCP工作流配置
      await this.prepareAgentTask(taskId, state);

      // 🔧 Agent智能执行主循环 - 动态控制而非硬性限制
      while (!state.isComplete && this.shouldContinueExecution(state, progressMonitor, maxIterations)) {
        state.currentIteration++;
        stepCounter++;

        logger.info(`🧠 Agent ${this.agent.name} - Iteration ${state.currentIteration}`);

        // 🔧 第一步：直接的任务完成感知和智能规划
        const planResult = await this.agentPlanningPhaseEnhanced(state);
        if (!planResult.success) {
          yield {
            event: 'planning_error',
            data: {
              error: planResult.error,
              agentName: this.agent.name,
              step: stepCounter
            }
          };
          break;
        }

        state.currentPlan = planResult.plan || null;

        // 🎯 直接完成感知：如果规划阶段判断任务已完成，立即退出
        if (state.currentPlan?.tool === 'task_complete') {
          logger.info(`🎯 Agent ${this.agent.name} determined task is complete. Finalizing...`);
          state.isComplete = true;
          
          // 发送任务完成事件
          yield {
            event: 'step_complete',
            data: {
              step: stepCounter,
              success: true,
              result: `Task completed successfully by ${this.agent.name}. All required information has been collected and the user's request has been satisfied.`,
              agentName: this.agent.name,
              message: `${this.agent.name} has determined the task is complete`,
              taskComplete: true
            }
          };
          
          break; // 直接退出循环，不需要额外的观察阶段
        }

        // 🔧 发送Agent格式的step_start事件
        const stepId = `agent_step_${stepCounter}_${Date.now()}`;
        yield {
          event: 'step_start',
          data: {
            step: stepCounter,
            mcpName: state.currentPlan!.mcpName || this.agent.name,
            actionName: state.currentPlan!.tool,
            input: JSON.stringify(state.currentPlan!.args),
            agentName: this.agent.name,
            message: `${this.agent.name} is executing step ${stepCounter}: ${state.currentPlan!.tool}`
          }
        };

        // 🔧 发送Agent格式的step_thinking_start事件
        yield {
          event: 'step_thinking_start',
          data: {
            stepId,
            step: stepCounter,
            agentName: this.agent.name,
            message: `${this.agent.name} is planning: ${state.currentPlan!.tool}`
          }
        };

        // 🔧 第二步：Agent执行阶段 - 先执行获取实际参数
        const executionResult = await this.agentExecutionPhase(state, stepId);

        // 🔧 增强现有的step_executing事件 - 使用实际执行的参数
        yield {
          event: 'step_executing',
          data: {
            step: stepCounter,
            tool: executionResult.actualExecution?.toolName || state.currentPlan!.tool,
            agentName: this.agent.name,
            message: `${this.agent.name} is executing step ${stepCounter}: ${executionResult.actualExecution?.toolName || state.currentPlan!.tool}`,
            // 🔧 使用实际执行的详细信息
            toolDetails: {
              toolType: state.currentPlan!.toolType,
              toolName: executionResult.actualExecution?.toolName || state.currentPlan!.tool,
              mcpName: executionResult.actualExecution?.mcpName || state.currentPlan!.mcpName || null,
              args: executionResult.actualExecution?.args || state.currentPlan!.args,
              expectedOutput: state.currentPlan!.expectedOutput,
              reasoning: state.currentPlan!.reasoning,
              timestamp: new Date().toISOString()
            }
          }
        };

        // 🔧 增强现有的step_raw_result事件 - 保持兼容性
        if (executionResult.success && executionResult.result) {
            yield {
            event: 'step_raw_result',
              data: {
              step: stepCounter,
              success: true,
              result: executionResult.result,
                agentName: this.agent.name,
              // 🚀 优化：详细信息（避免数据重复存储）
              executionDetails: {
                toolType: state.currentPlan!.toolType,
                toolName: executionResult.actualExecution?.toolName || state.currentPlan!.tool,
                mcpName: executionResult.actualExecution?.mcpName || state.currentPlan!.mcpName || null,
                args: executionResult.actualExecution?.args || state.currentPlan!.args,
                expectedOutput: state.currentPlan!.expectedOutput,
                dataSize: this.getDataSizeNonBlocking(executionResult.result),
                timestamp: new Date().toISOString()
              }
              }
            };

          // 🚀 优化：后台异步存储原始结果 - 不阻塞用户响应
          setImmediate(() => {
            this.saveStepRawResult(taskId, stepCounter, state.currentPlan!, executionResult.result)
              .catch(error => {
                logger.error(`Background save raw result failed [Step: ${stepCounter}, Task: ${taskId}]:`, error);
              });
          });
          }

        // 🚀 优化：流式格式化同时收集完整结果，避免重复格式化
        let formattedResultForStorage = '';
        if (executionResult.success && executionResult.result) {
          if (state.currentPlan!.toolType === 'mcp') {
            // MCP工具：流式格式化同时收集完整结果
            const formatGenerator = this.formatAndStreamStepResult(
              executionResult.result,
              state.currentPlan!.mcpName || 'unknown',
              state.currentPlan!.tool
            );
            
            const chunks: string[] = [];
            for await (const chunk of formatGenerator) {
              chunks.push(chunk); // 收集格式化片段
              
              yield {
                event: 'step_result_chunk',
                data: {
                  step: stepCounter,
                  chunk,
                  agentName: this.agent.name
                }
              };
            }
            
            // 组合完整的格式化结果用于存储
            formattedResultForStorage = chunks.join('');
          } else {
            // LLM工具：直接使用原始结果（已经是格式化的）
            formattedResultForStorage = executionResult.result;
          }

          // 🔧 增强现有的step_formatted_result事件 - 保持兼容性
          yield {
            event: 'step_formatted_result',
            data: {
              step: stepCounter,
              success: true,
              formattedResult: formattedResultForStorage,
              agentName: this.agent.name,
              // 🚀 优化：详细信息（避免数据重复存储）
              formattingDetails: {
                toolType: state.currentPlan!.toolType,
                toolName: executionResult.actualExecution?.toolName || state.currentPlan!.tool,
                mcpName: executionResult.actualExecution?.mcpName || state.currentPlan!.mcpName || null,
                args: executionResult.actualExecution?.args || state.currentPlan!.args,
                processingInfo: {
                  originalDataSize: this.getDataSizeNonBlocking(executionResult.result),
                  formattedDataSize: formattedResultForStorage.length,
                  processingTime: new Date().toISOString(),
                  needsFormatting: state.currentPlan!.toolType === 'mcp' // 标识是否进行了格式化
                },
                timestamp: new Date().toISOString()
              }
            }
          };

          // 🚀 优化：后台异步存储格式化结果 - 不阻塞用户响应
          setImmediate(() => {
            this.saveStepFormattedResult(taskId, stepCounter, state.currentPlan!, formattedResultForStorage)
              .catch(error => {
                logger.error(`Background save formatted result failed [Step: ${stepCounter}, Task: ${taskId}]:`, error);
              });
          });
        }

        // 🔧 Agent格式的step_thinking_complete事件
        yield {
          event: 'step_thinking_complete',
          data: {
            stepId,
            step: stepCounter,
            success: executionResult.success,
            result: executionResult.result, // 保持原始结果用于下一步传递
            formattedResult: formattedResultForStorage, // 新增：格式化结果用于存储
            agentName: this.agent.name,
            ...(executionResult.error && { error: executionResult.error })
          }
        };

        // 🔧 保存执行步骤（使用原始结果用于上下文传递）
        const executionStep: AgentExecutionStep = {
          stepNumber: stepCounter,
          plan: state.currentPlan!,
          result: executionResult.result, // 保持原始结果用于下一步传递
          success: executionResult.success,
          error: executionResult.error,
          timestamp: new Date(),
          agentName: this.agent.name,
          stepId
        };

        state.executionHistory.push(executionStep);

        // 🧠 更新进展监控
        this.updateProgressMonitor(progressMonitor, executionStep, state);

        // 🔧 组件状态跟踪已移除 - 使用动态智能判断

        // 🔧 新增：记录失败并生成处理策略
        if (!executionResult.success) {
          await this.recordFailureAndStrategy(state, executionStep);
          
          // 🔧 重要：检查并应用失败策略
          const failureStrategy = this.getFailureStrategy(state, executionStep);
          logger.info(`🎯 Applying failure strategy: ${failureStrategy} for tool: ${executionStep.plan.tool}`);
          
          if (failureStrategy === 'skip' || failureStrategy === 'manual_intervention') {
            // 跳过或需要手动干预时，标记任务为完成（失败完成）
            logger.warn(`⚠️ Agent ${this.agent.name} stopping execution due to strategy: ${failureStrategy}`);
            state.isComplete = true;
            state.errors.push(`Execution stopped due to ${failureStrategy} strategy for tool: ${executionStep.plan.tool}`);
            break; // 退出主循环
          } else if (failureStrategy === 'alternative') {
            // 尝试替代方案的次数限制
            const failureRecord = state.failureHistory.find(f => f.tool === executionStep.plan.tool);
            if (failureRecord && failureRecord.attemptCount >= 3) {
              logger.warn(`⚠️ Agent ${this.agent.name} exceeded alternative attempts limit for tool: ${executionStep.plan.tool}`);
              state.isComplete = true;
              state.errors.push(`Exceeded alternative attempts for tool: ${executionStep.plan.tool}`);
              break; // 退出主循环
            }
          }
        }

        // 🔧 发送Agent格式的step_complete事件
        yield {
          event: 'step_complete',
          data: {
            step: stepCounter,
            success: executionResult.success,
            result: executionResult.result, // 原始结果用于上下文传递
            formattedResult: formattedResultForStorage, // 格式化结果供前端显示
            rawResult: executionResult.result,
            agentName: this.agent.name,
            message: executionResult.success 
              ? `${this.agent.name} completed step ${stepCounter} successfully`
              : `${this.agent.name} failed at step ${stepCounter}`,
            // 🔧 简化：基于执行历史的进度信息
            executionProgress: {
              totalSteps: state.executionHistory.length,
              successfulSteps: state.executionHistory.filter(s => s.success).length,
              hasData: Object.keys(state.dataStore).length > 1
            }
          }
        };

        // 🔧 If execution failed, send appropriate error events
        if (!executionResult.success) {
          // 🔧 Enhanced: Use error handler to analyze errors with LLM
          let detailedError = null;
          let isMCPConnectionError = false;
          
          try {
            const { MCPErrorHandler } = await import('./mcpErrorHandler.js');
            const errorToAnalyze = executionResult.error ? new Error(executionResult.error) : new Error('Unknown error');
            const errorDetails = await MCPErrorHandler.analyzeError(errorToAnalyze, state.currentPlan?.mcpName);
            detailedError = MCPErrorHandler.formatErrorForFrontend(errorDetails);
            
            // Check if this is an MCP connection/authentication error
            isMCPConnectionError = this.isMCPConnectionError(errorDetails.type);
            
            if (isMCPConnectionError && state.currentPlan?.mcpName) {
              // Send specialized MCP connection error event
              yield {
                event: 'mcp_connection_error',
                data: {
                  mcpName: state.currentPlan.mcpName,
                  step: stepCounter,
                  agentName: this.agent.name,
                  errorType: errorDetails.type,
                  title: errorDetails.title,
                  message: errorDetails.userMessage,
                  suggestions: errorDetails.suggestions,
                  authFieldsRequired: errorDetails.authFieldsRequired,
                  isRetryable: errorDetails.isRetryable,
                  requiresUserAction: errorDetails.requiresUserAction,
                  llmAnalysis: errorDetails.llmAnalysis,
                  originalError: errorDetails.originalError,
                  timestamp: new Date().toISOString()
                }
              };
            }
          } catch (analysisError) {
            logger.warn('Error analysis failed:', analysisError);
          }

          // Send regular step error event if not MCP connection error
          if (!isMCPConnectionError) {
          yield {
            event: 'step_error',
            data: {
              step: stepCounter,
              error: executionResult.error || 'Unknown error',
              agentName: this.agent.name,
              message: `${this.agent.name} encountered an error in step ${stepCounter}`,
                failureStrategy: this.getFailureStrategy(state, executionStep),
                detailedError: detailedError
            }
          };
          }
        }

        // 🔧 保存步骤结果到数据库（使用格式化结果）
        await this.saveAgentStepResult(taskId, executionStep, formattedResultForStorage);

        // 🔧 简化：任务完成判断已前置到规划阶段，这里只需更新进度监控
        this.updateProgressMonitor(progressMonitor, executionStep, state);

        // 🔧 更新数据存储
        if (executionResult.success && executionResult.result) {
          state.dataStore[`step${stepCounter}`] = executionResult.result;
          state.dataStore.lastResult = executionResult.result;
        }
      }

      // 🔧 流式生成和输出最终结果
      logger.info(`📤 Agent ${this.agent.name} generating final result...`);
      
      let finalResult = '';
      const finalResultGenerator = this.generateAgentFinalResultStream(state);
      
      for await (const chunk of finalResultGenerator) {
        finalResult += chunk;
        yield {
          event: 'final_result_chunk',
          data: {
            chunk,
            agentName: this.agent.name
          }
        };
      }

      // 🔧 Agent格式的task_execution_complete事件
      yield {
        event: 'task_execution_complete',
        data: {
          success: state.isComplete && state.errors.length === 0,
          finalResult,
          agentName: this.agent.name,
          message: `${this.agent.name} completed the task`,
          timestamp: new Date().toISOString(),
          executionSummary: {
            totalSteps: state.executionHistory.length,
            successfulSteps: state.executionHistory.filter(s => s.success).length,
            failedSteps: state.executionHistory.filter(s => !s.success).length
          }
        }
      };

      // 🚀 优化：后台异步保存最终结果 - 不阻塞用户响应
      setImmediate(() => {
        this.saveAgentFinalResult(taskId, state, finalResult)
          .catch(error => {
            logger.error(`Background save final result failed [Task: ${taskId}]:`, error);
          });
      });

      const overallSuccess = state.isComplete && state.errors.length === 0;
      logger.info(`🎯 Agent ${this.agent.name} execution completed [Success: ${overallSuccess}]`);
      
      return overallSuccess;

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} execution failed:`, error);
      
      yield {
        event: 'task_execution_error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          agentName: this.agent.name,
          message: `${this.agent.name} execution failed`,
          timestamp: new Date().toISOString()
        }
      };
      
      return false;
    }
  }

  /**
   * 准备Agent任务 - 应用Agent的MCP工作流配置
   */
  private async prepareAgentTask(taskId: string, state: AgentWorkflowState): Promise<void> {
    const task = await this.taskService.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // 🔧 为任务应用Agent的MCP工作流配置
    if (this.agent.mcpWorkflow && !task.mcpWorkflow) {
      await this.taskService.updateTask(taskId, {
        mcpWorkflow: this.agent.mcpWorkflow
      });
      
      logger.info(`✅ Applied ${this.agent.name}'s workflow configuration to task ${taskId}`);
    }

    // 🔧 新增：确保Agent所需的MCP服务已连接（多用户隔离）
    if (this.agent.mcpWorkflow && this.agent.mcpWorkflow.mcps && this.agent.mcpWorkflow.mcps.length > 0) {
      await this.ensureAgentMCPsConnected(task.userId, taskId);
    }
  }

  /**
   * Agent智能规划阶段
   */
  private async agentPlanningPhase(state: AgentWorkflowState): Promise<{
    success: boolean;
    plan?: AgentExecutionPlan;
    error?: string;
  }> {
    try {
      // 🔧 获取Agent可用的MCP能力
      const availableMCPs = await this.getAgentAvailableMCPs(state.taskId, state.agentId);

      // 🔧 构建Agent专用规划提示词
      const plannerPrompt = this.buildAgentPlannerPrompt(state, availableMCPs);

      const response = await this.llm.invoke([new SystemMessage(plannerPrompt)]);
      const plan = this.parseAgentPlan(response.content as string, state.agentName);

      logger.info(`📋 Agent ${this.agent.name} planned: ${plan.tool} (${plan.toolType})`);
      logger.info(`💭 Agent reasoning: ${plan.reasoning}`);

      return { success: true, plan };

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} planning failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 🔧 新增：增强版规划阶段
   */
  private async agentPlanningPhaseEnhanced(state: AgentWorkflowState): Promise<{
    success: boolean;
    plan?: AgentExecutionPlan;
    error?: string;
  }> {
    try {
      // 🔧 获取Agent可用的MCP能力
      const availableMCPs = await this.getAgentAvailableMCPs(state.taskId, state.agentId);

      // 🔧 关键修复：获取每个MCP的实际工具列表
      const mcpToolsInfo = await this.getDetailedMCPToolsForPlanning(state.taskId);

      // 🔧 构建增强版规划提示词（包含真实工具列表）
      const plannerPrompt = this.buildEnhancedAgentPlannerPrompt(state, availableMCPs, mcpToolsInfo);

      const response = await this.llm.invoke([new SystemMessage(plannerPrompt)]);
      const plan = this.parseAgentPlan(response.content as string, state.agentName);

      logger.info(`📋 Agent ${this.agent.name} planned: ${plan.tool} (${plan.toolType})`);
      logger.info(`💭 Agent reasoning: ${plan.reasoning}`);

      return { success: true, plan };

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} planning failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 🔧 新增：获取详细的MCP工具信息用于规划
   */
  private async getDetailedMCPToolsForPlanning(taskId: string): Promise<Map<string, any[]>> {
    const mcpToolsMap = new Map<string, any[]>();
    
    try {
      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        logger.warn('Task not found for getting MCP tools');
        return mcpToolsMap;
      }

      // 获取Agent配置的MCP列表
      if (!this.agent.mcpWorkflow || !this.agent.mcpWorkflow.mcps) {
        logger.info(`Agent ${this.agent.name} has no MCP workflow configuration`);
        return mcpToolsMap;
      }

      // 遍历每个MCP，获取其实际工具列表
      for (const mcpInfo of this.agent.mcpWorkflow.mcps) {
        try {
          const mcpName = mcpInfo.name;
          logger.info(`🔍 Getting tools for MCP: ${mcpName}`);
          
          // 检查MCP是否已连接
          const connectedMCPs = this.mcpManager.getConnectedMCPs(task.userId);
          const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);
          
          if (!isConnected) {
            logger.warn(`MCP ${mcpName} not connected, skipping tool list retrieval`);
            continue;
          }

          // 获取MCP的实际工具列表
          const tools = await this.mcpManager.getTools(mcpName, task.userId);
          mcpToolsMap.set(mcpName, tools);
          
          logger.info(`📋 Found ${tools.length} tools in ${mcpName}: ${tools.map(t => t.name).join(', ')}`);
          
        } catch (error) {
          logger.error(`Failed to get tools for MCP ${mcpInfo.name}:`, error);
          // 即使某个MCP获取失败，继续处理其他MCP
          continue;
        }
      }

      logger.info(`🎯 总共获取了 ${mcpToolsMap.size} 个MCP的工具列表`);
      return mcpToolsMap;
      
    } catch (error) {
      logger.error('Failed to get detailed MCP tools for planning:', error);
      return mcpToolsMap;
    }
  }

  /**
   * Agent执行阶段
   */
  private async agentExecutionPhase(state: AgentWorkflowState, stepId: string): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    actualExecution?: {
      toolName: string;
      mcpName?: string;
      args: any;
    };
  }> {
    if (!state.currentPlan) {
      return { success: false, error: 'No execution plan available' };
    }

    try {
      let result: any;
      let actualExecution: any = undefined;

      if (state.currentPlan.tool === 'task_complete') {
        // 🔧 检测重复的task_complete尝试
        const taskCompleteAttempts = state.executionHistory.filter(step => 
          step.plan.tool === 'task_complete'
        ).length;
        
        if (taskCompleteAttempts >= 2) {
          logger.warn(`🚨 Multiple task_complete attempts detected (${taskCompleteAttempts}). Forcing completion to prevent infinite loop.`);
        }
        
        // 🎯 处理任务完成指令
        result = `Task completed successfully by ${this.agent.name}. All required information has been collected and the user's request has been satisfied.`;
        actualExecution = {
          toolName: 'task_complete',
          args: state.currentPlan.args
        };
        
        // 标记任务为完成
        state.isComplete = true;
        logger.info(`🎯 Agent ${this.agent.name} marked task as complete via task_complete tool (attempt ${taskCompleteAttempts + 1})`);
        
      } else if (state.currentPlan.toolType === 'mcp') {
        // 🔧 执行MCP工具
        const mcpResult = await this.executeAgentMCPTool(state.currentPlan, state);
        result = mcpResult.result;
        actualExecution = mcpResult.actualExecution;
      } else {
        // 🔧 执行LLM工具
        result = await this.executeAgentLLMTool(state.currentPlan, state);
        // 对于LLM工具，实际执行参数就是计划参数
        actualExecution = {
          toolName: state.currentPlan.tool,
          args: state.currentPlan.args
        };
      }

      logger.info(`✅ Agent ${this.agent.name} execution successful: ${state.currentPlan.tool}`);
      return { success: true, result, actualExecution };

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} execution failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Agent观察阶段 - 判断任务是否完成
   */
  private async agentObservationPhase(state: AgentWorkflowState): Promise<{
    isComplete: boolean;
    nextObjective?: string;
  }> {
    try {
      const observerPrompt = this.buildAgentObserverPrompt(state);
      
      const response = await this.llm.invoke([
        new SystemMessage(observerPrompt),
        new HumanMessage(`Please analyze whether ${this.agent.name} has completed the task successfully`)
      ]);

      const observation = this.parseAgentObservation(response.content as string);
      
      logger.info(`🔍 Agent ${this.agent.name} observation: ${observation.isComplete ? 'Complete' : 'Continue'}`);
      
      return observation;

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} observation failed:`, error);
      // 默认继续执行
      return { isComplete: false };
    }
  }

  /**
   * 🔧 新增：增强版观察阶段
   */
  private async agentObservationPhaseEnhanced(
    state: AgentWorkflowState
  ): Promise<{
    isComplete: boolean;
    nextObjective?: string;
  }> {
    try {
      // 🧠 智能观察：基于数据充分性判断，而非预设规则
      const observerPrompt = this.buildIntelligentDataSufficiencyPrompt(state);
      
      const response = await this.llm.invoke([
        new SystemMessage(observerPrompt),
        new HumanMessage(`Based on the data collected so far, can ${this.agent.name} now answer the user's question completely?`)
      ]);

      const observation = this.parseAgentObservation(response.content as string);
      
      logger.info(`🔍 Agent ${this.agent.name} intelligent observation: ${observation.isComplete ? 'Complete' : 'Continue'}`);
      if (observation.nextObjective) {
        logger.info(`🎯 Next objective: ${observation.nextObjective}`);
      }
      
      return observation;

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} observation failed:`, error);
      // 默认继续执行
      return { isComplete: false };
    }
  }

  /**
   * 🧠 智能执行控制：判断是否应该继续执行
   */
  private shouldContinueExecution(
    state: AgentWorkflowState, 
    progressMonitor: any, 
    maxIterations: number
  ): boolean {
    // 🔧 基础安全检查：超过绝对上限
    if (state.currentIteration >= maxIterations) {
      logger.warn(`🛑 Reached absolute iteration limit: ${maxIterations}`);
      return false;
    }

    // 🔧 连续失败检查：连续5次失败就停止
    if (progressMonitor.consecutiveFailures >= 5) {
      logger.warn(`🛑 Too many consecutive failures: ${progressMonitor.consecutiveFailures}`);
      return false;
    }

    // 🔧 停滞检查：超过8步没有进展
    if (progressMonitor.stagnationCount >= 8) {
      logger.warn(`🛑 Task appears stagnant: ${progressMonitor.stagnationCount} steps without progress`);
      return false;
    }

    // 🔧 重复动作检查：同一工具重复使用超过5次
    for (const [action, count] of progressMonitor.repeatedActions.entries()) {
      if (count >= 5) {
        logger.warn(`🛑 Action repeated too many times: ${action} (${count} times)`);
        return false;
      }
    }

    // 🚀 允许继续：任务在正常进展中
    return true;
  }

  /**
   * 🧠 更新进展监控状态
   */
  private updateProgressMonitor(
    progressMonitor: any, 
    executionStep: AgentExecutionStep, 
    state: AgentWorkflowState
  ): void {
    // 🔧 更新连续失败计数
    if (executionStep.success) {
      progressMonitor.consecutiveFailures = 0;
      progressMonitor.lastProgressStep = state.currentIteration;
    } else {
      progressMonitor.consecutiveFailures++;
    }

    // 🔧 更新停滞计数
    const stepsSinceProgress = state.currentIteration - progressMonitor.lastProgressStep;
    progressMonitor.stagnationCount = stepsSinceProgress;

    // 🔧 更新重复动作计数
    const actionKey = `${executionStep.plan.tool}_${executionStep.plan.mcpName || 'llm'}`;
    const currentCount = progressMonitor.repeatedActions.get(actionKey) || 0;
    progressMonitor.repeatedActions.set(actionKey, currentCount + 1);

    // 🔧 记录进展状态
    const repeatedActionsStr = Array.from(progressMonitor.repeatedActions.entries() as IterableIterator<[string, number]>)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    logger.info(`📊 Progress Monitor: failures=${progressMonitor.consecutiveFailures}, stagnation=${progressMonitor.stagnationCount}, repeated=${repeatedActionsStr}`);
  }

  /**
   * 🧠 新增：智能数据充分性判断提示词构建器
   */
  private buildIntelligentDataSufficiencyPrompt(state: AgentWorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    
    // 构建所有已收集数据的摘要
    const collectedDataSummary = this.buildCollectedDataSummary(state);
    
    // 🔧 新增：检测重复的task_complete尝试
    const taskCompleteAttempts = state.executionHistory.filter(step => 
      step.plan.tool === 'task_complete'
    ).length;
    
    // 🔧 新增：分析实际数据内容
    const dataContentAnalysis = this.buildDataContentAnalysis(state);
    
    // 🌍 使用state中的用户语言
    const userLanguage = state.userLanguage;
    
    return `You are **${this.agent.name}**, analyzing whether sufficient data has been collected to answer the user's question.

## 📋 USER'S ORIGINAL QUESTION
"${state.originalQuery}"

## 📊 DATA COLLECTION ANALYSIS

### Execution History
${state.executionHistory.map(step => `
**Step ${step.stepNumber}**: ${step.plan.tool} (${step.plan.toolType})
- Status: ${step.success ? '✅ Success' : '❌ Failed'}
- Tool: ${step.plan.tool}
- Data Retrieved: ${step.success && step.result ? 'Yes' : 'No'}
${step.success && step.result ? `- Data Summary: ${this.summarizeStepData(step.result)}` : ''}
${step.error ? `- Error: ${step.error}` : ''}
`).join('\n')}

### Data Content Analysis
${dataContentAnalysis}

${taskCompleteAttempts > 0 ? `
### ⚠️ Task Completion History
**Previous task_complete attempts**: ${taskCompleteAttempts}
**CRITICAL**: If task_complete has been attempted multiple times, the task is likely complete!
` : ''}

## 🧠 INTELLIGENT ANALYSIS REQUIRED

**Critical Questions**: 
1. Does the collected data contain the specific information requested by the user?
2. Can you identify and extract the exact answer from the available data?
3. Is the data recent, relevant, and sufficient in scope?

**For "${state.originalQuery}"**:
${this.buildSpecificRequirementsCheck(state.originalQuery)}

## 🎯 DECISION LOGIC

**✅ COMPLETE the task if ANY of these are true**:
- You have specific data that directly answers the user's question
- The data contains the requested items/information (e.g., top tokens, prices, etc.)
- Previous task_complete attempts ≥ 2 (likely indicates task is actually complete)
- Successful data collection step exists AND data is relevant to the query

**❌ CONTINUE execution ONLY if ALL of these are true**:
- No relevant data has been collected yet
- Critical information is clearly missing for the specific query
- Previous attempts all failed to get any usable data
- User's request requires multiple data points and only partial data exists

**OUTPUT FORMAT (JSON only)**:
{
  "isComplete": true/false,
  "reasoning": "Focus on whether the specific user question can be answered with available data",
  "nextObjective": "If not complete, what specific missing information is needed?"
}

**🚨 IMPORTANT**: Be more lenient in completion judgment. If relevant data exists, the task is likely complete.${userLanguage ? getLanguageInstruction(userLanguage) : ''}`;
  }

  /**
   * 🔧 构建通用数据内容分析
   */
  private buildDataContentAnalysis(state: AgentWorkflowState): string {
    const successfulSteps = state.executionHistory.filter(step => step.success && step.result);
    
    if (successfulSteps.length === 0) {
      return "No successful data collection yet.";
    }

    return successfulSteps.map(step => {
      const resultData = step.result;
      const dataType = this.detectDataType(resultData);
      const dataSize = JSON.stringify(resultData).length;
      
      let contentDescription = `${dataType} data (${dataSize} characters)`;
      
      // 通用的结构化数据分析
      if (Array.isArray(resultData) && resultData.length > 0) {
        contentDescription += ` - ${resultData.length} items`;
        const firstItem = resultData[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          const keys = Object.keys(firstItem);
          if (keys.length > 0) {
            contentDescription += `, sample fields: ${keys.slice(0, 3).join(', ')}`;
          }
        }
      } else if (typeof resultData === 'object' && resultData !== null) {
        const keys = Object.keys(resultData);
        if (keys.length > 0) {
          contentDescription += `, fields: ${keys.slice(0, 5).join(', ')}`;
        }
      }
      
      return `- Step ${step.stepNumber} (${step.plan.tool}): ${contentDescription}`;
    }).join('\n');
  }

  /**
   * 构建已收集数据的摘要
   */
  private buildCollectedDataSummary(state: AgentWorkflowState): string {
    if (state.executionHistory.length === 0) {
      return "No data collected yet.";
    }

    const successfulSteps = state.executionHistory.filter(step => step.success && step.result);
    
    if (successfulSteps.length === 0) {
      return "No successful data collection yet.";
    }

    return successfulSteps.map(step => {
      const dataType = this.detectDataType(step.result);
      const dataSize = JSON.stringify(step.result).length;
      return `- Step ${step.stepNumber} (${step.plan.tool}): ${dataType} data, ${dataSize} characters`;
    }).join('\n');
  }

  /**
   * 构建针对具体问题的需求检查
   */
  private buildSpecificRequirementsCheck(originalQuery: string): string {
    const lowerQuery = originalQuery.toLowerCase();
    
    // 针对不同类型的查询构建具体的需求检查
    if (lowerQuery.includes('identify') && lowerQuery.includes('top') && /\d+/.test(lowerQuery)) {
      const numberMatch = lowerQuery.match(/\d+/);
      const number = numberMatch ? numberMatch[0] : 'X';
      return `- Do you have data that allows you to identify the top ${number} items requested?
   - Is the data sorted/rankable to determine which are "top"?
   - Are the specific criteria mentioned in the query satisfied?`;
    }
    
    if (lowerQuery.includes('current') || lowerQuery.includes('latest')) {
      return `- Is the data current/recent as requested?
   - Does it represent the latest state as of now?`;
    }
    
    if (lowerQuery.includes('compare') || lowerQuery.includes('vs')) {
      return `- Do you have data for all items to be compared?
   - Is the data comparable (same timeframe, metrics, etc.)?`;
    }
    
    return `- Does the data directly address what the user is asking for?
   - Are all key terms from the user's question covered by the data?`;
  }

  /**
   * 通用数据类型检测
   */
  private detectDataType(data: any): string {
    if (typeof data === 'string') {
      return 'Text';
    }
    
    if (Array.isArray(data)) {
      return 'Array';
    }
    
    if (typeof data === 'object' && data !== null) {
      return 'Object';
    }
    
    if (typeof data === 'number') {
      return 'Number';
    }
    
    if (typeof data === 'boolean') {
      return 'Boolean';
    }
    
    return 'Unknown';
  }

  /**
   * 总结步骤数据
   */
  private summarizeStepData(data: any): string {
    const dataStr = JSON.stringify(data);
    if (dataStr.length > 200) {
      return `${dataStr.substring(0, 200)}... (${dataStr.length} chars total)`;
    }
    return dataStr;
  }

  /**
   * 构建Agent专用规划提示词
   */
  private buildAgentPlannerPrompt(state: AgentWorkflowState, availableMCPs: any[]): string {
    const totalSteps = state.executionHistory.length;
    const hasData = Object.keys(state.dataStore).length > 1;
    const lastStepResult = totalSteps > 0 ? state.executionHistory[totalSteps - 1] : null;
    
    return `You are **${this.agent.name}**, an intelligent AI assistant with specialized capabilities.

**AGENT IDENTITY**:
- Name: ${this.agent.name}
- Description: ${this.agent.description || 'Specialized AI Assistant'}
- Role: Intelligent workflow executor with access to advanced tools

**USER TASK**: "${state.originalQuery}"

**CURRENT EXECUTION STATE**:
- Steps completed: ${totalSteps}
- Available data: ${hasData ? Object.keys(state.dataStore).filter(k => k !== 'lastResult').join(', ') : 'None'}
- Last step: ${lastStepResult ? `${lastStepResult.plan.tool} (${lastStepResult.success ? 'Success' : 'Failed'})` : 'None'}
${lastStepResult?.result ? `- Last result: ${typeof lastStepResult.result === 'string' ? lastStepResult.result : JSON.stringify(lastStepResult.result)}` : ''}

**AVAILABLE MCP SERVICES FOR ${this.agent.name.toUpperCase()}**:
${availableMCPs.map(mcp => `- MCP Service: ${mcp.mcpName}
  Description: ${mcp.description || 'General purpose tool'}
  Status: Available (use appropriate tools for your task)`).join('\n')}

**AGENT PLANNING PRINCIPLES**:

1. **Agent Expertise**: As ${this.agent.name}, leverage your specialized knowledge and capabilities to provide the best solution.

2. **Task-Driven Approach**: Focus on what the user actually wants to achieve, using ${this.agent.name}'s unique strengths.

3. **Smart Progression**: 
   - Use ${this.agent.name}'s tools effectively
   - Build intelligently on previous results
   - 🚨 **AVOID REPETITION**: Never repeat the same tool if previous step was successful
   - 🎯 **DATA CHECK**: If data already collected, proceed to analysis or completion
   - Consider if the task is complete from ${this.agent.name}'s perspective

4. **Agent Context**: Always remember you are ${this.agent.name} with specific capabilities and expertise.

**DECISION LOGIC as ${this.agent.name}**:

Ask yourself: "As ${this.agent.name}, what is the most logical next step to help the user achieve their goal using my specialized capabilities?"

**OUTPUT FORMAT** (JSON only):
{
  "tool": "specific-function-name-like-getUserTweets-or-searchTweets",
  "toolType": "mcp" or "llm",
  "mcpName": "mcp-service-name-from-list-above",
  "args": {
    // Parameters specific to this tool/action
  },
  "expectedOutput": "What this step should accomplish",
  "reasoning": "Why ${this.agent.name} chose this specific step",
  "agentContext": "How this relates to ${this.agent.name}'s capabilities"
}

**CRITICAL INSTRUCTIONS - DO NOT REVERSE THESE**:
❌ WRONG: {"tool": "twitter-client-mcp", "mcpName": "getUserTweets"}
✅ CORRECT: {"tool": "getUserTweets", "mcpName": "twitter-client-mcp"}

**FIELD DEFINITIONS**:
- "tool": FUNCTION NAME (getUserTweets, sendTweet, searchTweets, etc.)
- "mcpName": SERVICE NAME (twitter-client-mcp, github-mcp, etc.)

**FOR TWITTER TASKS SPECIFICALLY**:
- Always use: "mcpName": "twitter-client-mcp"
- Tool options: "getUserTweets", "sendTweet", "searchTweets", "getTweetInfo"
- Example: {"tool": "getUserTweets", "mcpName": "twitter-client-mcp"}

What is the most logical next step for ${this.agent.name} to take?`;
  }

  /**
   * 🔧 新增：构建增强版规划提示词
   */
  private buildEnhancedAgentPlannerPrompt(state: AgentWorkflowState, availableMCPs: any[], mcpToolsInfo: Map<string, any[]>): string {
    const totalSteps = state.executionHistory.length;
    const hasData = Object.keys(state.dataStore).length > 1;
    const lastStepResult = totalSteps > 0 ? state.executionHistory[totalSteps - 1] : null;
    
    // 🔧 简化：基于执行历史分析  
    const successfulSteps = state.executionHistory.filter(s => s.success);
    const hasDataInStore = Object.keys(state.dataStore).length > 1;
    
    // 🔧 失败分析
    const recentFailures = state.failureHistory.filter(f => f.attemptCount > 0);
    
    // 🌍 使用state中的用户语言
    const userLanguage = state.userLanguage;
    
    return `You are **${this.agent.name}**, a specialized AI agent executing an intelligent workflow.

## 🎯 Agent Profile
**Name**: ${this.agent.name}
**Expertise**: ${this.agent.description || 'Specialized AI Assistant'}
**Mission**: ${state.originalQuery}

## 📊 Current Status
**Progress**: ${successfulSteps.length}/${totalSteps} steps completed
**Data Collected**: ${hasDataInStore ? 'Available' : 'None'}
**Last Action**: ${lastStepResult ? `${lastStepResult.plan.tool} (${lastStepResult.success ? '✅ Success' : '❌ Failed'})` : 'Starting task'}

${lastStepResult?.success ? `
## ✅ Last Success
**Tool**: ${lastStepResult.plan.tool}
**Result**: Data successfully obtained
**Next**: Build on this result (DO NOT repeat same tool)
` : lastStepResult ? `
## ⚠️ Last Attempt Failed
**Tool**: ${lastStepResult.plan.tool}
**Error**: ${lastStepResult.error}
**Strategy**: Try alternative approach
` : ''}

${recentFailures.length > 0 ? `## 🔧 Failure Recovery
${recentFailures.map(f => `- ${f.tool}: ${f.suggestedStrategy === 'alternative' ? 'Use different tool' : f.suggestedStrategy === 'skip' ? 'Skip this step' : 'Retry with changes'}`).join('\n')}
` : ''}

## 🛠️ Available Tools
**task_complete**: Use when user's request is fully satisfied (special completion tool)
${availableMCPs.map(mcp => {
  const tools = mcpToolsInfo.get(mcp.mcpName);
  if (tools && tools.length > 0) {
    return `**${mcp.mcpName}**: ${tools.map(t => t.name).join(', ')}`;
  }
  return `**${mcp.mcpName}**: Connection needed`;
}).join('\n')}

## 🧠 Intelligent Decision Framework

**🎯 PRIMARY: Direct Task Completion Assessment**
Based on the current data and execution history, make ONE of these decisions:

**A) TASK IS COMPLETE** → Use "task_complete" tool
- Current data fully answers the user's question
- All requested information has been successfully collected
- User's specific requirements are satisfied
- No additional data or processing is needed

**B) TASK NEEDS MORE WORK** → Choose appropriate MCP tool
- Identify exactly what information is still missing
- Select the most direct tool to get that information
- Use existing data from dataStore when applicable
- Focus on the specific gap in current data

**🚨 CRITICAL**: Make this decision based on actual data sufficiency, not execution count or complexity

## 📋 Decision Rules
1. **Task Complete → Finalize**: If user's request is satisfied, use "task_complete"
2. **Success → Progress**: If last step succeeded, assess if more is needed
3. **Failure → Alternative**: If tool failed, choose different approach  
4. **Data Available → Analysis**: If data exists but incomplete, collect more
5. **Missing Data → Collection**: If data needed, collect efficiently

## 🎯 Output Format (JSON only)
{
  "tool": "exact-function-name-or-task_complete",
  "toolType": "mcp" or "llm" or "completion",
  "mcpName": "service-name-from-above-or-null",
  "args": {
    // Specific parameters for this tool (empty {} for task_complete)
  },
  "expectedOutput": "What this accomplishes",
  "reasoning": "Why this is the optimal next step",
  "agentContext": "How this advances the mission"
}

**🔑 Critical Format Rules**:
- tool = function name (getUserTweets, not twitter-client-mcp)
- mcpName = service name (twitter-client-mcp, not getUserTweets)
- For task completion: {"tool": "task_complete", "toolType": "completion", "mcpName": null}

As ${this.agent.name}, what is your next strategic move?${userLanguage ? getLanguageInstruction(userLanguage) : ''}`;
  }

  /**
   * 构建Agent专用观察提示词
   */
  private buildAgentObserverPrompt(state: AgentWorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    
    return `You are observing the execution progress of **${this.agent.name}** to determine task completion status.

## Agent & Task Information
- **Agent**: ${this.agent.name}
- **Agent Description**: ${this.agent.description || 'Specialized AI Assistant'}
- **Original Task**: ${state.originalQuery}
- **Current Objective**: ${state.currentObjective}
- **Executed Steps**: ${state.executionHistory.length}

## Execution History for ${this.agent.name}
${state.executionHistory.map(step => `
Step ${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- Status: ${step.success ? 'Success' : 'Failed'}
- Reasoning: ${step.plan.reasoning}
- Result: ${step.success ? 'Available' : step.error}
`).join('\n')}

## Latest Result by ${this.agent.name}
${lastStep ? `
Step ${lastStep.stepNumber}: ${lastStep.plan.tool}
- Status: ${lastStep.success ? 'Success' : 'Failed'}
- Reasoning: ${lastStep.plan.reasoning}
- Result: ${lastStep.success ? (typeof lastStep.result === 'string' ? lastStep.result : JSON.stringify(lastStep.result)) : lastStep.error}
` : 'No execution history yet'}

## Agent Data Store
${JSON.stringify(state.dataStore, null, 2)}

## Task Completion Analysis for ${this.agent.name}

**SIMPLE COMPLETION RULES**:

For **DATA QUERIES** (like "show me", "get", "what is"):
- ✅ Complete if ANY valid data was retrieved successfully  
- ✅ Complete if the latest step returned meaningful information
- ❌ NOT complete only if NO data was retrieved or major errors

For **COMPLEX TASKS** (multi-step analysis, processing):
- ✅ Complete if all required steps finished successfully
- ❌ NOT complete if significant work remains

**QUICK CHECK**: Look at the latest step result - does it answer the user's question?

**OUTPUT FORMAT**:
{
  "isComplete": true/false,
  "reasoning": "Brief explanation - focus on whether user's question is answered",  
  "nextObjective": "only if NOT complete"
}`;
  }

  /**
   * 🔧 新增：构建增强版观察提示词
   */
  private buildEnhancedAgentObserverPrompt(
    state: AgentWorkflowState, 
    taskComplexity?: { type: string; recommendedSteps: number; reasoning: string }
  ): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    const totalSteps = state.executionHistory.length;
    const successfulSteps = state.executionHistory.filter(s => s.success);
    
    return `You are observing the execution progress of **${this.agent.name}** to determine task completion status with enhanced analysis.

## Agent & Task Information
- **Agent**: ${this.agent.name}
- **Agent Description**: ${this.agent.description || 'Specialized AI Assistant'}
- **Original Task**: ${state.originalQuery}
- **Task Complexity**: ${taskComplexity ? `${taskComplexity.type} (${taskComplexity.recommendedSteps} steps recommended)` : 'Unknown'}
- **Current Objective**: ${state.currentObjective}
- **Executed Steps**: ${state.executionHistory.length}

## 🔧 SIMPLIFIED EXECUTION ANALYSIS

### Execution Status
- **Total Steps Executed**: ${totalSteps}
- **Successful Steps**: ${successfulSteps.length}
- **Success Rate**: ${totalSteps > 0 ? `${Math.round((successfulSteps.length / totalSteps) * 100)}%` : 'N/A'}
- **Data Collected**: ${Object.keys(state.dataStore).length > 1 ? 'Yes' : 'No'}

### Execution History Analysis
${state.executionHistory.map(step => `
Step ${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- Status: ${step.success ? '✅ Success' : '❌ Failed'}
- Reasoning: ${step.plan.reasoning}
- Component Impact: ${step.success ? 'Contributed to task progress' : 'Needs attention'}
- Result: ${step.success ? 'Data available' : step.error}
`).join('\n')}

### Data Availability Analysis
${Object.keys(state.dataStore).length > 1 ? `
**Available Data Sources**:
${Object.keys(state.dataStore).filter(k => k !== 'lastResult').map(key => `- ${key}: Ready for use`).join('\n')}
` : '**No data collected yet**'}

### Failure Analysis
${state.failureHistory.length > 0 ? `
**Recorded Failures**:
${state.failureHistory.map(f => `- ${f.tool}: ${f.error} (${f.attemptCount} attempts, strategy: ${f.suggestedStrategy})`).join('\n')}
` : '**No failures recorded**'}

## 🎯 SMART COMPLETION JUDGMENT

**TASK-SPECIFIC COMPLETION RULES**:

${taskComplexity?.type === 'simple_query' ? `
🟢 **SIMPLE QUERY DETECTED** - Fast completion mode:
- ✅ **COMPLETE IMMEDIATELY** if latest step returned ANY valid data
- ✅ **COMPLETE IMMEDIATELY** if user's question is answered
- ❌ Continue only if NO data retrieved or complete failure
- ⚡ **Priority**: Speed over perfection for simple data requests
` : taskComplexity?.type === 'medium_task' ? `
🟡 **MEDIUM TASK DETECTED** - Balanced completion mode:
- ✅ Complete if main objectives achieved (2-3 successful steps)
- ✅ Complete if sufficient data collected for user's needs
- ❌ Continue if key analysis or comparison still needed
` : `
🔴 **COMPLEX WORKFLOW DETECTED** - Thorough completion mode:
- ✅ Complete only if all major components finished
- ✅ Complete if comprehensive analysis delivered
- ❌ Continue if significant workflow steps remain
`}

**CURRENT EXECUTION STATUS**:
- Steps completed: ${state.executionHistory.length}/${taskComplexity?.recommendedSteps || 'unknown'}
- Task type: ${taskComplexity?.type || 'unknown'}

### Latest Step Analysis
${lastStep ? `
**Step ${lastStep.stepNumber}**: ${lastStep.plan.tool}
- Status: ${lastStep.success ? '✅ Success' : '❌ Failed'}
- Result: ${lastStep.success ? 'Data available' : lastStep.error}
${taskComplexity?.type === 'simple_query' && lastStep.success ? '- 🎯 **SIMPLE QUERY + SUCCESS = SHOULD COMPLETE**' : ''}
` : 'No execution history yet'}

**DECISION FRAMEWORK**:
${taskComplexity?.type === 'simple_query' ? 'For simple queries: Success = Complete. No exceptions.' : 
  taskComplexity?.type === 'medium_task' ? 'For medium tasks: Focus on core objectives achievement.' :
  'For complex workflows: Ensure comprehensive completion.'}

**OUTPUT FORMAT**:
{
  "isComplete": true/false,
  "reasoning": "Brief explanation focusing on task type and completion criteria",
  "nextObjective": "only if NOT complete"
}`;
  }

  /**
   * 解析Agent计划
   */
  private parseAgentPlan(content: string, agentName: string): AgentExecutionPlan {
    try {
      // 清理和解析JSON
      let jsonText = content.trim();
      jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
      jsonText = jsonText.replace(/```\s*|\s*```/g, '');
      
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 🔧 调试日志：显示原始解析结果
        logger.info(`🔍 Original parsed plan: tool="${parsed.tool}", mcpName="${parsed.mcpName}", toolType="${parsed.toolType}"`);
        
        // 🔧 智能修正：检查tool和mcpName是否搞反了
        let { tool, mcpName } = this.correctToolAndMCPNames(parsed.tool, parsed.mcpName);
        
        // 🔧 调试日志：显示修正后结果
        logger.info(`🔍 Corrected plan: tool="${tool}", mcpName="${mcpName}"`);
        
        return {
          tool: tool || 'llm.process',
          toolType: parsed.toolType || 'llm',
          mcpName: mcpName,
          args: parsed.args || {},
          expectedOutput: parsed.expectedOutput || 'Task result',
          reasoning: parsed.reasoning || 'No reasoning provided',
          agentContext: parsed.agentContext || `Executed by ${agentName}`
        };
      }
    } catch (error) {
      logger.warn(`Agent plan parsing failed: ${error}`);
    }

    // 降级方案
    return {
      tool: 'llm.process',
      toolType: 'llm',
      args: { content: content },
      expectedOutput: 'Process user request',
      reasoning: 'Fallback plan due to parsing error',
      agentContext: `Fallback execution by ${agentName}`
    };
  }

  /**
   * 🔧 智能修正工具名和MCP名（防止LLM搞混）
   */
  private correctToolAndMCPNames(toolValue: string, mcpNameValue: string): { tool: string; mcpName: string } {
    // 🔧 调试日志：输入参数
    logger.info(`🔍 correctToolAndMCPNames input: tool="${toolValue}", mcpName="${mcpNameValue}"`);
    
    // 常见的MCP服务名称（通常包含-mcp后缀）
    const commonMCPNames = [
      'twitter-client-mcp', 'github-mcp', 'cryptocurrency-mcp', 
      'web-search-mcp', 'email-mcp', 'calendar-mcp'
    ];
    
    // 常见的工具函数名称
    const commonToolNames = [
      'getUserTweets', 'sendTweet', 'searchTweets', 'getTweetInfo',
      'getRepository', 'createIssue', 'searchRepositories',
      'getCryptoPrice', 'searchWeb', 'sendEmail'
    ];
    
    // 检查是否搞反了：tool字段包含MCP名，mcpName字段包含工具名
    const toolLooksLikeMCP = toolValue && (
      toolValue.includes('-mcp') || 
      commonMCPNames.includes(toolValue)
    );
    
    const mcpNameLooksLikeTool = mcpNameValue && (
      !mcpNameValue.includes('-mcp') &&
      (commonToolNames.includes(mcpNameValue) || /^[a-z][a-zA-Z0-9]*$/.test(mcpNameValue))
    );
    
    // 🔧 调试日志：检查结果
    logger.info(`🔍 Detection results: toolLooksLikeMCP=${toolLooksLikeMCP}, mcpNameLooksLikeTool=${mcpNameLooksLikeTool}`);
    
    if (toolLooksLikeMCP && mcpNameLooksLikeTool) {
      logger.warn(`🔧 Detected reversed tool/mcpName: tool="${toolValue}" mcpName="${mcpNameValue}"`);
      logger.warn(`🔧 Correcting to: tool="${mcpNameValue}" mcpName="${toolValue}"`);
      
      return {
        tool: mcpNameValue,
        mcpName: toolValue
      };
    }
    
    // 🔧 额外修复：如果tool是MCP名但mcpName为空，自动纠正
    if (toolLooksLikeMCP && !mcpNameValue) {
      logger.warn(`🔧 Tool looks like MCP but mcpName is empty. Auto-correcting...`);
      logger.warn(`🔧 Setting mcpName="${toolValue}" and tool="getUserTweets" (default)`);
      
      return {
        tool: 'getUserTweets', // 默认工具名
        mcpName: toolValue
      };
    }
    
    // 🔧 调试日志：最终输出
    logger.info(`🔍 correctToolAndMCPNames output: tool="${toolValue}", mcpName="${mcpNameValue}"`);
    
    return {
      tool: toolValue,
      mcpName: mcpNameValue
    };
  }

  /**
   * 解析Agent观察结果
   */
  private parseAgentObservation(content: string): { isComplete: boolean; nextObjective?: string } {
    try {
      let jsonText = content.trim();
      jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
      jsonText = jsonText.replace(/```\s*|\s*```/g, '');
      
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isComplete: parsed.isComplete || false,
          nextObjective: parsed.nextObjective
        };
      }
    } catch (error) {
      logger.warn(`Agent observation parsing failed: ${error}`);
    }

    // 🔧 增强智能判断 - 更宽松的完成条件
    const isComplete = /complete|finished|done|success|data.*retrieved|information.*available|result.*ready|sufficient.*data|answer.*question/i.test(content);
    
    // 🔧 如果包含明确的否定词，则认为未完成
    const hasNegation = /not.*complete|insufficient|missing|need.*more|continue|require/i.test(content);
    
    return { 
      isComplete: isComplete && !hasNegation 
    };
  }

  /**
   * 获取Agent可用的MCP能力
   */
  private async getAgentAvailableMCPs(taskId: string, agentId: string): Promise<any[]> {
    try {
      // 🔧 修复：直接从Agent的mcpWorkflow配置中获取MCP工具列表
      if (!this.agent.mcpWorkflow || !this.agent.mcpWorkflow.mcps) {
        logger.info(`Agent ${this.agent.name} has no MCP workflow configuration`);
        return [];
      }

      const availableMCPs = this.agent.mcpWorkflow.mcps.map((mcp: any) => ({
        mcpName: mcp.name,
        description: mcp.description || `${mcp.name} MCP service`,
        category: mcp.category || 'General',
        authRequired: mcp.authRequired || false,
        capabilities: mcp.capabilities || [],
        // 添加MCP服务的详细信息
        imageUrl: mcp.imageUrl,
        githubUrl: mcp.githubUrl,
        authParams: mcp.authParams || {}
      }));

      logger.info(`Found ${availableMCPs.length} available MCPs for Agent ${this.agent.name}: ${availableMCPs.map(m => m.mcpName).join(', ')}`);
      return availableMCPs;

    } catch (error) {
      logger.error(`Failed to get available MCPs for Agent ${this.agent.name}:`, error);
      return [];
    }
  }

  /**
   * 🔧 新增：确保Agent所需的MCP服务已连接并具有正确的认证信息（多用户隔离）
   */
  private async ensureAgentMCPsConnected(userId: string, taskId: string): Promise<void> {
    if (!this.agent.mcpWorkflow || !this.agent.mcpWorkflow.mcps || this.agent.mcpWorkflow.mcps.length === 0) {
      logger.info(`Agent ${this.agent.name} does not require MCP services`);
      return;
    }

    // 🔧 修复：连接所有MCP，不仅仅是需要认证的
    const requiredMCPs = this.agent.mcpWorkflow.mcps;

    logger.info(`Ensuring MCP connections for Agent ${this.agent.name} (User: ${userId}), required MCPs: ${requiredMCPs.map((mcp: any) => mcp.name).join(', ')}`);

    for (const mcpInfo of requiredMCPs) {
      try {
        // 🔧 重要修复：检查用户特定的MCP连接
        const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
        const isConnected = connectedMCPs.some((mcp: any) => mcp.name === mcpInfo.name);

        if (!isConnected) {
          logger.info(`MCP ${mcpInfo.name} not connected for user ${userId}, attempting to connect for Agent task...`);
          
          // 获取MCP配置
          const { getPredefinedMCP } = await import('./predefinedMCPs.js');
          const mcpConfig = getPredefinedMCP(mcpInfo.name);
          
          if (!mcpConfig) {
            throw new Error(`MCP ${mcpInfo.name} configuration not found`);
          }

          let authenticatedMcpConfig = mcpConfig;

          // 🔧 修复：只有需要认证的MCP才检查用户认证信息
          if (mcpInfo.authRequired) {
          // 获取用户认证信息
          const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpInfo.name);
          if (!userAuth || !userAuth.isVerified || !userAuth.authData) {
            throw new Error(`User authentication not found or not verified for MCP ${mcpInfo.name}. Please authenticate this MCP service first.`);
          }

          // 动态注入认证信息
          const dynamicEnv = { ...mcpConfig.env };
          if (mcpConfig.env) {
            for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
              if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                dynamicEnv[envKey] = userAuth.authData[envKey];
                logger.info(`Injected authentication for ${envKey} in MCP ${mcpInfo.name} for user ${userId}`);
              }
            }
          }

          // 创建带认证信息的MCP配置
            authenticatedMcpConfig = {
            ...mcpConfig,
            env: dynamicEnv
          };
          } else {
            logger.info(`MCP ${mcpInfo.name} does not require authentication, using default configuration`);
          }

          // 🔧 重要修复：连接MCP时传递用户ID实现多用户隔离
          const connected = await this.mcpManager.connectPredefined(authenticatedMcpConfig, userId);
          if (!connected) {
            throw new Error(`Failed to connect to MCP ${mcpInfo.name} for user ${userId}`);
          }

          logger.info(`✅ Successfully connected MCP ${mcpInfo.name} for user ${userId} and Agent task`);
        } else {
          logger.info(`✅ MCP ${mcpInfo.name} already connected for user ${userId}`);
        }
      } catch (error) {
        logger.error(`Failed to ensure MCP connection for ${mcpInfo.name} (User: ${userId}):`, error);
        throw new Error(`Failed to connect required MCP service ${mcpInfo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`✅ All required MCP services connected for Agent ${this.agent.name} (User: ${userId})`);
  }

  /**
   * 执行Agent MCP工具
   */
  private async executeAgentMCPTool(plan: AgentExecutionPlan, state: AgentWorkflowState): Promise<{
    result: any;
    actualExecution: {
      toolName: string;
      mcpName: string;
      args: any;
    };
  }> {
    if (!plan.mcpName) {
      throw new Error('MCP tool requires mcpName to be specified');
    }

    // 🔧 关键调试：显示执行前的plan内容
    logger.info(`🔍 executeAgentMCPTool plan: tool="${plan.tool}", mcpName="${plan.mcpName}", toolType="${plan.toolType}"`);
    logger.info(`⚡ Agent ${this.agent.name} calling MCP tool: ${plan.tool} (from ${plan.mcpName})`);
    
    try {
      // 🔧 获取任务的用户ID用于多用户隔离
      const task = await this.taskService.getTaskById(state.taskId);
      if (!task) {
        throw new Error('Task not found for MCP tool execution');
      }

      // 🔧 关键修复：添加完整的工具验证和智能参数转换机制
      logger.info(`🔄 Starting intelligent MCP tool execution with parameter conversion and tool validation...`);
      
      // 1. 标准化MCP名称
      const actualMcpName = this.normalizeMCPName(plan.mcpName);
      if (actualMcpName !== plan.mcpName) {
        logger.info(`MCP name mapping: '${plan.mcpName}' mapped to '${actualMcpName}'`);
      }

      // 2. 检查MCP连接状态
      const connectedMCPs = this.mcpManager.getConnectedMCPs(task.userId);
      const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
      
      if (!isConnected) {
        throw new Error(`MCP ${actualMcpName} not connected for user ${task.userId}`);
      }

      // 3. 🔧 关键步骤：获取MCP的实际可用工具列表
      logger.info(`🔍 === Getting MCP Tools Debug ===`);
      logger.info(`🔍 Actual MCP Name: ${actualMcpName}`);
      logger.info(`🔍 User ID: ${task.userId}`);
      
      const mcpTools = await this.mcpManager.getTools(actualMcpName, task.userId);
      logger.info(`📋 Available tools in ${actualMcpName}: ${mcpTools.map(t => t.name).join(', ')}`);
      logger.info(`🔍 Number of tools: ${mcpTools.length}`);
      
      // 4. 🔧 智能参数转换（使用实际工具schemas和前一步结果）
      logger.info(`🔍 === Starting Parameter Conversion ===`);
      logger.info(`🔍 Plan Tool: ${plan.tool}`);
      logger.info(`🔍 Plan Args: ${JSON.stringify(plan.args, null, 2)}`);
      logger.info(`🔍 Previous Results Available: ${state.executionHistory.length > 0}`);
      
      const convertedInput = await this.convertParametersWithLLM(plan.tool, plan.args, mcpTools, state);

      // 5. 🔧 工具验证和重选机制
      const { finalToolName, finalArgs } = await this.validateAndSelectTool(
        plan.tool, 
        convertedInput, 
        mcpTools, 
        actualMcpName
      );

      logger.info(`🔧 Final tool call: ${finalToolName} with converted parameters`);

      // 🔧 关键调试：记录传递给MCP的确切参数和调用链
      logger.info(`🔍 === CRITICAL DEBUG: MCP Call Parameters ===`);
      logger.info(`🔍 MCP Name: ${actualMcpName}`);
      logger.info(`🔍 Tool Name: ${finalToolName}`);
      logger.info(`🔍 User ID: ${task.userId}`);
      logger.info(`🔍 Args Type: ${typeof finalArgs}`);
      logger.info(`🔍 Args Value: ${JSON.stringify(finalArgs, null, 2)}`);
      logger.info(`🔍 Args is null/undefined: ${finalArgs === null || finalArgs === undefined}`);
      if (finalArgs && typeof finalArgs === 'object') {
        logger.info(`🔍 Args keys: [${Object.keys(finalArgs).join(', ')}]`);
        Object.keys(finalArgs).forEach(key => {
          const val = finalArgs[key];
          logger.info(`🔍 Args.${key}: type=${typeof val}, value=${JSON.stringify(val)}, isNull=${val === null}, isUndefined=${val === undefined}`);
        });
      }
      logger.info(`🔍 ============================================`);

      // 6. 使用验证后的工具和转换后的参数进行调用
      const result = await this.mcpToolAdapter.callTool(actualMcpName, finalToolName, finalArgs, task.userId);
      
      logger.info(`✅ Agent ${this.agent.name} MCP tool call successful: ${plan.tool}`);
      
      // 🔧 新增：x-mcp自动发布处理
      const processedResult = await this.handleXMcpAutoPublish(actualMcpName, finalToolName, result, task.userId);
      
      // 🔧 返回结果和实际执行信息
      return {
        result: processedResult,
        actualExecution: {
          toolName: finalToolName,
          mcpName: actualMcpName,
          args: finalArgs
        }
      };

    } catch (error) {
      logger.error(`❌ Agent ${this.agent.name} MCP tool call failed:`, error);
      throw error;
    }
  }

  /**
   * 执行Agent LLM工具
   */
  private async executeAgentLLMTool(plan: AgentExecutionPlan, state: AgentWorkflowState): Promise<any> {
    const toolName = plan.tool.replace('llm.', '');
    
    logger.info(`🤖 Agent ${this.agent.name} executing LLM tool: ${toolName}`);
    
    const prompt = this.buildAgentLLMPrompt(toolName, plan, state);
    
    const response = await this.llm.invoke([new SystemMessage(prompt)]);
    return response.content as string;
  }

  /**
   * 🔧 重新设计：构建通用且健壮的Agent LLM执行提示词
   */
  private buildAgentLLMPrompt(toolName: string, plan: AgentExecutionPlan, state: AgentWorkflowState): string {
    return this.buildUniversalLLMPrompt(toolName, plan, state);
  }

  /**
   * 🔧 新增：构建通用且健壮的LLM提示词（适用于所有LLM任务：分析、摘要、总结、提取、格式化等）
   */
  private buildUniversalLLMPrompt(toolName: string, plan: AgentExecutionPlan, state: AgentWorkflowState): string {
    // 🌍 使用state中的用户语言
    const userLanguage = state.userLanguage;
    // 🔧 智能上下文处理：如果上下文过长，先进行摘要
    const contextData = this.prepareContextData(state);
    
    return `You are **${this.agent.name}**, a specialized AI assistant executing: "${toolName}".

## 🎯 TASK CONTEXT

### Agent Information
- **Agent**: ${this.agent.name}
- **Description**: ${this.agent.description || 'Specialized AI Assistant'}
- **User Request**: ${state.originalQuery}
- **Current Task**: ${toolName}
- **Execution Phase**: Step ${state.currentIteration}/${state.maxIterations}

### Task Specifications
- **Expected Output**: ${plan.expectedOutput}
- **Task Reasoning**: ${plan.reasoning}
- **Agent Context**: ${plan.agentContext}

## 📊 INPUT DATA & CONTEXT

### Task Parameters
${Object.entries(plan.args).map(([key, value]) => 
  `- **${key}**: ${typeof value === 'string' ? value : JSON.stringify(value)}`
).join('\n')}

### 🧠 Available Context Data
${contextData.summary}

### Execution Environment
- **Execution Progress**: ${state.executionHistory.filter(s => s.success).length}/${state.executionHistory.length} steps successful
- **Data Sources**: ${contextData.sourceCount}
- **Context Type**: ${contextData.type}

## 🎯 EXECUTION REQUIREMENTS

### Universal Task Guidelines
1. **Context Integration**: 
   - Leverage ALL available context data appropriately
   - Understand relationships between different data sources
   - Maintain consistency with previous task results

2. **Quality Standards**:
   - Provide accurate, relevant, and comprehensive output
   - Ensure output format matches requirements
   - Include specific details and concrete information
   - Avoid generic or vague statements

3. **Platform Optimization** (if applicable):
   - **For Social Media**: Use appropriate character limits, hashtags, emojis
   - **For Analysis**: Provide structured insights with evidence
   - **For Summaries**: Extract key points while maintaining context
   - **For Data Extraction**: Ensure completeness and accuracy
   - **For Formatting**: Follow specified format requirements precisely

4. **Goal Alignment**:
   - Stay focused on the user's original request
   - Ensure output contributes to the overall objective
   - Maintain professional and engaging tone

## 🚀 EXECUTION COMMAND

Execute the "${toolName}" task now using:
- Your specialized ${this.agent.name} capabilities
- All provided context data and parameters
- Universal quality standards and platform requirements

**Generate your response:**${userLanguage ? getLanguageInstruction(userLanguage) : ''}`;
  }

  /**
       * 🔧 新增：智能准备上下文数据（处理过长上下文的摘要）
   */
  private prepareContextData(state: AgentWorkflowState): {
    summary: string;
    type: 'direct' | 'summarized';
    sourceCount: number;
  } {
    const allCollectedData = this.gatherAllCollectedData(state);
    
    if (allCollectedData.length === 0) {
      return {
        summary: 'No previous context data available.',
        type: 'direct',
        sourceCount: 0
      };
    }

    // 🔧 计算上下文总长度
    const totalContextLength = this.calculateContextLength(allCollectedData);
    const MAX_CONTEXT_LENGTH = 8000; // 约8k字符，留余量给其他部分

    if (totalContextLength <= MAX_CONTEXT_LENGTH) {
      // 🔧 直接传递所有上下文
      return {
        summary: this.formatDirectContext(allCollectedData),
        type: 'direct',
        sourceCount: allCollectedData.length
      };
    } else {
      // 🔧 需要摘要处理
      return {
        summary: this.formatSummarizedContext(allCollectedData),
        type: 'summarized',
        sourceCount: allCollectedData.length
      };
    }
  }

  /**
   * 🔧 新增：计算上下文总长度
   */
  private calculateContextLength(data: Array<any>): number {
    return data.reduce((total, item) => {
      const content = this.extractRawContent(item.result);
      return total + content.length;
    }, 0);
  }

  /**
   * 🔧 新增：格式化直接上下文（当上下文不太长时）
   */
  private formatDirectContext(data: Array<any>): string {
    if (data.length === 0) return 'No context data available.';

    return `**Complete Context Data** (${data.length} sources):

${data.map((item, index) => `
**Source ${index + 1}** (Step ${item.stepNumber} - ${item.tool}):
\`\`\`
${this.extractRawContent(item.result)}
\`\`\`
`).join('\n')}`;
  }

  /**
   * 🔧 优化：完全通用的摘要上下文格式化（让LLM来理解所有内容类型）
   */
  private formatSummarizedContext(data: Array<any>): string {
    if (data.length === 0) return 'No context data available.';

    // 🔧 通用摘要：不做内容类型假设，让LLM自己理解
    const summaries = data.map((item, index) => {
      const rawContent = this.extractRawContent(item.result);
      const summary = this.generateQuickSummary(rawContent, item.tool);
      
      return `**Source ${index + 1}** (Step ${item.stepNumber} - ${item.tool}):
- **Content Preview**: ${summary}
- **Data Size**: ${rawContent.length} characters
- **Structure Type**: ${this.detectContentType(rawContent)}`;
    });

    return `**Context Data Summary** (${data.length} sources, auto-summarized for efficiency):

${summaries.join('\n\n')}

**📋 Processing Note**: Content was automatically summarized to manage context length. All source data contains complete information that you should analyze and utilize appropriately for the current task.`;
  }

  /**
   * 🔧 修复：完全通用的内容摘要生成（不针对任何特定平台）
   */
  private generateQuickSummary(content: string, tool: string): string {
    if (!content || content.length === 0) return 'No content';
    
    // 🔧 完全通用的摘要逻辑：只基于内容长度和结构，不区分具体类型
    const MAX_SUMMARY_LENGTH = 300;
    
    if (content.length <= MAX_SUMMARY_LENGTH) {
      return content;
    }
    
    // 🔧 尝试智能截取：优先保留开头和关键结构
    try {
      // 检查是否为JSON结构，如果是则提取关键信息
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return `Array with ${parsed.length} items. First item: ${JSON.stringify(parsed[0] || {}).substring(0, 200)}...`;
      } else if (typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        return `Object with keys: ${keys.slice(0, 5).join(', ')}. Content: ${content.substring(0, 200)}...`;
      }
    } catch {
      // 不是JSON，按文本处理
    }
    
    // 🔧 文本内容：智能截取前部分内容
    return content.substring(0, MAX_SUMMARY_LENGTH) + '...';
  }

  /**
   * 🔧 新增：通用内容类型检测（不针对特定平台，只识别数据结构）
   */
  private detectContentType(content: string): string {
    if (!content) return 'empty';
    
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return `array (${parsed.length} items)`;
      } else if (typeof parsed === 'object') {
        return 'object';
      } else {
        return 'json-value';
      }
    } catch {
      // 不是JSON格式
    }
    
    // 🔧 基于内容特征的通用检测
    if (content.includes('\n') && content.split('\n').length > 5) {
      return 'multi-line-text';
    } else if (content.length > 500) {
      return 'long-text';
    } else {
      return 'short-text';
    }
  }

  /**
   * 🔧 保留：收集所有已收集的数据
   */
  private gatherAllCollectedData(state: AgentWorkflowState): Array<{
    stepNumber: number;
    tool: string;
    success: boolean;
    result: any;
  }> {
    return state.executionHistory
      .filter(step => step.success) // 只包含成功的步骤
      .map(step => ({
        stepNumber: step.stepNumber,
        tool: step.plan.tool,
        success: step.success,
        result: step.result
      }));
  }

  /**
   * 🔧 保留：提取原始内容（避免传递格式化的markdown）
   */
  private extractRawContent(result: any): string {
    if (!result) return 'No data';
    
    try {
      // 如果是MCP结果格式，尝试提取原始文本
      if (result && typeof result === 'object' && result.content) {
        if (Array.isArray(result.content) && result.content.length > 0) {
          const firstContent = result.content[0];
          if (firstContent && firstContent.text) {
            return firstContent.text;
          }
        }
        return JSON.stringify(result.content);
      }
      
      // 如果是字符串且看起来像JSON，返回原始JSON
      if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return result;
        }
      }
      
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return String(result);
    }
  }

  /**
   * 生成Agent最终结果
   */
  private generateAgentFinalResult(state: AgentWorkflowState): string {
    if (state.dataStore.lastResult) {
      return typeof state.dataStore.lastResult === 'string' 
        ? state.dataStore.lastResult 
        : JSON.stringify(state.dataStore.lastResult);
    }

    const successfulResults = state.executionHistory
      .filter(step => step.success)
      .map(step => step.result)
      .join('\n\n');

    return successfulResults || `${this.agent.name} execution completed`;
  }

  /**
   * 🚀 优化：非阻塞数据大小计算
   */
  private getDataSizeNonBlocking(data: any): number {
    try {
      // 对于大数据，只估算前面部分的大小，避免完整序列化阻塞
      if (typeof data === 'string') {
        return data.length;
      }
      
      if (typeof data === 'object' && data !== null) {
        // 快速估算：只计算对象的键数量和基本属性
        const keys = Object.keys(data);
        if (keys.length > 100) {
          // 大对象：估算而不精确计算
          return keys.length * 50; // 估算每个键值对平均50字符
        }
        // 小对象：正常计算
        return JSON.stringify(data).length;
      }
      
      return String(data).length;
    } catch (error) {
      // 序列化失败时返回估算值
      return 1000; // 默认估算值
    }
  }

  /**
   * 🔧 新增：格式化并流式输出步骤结果
   */
  private async *formatAndStreamStepResult(
    rawResult: any,
    mcpName: string,
    toolName: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      // 🚀 激进优化：智能数据预处理，防止LLM卡死
      const processedData = this.preprocessDataForFormatting(rawResult, mcpName, toolName);
      
      // 🔧 根据预处理结果构建提示词
      const formatPrompt = processedData.wasTruncated 
        ? `Convert this ${mcpName} ${toolName} data to clean, readable Markdown format.

**Important**: This data was intelligently filtered to show the most relevant information (${processedData.summary}).

**Formatting rules:**
- Convert to clear Markdown (tables for objects, lists for arrays)
- Output directly without code blocks or explanations
- Make numbers readable with commas where appropriate
- Keep all provided data values

Data to format:
${JSON.stringify(processedData.data)}`

        : `Convert this ${mcpName} ${toolName} data to clean, readable Markdown format:

**Formatting rules:**
- Convert JSON structure to clear Markdown
- Use tables for object data when helpful
- Use lists for arrays  
- Keep ALL original data values
- Output directly without code blocks or explanations
- Make long numbers readable with commas

Data to format:
${JSON.stringify(processedData.data)}`;

      // 使用流式LLM生成格式化结果
      const stream = await this.llm.stream([new SystemMessage(formatPrompt)]);

      for await (const chunk of stream) {
        if (chunk.content) {
          yield chunk.content as string;
        }
      }
    } catch (error) {
      logger.error(`Failed to format step result:`, error);
      // 降级处理：返回基本信息
      const fallbackResult = `### ${toolName} 执行结果\n\n✅ 数据获取成功，但格式化失败。原始数据类型: ${typeof rawResult}`;
      yield fallbackResult;
    }
  }

  /**
   * 🚀 新增：智能数据预处理 - 在发送给LLM前截断超大数据
   */
  private preprocessDataForFormatting(rawResult: any, mcpName: string, toolName: string): {
    data: any;
    wasTruncated: boolean;
    summary: string;
  } {
    try {
      // 快速大小估算（避免完整序列化）
      const estimatedSize = this.estimateDataSize(rawResult);
      
      // 🔥 激进截断策略
      if (estimatedSize > 50000) { // 50K字符阈值，更激进
        return this.truncateDataIntelligently(rawResult, mcpName, toolName);
      }
      
      // 小数据直接返回
      return {
        data: rawResult,
        wasTruncated: false,
        summary: 'complete data'
      };
    } catch (error) {
      logger.error('Data preprocessing failed:', error);
      // 极端降级：只返回数据类型信息
      return {
        data: { 
          dataType: typeof rawResult,
          message: 'Data too large to process safely',
          keys: Array.isArray(rawResult) ? `Array[${rawResult.length}]` : 
                typeof rawResult === 'object' && rawResult !== null ? 
                `Object with ${Object.keys(rawResult).length} keys` : 'Simple value'
        },
        wasTruncated: true,
        summary: 'safe fallback due to processing error'
      };
    }
  }

  /**
   * 🔧 快速数据大小估算（避免完整序列化阻塞）
   */
  private estimateDataSize(data: any): number {
    if (typeof data === 'string') {
      return data.length;
    }
    
    if (Array.isArray(data)) {
      if (data.length > 100) return 100000; // 大数组立即标记为大数据
      return data.length * 200; // 估算每个元素200字符
    }
    
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length > 50) return 50000; // 超过50个字段立即标记为大数据
      return keys.length * 300; // 估算每个字段300字符
    }
    
    return 100; // 原始类型
  }

  /**
   * 🎯 智能数据截断（针对不同MCP类型）
   */
  private truncateDataIntelligently(rawResult: any, mcpName: string, toolName: string): {
    data: any;
    wasTruncated: boolean;
    summary: string;
  } {
    try {
      // 🔧 基于MCP类型的智能截断策略
      if (mcpName.includes('ethereum') || mcpName.includes('blockchain') || toolName.includes('block')) {
        return this.truncateBlockchainData(rawResult);
      }
      
      if (mcpName.includes('github') || toolName.includes('repo')) {
        return this.truncateGithubData(rawResult);
      }
      
      if (mcpName.includes('twitter') || mcpName.includes('social')) {
        return this.truncateSocialData(rawResult);
      }
      
      // 通用截断策略
      return this.truncateGenericData(rawResult);
    } catch (error) {
      // 截断失败，返回最基本信息
      return {
        data: { 
          error: 'Data truncation failed',
          originalType: typeof rawResult,
          mcpName,
          toolName
        },
        wasTruncated: true,
        summary: 'truncation failed, basic info only'
      };
    }
  }

  /**
   * 🏗️ 区块链数据截断
   */
  private truncateBlockchainData(data: any): { data: any; wasTruncated: boolean; summary: string } {
    if (typeof data === 'object' && data !== null) {
      const truncated: any = {};
      
      // 保留最重要的区块链字段
      const importantFields = ['hash', 'number', 'gasUsed', 'gasLimit', 'miner', 'timestamp', 'parentHash', 'difficulty', 'totalDifficulty', 'size', 'transactionCount'];
      
      importantFields.forEach(field => {
        if (data[field] !== undefined) {
          truncated[field] = data[field];
        }
      });
      
      // 交易数组只保留前3个
      if (data.transactions && Array.isArray(data.transactions)) {
        truncated.transactions = data.transactions.slice(0, 3);
        if (data.transactions.length > 3) {
          truncated.transactionsNote = `Showing 3 of ${data.transactions.length} total transactions`;
        }
      }
      
      return {
        data: truncated,
        wasTruncated: true,
        summary: `${Object.keys(truncated).length} key blockchain fields`
      };
    }
    
    return { data, wasTruncated: false, summary: 'no truncation needed' };
  }

  /**
   * 🐙 GitHub数据截断
   */
  private truncateGithubData(data: any): { data: any; wasTruncated: boolean; summary: string } {
    if (Array.isArray(data)) {
      // 列表数据只保留前10个
      return {
        data: data.slice(0, 10),
        wasTruncated: data.length > 10,
        summary: `showing 10 of ${data.length} items`
      };
    }
    
    if (typeof data === 'object' && data !== null) {
      const truncated: any = {};
      
      // 保留重要的GitHub字段
      const importantFields = ['name', 'full_name', 'description', 'html_url', 'clone_url', 'stargazers_count', 'forks_count', 'language', 'created_at', 'updated_at', 'owner'];
      
      importantFields.forEach(field => {
        if (data[field] !== undefined) {
          truncated[field] = data[field];
        }
      });
      
      return {
        data: truncated,
        wasTruncated: true,
        summary: `${Object.keys(truncated).length} key GitHub fields`
      };
    }
    
    return { data, wasTruncated: false, summary: 'no truncation needed' };
  }

  /**
   * 📱 社交媒体数据截断
   */
  private truncateSocialData(data: any): { data: any; wasTruncated: boolean; summary: string } {
    if (Array.isArray(data)) {
      return {
        data: data.slice(0, 20), // 社交媒体显示更多条目
        wasTruncated: data.length > 20,
        summary: `showing 20 of ${data.length} posts`
      };
    }
    
    if (typeof data === 'object' && data !== null) {
      const truncated: any = {};
      
      // 保留重要的社交媒体字段
      const importantFields = ['id', 'text', 'created_at', 'author', 'user', 'likes', 'retweets', 'replies', 'url'];
      
      importantFields.forEach(field => {
        if (data[field] !== undefined) {
          truncated[field] = data[field];
        }
      });
      
      return {
        data: truncated,
        wasTruncated: true,
        summary: `${Object.keys(truncated).length} key social media fields`
      };
    }
    
    return { data, wasTruncated: false, summary: 'no truncation needed' };
  }

  /**
   * 🔧 通用数据截断
   */
  private truncateGenericData(data: any): { data: any; wasTruncated: boolean; summary: string } {
    if (Array.isArray(data)) {
      return {
        data: data.slice(0, 15),
        wasTruncated: data.length > 15,
        summary: `showing 15 of ${data.length} items`
      };
    }
    
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length <= 20) {
        return { data, wasTruncated: false, summary: 'complete object' };
      }
      
      // 只保留前20个字段
      const truncated: any = {};
      keys.slice(0, 20).forEach(key => {
        truncated[key] = data[key];
      });
      
      truncated._truncated_note = `Object truncated: showing 20 of ${keys.length} total fields`;
      
      return {
        data: truncated,
        wasTruncated: true,
        summary: `20 of ${keys.length} fields`
      };
    }
    
    return { data, wasTruncated: false, summary: 'simple value' };
  }



  /**
   * 🔧 新增：流式生成Agent最终结果
   */
  /**
   * 🔧 新增：为每个步骤生成智能摘要
   */
  private async generateStepSummaries(state: AgentWorkflowState): Promise<Array<{
    stepNumber: number;
    toolName: string;
    success: boolean;
    content: string;
    dataSize: 'small' | 'medium' | 'large';
  }>> {
    const summaries = [];
    
    for (const step of state.executionHistory) {
      try {
        // 确定数据大小
        const resultString = typeof step.result === 'string' ? step.result : JSON.stringify(step.result);
        const dataSize = this.determineDataSize(resultString);
        
        let summaryContent = '';
        
        if (step.success) {
          if (dataSize === 'large') {
            // 大数据：生成智能摘要
            summaryContent = await this.generateDataSummary(step, resultString);
          } else if (dataSize === 'medium') {
            // 中等数据：生成简化版本
            summaryContent = await this.generateSimplifiedSummary(step, resultString);
          } else {
            // 小数据：直接使用原始数据
            summaryContent = this.formatSmallData(step, resultString);
          }
        } else {
          // 失败步骤：显示错误信息
          summaryContent = `### ❌ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Failed
**Error**: ${step.error || 'Unknown error'}
**Attempted Action**: ${step.plan.reasoning}`;
        }
        
        summaries.push({
          stepNumber: step.stepNumber,
          toolName: step.plan.tool,
          success: step.success,
          content: summaryContent,
          dataSize
        });
        
      } catch (error) {
        logger.warn(`Failed to generate summary for step ${step.stepNumber}:`, error);
        summaries.push({
          stepNumber: step.stepNumber,
          toolName: step.plan.tool,
          success: step.success,
          content: `### Step ${step.stepNumber}: ${step.plan.tool}
**Status**: ${step.success ? 'Success' : 'Failed'}
**Note**: Summary generation failed, using basic info`,
          dataSize: 'small' as const
        });
      }
    }
    
    return summaries;
  }

  /**
   * 确定数据大小
   */
  private determineDataSize(dataString: string): 'small' | 'medium' | 'large' {
    const length = dataString.length;
    if (length > 5000) return 'large';
    if (length > 1500) return 'medium';
    return 'small';
  }

  /**
   * 生成大数据的智能摘要
   */
  private async generateDataSummary(step: AgentExecutionStep, dataString: string): Promise<string> {
    const summaryPrompt = `You are analyzing step results for an AI agent's task execution. Create a focused data summary.

**Agent Context:**
- Agent: ${this.agent.name}
- Step #${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- Purpose: ${step.plan.reasoning}
- Data Size: ${Math.round(dataString.length / 1000)}K characters

**Raw Data:**
${dataString.substring(0, 3000)}${dataString.length > 3000 ? '... [content truncated for analysis]' : ''}

**Analysis Requirements:**
Create a structured summary that extracts:

1. **Key Data Points**: Most important values, metrics, counts, amounts
2. **Critical Information**: Names, IDs, statuses, dates, addresses
3. **Insights**: Patterns, trends, anomalies, significant findings  
4. **Context**: What this data tells us about the task objective

**Format Guidelines:**
- Use bullet points for key findings
- Include specific numbers and percentages when available
- Highlight unexpected or notable results
- Keep total length under 250 words
- Focus on actionable information

Provide your data analysis summary:`;

    try {
      const response = await this.llm.invoke([new SystemMessage(summaryPrompt)]);
      const summary = response.content as string;
      
      return `### ✅ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Success  
**Data Size**: Large (${Math.round(dataString.length / 1000)}K characters)

${summary}`;

    } catch (error) {
      logger.warn(`Failed to generate LLM summary for step ${step.stepNumber}:`, error);
      return this.generateFallbackSummary(step, dataString);
    }
  }

  /**
   * 生成中等数据的简化摘要
   */
  private async generateSimplifiedSummary(step: AgentExecutionStep, dataString: string): Promise<string> {
    // 尝试解析JSON结构
    try {
      const data = JSON.parse(dataString);
      const keyPoints = this.extractKeyPoints(data);
      
      return `### ✅ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Success
**Data Size**: Medium (${Math.round(dataString.length / 1000)}K characters)

**Key Information:**
${keyPoints.map(point => `- ${point}`).join('\n')}

**Raw Data Preview:**
\`\`\`json
${dataString.substring(0, 500)}${dataString.length > 500 ? '...' : ''}
\`\`\``;

    } catch (error) {
      return `### ✅ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Success
**Data Size**: Medium (${Math.round(dataString.length / 1000)}K characters)

**Data Preview:**
${dataString.substring(0, 800)}${dataString.length > 800 ? '...' : ''}`;
    }
  }

  /**
   * 格式化小数据
   */
  private formatSmallData(step: AgentExecutionStep, dataString: string): string {
    return `### ✅ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Success
**Data Size**: Small

**Complete Result:**
${dataString}`;
  }

  /**
   * 提取关键点（用于中等数据）
   */
  private extractKeyPoints(data: any): string[] {
    const points: string[] = [];
    
    if (typeof data === 'object' && data !== null) {
      // 提取顶级键值
      Object.keys(data).slice(0, 8).forEach(key => {
        const value = data[key];
        if (typeof value === 'string' || typeof value === 'number') {
          points.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
          points.push(`${key}: Array with ${value.length} items`);
        } else if (typeof value === 'object') {
          points.push(`${key}: Object with ${Object.keys(value).length} properties`);
        }
      });
    }
    
    return points.length > 0 ? points : [`Data type: ${typeof data}`, `Content length: ${JSON.stringify(data).length} characters`];
  }

  /**
   * 生成备用摘要（当LLM失败时）
   */
  private generateFallbackSummary(step: AgentExecutionStep, dataString: string): string {
    const preview = dataString.substring(0, 200);
    const wordCount = dataString.split(' ').length;
    
    return `### ✅ Step ${step.stepNumber}: ${step.plan.tool}
**Status**: Success
**Data Size**: Large (~${Math.round(dataString.length / 1000)}K characters, ~${wordCount} words)

**Data Preview:**
${preview}${dataString.length > 200 ? '...' : ''}

**Note**: Full data available but summarized for readability.`;
  }

  /**
   * 🔧 新增：提取核心数据用于直接回答用户问题
   */
  private extractCoreDataForAnswer(state: AgentWorkflowState): string {
    const successfulSteps = state.executionHistory.filter(step => step.success && step.result);
    
    if (successfulSteps.length === 0) {
      return "No data was successfully collected.";
    }

    return successfulSteps.map((step, index) => {
      // 提取实际数据内容
      const dataContent = this.extractDataContent(step.result);
      const dataSize = JSON.stringify(step.result).length;
      
      return `**Data Source ${index + 1}** (from ${step.plan.tool}):
${dataContent}`;
    }).join('\n\n');
  }

  /**
   * 提取数据的核心内容用于回答问题
   */
  private extractDataContent(result: any): string {
    try {
      // 如果是字符串，直接返回（但限制长度）
      if (typeof result === 'string') {
        return result.length > 2000 ? result.substring(0, 2000) + '...' : result;
      }

      // 如果是对象，智能提取关键信息
      if (typeof result === 'object' && result !== null) {
        // 检查MCP标准格式
        if (result.content && Array.isArray(result.content)) {
          const textContent = result.content
            .filter((item: any) => item.type === 'text' && item.text)
            .map((item: any) => item.text)
            .join('\n');
          
          if (textContent) {
            return textContent.length > 2000 ? textContent.substring(0, 2000) + '...' : textContent;
          }
        }

        // 尝试提取核心字段
        const coreFields = ['data', 'result', 'results', 'items', 'content', 'value', 'price', 'amount'];
        for (const field of coreFields) {
          if (result[field] !== undefined) {
            const fieldData = JSON.stringify(result[field], null, 2);
            return fieldData.length > 2000 ? fieldData.substring(0, 2000) + '...' : fieldData;
          }
        }

        // 如果没有找到核心字段，返回整个对象的格式化版本
        const fullData = JSON.stringify(result, null, 2);
        return fullData.length > 2000 ? fullData.substring(0, 2000) + '...' : fullData;
      }

      // 其他类型直接转换为字符串
      return String(result);

    } catch (error) {
      return `[Data extraction error: ${error}]`;
    }
  }

  private async *generateAgentFinalResultStream(state: AgentWorkflowState): AsyncGenerator<string, string, unknown> {
    try {
            // 🔧 直接提取核心数据用于回答用户问题
      const coreDataSummary = this.extractCoreDataForAnswer(state);
      
      // 🌍 使用state中的用户语言
      const userLanguage = state.userLanguage;
      
      // 构建直接回答用户问题的提示词
      const summaryPrompt = `You are ${this.agent.name}, and you need to directly answer the user's question based on all the data you've collected.

## 🎯 User's Question
"${state.originalQuery}"

## 📊 All Collected Data
${coreDataSummary}

## 🎯 Your Task: Answer the User's Question

Based on ALL the data collected above, provide a direct, comprehensive answer to the user's question as ${this.agent.name}:

**Critical Requirements:**
1. **Direct Answer**: Address the user's question directly, don't describe your execution process
2. **Use All Data**: Synthesize information from all successful data collection steps
3. **Be Specific**: Include concrete numbers, names, dates, and details from the collected data
4. **Stay On Topic**: Focus only on what the user actually asked for
5. **Professional Insight**: Apply your expertise as ${this.agent.name} to provide valuable analysis

**Format Guidelines:**
- Start by directly answering the core question
- Present key information clearly and organized
- Include specific data points and metrics
- Provide context and interpretation where helpful
- End with any relevant insights or implications

**Remember**: The user wants an answer to their question, not a report about how you executed the task. Use your collected data to give them exactly what they asked for.

Provide your direct answer:${userLanguage ? getLanguageInstruction(userLanguage) : ''}`;

      // 使用流式LLM生成增强总结
      const stream = await this.llm.stream([new SystemMessage(summaryPrompt)]);
      let fullResult = '';

      for await (const chunk of stream) {
        if (chunk.content) {
          const chunkText = chunk.content as string;
          fullResult += chunkText;
          yield chunkText;
        }
      }

      return fullResult;

    } catch (error) {
      logger.error(`Failed to generate Agent streaming result:`, error);
      // 降级处理：返回基本结果
      const fallbackResult = this.generateAgentFinalResult(state);
      yield fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * 保存Agent步骤结果
   */
  private async saveAgentStepResult(taskId: string, step: AgentExecutionStep, formattedResult?: string): Promise<void> {
    try {
      // 🔧 使用格式化结果进行数据库存储（如果有的话），否则使用原始结果
      const resultToSave = formattedResult || step.result;
      
      await taskExecutorDao.saveStepResult(
        taskId,
        step.stepNumber,
        step.success,
        resultToSave
      );

      // 🔧 保存Agent步骤消息到会话（使用格式化结果）
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 直接使用格式化结果作为消息内容，不添加额外信息
        const stepContent = step.success 
          ? `${this.agent.name} Step ${step.stepNumber}: ${step.plan.tool}\n\n${resultToSave}`
          : `${this.agent.name} Step ${step.stepNumber} Failed: ${step.plan.tool}\n\nError: ${step.error}`;

        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: stepContent,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepNumber: step.stepNumber,
            stepName: step.plan.tool,
            taskPhase: 'execution',
            contentType: 'step_thinking',
            agentName: this.agent.name,
            isComplete: true,
            // 🔧 新增：详细的执行信息（仅在metadata中，不影响内容）
            toolDetails: {
              toolType: step.plan.toolType,
              toolName: step.plan.tool,
              mcpName: step.plan.mcpName || null,
              args: step.plan.args,
              expectedOutput: step.plan.expectedOutput,
              reasoning: step.plan.reasoning,
              timestamp: new Date().toISOString()
            },
            executionDetails: {
              rawResult: step.result,
              formattedResult: resultToSave,
              success: step.success,
              error: step.error,
              processingInfo: {
                originalDataSize: JSON.stringify(step.result).length,
                formattedDataSize: resultToSave.length,
                processingTime: new Date().toISOString()
              }
            }
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }
    } catch (error) {
      logger.error(`Failed to save Agent step result:`, error);
    }
  }

  /**
   * 🔧 保存Agent步骤原始结果
   */
  private async saveStepRawResult(taskId: string, stepNumber: number, plan: AgentExecutionPlan, rawResult: any): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        const rawContent = `${this.agent.name} Step ${stepNumber} Raw Result: ${plan.tool}

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
            stepName: plan.tool,
            taskPhase: 'execution',
            contentType: 'raw_result',
          agentName: this.agent.name,
            isComplete: true,
            toolDetails: {
              toolType: plan.toolType,
              toolName: plan.tool,
              mcpName: plan.mcpName || null,
              args: plan.args,
              expectedOutput: plan.expectedOutput,
              reasoning: plan.reasoning,
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
      logger.error(`Failed to save Agent step raw result:`, error);
    }
  }

  /**
   * 🔧 保存Agent步骤格式化结果
   */
  private async saveStepFormattedResult(taskId: string, stepNumber: number, plan: AgentExecutionPlan, formattedResult: string): Promise<void> {
    try {
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
        // 🔧 根据工具类型设置不同的标题
        const resultType = plan.toolType === 'llm' ? 'LLM Result' : 'Formatted Result';
        const formattedContent = `${this.agent.name} Step ${stepNumber} ${resultType}: ${plan.tool}

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
            stepName: plan.tool,
            taskPhase: 'execution',
            contentType: 'formatted_result',
            agentName: this.agent.name,
            isComplete: true,
            toolDetails: {
              toolType: plan.toolType,
              toolName: plan.tool,
              mcpName: plan.mcpName || null,
              args: plan.args,
              expectedOutput: plan.expectedOutput,
              reasoning: plan.reasoning,
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
      logger.error(`Failed to save Agent step formatted result:`, error);
    }
  }

  /**
   * 保存Agent最终结果
   */
  private async saveAgentFinalResult(taskId: string, state: AgentWorkflowState, finalResult: string): Promise<void> {
    try {
      const successfulSteps = state.executionHistory.filter(s => s.success).length;
      const overallSuccess = successfulSteps > 0 && state.isComplete;

      await taskExecutorDao.updateTaskResult(
        taskId,
        overallSuccess ? 'completed' : 'failed',
        {
          summary: `${this.agent.name} execution completed`,
          finalResult,
          agentName: this.agent.name,
          executionHistory: state.executionHistory,
          agentExecutionSummary: {
            totalSteps: state.executionHistory.length,
            successfulSteps,
            failedSteps: state.executionHistory.length - successfulSteps,
            isComplete: state.isComplete
          }
        }
      );
    } catch (error) {
      logger.error(`Failed to save Agent final result:`, error);
    }
    }
    
  // 🔧 组件状态跟踪已移除 - 使用动态智能判断代替预设组件分解

  // checkComponentCompletion 方法已删除

  // checkDataCollectionCompletion 方法已删除

  // checkTargetMatch 方法已删除

  // extractTargetsFromDescription 方法已删除

  /**
   * 🔧 新增：检查执行结果是否包含有效数据
   */
  private checkValidDataInResult(result: any): boolean {
    if (!result) {
      return false;
    }
    
    try {
      // 检查MCP标准格式
      if (result && typeof result === 'object' && result.content) {
        if (Array.isArray(result.content) && result.content.length > 0) {
          const firstContent = result.content[0];
          if (firstContent && firstContent.text) {
            const text = firstContent.text;
            return text.length > 10 && !text.includes('error') && !text.includes('failed');
          }
        }
      }
      
      // 检查字符串结果
      if (typeof result === 'string') {
        return result.length > 10 && !result.toLowerCase().includes('error') && !result.toLowerCase().includes('failed');
      }
      
      // 检查对象结果
      if (typeof result === 'object') {
        const resultString = JSON.stringify(result);
        return resultString.length > 20 && !resultString.toLowerCase().includes('error');
      }
      
      return false;
    } catch (error) {
      logger.warn(`Failed to validate result data:`, error);
      return false;
    }
  }

  /**
   * 🔧 新增：记录失败并生成处理策略
   */
  private async recordFailureAndStrategy(state: AgentWorkflowState, step: AgentExecutionStep): Promise<void> {
    const tool = step.plan.tool;
    const error = step.error || 'Unknown error';

    // 查找是否已有此工具的失败记录
    let failureRecord = state.failureHistory.find(f => f.tool === tool);
    
    if (failureRecord) {
      failureRecord.attemptCount++;
      failureRecord.lastAttemptTime = new Date();
    } else {
      failureRecord = {
        stepNumber: step.stepNumber,
        tool,
        error,
        attemptCount: 1,
        lastAttemptTime: new Date(),
        suggestedStrategy: 'retry',
        maxRetries: 2
      };
      state.failureHistory.push(failureRecord);
    }

    // 生成处理策略
    failureRecord.suggestedStrategy = this.generateFailureStrategy(tool, error, failureRecord.attemptCount);
    
    logger.info(`📝 Recorded failure for ${tool}: ${error} (attempt ${failureRecord.attemptCount})`);
    logger.info(`🔧 Suggested strategy: ${failureRecord.suggestedStrategy}`);
  }

  /**
   * 🔧 新增：生成失败处理策略
   */
  private generateFailureStrategy(tool: string, error: string, attemptCount: number): 'retry' | 'alternative' | 'skip' | 'manual_intervention' {
    // 系统级错误 - 直接跳过，无法修复
    if (error.includes('require is not defined') || error.includes('import') || error.includes('module') || error.includes('Cannot resolve')) {
      return 'manual_intervention';
    }
    
    // 字符限制错误 - 尝试替代方案
    if (error.includes('280') || error.includes('character') || error.includes('too long')) {
      return 'alternative';
    }
    
    // 认证错误 - 手动干预
    if (error.includes('auth') || error.includes('permission') || error.includes('403') || error.includes('401')) {
      return 'manual_intervention';
    }
    
    // 连接错误 - 直接跳过，避免无限重试
    if (error.includes('Not connected') || error.includes('Connection closed') || error.includes('connection failed')) {
      return 'skip';
    }
    
    // 服务器错误 - 重试一次后跳过
    if (error.includes('500') || error.includes('timeout') || error.includes('network')) {
      return attemptCount < 2 ? 'retry' : 'skip';
    }
    
    // 其他错误 - 根据尝试次数决定
    if (attemptCount < 2) {
      return 'retry';
    } else if (attemptCount < 5) {
      return 'alternative';
    } else {
      return 'skip'; // 超过5次尝试就停止
    }
  }

  /**
   * Get failure handling strategy
   */
  private getFailureStrategy(state: AgentWorkflowState, step: AgentExecutionStep): string {
    const failureRecord = state.failureHistory.find(f => f.tool === step.plan.tool);
    return failureRecord?.suggestedStrategy || 'retry';
  }
  
  /**
   * Check if error type is MCP connection related
   */
  private isMCPConnectionError(errorType: string): boolean {
    const mcpConnectionErrorTypes = [
      'INVALID_API_KEY',
      'EXPIRED_API_KEY', 
      'WRONG_PASSWORD',
      'MISSING_AUTH_PARAMS',
      'INVALID_AUTH_FORMAT',
      'INSUFFICIENT_PERMISSIONS',
      'MCP_CONNECTION_FAILED',
      'MCP_AUTH_REQUIRED',
      'MCP_SERVICE_INIT_FAILED'
    ];
    return mcpConnectionErrorTypes.includes(errorType);
  }

  /**
   * 🔧 新增：标准化MCP名称
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
   * 从文本中提取draft_id的辅助方法
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
   * x-mcp自动发布处理：当create_draft_tweet或create_draft_thread成功后自动发布
   */
  private async handleXMcpAutoPublish(
    mcpName: string, 
    toolName: string, 
    result: any, 
    userId?: string
  ): Promise<any> {
    // 🔧 添加详细调试信息
    const normalizedMcpName = this.normalizeMCPName(mcpName);
    logger.info(`🔍 AgentEngine X-MCP Auto-publish Check: mcpName="${mcpName}", normalizedMcpName="${normalizedMcpName}", toolName="${toolName}"`);
    
    // 只处理x-mcp的草稿创建操作
    if (normalizedMcpName !== 'x-mcp') {
      logger.info(`❌ AgentEngine X-MCP Auto-publish: Normalized MCP name "${normalizedMcpName}" is not "x-mcp", skipping auto-publish`);
      return result;
    }

    // 检查是否是草稿创建操作
    if (!toolName.includes('create_draft')) {
      logger.info(`❌ AgentEngine X-MCP Auto-publish: Tool name "${toolName}" does not include "create_draft", skipping auto-publish`);
      return result;
    }

    try {
      logger.info(`🔄 X-MCP Auto-publish: Detected ${toolName} completion, attempting auto-publish...`);

      // 提取draft_id
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
                      logger.info(`📝 AgentEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
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
                          logger.info(`📝 AgentEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
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
                    logger.info(`📝 AgentEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from text pattern matching`);
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
            logger.info(`📝 AgentEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from string pattern matching`);
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
      logger.info(`📝 AgentEngine X-MCP Auto-publish INPUT: ${JSON.stringify(publishInput, null, 2)}`);
      
      const publishResult = await this.mcpToolAdapter.callTool(
        normalizedMcpName,
        'publish_draft',
        publishInput,
        userId
      );
      
      logger.info(`📤 AgentEngine X-MCP Auto-publish OUTPUT: ${JSON.stringify(publishResult, null, 2)}`);

      logger.info(`✅ X-MCP Auto-publish: Successfully published draft ${draftId}`);

      // 返回合并的结果
      return {
        draft_creation: result,
        auto_publish: publishResult,
        combined_result: `Draft created and published successfully. Draft ID: ${draftId}`,
        draft_id: draftId,
        published: true
      };

    } catch (error) {
      logger.error(`❌ X-MCP Auto-publish failed:`, error);
      
      // 即使发布失败，也返回原始的草稿创建结果
      return {
        draft_creation: result,
        auto_publish_error: error instanceof Error ? error.message : String(error),
        combined_result: `Draft created successfully but auto-publish failed. You may need to publish manually.`,
        published: false
      };
    }
  }

  /**
   * 智能提取完整的JSON对象
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
            console.log(`🔧 Extracted complete JSON: ${jsonString}`);
            return jsonString;
          }
        }
      }
    }
    
    // 如果没有找到完整的JSON对象，返回null
    console.log(`⚠️ Could not find complete JSON object`);
    return null;
  }

  /**
   * 🔧 新增：使用LLM智能转换参数
   */
  private async convertParametersWithLLM(toolName: string, originalArgs: any, mcpTools: any[], state?: AgentWorkflowState): Promise<any> {
    try {
      logger.info(`🔄 Converting parameters for tool: ${toolName}`);

      // 🔧 准备前一步的执行结果上下文
      let previousResultsContext = '';
      if (state && state.executionHistory.length > 0) {
        const lastExecution = state.executionHistory[state.executionHistory.length - 1];
        if (lastExecution.success && lastExecution.result) {
          previousResultsContext = `

PREVIOUS STEP RESULTS:
${typeof lastExecution.result === 'string' ? lastExecution.result : JSON.stringify(lastExecution.result, null, 2)}

IMPORTANT: Use the ACTUAL CONTENT from the previous step results above when creating parameters. Do NOT use placeholder text like "Summary of @user's tweets" - extract the real data!`;
        }
      }

      // 构建智能参数转换提示词
      const conversionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform parameters for MCP tool calls.

CONTEXT:
- Tool to call: ${toolName}
- Input parameters: ${JSON.stringify(originalArgs, null, 2)}${previousResultsContext}
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
4. **EXTRACT REAL DATA FROM PREVIOUS RESULTS**: 
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
  1. Remove URLs (they're not clickable in tweets anyway)
  2. Use abbreviations (e.g., "w/" for "with")
  3. Remove less important details
  4. Keep only the most essential information
- For threads: First tweet should be <250 chars to leave room for thread numbering

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

IMPORTANT: Always use exact parameter names from the inputSchema, ensure Twitter content is under 280 characters, and EXTRACT REAL CONTENT from previous results!

Transform the data now:`;

      const response = await this.llm.invoke([new SystemMessage(conversionPrompt)]);

      let conversion;
      try {
        const responseText = response.content.toString().trim();
        logger.info(`🔍 === LLM Parameter Conversion Debug ===`);
        logger.info(`🔍 Raw LLM Response: ${responseText}`);
        
        // 🔧 完全复制传统引擎的JSON清理逻辑
        let cleanedJson = responseText;
        
        console.log(`\n==== 📝 LLM Parameter Conversion Debug ====`);
        console.log(`Raw LLM Response Length: ${responseText.length} chars`);
        console.log(`Raw LLM Response: ${responseText}`);
        
        // 移除Markdown代码块标记
        cleanedJson = cleanedJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        console.log(`After Markdown Cleanup: ${cleanedJson}`);
        
        // 🔧 修复：使用更智能的JSON提取逻辑
        const extractedJson = this.extractCompleteJson(cleanedJson);
        if (extractedJson) {
          cleanedJson = extractedJson;
          console.log(`After JSON Extraction: ${cleanedJson}`);
        }
        
        console.log(`🧹 Final Cleaned LLM response: ${cleanedJson}`);
        
        conversion = JSON.parse(cleanedJson);
        console.log(`🔄 Parsed conversion: ${JSON.stringify(conversion, null, 2)}`);
        logger.info(`🔍 Parsed Conversion: ${JSON.stringify(conversion, null, 2)}`);
      } catch (parseError) {
        logger.error(`❌ Failed to parse parameter conversion response: ${response.content}`);
        logger.error(`❌ Parse error: ${parseError}`);
        logger.info(`🔍 Falling back to originalArgs: ${JSON.stringify(originalArgs, null, 2)}`);
        return originalArgs; // 回退到原始参数
      }

      const convertedParams = conversion.inputParams || originalArgs;
      
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
   * 🔧 新增：验证工具并在需要时重选
   */
  private async validateAndSelectTool(
    requestedTool: string, 
    convertedArgs: any, 
    availableTools: any[], 
    mcpName: string
  ): Promise<{ finalToolName: string; finalArgs: any }> {
    try {
      logger.info(`🔍 === Tool Validation Debug ===`);
      logger.info(`🔍 Requested Tool: ${requestedTool}`);
      logger.info(`🔍 MCP Name: ${mcpName}`);
      logger.info(`🔍 Available Tools: [${availableTools.map(t => t.name).join(', ')}]`);
      logger.info(`🔍 Converted Args: ${JSON.stringify(convertedArgs, null, 2)}`);
      
      // 1. 首先检查请求的工具是否存在
      let selectedTool = availableTools.find(t => t.name === requestedTool);
      let finalToolName = requestedTool;
      let finalArgs = convertedArgs;
      
      logger.info(`🔍 Tool found: ${!!selectedTool}`);
      if (selectedTool) {
        logger.info(`🔍 Tool schema: ${JSON.stringify(selectedTool.inputSchema, null, 2)}`);
      }

      if (!selectedTool) {
        logger.warn(`Tool ${requestedTool} does not exist in ${mcpName}, attempting tool re-selection...`);
        
        // 2. 尝试模糊匹配
        const fuzzyMatch = availableTools.find(t => 
          t.name.toLowerCase().includes(requestedTool.toLowerCase()) ||
          requestedTool.toLowerCase().includes(t.name.toLowerCase())
        );
        
        if (fuzzyMatch) {
          logger.info(`Found fuzzy match: ${fuzzyMatch.name}`);
          selectedTool = fuzzyMatch;
          finalToolName = fuzzyMatch.name;
        } else {
          // 3. 让LLM从可用工具中重新选择
          logger.info(`Using LLM to re-select appropriate tool from available options...`);
          const reselectionResult = await this.llmReselectionTool(
            requestedTool, 
            convertedArgs, 
            availableTools, 
            mcpName
          );
          
          selectedTool = availableTools.find(t => t.name === reselectionResult.toolName);
          if (selectedTool) {
            finalToolName = reselectionResult.toolName;
            finalArgs = reselectionResult.inputParams;
            logger.info(`LLM re-selected tool: ${finalToolName}`);
          } else {
            throw new Error(`Cannot find suitable tool in ${mcpName} to execute task: ${requestedTool}. Available tools: ${availableTools.map(t => t.name).join(', ')}`);
          }
        }
              } else {
          logger.info(`✅ Tool ${requestedTool} found in ${mcpName}`);
        }

        logger.info(`🔍 === Final Tool Selection Results ===`);
        logger.info(`🔍 Final Tool Name: ${finalToolName}`);
        logger.info(`🔍 Final Args: ${JSON.stringify(finalArgs, null, 2)}`);
        logger.info(`🔍 Final Args Type: ${typeof finalArgs}`);
        logger.info(`🔍 =====================================`);

        return { finalToolName, finalArgs };

    } catch (error) {
      logger.error(`❌ Tool validation and selection failed:`, error);
      throw error;
    }
  }

  /**
   * 🔧 新增：LLM重新选择工具
   */
  private async llmReselectionTool(
    originalTool: string,
    originalArgs: any,
    availableTools: any[],
    mcpName: string
  ): Promise<{ toolName: string; inputParams: any; reasoning: string }> {
    try {
      const reselectionPrompt = `You are an expert tool selector. The originally requested tool "${originalTool}" does not exist in MCP service "${mcpName}". Please select the most appropriate alternative tool from the available options.

CONTEXT:
- Original tool requested: ${originalTool}
- Original parameters: ${JSON.stringify(originalArgs, null, 2)}
- MCP Service: ${mcpName}
- Available tools with their schemas:
${availableTools.map(tool => {
  const schema = tool.inputSchema || {};
  return `
Tool: ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema: ${JSON.stringify(schema, null, 2)}
`;
}).join('\n')}

SELECTION PRINCIPLES:
1. **Choose the most functionally similar tool**: Select the tool that can best accomplish the same objective
2. **Consider tool descriptions**: Match based on functionality, not just name similarity
3. **Transform parameters accordingly**: Adapt the parameters to match the selected tool's schema
4. **Use exact parameter names**: Follow the selected tool's input schema exactly

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "toolName": "exact_tool_name_from_available_list",
  "inputParams": { /* parameters adapted for the selected tool */ },
  "reasoning": "why this tool was selected and how parameters were adapted"
}

Select the best alternative tool now:`;

      const response = await this.llm.invoke([new SystemMessage(reselectionPrompt)]);

      let reselection;
      try {
        const responseText = response.content.toString().trim();
        logger.info(`🔍 === LLM Tool Reselection Debug ===`);
        logger.info(`🔍 Original Tool: ${originalTool}`);
        logger.info(`🔍 Raw LLM Reselection Response: ${responseText}`);
        
        // 🔧 使用传统引擎的强化JSON清理逻辑
        let cleanedJson = responseText;
        
        console.log(`\n==== 📝 LLM Tool Reselection JSON Debug ====`);
        console.log(`Raw LLM Response Length: ${responseText.length} chars`);
        console.log(`Raw LLM Response: ${responseText}`);
        
        // 移除Markdown代码块标记
        cleanedJson = cleanedJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        console.log(`After Markdown Cleanup: ${cleanedJson}`);
        
        // 🔧 修复：使用更智能的JSON提取逻辑
        const extractedJson = this.extractCompleteJson(cleanedJson);
        if (extractedJson) {
          cleanedJson = extractedJson;
          console.log(`After JSON Extraction: ${cleanedJson}`);
        }
        
        console.log(`🧹 Final Cleaned LLM response: ${cleanedJson}`);
        
        reselection = JSON.parse(cleanedJson);
        console.log(`🔄 Parsed reselection: ${JSON.stringify(reselection, null, 2)}`);
        logger.info(`🔍 Parsed Reselection: ${JSON.stringify(reselection, null, 2)}`);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        logger.error(`❌ Failed to parse tool reselection response: ${response.content}`);
        logger.error(`❌ Parse error: ${errorMessage}`);
        // 回退到第一个可用工具
        if (availableTools.length > 0) {
          logger.info(`🔍 Falling back to first available tool: ${availableTools[0].name}`);
          return {
            toolName: availableTools[0].name,
            inputParams: originalArgs,
            reasoning: `Fallback to first available tool due to parsing error: ${availableTools[0].name}`
          };
        }
        throw new Error('No available tools and LLM reselection failed');
      }

      return {
        toolName: reselection.toolName || (availableTools.length > 0 ? availableTools[0].name : originalTool),
        inputParams: reselection.inputParams || originalArgs,
        reasoning: reselection.reasoning || 'No reasoning provided'
      };

    } catch (error) {
      logger.error(`LLM tool reselection failed:`, error);
      // 最终回退
      if (availableTools.length > 0) {
        return {
          toolName: availableTools[0].name,
          inputParams: originalArgs,
          reasoning: `Emergency fallback to first available tool: ${availableTools[0].name}`
        };
      }
      throw new Error('No available tools and all reselection methods failed');
    }
  }
}

/**
 * Agent智能任务服务 - 使用Agent专用智能引擎
 */
export class AgentIntelligentTaskService {
  private agent: Agent;
  private engine: AgentIntelligentEngine;

  constructor(agent: Agent) {
    this.agent = agent;
    this.engine = new AgentIntelligentEngine(agent);
  }

  /**
   * 执行Agent智能任务
   */
  async executeAgentTaskIntelligently(
    taskId: string,
    stream: (data: any) => void,
    userLanguage?: SupportedLanguage
  ): Promise<boolean> {
    try {
      logger.info(`🚀 Starting Agent intelligent task execution [Task: ${taskId}, Agent: ${this.agent.name}]`);

      const task = await this.engine['taskService'].getTaskById(taskId);
      if (!task) {
        stream({ 
          event: 'task_execution_error', 
          data: { 
            message: 'Task not found',
            agentName: this.agent.name,
            timestamp: new Date().toISOString()
          } 
        });
        return false;
      }

      // 使用Agent专用智能引擎执行 (传递用户语言)
      const executionGenerator = this.engine.executeAgentTask(taskId, task.content, 15, userLanguage);
      
      let result = false;
      for await (const executionEvent of executionGenerator) {
        // 直接转发Agent原生事件流
        stream(executionEvent);
        
        // 检查是否是最终结果
        if (executionEvent.event === 'task_execution_complete') {
          result = executionEvent.data.success;
        }
      }

      logger.info(`🎯 Agent intelligent task execution completed [Task: ${taskId}, Agent: ${this.agent.name}, Success: ${result}]`);
      return result;

    } catch (error) {
      logger.error(`❌ Agent intelligent task execution failed:`, error);
      
      stream({
        event: 'task_execution_error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          agentName: this.agent.name,
          message: `${this.agent.name} intelligent execution failed`,
          timestamp: new Date().toISOString()
        }
      });
      
      return false;
    }
  }
}

/**
 * 创建Agent智能任务服务实例
 */
export function createAgentIntelligentTaskService(agent: Agent): AgentIntelligentTaskService {
  return new AgentIntelligentTaskService(agent);
} 