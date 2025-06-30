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

      return {
        executionHistory: [...state.executionHistory, step],
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
可用工具:
${mcp.tools.map((tool: any) => `  - ${tool.name}: ${tool.description}${tool.parameters ? '\n    参数: ' + JSON.stringify(tool.parameters, null, 4) : ''}`).join('\n')}
`).join('\n')}

## 决策规则
1. 需要外部数据或执行具体操作时，选择 MCP 工具
2. 需要分析、比较、总结等认知任务时，选择 LLM 能力
3. 如果 MCP 工具失败，可以回退到 LLM 能力
4. 优先使用最直接有效的工具
5. **重要：只能使用上面列出的确切工具名称**

## 重要格式说明
- 对于 LLM 工具：tool 应该是 "llm.analyze"、"llm.compare" 等，toolType 是 "llm"，不需要 mcpName
- 对于 MCP 工具：tool 应该是**确切的工具名称**（从上面可用工具列表中选择），toolType 是 "mcp"，mcpName 是 MCP 服务名称

**重要提醒**：
- MCP工具名称必须从上面的可用工具列表中**精确选择**
- 不要猜测或编造工具名称
- 如果不确定工具名称，优先选择 LLM 能力

请分析当前状态，制定下一步执行计划。返回格式：

对于 LLM 工具：
{
  "tool": "llm.analyze",
  "toolType": "llm", 
  "args": {"content": "要分析的内容"},
  "expectedOutput": "期望的输出描述",
  "reasoning": "选择此工具的原因"
}

对于 MCP 工具：
{
  "tool": "确切的工具名称（从可用工具列表选择）",
  "toolType": "mcp",
  "mcpName": "MCP服务名称",
  "args": {"参数名": "参数值"},
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

## 执行历史
${state.executionHistory.map(step => `
步骤 ${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- 执行状态: ${step.success ? '成功' : '失败'}
- 计划: ${step.plan.reasoning}
- 结果类型: ${step.success ? typeof step.result : '失败'}
`).join('\n')}

## 最新执行结果
${lastStep ? `
步骤 ${lastStep.stepNumber}: ${lastStep.plan.tool}
- 执行状态: ${lastStep.success ? '成功' : '失败'}
- 计划: ${lastStep.plan.reasoning}
- 结果: ${lastStep.success ? JSON.stringify(lastStep.result).substring(0, 1000) + '...' : lastStep.error}
` : '暂无执行历史'}

## 黑板数据
${JSON.stringify(state.blackboard, null, 2)}

## 判断标准
请仔细分析当前状态，判断任务是否真正完成：

### 🔍 复合任务识别
**原始任务**: ${state.originalQuery}

请仔细分析原始任务中的所有要求：
- 是否包含多个动作（如：分析 + 记录、获取 + 发送、比较 + 总结等）
- 是否有"并且"、"然后"、"接着"、"同时"等连接词
- 是否有多个目标平台或工具（如：GitHub + Notion、Twitter + 邮件等）

### 📋 完成性检查
1. **数据获取类任务**：如果只是获取了原始数据，但用户要求"分析"，还需要 LLM 分析
2. **分析类任务**：如果用户要求分析、比较、总结等，需要确保已经有 LLM 分析步骤
3. **存储/记录类任务**：如果用户要求"记录到xxx"、"保存到xxx"、"发送到xxx"，需要确保已执行相应的存储操作
4. **多步骤任务**：检查是否所有必要步骤都已完成
5. **结果完整性**：检查结果是否回答了用户的所有要求

### ⚠️ 常见遗漏场景
- ✅ 已分析GitHub issue → ❌ 但未记录到Notion
- ✅ 已获取价格数据 → ❌ 但未发送到Twitter
- ✅ 已比较两个项目 → ❌ 但未生成报告文档
- ✅ 已分析代码 → ❌ 但未创建GitHub issue

### 🎯 关键判断原则
**只有当原始任务中的所有要求都已完成时，才能判断任务完成！**

请返回格式：
{
  "isComplete": true/false,
  "reasoning": "判断的详细理由",
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
        
        // 记录 Observer 的推理过程
        if (observation.reasoning) {
          logger.info(`🤔 Observer 推理: ${observation.reasoning}`);
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
      const toolSelectionPrompt = `你是一个AI助手，负责从可用工具中选择最合适的工具并生成正确的输入参数。

原始工具名: ${originalTool}
原始参数: ${JSON.stringify(originalArgs)}
任务目标: ${objective}

可用工具:
${availableTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}${tool.inputSchema ? '\n  输入模式: ' + JSON.stringify(tool.inputSchema) : ''}`).join('\n')}

请选择最合适的工具并生成正确的参数，以JSON格式回复:
{
  "toolName": "确切的工具名称",
  "inputParams": { /* 基于工具模式转换的参数 */ },
  "reasoning": "选择原因的简要说明"
}

对于加密货币查询:
- 使用 "bitcoin" 作为比特币ID，"ethereum" 作为以太坊ID等
- 使用 "usd" 作为vs_currency表示美元价格
- 包含相关参数如 include_market_cap, include_24hr_change 等`;

      const response = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      let toolSelection;
      try {
        const responseText = response.content.toString().trim();
        // 清理可能的markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        toolSelection = JSON.parse(cleanedText);
      } catch (parseError) {
        logger.error(`解析工具选择响应失败: ${response.content}`);
        // 回退到简单选择
        const fallbackPrompt = `可用工具: ${availableTools.map(t => t.name).join(', ')}\n目标: ${objective}\n只选择确切的工具名称:`;
        const fallbackResponse = await this.llm.invoke([new SystemMessage(fallbackPrompt)]);
        const fallbackToolName = fallbackResponse.content.toString().trim();
        toolSelection = {
          toolName: fallbackToolName,
          inputParams: originalArgs,
          reasoning: "由于解析错误使用回退选择"
        };
      }

      return {
        toolName: toolSelection.toolName || originalTool,
        inputParams: toolSelection.inputParams || originalArgs,
        reasoning: toolSelection.reasoning || "无推理说明"
      };

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
   * 构建智能分析提示词 - 通用方法
   */
  private buildIntelligentAnalysisPrompt(content: any, args: any, state: WorkflowState): string {
    // 检测内容类型
    const contentType = this.detectContentType(content);
    const hasStructuredData = this.hasStructuredData(content);
    const originalQuery = state.originalQuery;
    
    // 基础提示词模板
    let prompt = `你是一位专业的数据分析师。请对以下内容进行深入分析：

## 用户的原始需求
${originalQuery}

## 待分析的数据
${typeof content === 'string' ? content : JSON.stringify(content, null, 2)}

## 分析指导原则
`;

    // 根据内容类型和结构化程度调整分析策略
    if (hasStructuredData) {
      prompt += `
**重要提醒：您面前的是具体的结构化数据，请直接对这些数据进行分析，而不是提供分析框架或方法论。**

### 分析要求：
1. **数据概览**：总结数据的基本情况（数量、类型、时间范围等）
2. **关键发现**：从数据中提取最重要的信息和模式
3. **深度分析**：基于数据内容进行详细分析
4. **实用洞察**：提供基于数据的具体见解和建议

### 分析重点：
- 直接分析提供的数据内容
- 提供具体的数字、统计和实例
- 识别数据中的模式、趋势或异常
- 回答用户的具体问题
`;
    } else {
      prompt += `
### 分析要求：
1. **内容理解**：深入理解内容的核心信息
2. **关键要点**：提取最重要的信息点
3. **逻辑分析**：分析内容的逻辑结构和关联性
4. **价值评估**：评估内容的价值和意义

### 分析重点：
- 基于提供的具体内容进行分析
- 避免空泛的理论或方法论
- 提供实用的见解和结论
`;
    }

    // 添加特定要求
    if (args.requirement) {
      prompt += `\n### 特定要求：
${args.requirement}`;
    }

    // 添加输出格式要求
    prompt += `

### 输出要求：
- 直接针对提供的数据/内容进行分析
- 提供具体、实用的分析结果
- 使用清晰的结构化格式
- 避免提供抽象的分析框架或方法论
- 确保分析结果直接回答用户的问题

请开始分析：`;

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
   * 从前一步结果中智能提取有用数据（移植自传统执行器）
   * @param prevResult 前一步的结果
   * @param nextAction 下一步的动作
   * @returns 提取的输入数据
   */
  private async extractUsefulDataFromResult(prevResult: any, nextAction: string): Promise<any> {
    try {
      if (!prevResult || !prevResult.result) {
        logger.info('No previous result to extract from');
        return {};
      }

      // 获取原始结果数据 - 优先使用rawResult（未格式化的原始数据）
      let rawResult = prevResult.rawResult || prevResult.result;
      
      // 处理MCP响应格式 - 提取实际内容
      if (rawResult && typeof rawResult === 'object' && rawResult.content) {
        if (Array.isArray(rawResult.content) && rawResult.content.length > 0) {
          const firstContent = rawResult.content[0];
          if (firstContent.text) {
            rawResult = firstContent.text;
          }
        }
      }

      logger.info(`🤖 Using LLM to transform data for next action: ${nextAction}`);
      
      // 构建智能转换提示词
      const conversionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

PREVIOUS STEP OUTPUT:
${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}

NEXT STEP ACTION: ${nextAction}

TRANSFORMATION RULES:
1. Analyze what type of input the next action expects based on its name
2. Extract and transform relevant data from the previous output
3. Return the data in the exact format expected by the next tool

SPECIAL HANDLING:
- For social media posts (tweet, post, etc.): Return ONLY the text content as a plain string, no JSON wrapper
- For API calls: Return properly structured JSON with required fields
- For data analysis: Include all relevant data from previous step
- Keep social media posts under 280 characters
- Make content engaging and contextual

IMPORTANT:
- Do NOT include explanations or metadata
- Return ONLY the transformed data
- If the next action expects a string, return a string
- If the next action expects JSON, return valid JSON

Example transformations:
- DEXScreener data → Tweet: "🚀 Trending token alert! $SYMBOL is up X% today!"
- Price data → Analysis: {"symbol": "BTC", "price": 50000, "change": 5.2}
- Analysis → Tweet: "Market insight: Bitcoin shows strong momentum..."`;

      const response = await this.llm.invoke([
        new SystemMessage(conversionPrompt)
      ]);

      let transformedData = response.content.toString().trim();
      
      // 清理可能的markdown代码块标记
      if (transformedData.startsWith('```') && transformedData.endsWith('```')) {
        transformedData = transformedData.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
      
      logger.info(`📊 LLM Data Transformation Result:`);
      logger.info(`   Original: ${JSON.stringify(rawResult).substring(0, 200)}...`);
      logger.info(`   Transformed: ${transformedData.substring(0, 200)}${transformedData.length > 200 ? '...' : ''}`);

      // 尝试解析为JSON，如果失败则返回原始字符串
      try {
        const parsed = JSON.parse(transformedData);
        logger.info(`   Type: JSON object`);
        return parsed;
      } catch {
        // 不是JSON，返回字符串（适用于推文等纯文本场景）
        logger.info(`   Type: Plain text string`);
        return transformedData;
      }

    } catch (error) {
      logger.error(`❌ Failed to transform data using LLM: ${error}`);
      
      // 降级处理：尝试简单提取
      if (prevResult.result) {
        const resultStr = JSON.stringify(prevResult.result);
        // 如果是推文相关，尝试生成简单内容
        if (nextAction.toLowerCase().includes('tweet') || nextAction.toLowerCase().includes('post')) {
          return '🚀 Check out the latest crypto market updates! #Crypto #DeFi';
        }
        // 否则返回解析的数据或原始结果
        return prevResult.parsedData || prevResult.result;
      }
      
      return {};
    }
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
   * 执行智能工作流
   */
  async executeWorkflow(
    taskId: string,
    query: string,
    maxIterations: number = 10,
    onProgress?: (step: ExecutionStep) => void
  ): Promise<WorkflowState> {
    logger.info(`🚀 启动智能工作流 [任务: ${taskId}]`);

    // 初始化状态 - 使用正确的类型
    const initialState: WorkflowState = {
      taskId,
      originalQuery: query,
      currentObjective: query,
      messages: [] as BaseMessage[],
      executionHistory: [] as ExecutionStep[],
      blackboard: {} as Record<string, any>,
      currentPlan: null as ExecutionPlan | null,
      isComplete: false,
      maxIterations,
      currentIteration: 0,
      errors: [] as string[],
      lastError: null as string | null
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

    // 初始化状态 - 使用正确的类型
    const initialState: WorkflowState = {
      taskId,
      originalQuery: query,
      currentObjective: query,
      messages: [] as BaseMessage[],
      executionHistory: [] as ExecutionStep[],
      blackboard: {} as Record<string, any>,
      currentPlan: null as ExecutionPlan | null,
      isComplete: false,
      maxIterations,
      currentIteration: 0,
      errors: [] as string[],
      lastError: null as string | null
    };

    let finalState = initialState; // 保存最终状态

    try {
      // 编译图
      const compiledGraph = this.graph.compile();

      // 流式执行 - 先 await 再 for-await-of
      const stream = await compiledGraph.stream(initialState);
      for await (const step of stream) {
        const [nodeName, nodeResult] = Object.entries(step)[0];
        
        // 更新最终状态
        finalState = nodeResult as WorkflowState;
        
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

      return finalState; // 返回真正的最终状态

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