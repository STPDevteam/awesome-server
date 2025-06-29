import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
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
 * 工作流状态定义 - 使用正确的 Annotation API
 */
const WorkflowStateAnnotation = Annotation.Root({
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
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  executionHistory: Annotation<ExecutionStep[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  blackboard: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  currentPlan: Annotation<ExecutionPlan | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  isComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 10,
  }),
  currentIteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  lastError: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
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

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4',
      temperature: 0.1,
    //   httpAgent: agent,
    //   httpsAgent: agent,
    });

    this.mcpManager = new MCPManager();
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    this.taskService = getTaskService();
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
   * Planner 节点 - 分析当前状态并制定执行计划
   */
  private async plannerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info(`🧠 Planner: 分析任务 [迭代: ${state.currentIteration + 1}]`);
      
      // 获取可用的MCP能力 - 传入taskId
      const availableMCPs = await this.getAvailableMCPCapabilities(state.taskId);
      
      // 构建提示词
      const prompt = this.buildPlannerPrompt(state, availableMCPs);
      
      // 调用LLM
      const response = await this.llm.invoke([new SystemMessage(prompt)]);
      const plan = this.parsePlan(response.content as string);
      
      logger.info(`📋 Planner: 制定计划 - ${plan.tool} (${plan.toolType})`);
      logger.info(`💭 推理: ${plan.reasoning}`);
      
      return {
        currentPlan: plan,
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
      let result: any;
      
      if (state.currentPlan.toolType === 'mcp') {
        // 调用 MCP 工具
        result = await this.executeMCPTool(state.currentPlan);
      } else {
        // 调用 LLM 能力
        result = await this.executeLLMTool(state.currentPlan, state);
      }

      // 记录执行步骤
      const step: ExecutionStep = {
        stepNumber: state.executionHistory.length + 1,
        plan: state.currentPlan,
        result,
        success: true,
        timestamp: new Date()
      };

      logger.info(`✅ 执行成功: ${state.currentPlan.tool}`);

      return {
        executionHistory: [...state.executionHistory, step],
        blackboard: {
          ...state.blackboard,
          [`step${step.stepNumber}`]: result,
          lastResult: result
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
   * 确保预选的MCP已连接
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
          await this.autoConnectMCP(mcpName);
        } else {
          logger.info(`✅ MCP已连接: ${mcpName}`);
        }

        // 获取工具信息
        const tools = await this.mcpToolAdapter.getAvailableTools(mcpName);
        
        capabilities.push({
          mcpName: mcpName,
          description: mcpInfo.description || `MCP Service: ${mcpName}`,
          authRequired: mcpInfo.authRequired || false,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }))
        });

        logger.info(`✅ 预选MCP可用: ${mcpName} (${tools.length} 个工具)`);

      } catch (error) {
        logger.warn(`预选MCP连接失败: ${mcpInfo.name}`, error);
        // 继续处理其他MCP，不中断整个流程
      }
    }

    return capabilities;
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
        // 获取工具信息
        const tools = await this.mcpToolAdapter.getAvailableTools(mcp.name);
        
        capabilities.push({
          mcpName: mcp.name,
          description: mcp.description || `MCP Service: ${mcp.name}`,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }))
        });

        logger.info(`✅ 发现已连接的 MCP: ${mcp.name} (${tools.length} 个工具)`);

      } catch (error) {
        logger.warn(`获取 MCP 能力失败: ${mcp.name}`, error);
      }
    }

    return capabilities;
  }

  /**
   * 构建 Planner 提示词
   */
  private buildPlannerPrompt(state: WorkflowState, availableMCPs: any[]): string {
    return `你是一个智能任务规划器，负责分析当前任务状态并制定下一步执行计划。

## 当前状态
- 任务ID: ${state.taskId}
- 原始查询: ${state.originalQuery}
- 当前目标: ${state.currentObjective}
- 已执行步骤: ${state.executionHistory.length}
- 当前迭代: ${state.currentIteration}

## 执行历史
${state.executionHistory.map(step => `
步骤 ${step.stepNumber}: ${step.plan.tool} (${step.success ? '成功' : '失败'})
- 计划: ${step.plan.reasoning}
- 结果: ${step.success ? '成功' : step.error}
`).join('\n')}

## 可用能力

### LLM 能力
- llm.analyze: 分析和推理复杂问题
- llm.compare: 比较不同选项或内容
- llm.summarize: 总结和概括信息
- llm.format: 格式化输出内容
- llm.translate: 翻译文本
- llm.extract: 从内容中提取特定信息

### MCP 工具能力
${availableMCPs.map(mcp => `
**${mcp.mcpName}**: ${mcp.description}
工具: ${mcp.tools.map((tool: any) => `${tool.name} - ${tool.description}`).join(', ')}
`).join('\n')}

## 决策规则
1. 需要外部数据或执行具体操作时，选择 MCP 工具
2. 需要分析、比较、总结等认知任务时，选择 LLM 能力
3. 如果 MCP 工具失败，可以回退到 LLM 能力
4. 优先使用最直接有效的工具

请分析当前状态，制定下一步执行计划。返回格式：
{
  "tool": "工具名称",
  "toolType": "llm|mcp",
  "mcpName": "MCP名称(如果是MCP工具)",
  "args": {"参数": "值"},
  "expectedOutput": "期望的输出描述",
  "reasoning": "选择此工具的原因"
}`;
  }

  /**
   * 构建 Observer 提示词
   */
  private buildObserverPrompt(state: WorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    
    return `你是一个智能观察器，负责分析任务执行结果并判断是否完成。

## 任务信息
- 原始查询: ${state.originalQuery}
- 当前目标: ${state.currentObjective}
- 已执行步骤: ${state.executionHistory.length}

## 最新执行结果
${lastStep ? `
步骤 ${lastStep.stepNumber}: ${lastStep.plan.tool}
- 执行状态: ${lastStep.success ? '成功' : '失败'}
- 计划: ${lastStep.plan.reasoning}
- 结果: ${lastStep.success ? JSON.stringify(lastStep.result) : lastStep.error}
` : '暂无执行历史'}

## 黑板数据
${JSON.stringify(state.blackboard, null, 2)}

请分析当前状态，判断任务是否完成。返回格式：
{
  "isComplete": true/false,
  "nextObjective": "下一步目标(如果未完成)",
  "finalAnswer": "最终答案(如果已完成)"
}`;
  }

  /**
   * 解析计划
   */
  private parsePlan(content: string): ExecutionPlan {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return {
          tool: plan.tool || 'llm.analyze',
          toolType: plan.toolType || 'llm',
          mcpName: plan.mcpName,
          args: plan.args || {},
          expectedOutput: plan.expectedOutput || '分析结果',
          reasoning: plan.reasoning || '默认推理'
        };
      }
    } catch (error) {
      logger.warn('解析计划失败，使用默认计划', error);
    }

    // 默认计划
    return {
      tool: 'llm.analyze',
      toolType: 'llm',
      args: { content: content },
      expectedOutput: '分析结果',
      reasoning: '解析失败，使用默认LLM分析'
    };
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
        return {
          isComplete: observation.isComplete || false,
          nextObjective: observation.nextObjective,
          finalAnswer: observation.finalAnswer
        };
      }
    } catch (error) {
      logger.warn('解析观察结果失败，使用默认判断', error);
    }

    // 默认判断：如果内容包含完成相关词汇
    const isComplete = /完成|成功|结束|done|complete|finished/i.test(content);
    return {
      isComplete,
      nextObjective: isComplete ? undefined : '继续执行任务',
      finalAnswer: isComplete ? content : undefined
    };
  }

  /**
   * 执行 MCP 工具
   */
  private async executeMCPTool(plan: ExecutionPlan): Promise<any> {
    if (!plan.mcpName) {
      throw new Error('MCP 工具需要指定 mcpName');
    }

    logger.info(`🔧 调用 MCP 工具: ${plan.mcpName}.${plan.tool}`);
    
    const result = await this.mcpToolAdapter.callTool(
      plan.mcpName,
      plan.tool,
      plan.args
    );

    return result;
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
    
    const prompt = `请分析以下内容：

${content}

分析要求：${args.requirement || '进行全面分析'}

请提供详细的分析结果。`;

    const response = await this.llm.invoke([new HumanMessage(prompt)]);
    return response.content as string;
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
   * 自动连接 MCP
   */
  private async autoConnectMCP(mcpName: string): Promise<void> {
    const mcpConfig = getPredefinedMCP(mcpName);
    if (!mcpConfig) {
      throw new Error(`未找到 MCP 配置: ${mcpName}`);
    }

    logger.info(`🔗 自动连接 MCP: ${mcpName}`);
    
    try {
      await this.mcpManager.connect(
        mcpConfig.name,
        mcpConfig.command,
        mcpConfig.args,
        mcpConfig.env
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
   * 执行智能工作流
   */
  async executeWorkflow(
    taskId: string,
    query: string,
    maxIterations: number = 10,
    onProgress?: (step: ExecutionStep) => void
  ): Promise<WorkflowState> {
    logger.info(`🚀 启动智能工作流 [任务: ${taskId}]`);

    // 初始化状态 - 使用默认值
    const initialState = {
      taskId,
      originalQuery: query,
      currentObjective: query,
      messages: [],
      executionHistory: [],
      blackboard: {},
      currentPlan: null,
      isComplete: false,
      maxIterations,
      currentIteration: 0,
      errors: [],
      lastError: null
    };

    try {
      // 编译并执行图
      const compiledGraph = this.graph.compile();
      const finalState = await compiledGraph.invoke(initialState);

      logger.info(`✅ 智能工作流完成 [任务: ${taskId}]`);
      return finalState;

    } catch (error) {
      logger.error(`❌ 智能工作流执行失败:`, error);
      throw error;
    }
  }

  /**
   * 流式执行智能工作流
   */
  async *executeWorkflowStream(
    taskId: string,
    query: string,
    maxIterations: number = 10
  ): AsyncGenerator<{ event: string; data: any }, WorkflowState, unknown> {
    logger.info(`🚀 启动流式智能工作流 [任务: ${taskId}]`);

    // 初始化状态
    const initialState = {
      taskId,
      originalQuery: query,
      currentObjective: query,
      messages: [],
      executionHistory: [],
      blackboard: {},
      currentPlan: null,
      isComplete: false,
      maxIterations,
      currentIteration: 0,
      errors: [],
      lastError: null
    };

    try {
      // 编译图
      const compiledGraph = this.graph.compile();

      // 流式执行 - 先 await 再 for-await-of
      const stream = await compiledGraph.stream(initialState);
      for await (const step of stream) {
        const [nodeName, nodeResult] = Object.entries(step)[0];
        
        yield {
          event: 'node_complete',
          data: {
            node: nodeName,
            result: nodeResult,
            iteration: (nodeResult as any).currentIteration || 0
          }
        };

        // 如果是执行步骤完成，发送详细信息
        if (nodeName === 'executor' && (nodeResult as any).executionHistory) {
          const history = (nodeResult as any).executionHistory;
          const lastStep = history[history.length - 1];
          
          yield {
            event: 'step_complete',
            data: {
              step: lastStep.stepNumber,
              plan: lastStep.plan,
              result: lastStep.result,
              success: lastStep.success,
              error: lastStep.error
            }
          };
        }

        // 检查是否完成
        if ((nodeResult as any).isComplete) {
          yield {
            event: 'workflow_complete',
            data: {
              success: true,
              finalState: nodeResult
            }
          };
          break;
        }
      }

      return initialState; // 返回最终状态

    } catch (error) {
      logger.error(`❌ 流式智能工作流执行失败:`, error);
      
      yield {
        event: 'workflow_error',
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
      
      throw error;
    }
  }
} 