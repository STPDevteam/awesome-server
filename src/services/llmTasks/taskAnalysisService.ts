import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';
import { MCPManager } from '../mcpManager.js';
import { getTaskService } from '../taskService.js';
import { TaskStep, TaskStepType } from '../../models/task.js';
import { MCPToolAdapter } from '../mcpToolAdapter.js';
import { OfficialMCPAdapter } from '../officialMcpAdapter.js';
import { SimpleMCPAdapter } from '../simpleMcpAdapter.js';
import { HTTPMCPAdapter } from '../httpMcpAdapter.js';
import { MCPInfo } from '../../models/mcp.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * 可用MCP列表
 * 注意: 在实际应用中，这应该从数据库或配置文件中加载
 * todo 代码兜底后续调整
 */
export const AVAILABLE_MCPS: MCPInfo[] = [
  {
    name: 'GitHubTool',
    description: 'GitHub 代码仓库操作工具，可以访问和管理GitHub仓库',
    capabilities: ['查看仓库信息', '获取文件内容', '创建Issue', '提交PR', '查看提交历史'],
    authRequired: true,
    authFields: ['GITHUB_TOKEN']
  },
  {
    name: 'GoogleSearchTool',
    description: '谷歌搜索工具，可以执行网络搜索并获取结果',
    capabilities: ['执行网络搜索', '获取最新信息', '回答常识问题'],
    authRequired: true,
    authFields: ['GOOGLE_API_KEY', 'CUSTOM_SEARCH_ENGINE_ID']
  },
  {
    name: 'FileSystemTool',
    description: '本地文件系统操作工具',
    capabilities: ['读取文件', '写入文件', '列出目录内容', '创建目录'],
    authRequired: false
  },
  {
    name: 'WebBrowserTool',
    description: '网页浏览和信息抓取工具',
    capabilities: ['访问网页', '抓取网页内容', '提取结构化数据'],
    authRequired: false
  },
  {
    name: 'DatabaseQueryTool',
    description: '数据库查询工具，支持各种SQL和NoSQL数据库',
    capabilities: ['执行SQL查询', '获取数据统计', '数据可视化'],
    authRequired: true,
    authFields: ['DB_CONNECTION_STRING']
  },
  {
    name: 'ImageAnalysisTool',
    description: '图像分析工具，可以分析和处理图像',
    capabilities: ['对象识别', '场景描述', '文字识别', '图像分类'],
    authRequired: true,
    authFields: ['VISION_API_KEY']
  },
  {
    name: 'TextAnalysisTool',
    description: '文本分析工具，可以分析文本内容和情感',
    capabilities: ['情感分析', '关键词提取', '实体识别', '文本分类'],
    authRequired: false
  },
  {
    name: 'WeatherTool',
    description: '天气信息工具，提供全球天气数据',
    capabilities: ['获取当前天气', '天气预报', '历史天气数据'],
    authRequired: true,
    authFields: ['WEATHER_API_KEY']
  }
];

/**
 * 任务分析服务
 * 负责对任务进行分析、推荐合适的MCP、确认可交付内容并构建工作流
 */
export class TaskAnalysisService {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpAdapter: MCPToolAdapter | OfficialMCPAdapter | SimpleMCPAdapter | HTTPMCPAdapter;

  constructor(mcpManager: MCPManager, adapter?: MCPToolAdapter | OfficialMCPAdapter | SimpleMCPAdapter) {
    this.mcpManager = mcpManager;
    
    // 如果没有提供adapter，根据环境选择适当的适配器
    if (!adapter) {
      const adapterType = process.env.MCP_ADAPTER_TYPE || 'http';
      
      if (adapterType === 'http') {
        // 使用SimpleMCPAdapter，它会根据环境自动选择stdio或HTTP模式
        this.mcpAdapter = new HTTPMCPAdapter();
        logger.info('TaskAnalysisService使用SimpleMCPAdapter，自动选择适当模式');
      } else if (adapterType === 'official') {
        // 使用官方适配器
        this.mcpAdapter = new OfficialMCPAdapter(mcpManager);
        logger.info('TaskAnalysisService使用OfficialMCPAdapter');
      } else {
        // 使用默认适配器
        this.mcpAdapter = new MCPToolAdapter(mcpManager);
        logger.info('TaskAnalysisService使用MCPToolAdapter');
      }
    } else {
      this.mcpAdapter = adapter;
      logger.info(`TaskAnalysisService使用外部提供的适配器: ${adapter.constructor.name}`);
    }
    
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.TASK_ANALYSIS_MODEL || 'gpt-4o',
      temperature: 0.2, // 较低温度，保证推理的准确性
      configuration: {
        httpAgent: agent, // ✅ 使用代理关键设置
      },
    });
  }
  
  /**
   * 执行任务的流式分析流程
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送分析结果
   * @returns 分析是否成功
   */
  async analyzeTaskStream(taskId: string, stream: (data: any) => void): Promise<boolean> {
    try {
      // 发送分析开始信息
      stream({ 
        event: 'analysis_start', 
        data: { taskId, timestamp: new Date().toISOString() } 
      });
      
      // 获取任务内容
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`任务不存在 [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: '任务不存在' } });
        return false;
      }
      
      // 更新任务状态为处理中
      await taskService.updateTask(taskId, { status: 'in_progress' });
      stream({ event: 'status_update', data: { status: 'in_progress' } });
      
      // 步骤1: 分析任务需求
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'analysis',
          stepName: '分析任务需求',
          stepNumber: 1,
          totalSteps: 4
        } 
      });
      
      // 这里使用常规的analyzeRequirements方法，而不是流式方法
      // 因为我们需要确保后续步骤能正常使用结构化的结果
      const requirementsResult = await this.analyzeRequirements(task.content);
      
      // 向前端发送分析结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'analysis',
          content: requirementsResult.content,
          reasoning: requirementsResult.reasoning
        } 
      });
      
      // 记录步骤1结果
      const step1 = await taskService.createTaskStep({
        taskId,
        stepType: 'analysis',
        title: '分析任务需求',
        content: requirementsResult.content,
        reasoning: requirementsResult.reasoning,
        reasoningTime: 0, // 简化处理
        orderIndex: 1
      });
      
      // 步骤2: 识别最相关的MCP
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'mcp_selection',
          stepName: '识别最相关的MCP工具',
          stepNumber: 2,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const mcpResult = await this.identifyRelevantMCPs(
        task.content, 
        requirementsResult.content
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'mcp_selection',
          content: mcpResult.content,
          reasoning: mcpResult.reasoning,
          mcps: mcpResult.recommendedMCPs.map(mcp => ({
            name: mcp.name,
            description: mcp.description
          }))
        } 
      });
      
      // 记录步骤2结果
      const step2 = await taskService.createTaskStep({
        taskId,
        stepType: 'mcp_selection',
        title: '识别最相关的MCP工具',
        content: mcpResult.content,
        reasoning: mcpResult.reasoning,
        reasoningTime: 0, // 简化处理
        orderIndex: 2
      });
      
      // 步骤3: 确认可交付内容
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'deliverables',
          stepName: '确认可交付内容',
          stepNumber: 3,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const deliverablesResult = await this.confirmDeliverables(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'deliverables',
          content: deliverablesResult.content,
          reasoning: deliverablesResult.reasoning,
          canBeFulfilled: deliverablesResult.canBeFulfilled,
          deliverables: deliverablesResult.deliverables
        } 
      });
      
      // 记录步骤3结果
      const step3 = await taskService.createTaskStep({
        taskId,
        stepType: 'deliverables',
        title: '确认可交付内容',
        content: deliverablesResult.content,
        reasoning: deliverablesResult.reasoning,
        reasoningTime: 0, // 简化处理
        orderIndex: 3
      });
      
      // 步骤4: 构建MCP工作流
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'workflow',
          stepName: '构建MCP工作流',
          stepNumber: 4,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const workflowResult = await this.buildMCPWorkflow(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs,
        deliverablesResult.canBeFulfilled,
        deliverablesResult.deliverables
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'workflow',
          content: workflowResult.content,
          reasoning: workflowResult.reasoning,
          workflow: workflowResult.workflow
        } 
      });
      
      // 记录步骤4结果
      const step4 = await taskService.createTaskStep({
        taskId,
        stepType: 'workflow',
        title: '构建MCP工作流',
        content: workflowResult.content,
        reasoning: workflowResult.reasoning,
        reasoningTime: 0, // 简化处理
        orderIndex: 4
      });
      
      // 更新任务的MCP工作流信息
      const mcpWorkflow = {
        mcps: mcpResult.recommendedMCPs.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          authRequired: mcp.authRequired,
          authVerified: false // 初始状态未验证
        })),
        workflow: workflowResult.workflow
      };
      
      await taskService.updateTask(taskId, { mcpWorkflow });
      
      // 发送分析完成信息
      stream({ 
        event: 'analysis_complete', 
        data: { 
          taskId,
          mcpWorkflow
        } 
      });
      
      logger.info(`任务流式分析完成 [任务ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`任务流式分析失败 [ID: ${taskId}]:`, error);
      
      // 更新任务状态为失败
      await taskService.updateTask(taskId, { status: 'failed' });
      
      // 发送错误信息
      stream({ 
        event: 'error', 
        data: { 
          message: '任务分析失败', 
          details: error instanceof Error ? error.message : String(error)
        } 
      });
      
      return false;
    }
  }
  
  /**
   * 执行任务的完整分析流程
   * @param taskId 任务ID
   * @returns 分析结果，包括推荐的MCP工作流
   */
  async analyzeTask(taskId: string): Promise<boolean> {
    try {
      // 获取任务内容
      // todo 每一步都获取了，有点冗余，看怎么优化
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`任务不存在 [ID: ${taskId}]`);
        return false;
      }
      
      // 更新任务状态为处理中
      await taskService.updateTask(taskId, { status: 'in_progress' });
      
      // 执行四个固定步骤
      const startTime = Date.now();
      
      // 步骤1: 分析任务需求
      const requirementsResult = await this.analyzeRequirements(task.content);
      
      // 记录步骤1结果
      await taskService.createTaskStep({
        taskId,
        stepType: 'analysis',
        title: '分析任务需求',
        content: requirementsResult.content,
        reasoning: requirementsResult.reasoning,
        reasoningTime: Date.now() - startTime,
        orderIndex: 1
      });
      
      // 步骤2: 识别最相关的MCP
      const mcpStartTime = Date.now();
      const mcpResult = await this.identifyRelevantMCPs(
        task.content, 
        requirementsResult.content
      );
      
      // 记录步骤2结果
      await taskService.createTaskStep({
        taskId,
        stepType: 'mcp_selection',
        title: '识别最相关的MCP工具',
        content: mcpResult.content,
        reasoning: mcpResult.reasoning,
        reasoningTime: Date.now() - mcpStartTime,
        orderIndex: 2
      });
      
      // 步骤3: 确认可交付内容
      const deliverablesStartTime = Date.now();
      const deliverablesResult = await this.confirmDeliverables(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs
      );
      
      // 记录步骤3结果
      await taskService.createTaskStep({
        taskId,
        stepType: 'deliverables',
        title: '确认可交付内容',
        content: deliverablesResult.content,
        reasoning: deliverablesResult.reasoning,
        reasoningTime: Date.now() - deliverablesStartTime,
        orderIndex: 3
      });
      
      // 步骤4: 构建MCP工作流
      const workflowStartTime = Date.now();
      const workflowResult = await this.buildMCPWorkflow(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs,
        deliverablesResult.canBeFulfilled,
        deliverablesResult.deliverables
      );
      
      // 记录步骤4结果
      await taskService.createTaskStep({
        taskId,
        stepType: 'workflow',
        title: '构建MCP工作流',
        content: workflowResult.content,
        reasoning: workflowResult.reasoning,
        reasoningTime: Date.now() - workflowStartTime,
        orderIndex: 4
      });
      
      // 更新任务的MCP工作流信息
      await taskService.updateTask(taskId, {
        mcpWorkflow: {
          mcps: mcpResult.recommendedMCPs.map(mcp => ({
            name: mcp.name,
            description: mcp.description,
            authRequired: mcp.authRequired,
            authVerified: false // 初始状态未验证
          })),
          workflow: workflowResult.workflow
        }
      });
      
      logger.info(`任务分析完成 [任务ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`任务分析失败 [ID: ${taskId}]:`, error);
      // 更新任务状态为失败
      await taskService.updateTask(taskId, { status: 'failed' });
      return false;
    }
  }
  
  /**
   * 步骤1: 分析任务需求
   * @param taskContent 任务内容
   * @returns 需求分析结果
   */
  public async analyzeRequirements(taskContent: string): Promise<{
    content: string;
    reasoning: string;
  }> {
    try {
      logger.info('开始分析任务需求');
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位专业的任务分析师，负责分析用户输入的任务需求。
请对以下任务内容进行详细的分析，解构并识别：
1. 核心目标和子目标
2. 关键约束条件
3. 必要的输入和期望的输出
4. 潜在的挑战和风险点

输出格式：
{
  "analysis": "这里是公开给用户的任务分析摘要，简洁清晰地说明任务的核心需求和目标",
  "detailed_reasoning": "这里是你的详细推理过程，包括你如何理解任务、识别关键需求的思路，以及可能的解决方向"
}

请确保分析准确、全面，但保持简洁。`),
        new HumanMessage(taskContent)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        return {
          content: parsedResponse.analysis || "无法生成任务分析",
          reasoning: parsedResponse.detailed_reasoning || "无详细推理"
        };
      } catch (parseError) {
        logger.error('分析任务需求结果解析失败:', parseError);
        // 如果解析失败，尝试提取有用的部分
        const contentMatch = responseText.match(/["']analysis["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: contentMatch ? contentMatch[1].trim() : "无法解析任务分析",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText
        };
      }
    } catch (error) {
      logger.error('分析任务需求失败:', error);
      throw error;
    }
  }
  
  /**
   * 步骤2: 识别最相关的MCP
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @returns 推荐的MCP列表
   */
  public async identifyRelevantMCPs(
    taskContent: string,
    requirementsAnalysis: string
  ): Promise<{
    content: string;
    reasoning: string;
    recommendedMCPs: MCPInfo[];
  }> {
    try {
      logger.info('开始识别相关MCP工具');
      
      // 动态获取可用的MCP列表，而不是使用静态列表
      const availableMCPs = await this.getAvailableMCPs();
      logger.info(`【MCP调试】可用的MCP工具列表: ${JSON.stringify(availableMCPs.map(mcp => ({ name: mcp.name, description: mcp.description })))}`);
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位MCP（Model Context Protocol）专家，负责为用户任务选择最合适的工具。
请根据用户的任务描述和任务分析，从以下可用的MCP工具中选择最适合的工具（最多4个）：

${JSON.stringify(availableMCPs, null, 2)}

请仔细考虑每个工具的能力和限制，选择能够最佳完成用户任务的组合。

输出格式：
{
  "selected_mcps": [
    "Tool1Name",
    "Tool2Name",
    ...
  ],
  "selection_explanation": "向用户解释为什么选择这些工具",
  "detailed_reasoning": "详细说明你的选择过程、考虑的因素，以及为什么这些工具组合最适合任务需求"
}

请确保你的推荐是合理的，并且能够有效地满足用户的任务需求。`),
        new SystemMessage(`任务分析结果：${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      logger.info(`【MCP调试】LLM响应成功，开始解析MCP选择结果`);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      logger.info(`【MCP调试】LLM原始响应: ${responseText}`);
      
      try {
        // 清理可能的Markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`【MCP调试】清理后的响应: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        const selectedMCPNames: string[] = parsedResponse.selected_mcps || [];
        
        logger.info(`【MCP调试】LLM选择的MCP: ${JSON.stringify(selectedMCPNames)}`);
        
        // 获取推荐的MCP详细信息
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedMCPNames.includes(mcp.name)
        );
        
        logger.info(`【MCP调试】成功匹配${recommendedMCPs.length}个推荐MCP: ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        return {
          content: parsedResponse.selection_explanation || "未能提供工具选择说明",
          reasoning: parsedResponse.detailed_reasoning || "无详细推理",
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      } catch (parseError) {
        logger.error('识别相关MCP结果解析失败:', parseError);
        logger.info(`【MCP调试】尝试从非结构化文本中提取MCP名称`);
        
        // 尝试从文本中提取MCP名称
        const mcpNamesMatch = responseText.match(/["']selected_mcps["']\s*:\s*\[(.*?)\]/s);
        let selectedNames: string[] = [];
        
        if (mcpNamesMatch) {
          const namesText = mcpNamesMatch[1];
          selectedNames = namesText
            .split(',')
            .map(name => name.trim().replace(/["']/g, ''))
            .filter(name => name.length > 0);
          
          logger.info(`【MCP调试】从文本中提取的MCP名称: ${JSON.stringify(selectedNames)}`);
        }
        
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedNames.includes(mcp.name)
        );
        
        logger.info(`【MCP调试】成功匹配${recommendedMCPs.length}个推荐MCP (从文本提取): ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        // 提取解释部分
        const explanationMatch = responseText.match(/["']selection_explanation["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: explanationMatch ? explanationMatch[1].trim() : "无法解析工具选择说明",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      }
    } catch (error) {
      logger.error('识别相关MCP失败:', error);
      throw error;
    }
  }
  
  /**
   * 步骤3: 确认可交付内容
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @param recommendedMCPs 推荐的MCP列表
   * @returns 可交付内容确认结果
   */
  public async confirmDeliverables(
    taskContent: string,
    requirementsAnalysis: string,
    recommendedMCPs: MCPInfo[]
  ): Promise<{
    content: string;
    reasoning: string;
    canBeFulfilled: boolean;
    deliverables: string[];
  }> {
    try {
      logger.info('开始确认可交付内容');
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位专业的项目规划师，需要确认基于可用的MCP工具能够交付的具体成果。
请根据用户的任务需求和已选择的MCP工具，判断：
1. 是否能完全满足用户的需求
2. 如果不能完全满足，可以实现哪些部分
3. 具体可以交付的成果列表

请考虑以下可用的MCP工具：
${JSON.stringify(recommendedMCPs, null, 2)}

输出格式：
{
  "can_be_fulfilled": true/false,
  "deliverables": [
    "具体可交付成果1",
    "具体可交付成果2",
    ...
  ],
  "limitations": "如果有无法满足的需求，请说明",
  "conclusion": "针对用户的总结说明，解释可以完成什么，以及可能的限制",
  "detailed_reasoning": "详细的推理过程，分析为什么能/不能满足需求，以及如何规划交付"
}

请保持专业客观，不要过度承诺无法实现的功能。`),
        new SystemMessage(`任务分析结果：${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        // 清理可能的Markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`【MCP调试】清理后的可交付内容响应: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        return {
          content: parsedResponse.conclusion || "无法确定可交付内容",
          reasoning: parsedResponse.detailed_reasoning || "无详细推理",
          canBeFulfilled: parsedResponse.can_be_fulfilled === true,
          deliverables: parsedResponse.deliverables || []
        };
      } catch (parseError) {
        logger.error('确认可交付内容结果解析失败:', parseError);
        
        // 尝试提取关键信息
        const canBeFulfilledMatch = responseText.match(/["']can_be_fulfilled["']\s*:\s*(true|false)/i);
        const deliverablesMatch = responseText.match(/["']deliverables["']\s*:\s*\[(.*?)\]/s);
        const conclusionMatch = responseText.match(/["']conclusion["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        let deliverables: string[] = [];
        if (deliverablesMatch) {
          deliverables = deliverablesMatch[1]
            .split(',')
            .map(item => item.trim().replace(/^["']|["']$/g, ''))
            .filter(item => item.length > 0);
        }
        
        return {
          content: conclusionMatch ? conclusionMatch[1].trim() : "无法解析可交付内容摘要",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          canBeFulfilled: canBeFulfilledMatch ? canBeFulfilledMatch[1].toLowerCase() === 'true' : false,
          deliverables
        };
      }
    } catch (error) {
      logger.error('确认可交付内容失败:', error);
      throw error;
    }
  }
  
  /**
   * 步骤4: 构建MCP工作流
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @param recommendedMCPs 推荐的MCP列表
   * @param canBeFulfilled 是否能满足需求
   * @param deliverables 可交付内容列表
   * @returns MCP工作流
   */
  public async buildMCPWorkflow(
    taskContent: string,
    requirementsAnalysis: string,
    recommendedMCPs: MCPInfo[],
    canBeFulfilled: boolean,
    deliverables: string[]
  ): Promise<{
    content: string;
    reasoning: string;
    workflow: Array<{
      step: number;
      mcp: string;
      action: string;
      input?: string;
      output?: string;
    }>;
  }> {
    try {
      logger.info('开始构建MCP工作流');
      
      // 如果无法满足需求，返回空工作流
      if (!canBeFulfilled || recommendedMCPs.length === 0) {
        return {
          content: "由于无法满足需求或未选择合适的工具，无法构建有效的工作流。",
          reasoning: "基于前面的分析，当前需求无法通过所选工具完全满足，或者没有选择合适的工具。",
          workflow: []
        };
      }
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位专业的工作流程设计师，需要设计一个基于MCP工具的执行流程。
请根据用户的任务需求、已选择的MCP工具和确定的可交付成果，设计一个详细的工作流程。

可用的MCP工具：
${JSON.stringify(recommendedMCPs, null, 2)}

可交付成果：
${deliverables.join('\n')}

请设计一个有序的步骤流程，指明每一步：
1. 使用哪个MCP工具
2. 执行什么具体操作
3. 输入是什么
4. 预期输出是什么

输出格式：
{
  "workflow": [
    {
      "step": 1,
      "mcp": "工具名称",
      "action": "具体操作",
      "input": "输入内容",
      "output": "预期输出"
    },
    ...
  ],
  "workflow_summary": "工作流程摘要，向用户解释工作流如何运行",
  "detailed_reasoning": "详细设计思路，解释为什么这样设计工作流，以及每一步的目的"
}

请确保工作流逻辑合理，步骤之间有清晰的数据流转，能够有效地完成用户需求。`),
        new SystemMessage(`任务分析结果：${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        // 清理可能的Markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`【MCP调试】清理后的工作流响应: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        const workflow = parsedResponse.workflow || [];
        
        logger.info(`📋 工作流步骤数量: ${workflow.length}`);
        workflow.forEach((step: any, index: number) => {
          logger.info(`📝 工作流步骤${index + 1}: MCP=${step.mcp}, 操作=${step.action}`);
        });
        
        return {
          content: parsedResponse.workflow_summary || "未提供工作流摘要",
          reasoning: parsedResponse.detailed_reasoning || "无详细推理",
          workflow: workflow
        };
      } catch (parseError) {
        logger.error('构建MCP工作流结果解析失败:', parseError);
        
        // 尝试从文本中提取工作流信息
        const workflowMatch = responseText.match(/["']workflow["']\s*:\s*\[(.*?)\]/s);
        let workflow: Array<{
          step: number;
          mcp: string;
          action: string;
          input?: string;
          output?: string;
        }> = [];
        
        // 如果无法提取格式化的工作流，创建一个简单的默认工作流
        if (!workflowMatch) {
          workflow = recommendedMCPs.map((mcp, index) => ({
            step: index + 1,
            mcp: mcp.name,
            action: `使用${mcp.name}执行相关操作`,
            input: "任务内容",
            output: "处理结果"
          }));
        }
        
        // 提取摘要和推理
        const summaryMatch = responseText.match(/["']workflow_summary["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: summaryMatch ? summaryMatch[1].trim() : "无法解析工作流摘要",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          workflow
        };
      }
    } catch (error) {
      logger.error('构建MCP工作流失败:', error);
      throw error;
    }
  }
  
  // 新增方法：动态获取可用MCP列表
  private async getAvailableMCPs(): Promise<MCPInfo[]> {
    try {
      logger.info(`【MCP调试】开始获取可用MCP列表`);
      
      // 根据适配器类型获取已连接的MCP
      let connectedMCPs: Array<{ name: string; command: string; args: string[]; env?: Record<string, string> }> = [];
      
      if (this.mcpAdapter instanceof HTTPMCPAdapter) {
        // 如果是HTTPMCPAdapter，直接从serviceEndpoints获取服务信息
        logger.info(`【MCP调试】使用HTTPMCPAdapter获取MCP服务`);
        
        // 获取HTTPMCPAdapter中的serviceEndpoints
        const serviceEndpoints = (this.mcpAdapter as any).serviceEndpoints;
        if (serviceEndpoints && serviceEndpoints instanceof Map) {
          // 将serviceEndpoints转换为connectedMCPs格式
          connectedMCPs = Array.from(serviceEndpoints.entries()).map(([name, endpoint]: [string, any]) => ({
            name: name,
            command: 'http',
            args: [endpoint.baseUrl || ''],
            env: {}
          }));
        }
        
        logger.info(`【MCP调试】HTTPMCPAdapter服务端点转换为MCP列表: ${JSON.stringify(connectedMCPs)}`);
        
        // 尝试获取工具，如果失败则直接使用默认列表
        try {
          const allTools = await this.mcpAdapter.getAllTools();
          if (allTools.length === 0) {
            logger.warn(`【MCP调试】HTTPMCPAdapter未找到任何工具，使用默认MCP列表 AVAILABLE_MCPS`);
            return AVAILABLE_MCPS;
          }
        } catch (error) {
          logger.warn(`【MCP调试】HTTPMCPAdapter获取工具失败，使用默认MCP列表 AVAILABLE_MCPS: ${error}`);
          return AVAILABLE_MCPS;
        }
      } else if (this.mcpAdapter instanceof SimpleMCPAdapter) {
        // 如果是SimpleMCPAdapter，使用其特有的方法
        logger.info(`【MCP调试】使用SimpleMCPAdapter获取已连接MCP`);
        connectedMCPs = this.mcpAdapter.getConnectedMCPs();
        logger.info(`【MCP调试】SimpleMCPAdapter返回的已连接MCP: ${JSON.stringify(connectedMCPs)}`);
      } else if (this.mcpAdapter instanceof OfficialMCPAdapter) {
        // 如果是OfficialMCPAdapter，获取其信息
        logger.info(`【MCP调试】使用OfficialMCPAdapter获取已连接MCP`);
        const adapterInfo = this.mcpAdapter.getAdapterInfo();
        connectedMCPs = adapterInfo.connectedMcps;
        logger.info(`【MCP调试】OfficialMCPAdapter返回的已连接MCP: ${JSON.stringify(connectedMCPs)}`);
      } else {
        // 否则使用MCPManager
        logger.info(`【MCP调试】使用MCPManager获取已连接MCP`);
        connectedMCPs = this.mcpManager.getConnectedMCPs();
        logger.info(`【MCP调试】MCPManager返回的已连接MCP: ${JSON.stringify(connectedMCPs)}`);
      }
      
      const result: MCPInfo[] = [];
      
      for (const mcp of connectedMCPs) {
        try {
          logger.info(`【MCP调试】开始获取MCP工具信息 [MCP: ${mcp.name}]`);
          // 获取该MCP的所有工具
          let mcpTools: any[] = [];
          
          if (this.mcpAdapter instanceof HTTPMCPAdapter) {
            // 使用HTTPMCPAdapter的getAllTools或getToolsFromService方法
            logger.info(`【MCP调试】使用HTTPMCPAdapter获取MCP工具 [MCP: ${mcp.name}]`);
            try {
              // 尝试使用私有方法getToolsFromService
              const serviceEndpoint = (this.mcpAdapter as any).serviceEndpoints.get(mcp.name);
              if (serviceEndpoint) {
                mcpTools = await (this.mcpAdapter as any).getToolsFromService(mcp.name, serviceEndpoint);
              } else {
                // 如果找不到特定服务，尝试获取所有工具
                mcpTools = await this.mcpAdapter.getAllTools();
                // 过滤出属于当前MCP的工具
                mcpTools = mcpTools.filter(tool => tool.name.startsWith(mcp.name));
              }
            } catch (e) {
              // 如果上述方法失败，尝试获取所有工具
              mcpTools = await this.mcpAdapter.getAllTools();
            }
            logger.info(`【MCP调试】HTTPMCPAdapter返回的工具数量: ${mcpTools.length} [MCP: ${mcp.name}]`);
          } else if (this.mcpAdapter instanceof SimpleMCPAdapter) {
            // 使用SimpleMCPAdapter的特有方法
            logger.info(`【MCP调试】使用SimpleMCPAdapter获取MCP工具 [MCP: ${mcp.name}]`);
            mcpTools = await this.mcpAdapter.getMCPTools(mcp.name);
            logger.info(`【MCP调试】SimpleMCPAdapter返回的工具数量: ${mcpTools.length} [MCP: ${mcp.name}]`);
          } else {
            // 否则使用MCPManager
            logger.info(`【MCP调试】使用MCPManager获取MCP工具 [MCP: ${mcp.name}]`);
            mcpTools = await this.mcpManager.getTools(mcp.name);
            logger.info(`【MCP调试】MCPManager返回的工具数量: ${mcpTools.length} [MCP: ${mcp.name}]`);
          }
          
          // 获取工具能力列表
          const capabilities = mcpTools.map(tool => 
            tool.description || `${tool.name} 功能`
          );
          
          // 确定是否需要授权(根据工具特性或连接参数)
          const authRequired = mcp.args.some(arg => arg.includes('auth') || arg.includes('token'));
          
          // 提取可能的授权字段
          const authFields = mcp.env ? Object.keys(mcp.env) : [];
          
          result.push({
            name: mcp.name,
            description: `${mcp.name} - ${mcpTools.length}个工具`,
            capabilities,
            authRequired,
            authFields: authRequired ? authFields : undefined
          });
          
          logger.info(`【MCP调试】成功添加MCP信息 [MCP: ${mcp.name}, 工具数量: ${mcpTools.length}, 需要授权: ${authRequired}]`);
        } catch (error) {
          logger.error(`【MCP调试】获取MCP工具信息失败 [${mcp.name}]:`, error);
        }
      }
      
      // 如果没有找到任何MCP，使用默认列表(以确保系统能正常工作)
      if (result.length === 0) {
        logger.warn(`【MCP调试】未找到任何已连接的MCP，使用默认MCP列表 AVAILABLE_MCPS`);
        return AVAILABLE_MCPS;
      }
      
      logger.info(`【MCP调试】成功获取可用MCP列表，共${result.length}个MCP: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`【MCP调试】获取可用MCP列表失败:`, error);
      logger.warn(`【MCP调试】使用默认MCP列表作为备选方案`);
      return AVAILABLE_MCPS; // 失败时返回默认列表
    }
  }
} 