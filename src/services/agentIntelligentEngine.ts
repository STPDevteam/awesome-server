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
      lastError: null
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

        // 🔧 第一步：Agent智能规划
        const planResult = await this.agentPlanningPhase(state);
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
              : `${this.agent.name} failed at step ${stepCounter}`
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
              message: `${this.agent.name} encountered an error in step ${stepCounter}`
            }
          };
        }

        // 🔧 保存步骤结果到数据库（使用格式化结果）
        await this.saveAgentStepResult(taskId, executionStep, formattedResultForStorage);

        // 🔧 第三步：Agent观察阶段 - 判断是否完成
        const observationResult = await this.agentObservationPhase(state);
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
${lastStepResult?.result ? `- Last result preview: ${JSON.stringify(lastStepResult.result).substring(0, 150)}...` : ''}

**AVAILABLE MCP SERVICES FOR ${this.agent.name.toUpperCase()}**:
${availableMCPs.map(mcp => `- MCP Service: ${mcp.mcpName}
  Description: ${mcp.description || 'General purpose tool'}
  Available Tools: getUserTweets, sendTweet, searchTweets (examples - use appropriate tool for task)`).join('\n')}

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
- Result: ${lastStep.success ? JSON.stringify(lastStep.result).substring(0, 500) + '...' : lastStep.error}
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

      // 🔧 关键调试：显示即将传递给MCPToolAdapter的参数
      logger.info(`🔍 Calling mcpToolAdapter.callTool with: mcpName="${plan.mcpName}", tool="${plan.tool}", userId="${task.userId}"`);

      // 🔧 使用多用户隔离的MCP工具调用
      const result = await this.mcpToolAdapter.callTool(plan.mcpName, plan.tool, plan.args, task.userId);
      
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
   * 构建Agent LLM执行提示词
   */
  private buildAgentLLMPrompt(toolName: string, plan: AgentExecutionPlan, state: AgentWorkflowState): string {
    return `You are **${this.agent.name}** executing the task: "${toolName}".

## Agent Context
**Agent**: ${this.agent.name}
**Agent Description**: ${this.agent.description || 'Specialized AI Assistant'}
**User's Goal**: ${state.originalQuery}
**Current Task**: ${toolName}

## Input Data
${Object.entries(plan.args).map(([key, value]) => 
  `**${key}**: ${typeof value === 'string' ? value : JSON.stringify(value)}`
).join('\n')}

## Previous Results
${state.dataStore.lastResult ? `
**Previous Step Result**: ${typeof state.dataStore.lastResult === 'string' 
  ? state.dataStore.lastResult 
  : JSON.stringify(state.dataStore.lastResult)}
` : 'No previous results'}

## Task Execution
As ${this.agent.name}, execute the "${toolName}" task using your specialized capabilities.

**Expected Output**: ${plan.expectedOutput}
**Reasoning**: ${plan.reasoning}
**Agent Context**: ${plan.agentContext}

Execute the task now:`;
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