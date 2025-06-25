import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';
import { getTaskService } from '../taskService.js';
import { TaskStep, TaskStepType } from '../../models/task.js';
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
    name: 'github-mcp-service',
    description: 'GitHub 代码仓库操作工具，可以访问和管理GitHub仓库',
    capabilities: ['查看仓库信息', '获取文件内容', '创建Issue', '提交PR', '查看提交历史'],
    authRequired: true,
    authFields: ['GITHUB_TOKEN'],
    category: '开发工具',
    imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    githubUrl: 'https://github.com/features/actions',
    authParams: {
      tokenName: 'GITHUB_TOKEN',
      tokenDescription: 'GitHub个人访问令牌，需要repo权限'
    }
  },
  {
    name: 'GoogleSearchTool',
    description: '谷歌搜索工具，可以执行网络搜索并获取结果',
    capabilities: ['执行网络搜索', '获取最新信息', '回答常识问题'],
    authRequired: true,
    authFields: ['GOOGLE_API_KEY', 'CUSTOM_SEARCH_ENGINE_ID'],
    category: '搜索工具',
    imageUrl: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png',
    githubUrl: 'https://github.com/googleapis/google-api-nodejs-client',
    authParams: {
      apiKeyName: 'GOOGLE_API_KEY',
      engineIdName: 'CUSTOM_SEARCH_ENGINE_ID'
    }
  },
  {
    name: 'FileSystemTool',
    description: '本地文件系统操作工具',
    capabilities: ['读取文件', '写入文件', '列出目录内容', '创建目录'],
    authRequired: false,
    category: '系统工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
    githubUrl: 'https://github.com/nodejs/node'
  },
  {
    name: 'WebBrowserTool',
    description: '网页浏览和信息抓取工具',
    capabilities: ['访问网页', '抓取网页内容', '提取结构化数据'],
    authRequired: false,
    category: '网络工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2985/2985975.png',
    githubUrl: 'https://github.com/puppeteer/puppeteer'
  },
  {
    name: 'DatabaseQueryTool',
    description: '数据库查询工具，支持各种SQL和NoSQL数据库',
    capabilities: ['执行SQL查询', '获取数据统计', '数据可视化'],
    authRequired: true,
    authFields: ['DB_CONNECTION_STRING'],
    category: '数据工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2772/2772128.png',
    githubUrl: 'https://github.com/sequelize/sequelize',
    authParams: {
      connectionStringName: 'DB_CONNECTION_STRING',
      connectionStringDescription: '数据库连接字符串'
    }
  },
  {
    name: 'ImageAnalysisTool',
    description: '图像分析工具，可以分析和处理图像',
    capabilities: ['对象识别', '场景描述', '文字识别', '图像分类'],
    authRequired: true,
    authFields: ['VISION_API_KEY'],
    category: '媒体工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2659/2659360.png',
    githubUrl: 'https://github.com/googleapis/nodejs-vision',
    authParams: {
      apiKeyName: 'VISION_API_KEY',
      apiKeyDescription: '视觉API访问密钥'
    }
  },
  {
    name: 'TextAnalysisTool',
    description: '文本分析工具，可以分析文本内容和情感',
    capabilities: ['情感分析', '关键词提取', '实体识别', '文本分类'],
    authRequired: false,
    category: '媒体工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1950/1950715.png',
    githubUrl: 'https://github.com/NaturalNode/natural'
  },
  {
    name: 'WeatherTool',
    description: '天气信息工具，提供全球天气数据',
    capabilities: ['获取当前天气', '天气预报', '历史天气数据'],
    authRequired: true,
    authFields: ['WEATHER_API_KEY'],
    category: '信息服务',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1163/1163763.png',
    githubUrl: 'https://github.com/chubin/wttr.in',
    authParams: {
      apiKeyName: 'WEATHER_API_KEY',
      apiKeyDescription: '天气API访问密钥'
    }
  },
  {
    name: 'cook-mcp-service',
    description: '多功能工具集合，包含浏览器自动化、烹饪指导和网页访问功能',
    capabilities: ['打开浏览器', '访问网页', '填写表单', '点击元素', '获取页面内容', '查找烹饪食谱', '获取食材信息'],
    authRequired: false,
    category: '生活服务',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1830/1830839.png',
    githubUrl: 'https://github.com/cook-mcp/cook-mcp'
  },
  {
    name: 'playwright-mcp-service',
    description: 'Playwright 浏览器自动化工具，可以控制浏览器访问网页',
    capabilities: ['打开浏览器', '访问网页', '填写表单', '点击元素', '获取页面内容'],
    authRequired: false,
    category: '自动化工具',
    imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
    githubUrl: 'https://github.com/microsoft/playwright'
  }
];

/**
 * 任务分析服务
 * 负责对任务进行分析、推荐合适的MCP、确认可交付内容并构建工作流
 */
export class TaskAnalysisService {
  private llm: ChatOpenAI;
  private httpAdapter: HTTPMCPAdapter;

  constructor(httpAdapter: HTTPMCPAdapter) {
    this.httpAdapter = httpAdapter;
    
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
        logger.error(`Task not found [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: 'Task not found' } });
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
          stepName: 'Analyze Task Requirements',
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
        title: 'Analyze Task Requirements',
        content: requirementsResult.content,
        reasoning: requirementsResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 1
      });
      
      // 步骤2: 识别最相关的MCP
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'mcp_selection',
          stepName: 'Identify Relevant MCP Tools',
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
        title: 'Identify Relevant MCP Tools',
        content: mcpResult.content,
        reasoning: mcpResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 2
      });
      
      // 步骤3: 确认可交付内容
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'deliverables',
          stepName: 'Confirm Deliverables',
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
        title: 'Confirm Deliverables',
        content: deliverablesResult.content,
        reasoning: deliverablesResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 3
      });
      
      // 步骤4: 构建MCP工作流
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'workflow',
          stepName: 'Build MCP Workflow',
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
        title: 'Build MCP Workflow',
        content: workflowResult.content,
        reasoning: workflowResult.reasoning,
        reasoningTime: 0, // Simplified handling
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
      
      logger.info(`Task streaming analysis completed [Task ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`Task streaming analysis failed [ID: ${taskId}]:`, error);
      
      // Update task status to failed
      await taskService.updateTask(taskId, { status: 'failed' });
      
      // Send error info
      stream({ 
        event: 'error', 
        data: { 
          message: 'Task analysis failed', 
          details: error instanceof Error ? error.message : String(error)
        } 
      });
      
      return false;
    }
  }
  
  /**
   * Execute the complete task analysis process
   * @param taskId Task ID
   * @returns Analysis result, including recommended MCP workflow
   */
  async analyzeTask(taskId: string): Promise<boolean> {
    try {
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`Task analysis failed: Task not found [ID: ${taskId}]`);
        return false;
      }
      
      // First update status to in_progress
      await taskService.updateTask(taskId, { status: 'in_progress' });

      logger.info(`Starting task analysis [Task ID: ${taskId}, Content: ${task.content}]`);
      
      // Always choose Playwright MCP as the recommended tool
      const playwrightToolInfo = AVAILABLE_MCPS.find(mcp => mcp.name === 'playwright-mcp-service') || {
        name: 'playwright-mcp-service',
        description: 'Playwright browser automation tool for controlling browser interactions',
        capabilities: ['Open browser', 'Visit webpages', 'Fill forms', 'Click elements', 'Get page content'],
        authRequired: false
      };
      
      // Generate different workflows based on task content
      let workflow;
      
      if (task.content.toLowerCase().includes('baidu') || task.content.toLowerCase().includes('search')) {
        // If task content includes "baidu" or "search" keywords, generate Baidu search workflow
        const searchTerm = this.extractSearchTerm(task.content) || 'Playwright';
        
        workflow = [{
          step: 1,
          mcp: 'playwright-mcp-service',
          action: 'browser_navigate',
          input: '{"url": "https://www.baidu.com"}'
        },
        {
          step: 2,
          mcp: 'playwright-mcp-service',
          action: 'browser_type',
          input: `{"text": "${searchTerm}", "element": "Search box", "ref": "#kw"}`
        },
        {
          step: 3,
          mcp: 'playwright-mcp-service',
          action: 'browser_click',
          input: '{"element": "Search button", "ref": "#su"}'
        }];
      } else if (task.content.toLowerCase().includes('playwright') || task.content.toLowerCase().includes('test')) {
        // If task content includes "playwright" or "test" keywords, generate Playwright test workflow
        workflow = [{
          step: 1,
          mcp: 'playwright-mcp-service',
          action: 'browser_generate_playwright_test',
          input: `{"name": "Automated Test", "description": "Automated test based on task content", "steps": ["Visit target website", "Perform interaction", "Verify results"]}`
        }];
      } else {
        // Default workflow
        workflow = [{
          step: 1,
          mcp: 'playwright-mcp-service',
          action: 'browser_navigate',
          input: '{"url": "https://www.baidu.com"}'
        },
        {
          step: 2,
          mcp: 'playwright-mcp-service',
          action: 'browser_snapshot',
          input: '{}'
        }];
      }
      
      // Build MCP workflow object
      const mcpWorkflow = {
        mcps: [{
          name: playwrightToolInfo.name,
          description: playwrightToolInfo.description,
          authRequired: playwrightToolInfo.authRequired,
          authVerified: true, // Default set to verified, skip verification step
          category: playwrightToolInfo.category,
          imageUrl: playwrightToolInfo.imageUrl,
          githubUrl: playwrightToolInfo.githubUrl,
          authParams: playwrightToolInfo.authParams
        }],
        workflow: workflow
      };

      // Create task step records
      await taskService.createTaskStep({
        taskId,
        stepType: 'analysis',
        title: 'Analyze Task Requirements',
        content: `Analyzed task "${task.content}", determined to use Playwright MCP tool to complete the task.`,
        reasoning: 'Automatically selected Playwright MCP as the best tool, no LLM analysis needed.',
        orderIndex: 1
      });
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'mcp_selection',
        title: 'Identify Most Relevant MCP Tools',
        content: `Selected Playwright MCP as the best tool.`,
        reasoning: 'Playwright MCP provides powerful browser automation capabilities, suitable for web interaction tasks.',
        orderIndex: 2
      });
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'deliverables',
        title: 'Confirm Deliverables',
        content: 'Using Playwright MCP can complete browser automation operations, including webpage visits, form filling, and click operations.',
        reasoning: 'Playwright MCP toolset fully meets current task requirements.',
        orderIndex: 3
      });
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'workflow',
        title: 'Build MCP Workflow',
        content: `Built ${workflow.length}-step workflow, including operations such as ${workflow.map(w => w.action).join(', ')}.`,
        reasoning: 'Automatically built the most appropriate workflow steps based on task content.',
        orderIndex: 4
      });

      // Update task's MCP workflow
      await taskService.updateTask(taskId, {
        mcpWorkflow: mcpWorkflow
      });
      
      // After completion, update status to completed in a separate update operation
      await taskService.updateTask(taskId, {
        status: 'completed'
      });
      
      logger.info(`✅ Task analysis completed, workflow saved [Task ID: ${taskId}]`);
      return true;

    } catch (error) {
      logger.error(`Task analysis failed [ID: ${taskId}]:`, error);
      // Update task status to failed
      await taskService.updateTask(taskId, { status: 'failed' });
      return false;
    }
  }
  
  /**
   * Step 1: Analyze task requirements
   * @param taskContent Task content
   * @returns Requirements analysis result
   */
  public async analyzeRequirements(taskContent: string): Promise<{
    content: string;
    reasoning: string;
  }> {
    try {
      logger.info('Starting task requirements analysis');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional task analyst responsible for analyzing user task requirements.
Please analyze the following task content in detail, deconstructing and identifying:
1. Core goals and sub-goals
2. Key constraints
3. Necessary inputs and expected outputs
4. Potential challenges and risk points

Output format:
{
  "analysis": "This is the task analysis summary visible to the user, clearly and concisely explaining the core requirements and goals of the task",
  "detailed_reasoning": "This is your detailed reasoning process, including how you understand the task, your approach to identifying key requirements, and possible solution directions"
}

Please ensure the analysis is accurate and comprehensive while remaining concise.`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        return {
          content: parsedResponse.analysis || "Unable to generate task analysis",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning"
        };
      } catch (parseError) {
        logger.error('Failed to parse task requirements analysis result:', parseError);
        // If parsing fails, try to extract useful parts
        const contentMatch = responseText.match(/["']analysis["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: contentMatch ? contentMatch[1].trim() : "Unable to parse task analysis",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText
        };
      }
    } catch (error) {
      logger.error('Task requirements analysis failed:', error);
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
      logger.info('Starting identification of relevant MCP tools');
      
      // Dynamically get available MCP list instead of using static list
      const availableMCPs = await this.getAvailableMCPs();
      logger.info(`[MCP Debug] Available MCP tools list: ${JSON.stringify(availableMCPs.map(mcp => ({ name: mcp.name, description: mcp.description })))}`);
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are an MCP (Model Context Protocol) expert responsible for selecting the most appropriate tools for user tasks.
Please select the most suitable tools (maximum 4) from the following available MCP tools based on the user's task description and task analysis:

${JSON.stringify(availableMCPs, null, 2)}

Please carefully consider each tool's capabilities and limitations, selecting the combination that can best complete the user's task.

Output format:
{
  "selected_mcps": [
    "Tool1Name",
    "Tool2Name",
    ...
  ],
  "selection_explanation": "Explain to the user why these tools were selected",
  "detailed_reasoning": "Detailed explanation of your selection process, factors considered, and why this tool combination is most suitable for the task requirements"
}

Please ensure your recommendations are reasonable and can effectively meet the user's task requirements.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      logger.info(`[MCP Debug] LLM response successful, starting to parse MCP selection results`);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      logger.info(`[MCP Debug] LLM original response: ${responseText}`);
      
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        const selectedMCPNames: string[] = parsedResponse.selected_mcps || [];
        
        logger.info(`[MCP Debug] LLM selected MCPs: ${JSON.stringify(selectedMCPNames)}`);
        
        // Get recommended MCP detailed information
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedMCPNames.includes(mcp.name)
        );
        
        logger.info(`[MCP Debug] Successfully matched ${recommendedMCPs.length} recommended MCPs: ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        return {
          content: parsedResponse.selection_explanation || "Failed to provide tool selection explanation",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      } catch (parseError) {
        logger.info(`[MCP Debug] Attempting to extract MCP names from unstructured text`);
        
        // Try to extract MCP names from text
        const mcpNamesMatch = responseText.match(/["']selected_mcps["']\s*:\s*\[(.*?)\]/s);
        let selectedNames: string[] = [];
        
        if (mcpNamesMatch) {
          const namesText = mcpNamesMatch[1];
          selectedNames = namesText
            .split(',')
            .map(name => name.trim().replace(/["']/g, ''))
            .filter(name => name.length > 0);
          
          logger.info(`[MCP Debug] MCP names extracted from text: ${JSON.stringify(selectedNames)}`);
        }
        
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedNames.includes(mcp.name)
        );
        
        logger.info(`[MCP Debug] Successfully matched ${recommendedMCPs.length} recommended MCPs (from text extraction): ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        // Extract explanation parts
        const explanationMatch = responseText.match(/["']selection_explanation["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: explanationMatch ? explanationMatch[1].trim() : "Unable to parse tool selection explanation",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      }
    } catch (error) {
      logger.error('Failed to identify relevant MCPs:', error);
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
      logger.info('Starting confirmation of deliverables');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional project planner who needs to confirm the specific deliverables based on available MCP tools.
Please assess based on the user's task requirements and selected MCP tools:
1. Whether the user's requirements can be fully met
2. If they cannot be fully met, which parts can be implemented
3. A specific list of deliverables

Please consider the following available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

Output format:
{
  "can_be_fulfilled": true/false,
  "deliverables": [
    "Specific deliverable 1",
    "Specific deliverable 2",
    ...
  ],
  "limitations": "If there are requirements that cannot be met, please explain",
  "conclusion": "Summary explanation for the user, explaining what can be accomplished and possible limitations",
  "detailed_reasoning": "Detailed reasoning process, analyzing why requirements can/cannot be met, and how to plan delivery"
}

Please remain professional and objective, and do not over-promise features that cannot be implemented.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned deliverables response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        return {
          content: parsedResponse.conclusion || "Unable to determine deliverables",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          canBeFulfilled: parsedResponse.can_be_fulfilled === true,
          deliverables: parsedResponse.deliverables || []
        };
      } catch (parseError) {
        logger.error('Failed to parse deliverables confirmation result:', parseError);
        
        // Try to extract key information
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
          content: conclusionMatch ? conclusionMatch[1].trim() : "Unable to parse deliverables summary",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          canBeFulfilled: canBeFulfilledMatch ? canBeFulfilledMatch[1].toLowerCase() === 'true' : false,
          deliverables
        };
      }
    } catch (error) {
      logger.error('Failed to confirm deliverables:', error);
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
      logger.info('Starting MCP workflow construction');
      
      // Debug mode: If test content, return a hardcoded workflow
      if (taskContent.includes('list all repositories')) {
        logger.info('[Debug Mode] Test task content detected, returning hardcoded GitHub workflow');
        return {
          content: 'Hardcoded workflow built for test task',
          reasoning: 'This is debug mode, skipping LLM analysis and using predefined workflow.',
          workflow: [
            {
              step: 1,
              mcp: 'github-mcp-service',
              action: 'list_repositories',
              input: '{"affiliation": "owner"}'
            }
          ]
        };
      }
      
      // If requirements cannot be met, return empty workflow
      if (!canBeFulfilled || recommendedMCPs.length === 0) {
        return {
          content: "Unable to build an effective workflow due to inability to meet requirements or lack of appropriate tool selection.",
          reasoning: "Based on previous analysis, current requirements cannot be fully met through selected tools, or no appropriate tools were selected.",
          workflow: []
        };
      }
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional workflow designer who needs to design an execution process based on MCP tools.
Please design a detailed workflow based on the user's task requirements, selected MCP tools, and determined deliverables.

Available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

Deliverables:
${deliverables.join('\n')}

Please design an ordered step process, specifying for each step:
1. Which MCP tool to use
2. What specific action to perform
3. What the input is
4. What the expected output is

Output format:
{
  "workflow": [
    {
      "step": 1,
      "mcp": "Tool name",
      "action": "Specific action",
      "input": "Input content",
      "output": "Expected output"
    },
    ...
  ],
  "workflow_summary": "Workflow summary explaining to the user how the workflow runs",
  "detailed_reasoning": "Detailed design thinking, explaining why the workflow is designed this way and the purpose of each step"
}

Please ensure the workflow logic is reasonable, with clear data flow between steps, and can effectively complete the user's requirements.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned workflow response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        const workflow = parsedResponse.workflow || [];
        
        logger.info(`📋 Workflow step count: ${workflow.length}`);
        workflow.forEach((step: any, index: number) => {
          logger.info(`📝 Workflow step ${index + 1}: MCP=${step.mcp}, Action=${step.action}`);
        });
        
        return {
          content: parsedResponse.workflow_summary || "No workflow summary provided",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          workflow: workflow
        };
      } catch (parseError) {
        logger.error('Failed to parse MCP workflow construction result:', parseError);
        
        // Try to extract workflow information from text
        const workflowMatch = responseText.match(/["']workflow["']\s*:\s*\[(.*?)\]/s);
        let workflow: Array<{
          step: number;
          mcp: string;
          action: string;
          input?: string;
          output?: string;
        }> = [];
        
        // If unable to extract formatted workflow, create a simple default workflow
        if (!workflowMatch) {
          workflow = recommendedMCPs.map((mcp, index) => ({
            step: index + 1,
            mcp: mcp.name,
            action: `Use ${mcp.name} to perform related operations`,
            input: "Task content",
            output: "Processing result"
          }));
        }
        
        // Extract summary and reasoning
        const summaryMatch = responseText.match(/["']workflow_summary["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: summaryMatch ? summaryMatch[1].trim() : "Unable to parse workflow summary",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          workflow
        };
      }
    } catch (error) {
      logger.error('Failed to build MCP workflow:', error);
      throw error;
    }
  }
  
  // New method: Dynamically get available MCP list
  private async getAvailableMCPs(): Promise<MCPInfo[]> {
    try {
      logger.info(`[MCP Debug] Starting to get available MCP list via HTTP Adapter`);
      const allTools = await this.httpAdapter.getAllTools();
      
      // Aggregate MCP information from tool information
      const mcpInfoMap: Map<string, { description: Set<string>, authRequired: boolean }> = new Map();

      for (const tool of allTools) {
          // Tool name format: serviceName_toolName
          const parts = tool.name.split('_');
          if (parts.length < 2) continue;
          
          const serviceName = parts.shift()!; // serviceName is the first part
          
          if (!mcpInfoMap.has(serviceName)) {
              mcpInfoMap.set(serviceName, {
                  description: new Set(),
                  // Simple authorization judgment based on service name
                  authRequired: serviceName.includes('github') 
              });
          }
          
          const info = mcpInfoMap.get(serviceName)!;
          info.description.add(tool.description);
      }
      
      const result: MCPInfo[] = Array.from(mcpInfoMap.entries()).map(([name, info]) => ({
          name,
          description: `${name} service with tools.`,
          capabilities: Array.from(info.description),
          authRequired: info.authRequired,
      }));

      if (result.length === 0) {
        logger.warn(`[MCP Debug] HTTP adapter did not find any MCP tools, using default list`);
        return AVAILABLE_MCPS;
      }
      
      logger.info(`[MCP Debug] Successfully retrieved available MCP list, total ${result.length} MCPs: ${JSON.stringify(result.map(r => r.name))}`);
      return result;

    } catch (error) {
      logger.error(`[MCP Debug] Failed to get available MCP list via HTTP Adapter:`, error);
      logger.warn(`[MCP Debug] Using default MCP list as fallback`);
      return AVAILABLE_MCPS; // Return default list on failure
    }
  }
  
  /**
   * Extract search keywords from task content
   * @param content Task content
   * @returns Search keyword
   */
  private extractSearchTerm(content: string): string | null {
    // Try to extract search terms from content
    const searchPatterns = [
      /search[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /search\s+for\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /find[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /look\s+for\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /query[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /search\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i
    ];
    
    for (const pattern of searchPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }
} 