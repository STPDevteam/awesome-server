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
  // 🔧 新增：任务分解和状态跟踪
  taskBreakdown: TaskComponent[];     // 任务分解结构
  completedComponents: string[];      // 已完成的组件ID
  failureHistory: FailureRecord[];    // 失败记录和处理策略
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
    maxIterations: number = 10
  ): AsyncGenerator<{ event: string; data: any }, boolean, unknown> {
    logger.info(`🤖 Starting Agent intelligent execution [Task: ${taskId}, Agent: ${this.agent.name}]`);

    // 🔧 Agent专用：发送execution_start事件
    yield {
      event: 'execution_start',
      data: {
        taskId,
        agentName: this.agent.name,
        timestamp: new Date().toISOString(),
        message: `Starting intelligent execution with ${this.agent.name}...`
      }
    };

    // 🔧 新增：初始化任务分解
    const taskBreakdown = await this.analyzeAndBreakdownTask(query);
    
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
      maxIterations,
      currentIteration: 0,
      errors: [],
      lastError: null,
      // 🔧 新增：任务跟踪相关字段
      taskBreakdown,
      completedComponents: [],
      failureHistory: []
    };

    let stepCounter = 0;

    try {
      // 🔧 获取任务并应用Agent的MCP工作流配置
      await this.prepareAgentTask(taskId, state);

      // 🔧 Agent智能执行主循环
      while (!state.isComplete && state.currentIteration < maxIterations) {
        state.currentIteration++;
        stepCounter++;

        logger.info(`🧠 Agent ${this.agent.name} - Iteration ${state.currentIteration}`);

        // 🔧 第一步：Agent智能规划（增强版）
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

        // 🔧 第二步：Agent执行阶段
        const executionResult = await this.agentExecutionPhase(state, stepId);

        // 🔧 Agent格式的流式thinking输出（原始+格式化双重处理）
        if (executionResult.success && executionResult.result) {
          // 1. 🔧 首先发送原始结果的chunks（用于调试和上下文传递）
          const originalResultText = typeof executionResult.result === 'string' 
            ? executionResult.result 
            : JSON.stringify(executionResult.result);
          
          const originalChunks = originalResultText.match(/.{1,100}/g) || [originalResultText];
          for (const chunk of originalChunks) {
            yield {
              event: 'step_thinking_chunk',
              data: {
                stepId,
                chunk,
                agentName: this.agent.name,
                type: 'original' // 标识为原始数据
              }
            };
            await new Promise(resolve => setTimeout(resolve, 30));
          }

          // 2. 🔧 然后发送LLM格式化后的结果chunks（用于前端美观显示和存储）- 使用step_result_chunk事件
          const formattedResultGenerator = this.formatAndStreamStepResult(
            executionResult.result,
            state.currentPlan!.mcpName || 'unknown',
            state.currentPlan!.tool
          );
          
          for await (const chunk of formattedResultGenerator) {
            yield {
              event: 'step_result_chunk',
              data: {
                stepId,
                chunk,
                agentName: this.agent.name,
                type: 'formatted' // 标识为格式化数据
              }
            };
          }
        }

        // 🔧 获取格式化结果用于存储（但保留原始结果用于传递）
        let formattedResultForStorage = '';
        if (executionResult.success && executionResult.result) {
          // 生成完整的格式化结果（不流式，用于存储）
          formattedResultForStorage = await this.generateFormattedResult(
            executionResult.result,
            state.currentPlan!.mcpName || 'unknown',
            state.currentPlan!.tool
          );
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

        // 🔧 新增：更新任务组件完成状态
        await this.updateTaskComponentStatus(state, executionStep);

        // 🔧 新增：记录失败并生成处理策略
        if (!executionResult.success) {
          await this.recordFailureAndStrategy(state, executionStep);
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
            // 🔧 新增：任务进度信息
            taskProgress: {
              completedComponents: state.completedComponents.length,
              totalComponents: state.taskBreakdown.length,
              componentDetails: state.taskBreakdown.map(c => ({
                id: c.id,
                description: c.description,
                isCompleted: c.isCompleted
              }))
            }
          }
        };

        // 🔧 如果执行失败，发送Agent格式的step_error事件
        if (!executionResult.success) {
          yield {
            event: 'step_error',
            data: {
              step: stepCounter,
              error: executionResult.error || 'Unknown error',
              agentName: this.agent.name,
              message: `${this.agent.name} encountered an error in step ${stepCounter}`,
              // 🔧 新增：失败处理策略
              failureStrategy: this.getFailureStrategy(state, executionStep)
            }
          };
        }

        // 🔧 保存步骤结果到数据库（使用格式化结果）
        await this.saveAgentStepResult(taskId, executionStep, formattedResultForStorage);

        // 🔧 第三步：Agent观察阶段（增强版） - 判断是否完成
        const observationResult = await this.agentObservationPhaseEnhanced(state);
        state.isComplete = observationResult.isComplete;
        
        if (observationResult.nextObjective) {
          state.currentObjective = observationResult.nextObjective;
        }

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

      // 🔧 保存Agent最终结果到数据库
      await this.saveAgentFinalResult(taskId, state, finalResult);

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
   * 🔧 新增：分析并分解任务
   */
  private async analyzeAndBreakdownTask(query: string): Promise<TaskComponent[]> {
    try {
      const analysisPrompt = `Analyze the user's task and break it down into logical components.

**User Task**: "${query}"

**Analysis Framework**:
Identify the major components in this task. Common patterns include:

1. **Data Collection**: Getting information from external sources
   - Examples: "get tweets from user X", "fetch repository info", "retrieve price data"
   
2. **Data Processing**: Analyzing, combining, or transforming collected data
   - Examples: "summarize the tweets", "compare the data", "analyze trends"
   
3. **Action Execution**: Performing actions based on processed data
   - Examples: "send tweet", "create issue", "post to social media"
   
4. **Output Generation**: Creating final deliverables
   - Examples: "generate report", "create summary", "format results"

**Task Analysis**:
Look for keywords that indicate multiple components:
- "and", "then", "also", "after", "subsequently"
- Multiple verbs: "get... and post...", "analyze... and send..."
- Multiple targets: "from A and B", "to X and Y"

**Component Dependencies**:
- Data Collection → Data Processing → Action Execution
- Some components may run in parallel (collecting from multiple sources)
- Some components depend on others (can't send summary without data)

**Output Format**:
Return a JSON array of task components:
[
  {
    "id": "unique_component_id",
    "type": "data_collection|data_processing|action_execution|analysis|output",
    "description": "Clear description of what this component does",
    "dependencies": ["id_of_required_component"],
    "requiredData": ["type_of_data_needed"],
    "outputData": ["type_of_data_produced"]
  }
]

Analyze the task now:`;

      const response = await this.llm.invoke([new SystemMessage(analysisPrompt)]);
      
      let breakdown: TaskComponent[];
      try {
        const responseText = response.content.toString().trim();
        let cleanedJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const jsonMatch = cleanedJson.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          cleanedJson = jsonMatch[0];
        }
        
        const parsedBreakdown = JSON.parse(cleanedJson);
        breakdown = parsedBreakdown.map((component: any, index: number) => ({
          id: component.id || `component_${index + 1}`,
          type: component.type || 'analysis',
          description: component.description || `Task component ${index + 1}`,
          isCompleted: false,
          completedStepNumbers: [],
          dependencies: component.dependencies || [],
          requiredData: component.requiredData || [],
          outputData: component.outputData || []
        }));
        
        logger.info(`📋 Task breakdown completed: ${breakdown.length} components identified`);
        breakdown.forEach((comp, i) => {
          logger.info(`   ${i + 1}. ${comp.description} (${comp.type})`);
        });
        
        return breakdown;
      } catch (parseError) {
        logger.warn(`Task breakdown parsing failed: ${parseError}`);
        // 降级处理：创建简单的单组件任务
        return [{
          id: 'main_task',
          type: 'analysis',
          description: query,
          isCompleted: false,
          completedStepNumbers: [],
          dependencies: [],
          requiredData: [],
          outputData: []
        }];
      }
    } catch (error) {
      logger.error(`Task breakdown analysis failed:`, error);
      // 最基础的降级处理
      return [{
        id: 'fallback_task',
        type: 'analysis',
        description: 'Complete user request',
        isCompleted: false,
        completedStepNumbers: [],
        dependencies: [],
        requiredData: [],
        outputData: []
      }];
    }
  }

  /**
   * 🔧 示例：流式规划阶段改进版本
   */
  private async agentPlanningPhaseStreaming(state: AgentWorkflowState): Promise<{
    success: boolean;
    plan?: AgentExecutionPlan;
    error?: string;
  }> {
    try {
      const availableMCPs = await this.getAgentAvailableMCPs(state.taskId, state.agentId);
      const plannerPrompt = this.buildAgentPlannerPrompt(state, availableMCPs);

      // 🔄 使用流式LLM调用
      const stream = await this.llm.stream([new SystemMessage(plannerPrompt)]);
      let planningContent = '';
      
      for await (const chunk of stream) {
        if (chunk.content) {
          planningContent += chunk.content;
          
          // 发送规划思考过程
          // yield {
          //   event: 'planning_thinking_chunk',
          //   data: {
          //     chunk: chunk.content,
          //     agentName: this.agent.name
          //   }
          // };
        }
      }

      const plan = this.parseAgentPlan(planningContent, state.agentName);
      return { success: true, plan };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 🔧 示例：流式观察阶段改进版本
   */
  private async agentObservationPhaseStreaming(state: AgentWorkflowState): Promise<{
    isComplete: boolean;
    nextObjective?: string;
  }> {
    try {
      const observerPrompt = this.buildAgentObserverPrompt(state);
      
      // 🔄 使用流式LLM调用
      const stream = await this.llm.stream([
        new SystemMessage(observerPrompt),
        new HumanMessage(`Please analyze whether ${this.agent.name} has completed the task successfully`)
      ]);
      
      let observationContent = '';
      
      for await (const chunk of stream) {
        if (chunk.content) {
          observationContent += chunk.content;
          
          // 发送观察思考过程
          // yield {
          //   event: 'observation_thinking_chunk', 
          //   data: {
          //     chunk: chunk.content,
          //     agentName: this.agent.name
          //   }
          // };
        }
      }

      const observation = this.parseAgentObservation(observationContent);
      return observation;

    } catch (error) {
      return { isComplete: false };
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
  }> {
    if (!state.currentPlan) {
      return { success: false, error: 'No execution plan available' };
    }

    try {
      let result: any;

      if (state.currentPlan.toolType === 'mcp') {
        // 🔧 执行MCP工具
        result = await this.executeAgentMCPTool(state.currentPlan, state);
      } else {
        // 🔧 执行LLM工具
        result = await this.executeAgentLLMTool(state.currentPlan, state);
      }

      logger.info(`✅ Agent ${this.agent.name} execution successful: ${state.currentPlan.tool}`);
      return { success: true, result };

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
  private async agentObservationPhaseEnhanced(state: AgentWorkflowState): Promise<{
    isComplete: boolean;
    nextObjective?: string;
  }> {
    try {
      const observerPrompt = this.buildEnhancedAgentObserverPrompt(state);
      
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
    
    // 🔧 任务组件分析
    const completedComponents = state.taskBreakdown.filter(c => c.isCompleted);
    const remainingComponents = state.taskBreakdown.filter(c => !c.isCompleted);
    
    // 🔧 失败分析
    const recentFailures = state.failureHistory.filter(f => f.attemptCount > 0);
    
    return `You are **${this.agent.name}**, an intelligent AI assistant with specialized capabilities.

**AGENT IDENTITY**:
- Name: ${this.agent.name}
- Description: ${this.agent.description || 'Specialized AI Assistant'}
- Role: Intelligent workflow executor with access to advanced tools

**USER TASK**: "${state.originalQuery}"

**🔧 ENHANCED TASK ANALYSIS**:

## Task Breakdown Status
${state.taskBreakdown.map(comp => 
  `- ${comp.isCompleted ? '✅' : '⏳'} ${comp.description} (${comp.type})`
).join('\n')}

**Completed Components**: ${completedComponents.length}/${state.taskBreakdown.length}
**Remaining Components**: ${remainingComponents.map(c => c.description).join(', ')}

## Execution History & Data Analysis
- Steps completed: ${totalSteps}
- Available data: ${hasData ? Object.keys(state.dataStore).filter(k => k !== 'lastResult').join(', ') : 'None'}
- Last step: ${lastStepResult ? `${lastStepResult.plan.tool} (${lastStepResult.success ? 'Success' : 'Failed'})` : 'None'}
${lastStepResult?.result ? `- Last result data available: Yes (${typeof lastStepResult.result})` : ''}

## Failure Analysis & Strategy
${recentFailures.length > 0 ? 
  recentFailures.map(f => 
    `- ${f.tool}: Failed ${f.attemptCount} time(s), Strategy: ${f.suggestedStrategy}`
  ).join('\n') 
  : '- No recent failures'}

**AVAILABLE MCP SERVICES FOR ${this.agent.name.toUpperCase()}**:
${availableMCPs.map(mcp => {
  const actualTools = mcpToolsInfo.get(mcp.mcpName);
  if (actualTools && actualTools.length > 0) {
    return `- MCP Service: ${mcp.mcpName}
  Description: ${mcp.description || 'General purpose tool'}
  Available Tools: ${actualTools.map(tool => tool.name).join(', ')}
  Tool Details:
${actualTools.map(tool => `    * ${tool.name}: ${tool.description || 'No description'}`).join('\n')}`;
  } else {
    return `- MCP Service: ${mcp.mcpName}
  Description: ${mcp.description || 'General purpose tool'}
  Status: Not connected or no tools available`;
  }
}).join('\n\n')}

**🔧 ENHANCED PLANNING PRINCIPLES**:

### 1. **Avoid Redundant Work**
- ✅ DO: Use existing data from completed components
- ❌ DON'T: Re-collect data that was already successfully obtained
- 🔍 CHECK: What data is already available in dataStore?

### 2. **Handle Failures Intelligently**
${recentFailures.length > 0 ? `
Recent failure analysis:
${recentFailures.map(f => `- ${f.tool}: ${f.suggestedStrategy === 'alternative' ? 'Try different approach' : f.suggestedStrategy === 'retry' ? 'Retry with modifications' : 'Skip this step'}`).join('\n')}
` : ''}

### 3. **Focus on Incomplete Components**
**Next logical step should address**: ${remainingComponents.length > 0 ? remainingComponents[0].description : 'Task completion verification'}

### 4. **Smart Progression Logic**
Ask yourself:
- "What component needs to be completed next?"
- "Do I have all required data for the next step?"
- "Should I retry a failed step or try an alternative approach?"
- "Can I skip a problematic step and still achieve the user's goal?"

**DECISION LOGIC as ${this.agent.name}**:

Based on the task breakdown and current progress, determine the most logical next step:

1. **If data collection is incomplete**: Collect missing data
2. **If data is available but processing is incomplete**: Process/analyze the data  
3. **If processing is done but action is incomplete**: Execute the final action
4. **If a step failed**: Apply the suggested failure strategy
5. **If all components are complete**: Verify completion or conclude

**OUTPUT FORMAT** (JSON only):
{
  "tool": "specific-function-name-like-getUserTweets-or-sendTweet",
  "toolType": "mcp" or "llm",
  "mcpName": "mcp-service-name-from-list-above",
  "args": {
    // Parameters specific to this tool/action
    // Use available data from dataStore when applicable
  },
  "expectedOutput": "What this step should accomplish",
  "reasoning": "Why ${this.agent.name} chose this specific step (reference task breakdown and avoid redundant work)",
  "agentContext": "How this relates to completing the remaining task components"
}

**CRITICAL INSTRUCTIONS**:
❌ WRONG: {"tool": "twitter-client-mcp", "mcpName": "getUserTweets"}
✅ CORRECT: {"tool": "getUserTweets", "mcpName": "twitter-client-mcp"}

What is the most logical next step for ${this.agent.name} to take?`;
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

## Completion Judgment for ${this.agent.name}

Please analyze whether **${this.agent.name}** has successfully completed the user's task:

### 🤖 Agent Performance Assessment
From ${this.agent.name}'s perspective:
- Has ${this.agent.name} successfully fulfilled the user's request?
- Are the results satisfactory for ${this.agent.name}'s standards?
- Would the user be satisfied with ${this.agent.name}'s performance?

### 📋 Task Completeness Check
1. **Primary Goal**: Has the main objective been achieved?
2. **Quality Assessment**: Are the results of sufficient quality?
3. **User Satisfaction**: Would this satisfy the user's expectations?

Please return in format:
{
  "isComplete": true/false,
  "reasoning": "detailed reasoning for ${this.agent.name}'s completion judgment",
  "nextObjective": "next objective for ${this.agent.name} (if not complete)"
}`;
  }

  /**
   * 🔧 新增：构建增强版观察提示词
   */
  private buildEnhancedAgentObserverPrompt(state: AgentWorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    const completedComponents = state.taskBreakdown.filter(c => c.isCompleted);
    const totalComponents = state.taskBreakdown.length;
    
    return `You are observing the execution progress of **${this.agent.name}** to determine task completion status with enhanced analysis.

## Agent & Task Information
- **Agent**: ${this.agent.name}
- **Agent Description**: ${this.agent.description || 'Specialized AI Assistant'}
- **Original Task**: ${state.originalQuery}
- **Current Objective**: ${state.currentObjective}
- **Executed Steps**: ${state.executionHistory.length}

## 🔧 ENHANCED TASK COMPONENT ANALYSIS

### Component Completion Status
${state.taskBreakdown.map(comp => `
**Component**: ${comp.description} (${comp.type})
- Status: ${comp.isCompleted ? '✅ COMPLETED' : '⏳ PENDING'}
- Completed in steps: ${comp.completedStepNumbers.join(', ') || 'None'}
- Dependencies: ${comp.dependencies.join(', ') || 'None'}
`).join('\n')}

**Overall Progress**: ${completedComponents.length}/${totalComponents} components completed

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

## 🎯 ENHANCED COMPLETION JUDGMENT

### Critical Completion Criteria

1. **Component Completeness Check**
   - Are ALL required components completed? ${completedComponents.length === totalComponents ? 'YES ✅' : 'NO ❌'}
   - Remaining components: ${state.taskBreakdown.filter(c => !c.isCompleted).map(c => c.description).join(', ') || 'None'}

2. **Data Flow Analysis**
   - Is data collection complete? ${state.taskBreakdown.filter(c => c.type === 'data_collection').every(c => c.isCompleted) ? 'YES ✅' : 'NO ❌'}
   - Is data processing complete? ${state.taskBreakdown.filter(c => c.type === 'data_processing' || c.type === 'analysis').every(c => c.isCompleted) ? 'YES ✅' : 'NO ❌'}
   - Is action execution complete? ${state.taskBreakdown.filter(c => c.type === 'action_execution').every(c => c.isCompleted) ? 'YES ✅' : 'NO ❌'}

3. **Failure Impact Assessment**
   - Are there critical failures blocking progress? ${state.failureHistory.filter(f => f.suggestedStrategy === 'manual_intervention').length > 0 ? 'YES ❌' : 'NO ✅'}
   - Can remaining work be completed with available data? (Analyze based on component dependencies)

4. **User Satisfaction Check**
   - Would the user be satisfied with current results?
   - Has the original request been fully addressed?

### 🚨 IMPORTANT DECISION RULES

**MARK COMPLETE ONLY IF**:
- ✅ ALL task components are completed OR
- ✅ User's core objective is achieved AND remaining components are optional OR
- ✅ Critical failures prevent further progress AND significant value has been delivered

**CONTINUE EXECUTION IF**:
- ❌ Key components remain incomplete
- ❌ Recent failures can be resolved with alternative approaches
- ❌ Available data can be used to complete remaining components

### Latest Execution Context
${lastStep ? `
**Last Step Details**:
- Step ${lastStep.stepNumber}: ${lastStep.plan.tool}
- Status: ${lastStep.success ? '✅ Success' : '❌ Failed'}
- Reasoning: ${lastStep.plan.reasoning}
- Result: ${lastStep.success ? (typeof lastStep.result === 'string' ? lastStep.result : '[Data Available]') : lastStep.error}
` : 'No execution history yet'}

Please return in format:
{
  "isComplete": true/false,
  "reasoning": "detailed analysis of component completion, data flow, and user objective fulfillment",
  "nextObjective": "specific next objective focusing on incomplete components (if not complete)",
  "completionConfidence": 0.0-1.0,
  "criticalGaps": ["list of any critical missing components"]
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

    // 智能判断
    const isComplete = /complete|finished|done|success/i.test(content);
    return { isComplete };
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

    const requiredMCPs = this.agent.mcpWorkflow.mcps.filter((mcp: any) => mcp.authRequired);

    if (requiredMCPs.length === 0) {
      logger.info(`Agent ${this.agent.name} does not require authenticated MCP services`);
      return;
    }

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
          const authenticatedMcpConfig = {
            ...mcpConfig,
            env: dynamicEnv
          };

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
  private async executeAgentMCPTool(plan: AgentExecutionPlan, state: AgentWorkflowState): Promise<any> {
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
      
      // 4. 🔧 智能参数转换（使用实际工具schemas）
      logger.info(`🔍 === Starting Parameter Conversion ===`);
      logger.info(`🔍 Plan Tool: ${plan.tool}`);
      logger.info(`🔍 Plan Args: ${JSON.stringify(plan.args, null, 2)}`);
      
      const convertedInput = await this.convertParametersWithLLM(plan.tool, plan.args, mcpTools);

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
      return result;

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
- **Completed Tasks**: ${state.completedComponents.length}/${state.taskBreakdown.length}
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

**Generate your response:**`;
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
   * 🔧 新增：格式化并流式输出步骤结果
   */
  private async *formatAndStreamStepResult(
    rawResult: any,
    mcpName: string,
    toolName: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      // 构建格式化提示词，参考传统agent的格式化方式
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
      logger.error(`Failed to format step result:`, error);
      // 降级处理：返回基本格式化
      const fallbackResult = `### ${toolName} 执行结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
      yield fallbackResult;
    }
  }

  /**
   * 🔧 新增：生成完整的格式化结果（非流式，用于存储）
   */
  private async generateFormattedResult(
    rawResult: any,
    mcpName: string,
    toolName: string
  ): Promise<string> {
    try {
      // 构建格式化提示词（与流式版本相同）
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

      // 使用非流式LLM生成格式化结果
      const response = await this.llm.invoke([new SystemMessage(formatPrompt)]);
      return response.content as string;
    } catch (error) {
      logger.error(`Failed to generate formatted result:`, error);
      // 降级处理：返回基本格式化
      return `### ${toolName} 执行结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
    }
  }

  /**
   * 🔧 新增：流式生成Agent最终结果
   */
  private async *generateAgentFinalResultStream(state: AgentWorkflowState): AsyncGenerator<string, string, unknown> {
    try {
      // 如果有可用的结果，使用LLM进行智能总结并流式输出
      const executionData = {
        agentName: this.agent.name,
        agentDescription: this.agent.description,
        originalQuery: state.originalQuery,
        executionSteps: state.executionHistory.length,
        successfulSteps: state.executionHistory.filter(s => s.success).length,
        lastResult: state.dataStore.lastResult,
        allResults: state.executionHistory.filter(s => s.success).map(s => s.result)
      };

      // 构建Agent专用的总结提示词
      const summaryPrompt = `You are ${this.agent.name}, summarizing your task execution results.

## Agent Information
**Name**: ${this.agent.name}
**Description**: ${this.agent.description}

## Task Execution Summary
**Original Query**: ${state.originalQuery}
**Execution Steps**: ${state.executionHistory.length}
**Successful Steps**: ${state.executionHistory.filter(s => s.success).length}

## Execution Results
${state.executionHistory.filter(s => s.success).map((step, index) => 
  `**Step ${step.stepNumber}**: ${step.plan.tool}\nResult: ${step.result}`
).join('\n\n')}

## Final Output Requirements
As ${this.agent.name}, provide a clear, concise summary of what was accomplished:
1. Summarize the key results achieved
2. Highlight the most important information
3. Maintain your agent's personality and expertise
4. Format the response in a user-friendly way

Generate a comprehensive but concise summary:`;

      // 使用流式LLM生成总结
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

      // 保存Agent步骤消息到会话（使用格式化结果）
      const task = await this.taskService.getTaskById(taskId);
      if (task.conversationId) {
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
            isComplete: true
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }
    } catch (error) {
      logger.error(`Failed to save Agent step result:`, error);
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

  /**
   * 🔧 新增：更新任务组件完成状态
   */
  private async updateTaskComponentStatus(state: AgentWorkflowState, step: AgentExecutionStep): Promise<void> {
    if (!step.success) return;

    // 根据步骤结果和工具类型判断完成了哪个组件
    for (const component of state.taskBreakdown) {
      if (component.isCompleted) continue;

      const isComponentCompleted = this.checkComponentCompletion(component, step, state);
      
      if (isComponentCompleted) {
        component.isCompleted = true;
        component.completedStepNumbers.push(step.stepNumber);
        state.completedComponents.push(component.id);
        
        logger.info(`✅ Task component completed: ${component.description}`);
      }
    }
  }

  /**
   * 🔧 新增：检查组件是否完成
   */
  private checkComponentCompletion(component: TaskComponent, step: AgentExecutionStep, state: AgentWorkflowState): boolean {
    const tool = step.plan.tool.toLowerCase();
    const componentType = component.type;
    const componentDesc = component.description.toLowerCase();

    // 基于工具类型和组件类型的匹配逻辑
    switch (componentType) {
      case 'data_collection':
        // 数据收集组件：成功调用了数据获取工具
        return tool.includes('get') || tool.includes('fetch') || tool.includes('search') || tool.includes('retrieve');
        
      case 'data_processing':
      case 'analysis':
        // 数据处理组件：使用了LLM分析或处理工具
        return step.plan.toolType === 'llm' || tool.includes('analyze') || tool.includes('process') || tool.includes('summarize');
        
      case 'action_execution':
        // 行动执行组件：成功执行了发送、创建、发布等操作
        return tool.includes('send') || tool.includes('create') || tool.includes('post') || tool.includes('publish') || tool.includes('save');
        
      case 'output':
        // 输出组件：成功生成了最终输出
        return tool.includes('generate') || tool.includes('format') || tool.includes('export');
        
      default:
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
    // 字符限制错误 - 尝试替代方案
    if (error.includes('280') || error.includes('character') || error.includes('too long')) {
      return 'alternative';
    }
    
    // 认证错误 - 手动干预
    if (error.includes('auth') || error.includes('permission') || error.includes('403') || error.includes('401')) {
      return 'manual_intervention';
    }
    
    // 服务器错误 - 重试一次后跳过
    if (error.includes('500') || error.includes('timeout') || error.includes('network')) {
      return attemptCount < 2 ? 'retry' : 'skip';
    }
    
    // 其他错误 - 根据尝试次数决定
    if (attemptCount < 2) {
      return 'retry';
    } else {
      return 'alternative';
    }
  }

  /**
   * 🔧 新增：获取失败处理策略
   */
  private getFailureStrategy(state: AgentWorkflowState, step: AgentExecutionStep): string {
    const failureRecord = state.failureHistory.find(f => f.tool === step.plan.tool);
    return failureRecord?.suggestedStrategy || 'retry';
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
      'search': 'brave-search-mcp'
    };

    return nameMapping[mcpName.toLowerCase()] || mcpName;
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
  private async convertParametersWithLLM(toolName: string, originalArgs: any, mcpTools: any[]): Promise<any> {
    try {
      logger.info(`🔄 Converting parameters for tool: ${toolName}`);

      // 构建智能参数转换提示词
      const conversionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform parameters for MCP tool calls.

CONTEXT:
- Tool to call: ${toolName}
- Input parameters: ${JSON.stringify(originalArgs, null, 2)}
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
4. **Handle missing data intelligently**: Extract from input or use descriptive content

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

IMPORTANT: Always use exact parameter names from the inputSchema and ensure Twitter content is under 280 characters!

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
    stream: (data: any) => void
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

      // 使用Agent专用智能引擎执行
      const executionGenerator = this.engine.executeAgentTask(taskId, task.content, 15);
      
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