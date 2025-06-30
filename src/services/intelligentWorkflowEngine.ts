import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getAllPredefinedMCPs, getPredefinedMCP } from './predefinedMCPs.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { z } from 'zod';
import { getTaskService } from './taskService.js';

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);

/**
 * 执行步骤类型
 */
export enum StepType {
  LLM_REASONING = 'llm_reasoning',
  MCP_TOOL_CALL = 'mcp_tool_call', 
  LLM_ANALYSIS = 'llm_analysis',
  MCP_DATA_FETCH = 'mcp_data_fetch',
  LLM_SYNTHESIS = 'llm_synthesis',
  CAPABILITY_CHECK = 'capability_check',
  FALLBACK = 'fallback'
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  tool: string;
  toolType: 'llm' | 'mcp';
  mcpName?: string;
  args: Record<string, any>;
  expectedOutput: string;
  reasoning: string;
}

/**
 * 执行步骤
 */
export interface ExecutionStep {
  stepNumber: number;
  plan: ExecutionPlan;
  result: any;
  success: boolean;
  error?: string;
  timestamp: Date;
}

/**
 * 工作流状态定义
 */
export const WorkflowStateAnnotation = Annotation.Root({
  // Task information
  taskId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  originalQuery: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  currentObjective: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),

  // Execution state
  executionHistory: Annotation<ExecutionStep[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  blackboard: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  
  // Completion state
  isComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  
  // Error handling
  lastError: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  errors: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  
  // Workflow control
  currentPlan: Annotation<ExecutionPlan | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  workflowPlan: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentStepIndex: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 50,
  }),
  currentIteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  })
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;

/**
 * 智能工作流引擎 - 基于 LangGraph 实现 Plan-Act-Observe 微循环
 */
export class IntelligentWorkflowEngine {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpToolAdapter: MCPToolAdapter;
  private graph: StateGraph<any>;
  private taskService: any;
  private mcpAuthService: MCPAuthService;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o',
      temperature: 0.1,
    //   httpAgent: agent,
    //   httpsAgent: agent,
    });

    this.mcpManager = new MCPManager();
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    this.taskService = getTaskService();
    
    // 直接同步初始化 MCPAuthService，就像传统执行器一样
    this.mcpAuthService = new MCPAuthService();
    
    this.graph = this.buildWorkflowGraph();
  }

  /**
   * 构建 LangGraph 工作流图 - 使用正确的 API
   */
  private buildWorkflowGraph(): StateGraph<any> {
    const graph = new StateGraph(WorkflowStateAnnotation);

    // 添加节点
    graph.addNode('planner' as any, this.plannerNode.bind(this));
    graph.addNode('executor' as any, this.executorNode.bind(this));
    graph.addNode('observer' as any, this.observerNode.bind(this));

    // 设置入口点 - 使用 START 常量
    graph.addEdge(START, 'planner' as any);
    
    // 设置边
    graph.addEdge('planner' as any, 'executor' as any);
    graph.addEdge('executor' as any, 'observer' as any);
    
    // 条件边：根据观察结果决定是否继续
    graph.addConditionalEdges(
      'observer' as any,
      this.shouldContinue.bind(this),
      {
        continue: 'planner' as any,
        end: END
      } as any
    );

    return graph;
  }

  /**
   * Planner 节点 - 制定或获取下一步执行计划
   */
  private async plannerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info(`🧠 Planner: 分析任务 [迭代: ${state.currentIteration + 1}]`);
      
      // 🔧 关键修复：检查是否已有完整工作流计划
      if (state.workflowPlan && state.workflowPlan.length > 0) {
        // 如果已有工作流计划，按步骤执行
        if (state.currentStepIndex < state.workflowPlan.length) {
          const currentStep = state.workflowPlan[state.currentStepIndex];
          logger.info(`📋 执行预定工作流步骤 ${state.currentStepIndex + 1}/${state.workflowPlan.length}: ${currentStep.action}`);
          
          // 将工作流步骤转换为执行计划
          const plan = await this.convertWorkflowStepToExecutionPlan(currentStep, state.workflowPlan);
          
          logger.info(`📋 Planner: 制定计划 - ${plan.tool} (${plan.toolType})`);
          logger.info(`💭 推理: ${plan.reasoning}`);
          
          return {
            currentPlan: plan,
            currentIteration: state.currentIteration + 1
          };
        } else {
          // 所有步骤都已执行完毕
          logger.info(`✅ 所有工作流步骤已执行完毕`);
          return {
            isComplete: true,
            currentIteration: state.currentIteration + 1
          };
        }
      }
      
      // 🔧 如果没有工作流计划，生成完整的工作流计划
      logger.info(`🧠 生成完整工作流计划`);
      
      // 获取可用的MCP能力 - 传入taskId
      const availableMCPs = await this.getAvailableMCPCapabilities(state.taskId);
      
      // 构建提示词
      const plannerPrompt = this.buildPlannerPrompt(state, availableMCPs);

      const response = await this.llm.invoke([
        new SystemMessage(plannerPrompt)
      ]);

      // 解析完整工作流计划
      const workflowPlan = await this.parseWorkflowPlan(response.content as string);
      
      if (workflowPlan.length === 0) {
        throw new Error('生成的工作流计划为空');
      }
      
      logger.info(`📋 生成完整工作流计划，包含 ${workflowPlan.length} 个步骤`);
      
      // 执行第一步
      const firstStep = workflowPlan[0];
      const plan = await this.convertWorkflowStepToExecutionPlan(firstStep, workflowPlan);
      
      logger.info(`📋 Planner: 制定计划 - ${plan.tool} (${plan.toolType})`);
      logger.info(`💭 推理: ${plan.reasoning}`);
      
      return {
        currentPlan: plan,
        workflowPlan: workflowPlan, // 保存完整计划
        currentStepIndex: 0, // 从第0步开始
        currentIteration: state.currentIteration + 1
      };
      
    } catch (error) {
      logger.error('Planner节点执行失败:', error);
      
      return {
        errors: [...state.errors, `Planner失败: ${error}`],
        currentIteration: state.currentIteration + 1
      };
    }
  }

  /**
   * Executor 节点 - 执行计划
   */
  private async executorNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    if (!state.currentPlan) {
      return {
        lastError: '没有可执行的计划',
        errors: [...state.errors, '没有可执行的计划']
      };
    }

    logger.info(`⚡ Executor: 执行计划 ${state.currentPlan.tool}`);

    try {
      // 🔗 关键修复：添加链式调用逻辑（参考传统执行器）
      // 如果有前一步的结果，智能地将其作为当前步骤的输入
      let enhancedPlan = { ...state.currentPlan };
      
      if (state.executionHistory.length > 0 && state.blackboard.lastResult) {
        logger.info(`🔗 检测到前一步结果，开始链式调用转换`);
        
        // 使用类似传统执行器的逻辑，智能提取前一步结果中的有用数据
        const enhancedInput = await this.extractUsefulDataFromResult(
          { result: state.blackboard.lastResult }, // 模拟传统执行器的结果格式
          state.currentPlan.tool // 下一步的动作
        );
        
        // 合并原有参数和提取的数据
        enhancedPlan.args = {
          ...state.currentPlan.args,
          ...enhancedInput
        };
        
        logger.info(`🔗 链式调用：已将前一步结果融入当前计划`);
        logger.info(`📥 增强后的参数: ${JSON.stringify(enhancedPlan.args, null, 2)}`);
      }

      let result: any;
      
      if (enhancedPlan.toolType === 'mcp') {
        // 调用 MCP 工具
        result = await this.executeMCPTool(enhancedPlan, state);
      } else {
        // 调用 LLM 能力
        result = await this.executeLLMTool(enhancedPlan, state);
      }

      // 记录执行步骤
      const step: ExecutionStep = {
        stepNumber: state.executionHistory.length + 1,
        plan: enhancedPlan, // 使用增强后的计划
        result,
        success: true,
        timestamp: new Date()
      };

      logger.info(`✅ 执行成功: ${enhancedPlan.tool}`);

      // 🔧 关键修复：推进步骤索引
      const nextStepIndex = state.currentStepIndex + 1;
      logger.info(`📈 步骤推进: ${state.currentStepIndex} -> ${nextStepIndex}`);

      return {
        executionHistory: [...state.executionHistory, step],
        currentStepIndex: nextStepIndex, // 推进到下一步
        blackboard: {
          ...state.blackboard,
          [`step${step.stepNumber}`]: result,
          lastResult: result,
          // 🔗 添加解析后的数据，供下一步使用（参考传统执行器）
          parsedData: this.parseResultData(result)
        }
      };

    } catch (error) {
      logger.error('Executor 节点执行失败:', error);
      
      const step: ExecutionStep = {
        stepNumber: state.executionHistory.length + 1,
        plan: state.currentPlan,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };

      return {
        executionHistory: [...state.executionHistory, step],
        lastError: `执行失败: ${error}`,
        errors: [...state.errors, `执行失败: ${error}`]
      };
    }
  }

  /**
   * Observer 节点 - 观察执行结果并判断是否完成
   */
  private async observerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info(`👁️ Observer: 观察执行结果并判断完成状态`);

    try {
      // 构建观察提示词
      const observerPrompt = this.buildObserverPrompt(state);
      
      // 调用 LLM 分析当前状态
      const response = await this.llm.invoke([
        new SystemMessage(observerPrompt),
        new HumanMessage('请分析当前执行状态并判断是否需要继续')
      ]);

      // 解析观察结果
      const observation = this.parseObservation(response.content as string);
      
      logger.info(`🔍 观察结果: ${observation.isComplete ? '任务完成' : '需要继续'}`);

      return {
        isComplete: observation.isComplete,
        currentObjective: observation.nextObjective || state.currentObjective,
        currentIteration: state.currentIteration + 1,
        messages: [...state.messages, response]
      };

    } catch (error) {
      logger.error('Observer 节点执行失败:', error);
      return {
        lastError: `观察分析失败: ${error}`,
        errors: [...state.errors, `观察分析失败: ${error}`]
      };
    }
  }

  /**
   * 判断是否应该继续执行
   */
  private shouldContinue(state: WorkflowState): 'continue' | 'end' {
    // 检查完成状态
    if (state.isComplete) {
      return 'end';
    }

    // 检查最大迭代次数
    if (state.currentIteration >= state.maxIterations) {
      logger.warn(`达到最大迭代次数 ${state.maxIterations}，停止执行`);
      return 'end';
    }

    // 检查连续错误
    if (state.errors.length >= 3) {
      logger.warn('连续错误过多，停止执行');
      return 'end';
    }

    return 'continue';
  }

  /**
   * 从任务分析结果获取预选的MCP列表
   */
  private async getPreselectedMCPs(taskId: string): Promise<any[]> {
    try {
      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task || !task.mcpWorkflow) {
        logger.info(`任务 ${taskId} 没有预选的MCP工作流`);
        return [];
      }

      // 解析MCP工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!mcpWorkflow.mcps || mcpWorkflow.mcps.length === 0) {
        logger.info(`任务 ${taskId} 的MCP工作流为空`);
        return [];
      }

      logger.info(`📋 任务 ${taskId} 预选的MCP: ${mcpWorkflow.mcps.map((mcp: any) => mcp.name).join(', ')}`);
      return mcpWorkflow.mcps;

    } catch (error) {
      logger.error(`获取预选MCP失败:`, error);
      return [];
    }
  }

  /**
   * 获取可用的 MCP 能力 - 基于任务分析结果
   */
  private async getAvailableMCPCapabilities(taskId?: string): Promise<any[]> {
    if (!taskId) {
      // 如果没有taskId，回退到只使用已连接的MCP
      return this.getConnectedMCPCapabilities();
    }

    try {
      // 基于任务分析结果获取预选的MCP
      const capabilities = await this.ensurePreselectedMCPsConnected(taskId);
      
      if (capabilities.length === 0) {
        logger.info('🧠 没有可用的预选MCP，使用纯LLM模式');
      } else {
        logger.info(`📋 可用的预选MCP能力: ${capabilities.map(cap => cap.mcpName).join(', ')}`);
      }

      return capabilities;
    } catch (error) {
      logger.error('获取预选MCP能力失败:', error);
      // 回退到使用已连接的MCP
      return this.getConnectedMCPCapabilities();
    }
  }

  /**
   * 确保预选的MCP已连接，并获取实际工具列表
   */
  private async ensurePreselectedMCPsConnected(taskId: string): Promise<any[]> {
    const preselectedMCPs = await this.getPreselectedMCPs(taskId);
    const capabilities: any[] = [];

    if (preselectedMCPs.length === 0) {
      logger.info('🧠 没有预选的MCP，使用纯LLM模式');
      return [];
    }

    for (const mcpInfo of preselectedMCPs) {
      try {
        const mcpName = mcpInfo.name;
        
        // 检查是否已连接
        const connectedMCPs = this.mcpManager.getConnectedMCPs();
        const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);

        if (!isConnected) {
          logger.info(`🔗 连接预选的MCP: ${mcpName}`);
          await this.autoConnectMCP(mcpName, taskId);
        } else {
          logger.info(`✅ MCP已连接: ${mcpName}`);
        }

        // 🔧 关键修复：获取MCP的实际工具列表
        const actualTools = await this.mcpManager.getTools(mcpName);
        logger.info(`📋 ${mcpName} 实际可用工具: ${actualTools.map(t => t.name).join(', ')}`);
        
        capabilities.push({
          mcpName: mcpName,
          description: mcpInfo.description || `MCP Service: ${mcpName}`,
          authRequired: mcpInfo.authRequired || false,
          // 🔧 使用实际工具列表，而不是预定义的工具信息
          tools: actualTools.map(tool => ({
            name: tool.name,
            description: tool.description || 'No description',
            parameters: tool.inputSchema
          }))
        });

        logger.info(`✅ 预选MCP可用: ${mcpName} (${actualTools.length} 个工具)`);

      } catch (error) {
        logger.warn(`预选MCP连接失败: ${mcpInfo.name}`, error);
        // 继续处理其他MCP，不中断整个流程
      }
    }

    return capabilities;
  }

  /**
   * 获取已连接的MCP能力（回退方案）
   */
  private async getConnectedMCPCapabilities(): Promise<any[]> {
    const capabilities: any[] = [];
    
    // 获取已连接的 MCP
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    if (connectedMCPs.length === 0) {
      logger.info('🧠 没有已连接的 MCP，使用纯 LLM 模式');
      return [];
    }
    
    // 只处理已连接的 MCP
    for (const mcp of connectedMCPs) {
      try {
        // 🔧 关键修复：获取MCP的实际工具列表
        const actualTools = await this.mcpManager.getTools(mcp.name);
        logger.info(`📋 ${mcp.name} 实际可用工具: ${actualTools.map(t => t.name).join(', ')}`);
        
        capabilities.push({
          mcpName: mcp.name,
          description: mcp.description || `MCP Service: ${mcp.name}`,
          // 🔧 使用实际工具列表
          tools: actualTools.map(tool => ({
            name: tool.name,
            description: tool.description || 'No description',
            parameters: tool.inputSchema
          }))
        });

        logger.info(`✅ 发现已连接的 MCP: ${mcp.name} (${actualTools.length} 个工具)`);

      } catch (error) {
        logger.warn(`获取 MCP 能力失败: ${mcp.name}`, error);
      }
    }

    return capabilities;
  }

  /**
   * Build Planner prompt in English
   */
  private buildPlannerPrompt(state: WorkflowState, availableMCPs: any[]): string {
    return `You are an intelligent workflow planner. Your task is to break down a user request into a series of actionable steps using available MCP tools.

AVAILABLE MCPS AND THEIR CAPABILITIES:
${availableMCPs.map(mcp => `- ${mcp.name}: ${mcp.description || 'General purpose MCP'}`).join('\n')}

USER REQUEST: "${state.currentObjective}"

SPECIAL HANDLING FOR NOTION:
When the task involves creating/writing to Notion:
1. ALWAYS start with a search step using API-post-search to find available pages
2. Then create a new page under an existing page using the search results
3. NEVER try to create pages directly in workspace - this is not supported

WORKFLOW PLANNING RULES:
1. Break down complex tasks into logical steps
2. Each step should have a clear objective and use appropriate MCP tools
3. Steps should build upon previous results
4. For analysis tasks: gather data → analyze → record results
5. For Notion integration: search pages → create page → add content

OUTPUT FORMAT:
Return a JSON array of workflow steps:
[
  {
    "action": "descriptive action name",
    "mcpName": "exact-mcp-name",
    "objective": "what this step should accomplish",
    "dependsOn": ["previous_step_indices"] // optional, for steps that need previous results
  }
]

Examples:
- For "analyze GitHub project and record in Notion":
  [
    {"action": "fetch_github_project_info", "mcpName": "github-mcp", "objective": "Get project basic info, issues list, etc."},
    {"action": "analyze_project_data", "mcpName": "llm-analysis", "objective": "Analyze and summarize collected data"},
    {"action": "search_notion_pages", "mcpName": "notion-mcp", "objective": "Find available parent pages for creating new page"},
    {"action": "create_notion_analysis_record", "mcpName": "notion-mcp", "objective": "Create new page under found page and record analysis results", "dependsOn": [1, 2]}
  ]

Plan the workflow now:`;
  }

  /**
   * Build Observer prompt in English
   */
  private buildObserverPrompt(state: WorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    
    return `You are an intelligent observer responsible for analyzing task execution results and determining completion status.

## Task Information
- Original Query: ${state.originalQuery}
- Current Objective: ${state.currentObjective}
- Steps Executed: ${state.executionHistory.length}

## Execution History
${state.executionHistory.map(step => `
Step ${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- Status: ${step.success ? 'Success' : 'Failed'}
- Plan: ${step.plan.reasoning}
- Result Type: ${step.success ? typeof step.result : 'Failed'}
`).join('\n')}

## Latest Execution Result
${lastStep ? `
Step ${lastStep.stepNumber}: ${lastStep.plan.tool}
- Status: ${lastStep.success ? 'Success' : 'Failed'}
- Plan: ${lastStep.plan.reasoning}
- Result: ${lastStep.success ? JSON.stringify(lastStep.result).substring(0, 1000) + '...' : lastStep.error}
` : 'No execution history yet'}

## Blackboard Data
${JSON.stringify(state.blackboard, null, 2)}

## Judgment Criteria
Please carefully analyze the current state and determine if the task is truly complete:

### 🔍 Compound Task Recognition
**Original Task**: ${state.originalQuery}

Please carefully analyze all requirements in the original task:
- Does it contain multiple actions (e.g., analyze + record, fetch + send, compare + summarize)?
- Are there connecting words like "and", "then", "also", "simultaneously"?
- Are there multiple target platforms or tools (e.g., GitHub + Notion, Twitter + Email)?

### 📋 Completeness Check
1. **Data Fetching Tasks**: If only raw data was obtained but user requested "analysis", LLM analysis is still needed
2. **Analysis Tasks**: If user requested analysis, comparison, summary, ensure LLM analysis step is completed
3. **Storage/Recording Tasks**: If user requested "record to xxx", "save to xxx", "send to xxx", ensure storage operation is executed
4. **Multi-step Tasks**: Check if all necessary steps are completed
5. **Result Completeness**: Check if results answer all user requirements

### ⚠️ Common Missing Scenarios
- ✅ Analyzed GitHub issues → ❌ But not recorded to Notion
- ✅ Fetched price data → ❌ But not sent to Twitter
- ✅ Compared two projects → ❌ But not generated report document
- ✅ Analyzed code → ❌ But not created GitHub issue

### 🎯 Key Judgment Principle
**Only when ALL requirements in the original task are completed can the task be considered complete!**

Please return in format:
{
  "isComplete": true/false,
  "reasoning": "detailed reasoning for the judgment",
  "nextObjective": "next objective (if not complete)",
  "finalAnswer": "final answer (if complete)"
}`;
  }

  /**
   * 解析完整工作流计划
   */
  private async parseWorkflowPlan(content: string): Promise<any[]> {
    try {
      // 尝试提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (Array.isArray(parsed) && parsed.length > 0) {
          logger.info(`📋 解析到完整工作流计划，包含 ${parsed.length} 个步骤`);
          return parsed;
        }
      }
    } catch (error) {
      logger.warn('解析工作流计划失败', error);
    }

    // 如果解析失败，返回默认的单步计划
    return [{
      action: 'llm_analyze',
      mcpName: 'llm',
      objective: 'Analyze the user request using LLM capabilities'
    }];
  }

  /**
   * 将工作流步骤转换为执行计划
   */
  private async convertWorkflowStepToExecutionPlan(step: any, fullWorkflow: any[]): Promise<ExecutionPlan> {
    let toolType: 'llm' | 'mcp' = 'mcp';
    let toolName = step.action;
    
    if (step.mcpName === 'llm-analysis' || step.mcpName === 'llm') {
      toolType = 'llm';
      toolName = 'llm.analyze';
    } else if (step.mcpName && step.mcpName !== 'llm-analysis') {
      toolType = 'mcp';
      // 根据目标智能选择工具
      toolName = await this.inferToolNameFromObjective(step.objective, step.mcpName);
    }
    
    // 获取前序步骤结果（如果有）
    const previousResults = fullWorkflow.slice(0, fullWorkflow.indexOf(step));
    
    // 🔧 关键修复：使用实际选择的工具名称构建参数
    const stepForArgs = {
      ...step,
      action: toolName // 使用实际选择的工具名称
    };
    const args = await this.buildArgsFromStep(stepForArgs, previousResults);
    
    return {
      tool: toolName,
      toolType: toolType,
      mcpName: step.mcpName,
      args: args,
      expectedOutput: step.objective || 'Execution result',
      reasoning: `Execute workflow step: ${step.action} (${step.objective})`
    };
  }

  /**
   * 通用智能工具选择 - 基于目标和可用工具，让LLM选择最合适的工具
   */
  private async inferToolNameFromObjective(objective: string, mcpName: string): Promise<string> {
    try {
      // 获取该MCP的所有可用工具
      const availableTools = await this.mcpManager.getTools(mcpName);
      
      if (availableTools.length === 0) {
        logger.warn(`MCP ${mcpName} 没有可用工具`);
        return 'default_tool';
      }

      // 如果只有一个工具，直接使用
      if (availableTools.length === 1) {
        return availableTools[0].name;
      }

      // 使用LLM智能选择最合适的工具
      const toolSelectionPrompt = `You are a tool selection expert. Based on the user's goal and the available tool list, select the most suitable tool.

User Goal: "${objective}"
MCP Service: ${mcpName}

Available Tools List:
${availableTools.map((tool: any, index: number) => 
  `${index + 1}. ${tool.name}: ${tool.description || 'No description'}`
).join('\n')}

Please select the most suitable tool to complete the user's goal. Only return the tool name, no other explanation.

Examples:
- If the goal is "search" or "find", select tools containing keywords like search, find, list
- If the goal is "create" or "add", select tools containing keywords like create, add, post
- If the goal is "get" or "read", select tools containing keywords like get, read, fetch

Selected Tool Name:`;

      const response = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      const selectedTool = response.content.toString().trim();
      
      // 验证选择的工具是否存在
      const validTool = availableTools.find((tool: any) => tool.name === selectedTool);
      if (validTool) {
        logger.info(`🎯 Intelligent Tool Selection: ${selectedTool} (from ${mcpName})`);
        return selectedTool;
      } else {
        // 如果LLM选择的工具不存在，使用第一个可用工具
        logger.warn(`LLM selected tool ${selectedTool} does not exist, using the first available tool: ${availableTools[0].name}`);
        return availableTools[0].name;
      }

    } catch (error) {
      logger.error(`Intelligent Tool Selection Failed: ${error}`);
      
      // 降级处理：尝试获取第一个可用工具
      try {
        const availableTools = await this.mcpManager.getTools(mcpName);
        if (availableTools.length > 0) {
          return availableTools[0].name;
        }
      } catch (fallbackError) {
        logger.error(`Get Available Tool Failed: ${fallbackError}`);
      }
      
      return 'default_tool';
    }
  }

  /**
   * Universal intelligent parameter building - Based on goal, tool schema and context, let LLM build appropriate parameters
   */
  private async buildArgsFromStep(step: any, previousResults?: any[]): Promise<Record<string, any>> {
    try {
      // Get tool schema information
      const availableTools = await this.mcpManager.getTools(step.mcpName);
      const targetTool = availableTools.find((tool: any) => tool.name === step.action);
      
      if (!targetTool) {
        logger.warn(`Tool ${step.action} does not exist in ${step.mcpName}`);
        return { content: step.objective || step.action };
      }

      // Smart default parameters for GitHub API
      let smartDefaults = {};
      if (step.mcpName === 'github-mcp') {
        // Extract repository info from objective
        const repoMatch = step.objective?.match(/github\.com\/([^\/]+\/[^\/\s]+)/i) || 
                         step.objective?.match(/([^\/\s]+\/[^\/\s]+)\s*(?:project|repository|repo)/i);
        
        if (repoMatch) {
          const [owner, repo] = repoMatch[1].split('/');
          smartDefaults = { owner, repo };
          logger.info(`🎯 Extracted GitHub repo info: ${owner}/${repo}`);
        } else {
          // Use popular open source project as example
          smartDefaults = { 
            owner: 'ai16z', 
            repo: 'eliza',
            state: 'open',
            per_page: 10
          };
          logger.info(`🎯 Using default GitHub repo: ai16z/eliza`);
        }
      }

      // Use LLM to build parameters based on tool schema and goal
      const paramBuildingPrompt = `You are an API parameter building expert. Based on the tool's schema and user goal, build appropriate call parameters.

User Goal: "${step.objective || step.action}"
Tool Name: ${step.action}
Tool Description: ${targetTool.description || 'No description'}

Tool Schema:
${JSON.stringify(targetTool.inputSchema, null, 2)}

${Object.keys(smartDefaults).length > 0 ? `
Smart Defaults Available:
${JSON.stringify(smartDefaults, null, 2)}
` : ''}

${previousResults && previousResults.length > 0 ? `
Previous Step Results (useful information can be extracted):
${JSON.stringify(previousResults.slice(-2), null, 2)}  // Only show recent 2 results
` : ''}

Building Rules:
1. Build parameters strictly according to tool schema requirements
2. Use smart defaults when available (especially for GitHub owner/repo)
3. If data needs to be extracted from previous results, please smartly extract
4. For ID type parameters, if not available from context, use descriptive placeholders like "REQUIRED_PAGE_ID"
5. Ensure all necessary parameters have values
6. For GitHub APIs, always provide owner and repo parameters

Please return JSON formatted parameter object, no other explanation:`;

      const response = await this.llm.invoke([
        new SystemMessage(paramBuildingPrompt)
      ]);

      try {
        const responseText = response.content.toString().trim();
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        let builtArgs = JSON.parse(cleanedText);
        
        // Merge with smart defaults
        builtArgs = { ...smartDefaults, ...builtArgs };
        
        logger.info(`🔧 Intelligent Parameter Building: ${JSON.stringify(builtArgs, null, 2)}`);
        return builtArgs;
        
      } catch (parseError) {
        logger.error(`Parsing LLM Built Parameters Failed: ${response.content}`);
        // Fallback: return smart defaults or basic parameters
        return Object.keys(smartDefaults).length > 0 ? smartDefaults : { content: step.objective || step.action };
      }

    } catch (error) {
      logger.error(`Intelligent Parameter Building Failed: ${error}`);
      
      // Final fallback
      return {
        content: step.objective || step.action,
        query: step.objective || step.action
      };
    }
  }

  /**
   * 解析观察结果
   */
  private parseObservation(content: string): { isComplete: boolean; nextObjective?: string; finalAnswer?: string } {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const observation = JSON.parse(jsonMatch[0]);
        
        // 记录 Observer 的推理过程
        if (observation.reasoning) {
          logger.info(`🤔 Observer Reasoning: ${observation.reasoning}`);
        }
        
        return {
          isComplete: observation.isComplete || false,
          nextObjective: observation.nextObjective,
          finalAnswer: observation.finalAnswer
        };
      }
    } catch (error) {
      logger.warn('解析观察结果失败，使用智能判断', error);
    }

    // 更智能的默认判断逻辑
    return this.intelligentCompletionCheck(content);
  }

  /**
   * 智能完成状态检查
   */
  private intelligentCompletionCheck(content: string): { isComplete: boolean; nextObjective?: string; finalAnswer?: string } {
    // 检查是否包含明确的完成信号
    const explicitComplete = /任务完成|分析完成|执行完成|已完成|task complete|analysis complete/i.test(content);
    
    // 检查是否包含明确的继续信号
    const explicitContinue = /需要继续|继续分析|下一步|need to continue|next step/i.test(content);
    
    if (explicitComplete) {
      return {
        isComplete: true,
        finalAnswer: content
      };
    }
    
    if (explicitContinue) {
      return {
        isComplete: false,
        nextObjective: content
      };
    }
    
    // 默认：如果内容很短或只是简单确认，可能需要继续
    if (content.length < 100) {
      return {
        isComplete: false,
        nextObjective: '需要更详细的分析或处理'
      };
    }
    
    // 默认：内容较长，可能是完整的分析结果
    return {
      isComplete: true,
      finalAnswer: content
    };
  }

  /**
   * 执行 MCP 工具
   */
  private async executeMCPTool(plan: ExecutionPlan, state: WorkflowState): Promise<any> {
    if (!plan.mcpName) {
      throw new Error('MCP 工具需要指定 mcpName');
    }

    logger.info(`⚡ 调用 MCP 工具: ${plan.tool} (来自 ${plan.mcpName})`);
    
    // 检查 MCP 是否已连接，如果没有则自动连接
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    const isConnected = connectedMCPs.some(mcp => mcp.name === plan.mcpName);
    
    if (!isConnected) {
      logger.info(`🔗 MCP ${plan.mcpName} 未连接，尝试自动连接...`);
      await this.autoConnectMCP(plan.mcpName, state.taskId);
    }
    
    // 🔧 关键修复：获取MCP的实际工具列表
    const actualTools = await this.mcpManager.getTools(plan.mcpName);
    logger.info(`📋 ${plan.mcpName} 实际可用工具: ${actualTools.map(t => t.name).join(', ')}`);
    
    // 🔧 验证工具是否存在，如果不存在则让LLM重新选择
    let selectedTool = actualTools.find(t => t.name === plan.tool);
    let finalToolName = plan.tool;
    let finalArgs = plan.args;
    
    if (!selectedTool) {
      logger.warn(`工具 ${plan.tool} 在 ${plan.mcpName} 中不存在，使用LLM重新选择...`);
      
      // 尝试模糊匹配
      const fuzzyMatch = actualTools.find(t => 
        t.name.toLowerCase().includes(plan.tool.toLowerCase()) ||
        plan.tool.toLowerCase().includes(t.name.toLowerCase())
      );
      
      if (fuzzyMatch) {
        logger.info(`找到模糊匹配: ${fuzzyMatch.name}`);
        selectedTool = fuzzyMatch;
        finalToolName = fuzzyMatch.name;
      } else {
        // 使用LLM重新选择工具
        logger.info(`使用LLM重新选择合适的工具...`);
        const toolSelectionResult = await this.selectCorrectTool(
          plan.tool, 
          plan.args, 
          actualTools, 
          state.currentObjective
        );
        
        selectedTool = actualTools.find(t => t.name === toolSelectionResult.toolName);
        if (selectedTool) {
          finalToolName = toolSelectionResult.toolName;
          finalArgs = toolSelectionResult.inputParams;
          logger.info(`LLM重新选择的工具: ${finalToolName}`);
        } else {
          throw new Error(`无法在 ${plan.mcpName} 中找到合适的工具执行任务: ${plan.tool}`);
        }
      }
    }
    
    logger.info(`🔧 最终调用工具: ${finalToolName} (参数: ${JSON.stringify(finalArgs)})`);
    
    const result = await this.mcpToolAdapter.callTool(
      plan.mcpName,
      finalToolName,
      finalArgs
    );

    return result;
  }

  /**
   * 使用LLM选择正确的工具（参考传统执行器的做法）
   */
  private async selectCorrectTool(
    originalTool: string,
    originalArgs: any,
    availableTools: any[],
    objective: string
  ): Promise<{ toolName: string; inputParams: any; reasoning: string }> {
    try {
      const toolSelectionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

CONTEXT:
- Previous step output: ${typeof originalArgs === 'string' ? originalArgs : JSON.stringify(originalArgs, null, 2)}
- Next action: ${objective}
- Available tools: ${availableTools.map(tool => `${tool.name}: ${tool.description || 'No description'}`).join(', ')}

CRITICAL NOTION WORKFLOW LOGIC:
When working with Notion API (API-post-page, create_page, etc.):

1. **NEVER use workspace parent** - This is not supported for internal integrations:
   ❌ {"parent": {"type": "workspace", "workspace": true}}

2. **Always use real page_id or database_id**:
   ✅ {"parent": {"type": "page_id", "page_id": "REAL_PAGE_ID"}}
   ✅ {"parent": {"type": "database_id", "database_id": "REAL_DATABASE_ID"}}

3. **CRITICAL: If you need to create a Notion page but don't have a real page_id**:
   - DO NOT use placeholders like "EXTRACTED_FROM_SEARCH"
   - Instead, return a search query to find available pages first
   - Use API-post-search with this format:
   {
     "query": "",
     "filter": {
       "value": "page", 
       "property": "object"
     }
   }

4. **Only create pages when you have real page_id from previous search results**

5. **Children format**: Must be block objects:
   ✅ "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "content"}}]}}]

TRANSFORMATION LOGIC:
- If nextAction involves Notion page creation AND no real page_id is available: Return search parameters
- If nextAction involves Notion page creation AND real page_id is available: Return page creation parameters  
- If nextAction is search: Return search parameters
- For other actions: Transform according to tool requirements

SMART CONTENT TRANSFORMATION:
- If previous output contains analysis/content, transform it into proper Notion blocks
- If creating a page about analysis, use descriptive title like "GitHub Project Analysis - [Project Name]"
- Convert plain text into rich_text format for Notion blocks

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "transformedData": { /* the actual parameters for the next tool */ },
  "selectedTool": "exact_tool_name_from_available_list",
  "reasoning": "brief explanation of the transformation logic"
}

Transform the data now:`;

      const response = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      let result;
      try {
        const responseText = response.content.toString().trim();
        // 清理可能的markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        const parsed = JSON.parse(cleanedText);
        
        // 🔍 智能工具选择逻辑
        let selectedTool = parsed.selectedTool;
        let transformedData = parsed.transformedData || originalArgs;
        
        // 检查是否需要强制搜索
        const dataStr = JSON.stringify(transformedData);
        if ((objective.includes('创建') || objective.includes('记录') || objective.includes('Notion')) &&
            (dataStr.includes('EXTRACTED_FROM_SEARCH') || 
             dataStr.includes('PLACEHOLDER') || 
             !dataStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i))) {
          
          logger.info(`🔄 检测到Notion创建任务但缺少真实page_id，强制使用搜索`);
          
          // 查找搜索工具
          const searchTool = availableTools.find(tool => 
            tool.name.includes('search') || 
            tool.name.includes('API-post-search')
          );
          
          if (searchTool) {
            selectedTool = searchTool.name;
            transformedData = {
              "query": "",
              "filter": {
                "value": "page",
                "property": "object"
              }
            };
            logger.info(`🔧 自动选择搜索工具: ${selectedTool}`);
          }
        }
        
        result = {
          toolName: selectedTool,
          inputParams: transformedData,
          reasoning: parsed.reasoning || "Automatic tool selection and parameter transformation"
        };
        
        logger.info(`🎯 工具选择结果: ${selectedTool}`);
        logger.info(`📋 转换参数: ${JSON.stringify(transformedData, null, 2)}`);
        
      } catch (parseError) {
        logger.error(`解析工具选择结果失败: ${response.content}`);
        // 回退处理
        result = {
          toolName: availableTools[0]?.name || 'unknown',
          inputParams: originalArgs,
          reasoning: "Fallback due to parsing error"
        };
      }

      return result;

    } catch (error) {
      logger.error(`LLM工具选择失败:`, error);
      // 最终回退：使用第一个可用工具
      if (availableTools.length > 0) {
        return {
          toolName: availableTools[0].name,
          inputParams: originalArgs,
          reasoning: `由于LLM选择失败，使用第一个可用工具: ${availableTools[0].name}`
        };
      }
      throw new Error('无可用工具且LLM选择失败');
    }
  }

  /**
   * 执行 LLM 工具
   */
  private async executeLLMTool(plan: ExecutionPlan, state: WorkflowState): Promise<any> {
    const toolName = plan.tool.replace('llm.', '');
    
    switch (toolName) {
      case 'analyze':
        return await this.llmAnalyze(plan.args, state);
      case 'compare':
        return await this.llmCompare(plan.args, state);
      case 'summarize':
        return await this.llmSummarize(plan.args, state);
      case 'format':
        return await this.llmFormat(plan.args, state);
      case 'translate':
        return await this.llmTranslate(plan.args, state);
      case 'extract':
        return await this.llmExtract(plan.args, state);
      default:
        throw new Error(`未知的 LLM 工具: ${plan.tool}`);
    }
  }

  /**
   * LLM 分析能力
   */
  private async llmAnalyze(args: any, state: WorkflowState): Promise<string> {
    const content = args.content || state.blackboard.lastResult || state.currentObjective;
    
    // 构建智能分析提示词
    const prompt = this.buildIntelligentAnalysisPrompt(content, args, state);

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * Build intelligent analysis prompt in English - Universal method
   */
  private buildIntelligentAnalysisPrompt(content: any, args: any, state: WorkflowState): string {
    // Detect content type
    const contentType = this.detectContentType(content);
    const hasStructuredData = this.hasStructuredData(content);
    const originalQuery = state.originalQuery;
    
    // Base prompt template
    let prompt = `You are a professional data analyst. Please conduct an in-depth analysis of the following content:

## User's Original Request
${originalQuery}

## Data to Analyze
${typeof content === 'string' ? content : JSON.stringify(content, null, 2)}

## Analysis Guidelines
`;

    // Adjust analysis strategy based on content type and structure
    if (hasStructuredData) {
      prompt += `
**Important Reminder: You are facing concrete structured data. Please analyze this data directly rather than providing analysis frameworks or methodologies.**

### Analysis Requirements:
1. **Data Overview**: Summarize basic information about the data (quantity, type, time range, etc.)
2. **Key Findings**: Extract the most important information and patterns from the data
3. **In-depth Analysis**: Conduct detailed analysis based on data content
4. **Practical Insights**: Provide specific insights and recommendations based on the data

### Analysis Focus:
- Directly analyze the provided data content
- Provide specific numbers, statistics, and examples
- Identify patterns, trends, or anomalies in the data
- Answer the user's specific questions
`;
    } else {
      prompt += `
### Analysis Requirements:
1. **Content Understanding**: Deeply understand the core information of the content
2. **Key Points**: Extract the most important information points
3. **Logical Analysis**: Analyze the logical structure and relationships of the content
4. **Value Assessment**: Evaluate the value and significance of the content

### Analysis Focus:
- Analyze based on the specific content provided
- Avoid abstract theories or methodologies
- Provide practical insights and conclusions
`;
    }

    // Add specific requirements
    if (args.requirement) {
      prompt += `\n### Specific Requirements:
${args.requirement}`;
    }

    // Add output format requirements
    prompt += `

### Output Requirements:
- Directly analyze the provided data/content
- Provide specific, practical analysis results
- Use clear structured format
- Avoid providing abstract analysis frameworks or methodologies
- Ensure analysis results directly answer user's questions

Please begin the analysis:`;

    return prompt;
  }

  /**
   * 检测内容类型 - 通用方法
   */
  private detectContentType(content: any): string {
    if (typeof content === 'string') {
      if (content.includes('{') && content.includes('}')) {
        return 'json_string';
      } else if (content.includes('\n') && content.length > 200) {
        return 'long_text';
      } else {
        return 'short_text';
      }
    } else if (Array.isArray(content)) {
      return 'array_data';
    } else if (typeof content === 'object') {
      return 'object_data';
    } else {
      return 'unknown';
    }
  }

  /**
   * 检测是否包含结构化数据 - 通用方法
   */
  private hasStructuredData(content: any): boolean {
    // 检查是否是数组或对象
    if (Array.isArray(content) || (typeof content === 'object' && content !== null)) {
      return true;
    }
    
    // 检查字符串是否包含JSON数据
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null);
      } catch {
        // 检查是否包含明显的结构化数据特征
        const structuredPatterns = [
          /\[\s*\{.*\}\s*\]/s,  // JSON数组
          /\{.*".*":.*\}/s,      // JSON对象
          /^\s*\|.*\|.*\|/m,     // 表格格式
          /^\s*\d+\.\s+/m,       // 编号列表
          /^\s*[-*+]\s+/m        // 无序列表
        ];
        
        return structuredPatterns.some(pattern => pattern.test(content));
      }
    }
    
    return false;
  }

  /**
   * LLM 比较能力
   */
  private async llmCompare(args: any, state: WorkflowState): Promise<string> {
    const content1 = args.content1 || args.option1;
    const content2 = args.content2 || args.option2;
    
    const prompt = `请比较以下两个内容：

内容A：${content1}

内容B：${content2}

比较维度：${args.criteria || '全面比较'}

请提供详细的比较分析。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * LLM 总结能力
   */
  private async llmSummarize(args: any, state: WorkflowState): Promise<string> {
    const content = args.content || state.blackboard.lastResult;
    
    const prompt = `请总结以下内容：

${content}

总结要求：${args.requirement || '简洁明了地总结要点'}

请提供总结结果。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * LLM 格式化能力
   */
  private async llmFormat(args: any, state: WorkflowState): Promise<string> {
    const content = args.content || state.blackboard.lastResult;
    const format = args.format || 'markdown';
    
    const prompt = `请将以下内容格式化为${format}格式：

${content}

格式化要求：${args.requirement || '保持内容完整，优化结构'}

请提供格式化后的结果。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * LLM 翻译能力
   */
  private async llmTranslate(args: any, state: WorkflowState): Promise<string> {
    const prompt = `请将以下内容翻译为${args.targetLanguage || '中文'}：

${args.content || args.text}

请提供翻译结果。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
  }

  /**
   * LLM 提取能力
   */
  private async llmExtract(args: any, state: WorkflowState): Promise<any> {
    const content = args.content || state.blackboard.lastResult;
    
    const prompt = `请从以下内容中提取 ${args.target || '关键信息'}：

${content}

提取要求：${args.requirement || '提取所有相关信息'}

请以JSON格式返回提取的信息。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    
    try {
      // 尝试解析为 JSON
      const jsonMatch = (response.content as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('提取结果不是有效JSON，返回原始文本');
    }
    
    return response.content as string;
  }

  /**
   * 自动连接 MCP（带用户认证信息注入）
   */
  private async autoConnectMCP(mcpName: string, taskId?: string): Promise<void> {
    const mcpConfig = getPredefinedMCP(mcpName);
    if (!mcpConfig) {
      throw new Error(`未找到 MCP 配置: ${mcpName}`);
    }

    logger.info(`🔗 自动连接 MCP: ${mcpName}`);
    
    try {
      // 动态注入用户认证信息
      const dynamicEnv = await this.injectUserAuthentication(mcpConfig, taskId);
      
      // 处理args中的环境变量替换
      const dynamicArgs = await this.injectArgsAuthentication(mcpConfig.args || [], dynamicEnv, taskId);
      
      await this.mcpManager.connect(
        mcpConfig.name,
        mcpConfig.command,
        dynamicArgs,
        dynamicEnv
      );
      
      // 等待连接稳定
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.info(`✅ MCP 连接成功: ${mcpName}`);
    } catch (error) {
      logger.error(`❌ MCP 连接失败: ${mcpName}`, error);
      throw error;
    }
  }

  /**
   * 动态注入用户认证信息
   */
  private async injectUserAuthentication(mcpConfig: any, taskId?: string): Promise<Record<string, string>> {
    let dynamicEnv = { ...mcpConfig.env };
    
    console.log(`\n==== 智能工作流引擎 - 认证信息注入调试 ====`);
    console.log(`时间: ${new Date().toISOString()}`);
    console.log(`MCP名称: ${mcpConfig.name}`);
    console.log(`任务ID: ${taskId}`);
    console.log(`原始环境变量: ${JSON.stringify(mcpConfig.env, null, 2)}`);
    
    // 检查是否需要认证
    if (mcpConfig.env) {
      const missingEnvVars: string[] = [];
      
      // 检查每个环境变量是否缺失
      for (const [key, value] of Object.entries(mcpConfig.env)) {
        if (!value || value === '') {
          missingEnvVars.push(key);
        }
      }
      
      console.log(`缺失的环境变量: ${JSON.stringify(missingEnvVars)}`);
      
      // 如果有缺失的环境变量，尝试从数据库获取用户认证信息
      if (missingEnvVars.length > 0 && taskId) {
        logger.info(`MCP需要认证，尝试从数据库获取用户认证数据...`);
        
        try {
          const currentTask = await this.taskService.getTaskById(taskId);
          if (currentTask) {
            const userId = currentTask.userId;
            logger.info(`从任务上下文获取用户ID: ${userId}`);
            console.log(`用户ID: ${userId}`);
            
            // 确保 MCPAuthService 已初始化
            if (!this.mcpAuthService) {
              throw new Error('MCPAuthService 未初始化');
            }
            
            const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpConfig.name);
            console.log(`用户认证结果:`, {
              hasUserAuth: !!userAuth,
              isVerified: userAuth?.isVerified,
              hasAuthData: !!userAuth?.authData
            });
            
            if (userAuth && userAuth.isVerified && userAuth.authData) {
              logger.info(`找到用户 ${userId} 的 ${mcpConfig.name} 认证信息，注入环境变量...`);
              console.log(`用户认证数据: ${JSON.stringify(userAuth.authData, null, 2)}`);
              
              // 动态注入认证信息到环境变量
              for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
                console.log(`检查环境变量: ${envKey} = "${envValue}"`);
                if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                  // 🔧 特殊处理Notion MCP的OPENAPI_MCP_HEADERS
                  if (envKey === 'OPENAPI_MCP_HEADERS' && mcpConfig.name === 'notion-mcp') {
                    const authValue = userAuth.authData[envKey];
                    console.log(`🔧 处理Notion MCP的OPENAPI_MCP_HEADERS: "${authValue}"`);
                    
                    // 检查用户填写的是否已经是完整的JSON字符串
                    if (authValue.startsWith('{') && authValue.endsWith('}')) {
                      // 用户填写的是完整JSON，直接使用
                      dynamicEnv[envKey] = authValue;
                      console.log(`✅ 使用完整JSON格式: ${authValue}`);
                    } else if (authValue.startsWith('ntn_') || authValue.startsWith('secret_')) {
                      // 用户只填写了token，构建完整的JSON字符串
                      const jsonHeaders = JSON.stringify({
                        "Authorization": `Bearer ${authValue}`,
                        "Notion-Version": "2022-06-28"
                      });
                      dynamicEnv[envKey] = jsonHeaders;
                      console.log(`✅ 自动构建JSON格式: ${jsonHeaders}`);
                      logger.info(`自动构建Notion认证JSON: ${jsonHeaders}`);
                    } else {
                      // 尝试解析为JSON，如果失败则当作token处理
                      try {
                        JSON.parse(authValue);
                        dynamicEnv[envKey] = authValue;
                        console.log(`✅ 验证JSON格式有效: ${authValue}`);
                      } catch {
                        // 当作token处理
                        const jsonHeaders = JSON.stringify({
                          "Authorization": `Bearer ${authValue}`,
                          "Notion-Version": "2022-06-28"
                        });
                        dynamicEnv[envKey] = jsonHeaders;
                        console.log(`✅ 解析失败，当作token处理: ${jsonHeaders}`);
                      }
                    }
                  } else {
                    // 其他MCP的正常处理
                    dynamicEnv[envKey] = userAuth.authData[envKey];
                    console.log(`✅ 注入 ${envKey} = "${userAuth.authData[envKey]}"`);
                  }
                  logger.info(`注入环境变量 ${envKey}`);
                } else {
                  console.log(`❌ 不注入 ${envKey}: envValue="${envValue}", 认证数据有此键: ${!!userAuth.authData[envKey]}`);
                }
              }
              
              const stillMissingVars = missingEnvVars.filter(key => !dynamicEnv[key] || dynamicEnv[key] === '');
              if (stillMissingVars.length === 0) {
                logger.info(`✅ 成功注入 ${mcpConfig.name} 的所有必需认证信息`);
                console.log(`✅ 所有必需认证信息注入成功`);
              } else {
                console.log(`❌ 仍然缺失变量: ${JSON.stringify(stillMissingVars)}`);
              }
            } else {
              console.log(`❌ 未找到有效用户认证:`, {
                hasUserAuth: !!userAuth,
                isVerified: userAuth?.isVerified,
                hasAuthData: !!userAuth?.authData
              });
            }
          } else {
            console.log(`❌ 任务未找到: ${taskId}`);
          }
        } catch (error) {
          logger.error(`获取用户认证信息失败:`, error);
          console.log(`❌ 获取用户认证错误:`, error);
        }
      }
    }
    
    console.log(`最终动态环境变量: ${JSON.stringify(dynamicEnv, null, 2)}`);
    return dynamicEnv;
  }
  
  /**
   * 动态注入args中的认证信息
   */
  private async injectArgsAuthentication(originalArgs: string[], dynamicEnv: Record<string, string>, taskId?: string): Promise<string[]> {
    if (!originalArgs || originalArgs.length === 0) {
      return originalArgs;
    }
    
    console.log(`\n==== 智能工作流引擎 - Args认证注入调试 ====`);
    console.log(`时间: ${new Date().toISOString()}`);
    console.log(`任务ID: ${taskId}`);
    console.log(`原始Args: ${JSON.stringify(originalArgs, null, 2)}`);
    console.log(`动态环境变量: ${JSON.stringify(dynamicEnv, null, 2)}`);
    
    // 创建args的副本进行处理
    const dynamicArgs = [...originalArgs];
    
    // 遍历每个arg，查找并替换环境变量引用
    for (let i = 0; i < dynamicArgs.length; i++) {
      const arg = dynamicArgs[i];
      
      // 查找包含 process.env.* 的参数
      if (typeof arg === 'string' && arg.includes('process.env.')) {
        console.log(`处理参数 ${i}: "${arg}"`);
        
        // 使用正则表达式查找所有的 process.env.VARIABLE_NAME 引用
        const envVarRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
        let modifiedArg = arg;
        let match;
        
        while ((match = envVarRegex.exec(arg)) !== null) {
          const envVarName = match[1]; // 环境变量名
          const fullMatch = match[0]; // 完整匹配的字符串
          
          console.log(`找到环境变量引用: ${fullMatch} (变量: ${envVarName})`);
          
          // 先检查dynamicEnv中是否有值
          if (dynamicEnv[envVarName]) {
            const newValue = dynamicEnv[envVarName];
            modifiedArg = modifiedArg.replace(fullMatch, newValue);
            console.log(`✅ 替换 ${fullMatch} 为 "${newValue}"`);
          } else {
            // 如果dynamicEnv中没有，尝试从process.env获取
            const processEnvValue = process.env[envVarName] || '';
            modifiedArg = modifiedArg.replace(fullMatch, processEnvValue);
            console.log(`⚠️ 使用process.env值 ${envVarName}: "${processEnvValue}"`);
          }
        }
        
        // 如果参数被修改了，更新它
        if (modifiedArg !== arg) {
          dynamicArgs[i] = modifiedArg;
          console.log(`更新参数 ${i}: "${arg}" -> "${modifiedArg}"`);
        }
      }
    }
    
    console.log(`最终动态Args: ${JSON.stringify(dynamicArgs, null, 2)}`);
    return dynamicArgs;
  }

  /**
   * 解析结果数据为结构化格式（移植自传统执行器）
   * @param result 原始结果
   * @returns 解析后的结构化数据
   */
  private parseResultData(result: any): any {
    try {
      if (typeof result === 'string') {
        // 尝试解析JSON
        const parsed = JSON.parse(result);
        
        // 提取关键数据
        if (parsed.data) {
          return parsed.data;
        } else if (parsed.summary) {
          return parsed.summary;
        } else {
          return parsed;
        }
      }
      return result;
    } catch (error) {
      // 如果不是JSON，返回原始数据
      return { rawData: result };
    }
  }

  /**
   * 从上一步结果中提取有用数据用于下一步
   */
  private async extractUsefulDataFromResult(prevResult: any, nextAction: string): Promise<any> {
    try {
      // 获取原始结果
      let rawResult = prevResult.result;
      
      // 如果结果是MCP工具调用的响应格式，提取实际内容
      if (rawResult && rawResult.content && Array.isArray(rawResult.content)) {
        const firstContent = rawResult.content[0];
        if (firstContent && firstContent.text) {
          rawResult = firstContent.text;
        }
      }

      logger.info(`🤖 使用LLM转换数据用于下一步操作: ${nextAction}`);
      
      // 获取当前连接的MCP工具信息
      let toolInfo = null;
      try {
        const connectedMCPs = this.mcpManager.getConnectedMCPs();
        for (const mcp of connectedMCPs) {
          const tools = await this.mcpManager.getTools(mcp.name);
          const targetTool = tools.find((t: any) => t.name === nextAction);
          if (targetTool) {
            toolInfo = targetTool;
            break;
          }
        }
      } catch (error) {
        logger.warn(`获取工具信息失败: ${error}`);
      }

      // 构建智能转换提示词
      const conversionPrompt = `You are a professional data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

CONTEXT:
- Previous step output: ${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}
- Next action: ${nextAction}
${toolInfo ? `- Tool Information: ${JSON.stringify(toolInfo, null, 2)}` : ''}

Transformation Logic:
1. Extract relevant data from previous output
2. Transform data into the format expected by the next tool
3. Smartly handle missing data
4. Ensure output format is correct

Please return transformed data, in JSON format.`;

      const response = await this.llm.invoke([
        new SystemMessage(conversionPrompt)
      ]);

      let transformedData;
      try {
        const responseText = response.content.toString().trim();
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        transformedData = JSON.parse(cleanedText);
        logger.info(`🤖 LLM Data Transformation Successful: ${JSON.stringify(transformedData, null, 2)}`);
      } catch (parseError) {
        logger.error(`Parsing LLM Transformation Result Failed: ${response.content}`);
        transformedData = rawResult;
      }

      return transformedData;
    } catch (error) {
      logger.error(`❌ 使用LLM转换数据失败: ${error}`);
      
      // 降级处理
      if (prevResult.result) {
        return prevResult.result;
      }
      
      return {};
    }
  }

  /**
   * 执行智能工作流
   * @param taskId 任务ID
   * @param originalQuery 原始查询
   * @param preselectedMCPs 预选的MCP工具
   * @param maxIterations 最大迭代次数
   * @returns 执行结果
   */
  async executeIntelligentWorkflow(
    taskId: string,
    originalQuery: string,
    preselectedMCPs: any[] = [],
    maxIterations: number = 50
  ): Promise<any> {
    try {
      logger.info(`🧠 开始执行智能工作流 [任务: ${taskId}]`);
      
      // 🔧 关键修复：正确处理预选的MCP和工作流信息
      let initialWorkflowPlan: any[] = [];
      
      // 从任务分析结果中获取完整的工作流信息
      try {
        const task = await this.taskService.getTaskById(taskId);
        if (task && task.mcpWorkflow) {
          const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
            ? JSON.parse(task.mcpWorkflow) 
            : task.mcpWorkflow;
          
          // 🔧 使用分析阶段生成的实际工作流步骤，而不是MCP信息
          if (mcpWorkflow.workflow && Array.isArray(mcpWorkflow.workflow) && mcpWorkflow.workflow.length > 0) {
            // 转换传统工作流格式为智能工作流格式
            initialWorkflowPlan = mcpWorkflow.workflow.map((step: any, index: number) => ({
              action: step.action || `step_${index + 1}`,
              mcpName: step.mcp || 'unknown',
              objective: step.action || `Execute step ${index + 1}`,
              step: step.step || index + 1
            }));
            
            logger.info(`📋 使用任务分析阶段的工作流计划，包含 ${initialWorkflowPlan.length} 个步骤`);
            logger.info(`📋 工作流步骤详情: ${JSON.stringify(initialWorkflowPlan, null, 2)}`);
          } else {
            logger.info(`📋 任务分析没有生成具体工作流步骤，将由智能引擎动态生成`);
          }
        }
      } catch (error) {
        logger.warn(`获取任务工作流信息失败: ${error}`);
      }
      
      // 初始化状态
      const initialState = {
        taskId,
        originalQuery,
        currentObjective: originalQuery,
        executionHistory: [],
        blackboard: {},
        messages: [],
        isComplete: false,
        finalAnswer: null,
        lastError: null,
        errors: [],
        // 🔧 正确设置工作流计划和步骤索引
        workflowPlan: initialWorkflowPlan, // 使用实际的工作流步骤
        currentStepIndex: 0,
        maxIterations,
        currentIteration: 0
      };

      logger.info(`🚀 智能工作流初始状态: 预定义步骤=${initialWorkflowPlan.length}, 最大迭代=${maxIterations}`);

      // 编译并执行工作流图
      const compiledGraph = this.graph.compile();
      const result = await compiledGraph.invoke(initialState);
      
      logger.info(`✅ 智能工作流执行完成 [任务: ${taskId}]`);
      return result;
      
    } catch (error) {
      logger.error(`❌ 智能工作流执行失败 [任务: ${taskId}]:`, error);
      throw error;
    }
  }
}