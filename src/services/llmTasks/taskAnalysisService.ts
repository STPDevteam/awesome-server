import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { 
  PromptTemplate, 
  ChatPromptTemplate
} from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { getTaskService } from '../taskService.js';
import { TaskStep, TaskStepType } from '../../models/task.js';
import { HTTPMCPAdapter } from '../httpMcpAdapter.js';
import { MCPInfo } from '../../models/mcp.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getAllPredefinedMCPs } from '../predefinedMCPs.js';
import { MCPService } from '../mcpManager.js';
import { messageDao } from '../../dao/messageDao.js';
import { MessageType, MessageIntent, MessageStepType } from '../../models/conversation.js';
import { conversationDao } from '../../dao/conversationDao.js';
import { MCPAuthService } from '../mcpAuthService.js';
// 删除了智能工作流引擎导入，分析阶段不需要

// 🎛️ 智能工作流全局开关 - 设置为false可快速回退到原有流程
const ENABLE_INTELLIGENT_WORKFLOW = true;

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * 将MCPService转换为MCPInfo
 * @param mcpService MCPService对象
 * @returns MCPInfo对象
 */
function convertMCPServiceToMCPInfo(mcpService: MCPService): MCPInfo {
  return {
    name: mcpService.name,
    description: mcpService.description,
    authRequired: mcpService.authRequired ?? false,
    category: mcpService.category,
    imageUrl: mcpService.imageUrl,
    githubUrl: mcpService.githubUrl,
    authParams: mcpService.authParams
  };
}

/**
 * 任务分析服务
 * 负责对任务进行分析、推荐合适的MCP、确认可交付内容并构建工作流
 */
export class TaskAnalysisService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;
  
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: process.env.TASK_ANALYSIS_MODEL || 'gpt-4o',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
      timeout: 15000, // 15秒超时
      maxRetries: 1 // 最多重试1次
    });
    this.mcpAuthService = new MCPAuthService();
  }

  /**
   * 增强 MCP 信息，添加用户的认证状态（包括 saveAuth 字段）
   */
  private async enhanceMCPWithUserAuth(mcp: any, userId: string): Promise<any> {
    if (!mcp.authRequired) {
      // 不需要认证的 MCP，直接返回并设置默认值
      return {
        ...mcp,
        authVerified: true,
        saveAuth: true
      };
    }

    try {
      // 获取用户的认证信息
      const authData = await this.mcpAuthService.getUserMCPAuth(userId, mcp.name);
      return {
        ...mcp,
        authVerified: authData ? authData.isVerified : false,
        saveAuth: authData ? authData.saveAuth : true // 默认为 true
      };
    } catch (error) {
      logger.error(`Failed to get auth data for MCP ${mcp.name} and user ${userId}:`, error);
      return {
        ...mcp,
        authVerified: false,
        saveAuth: true
      };
    }
  }

  /**
   * 批量增强 MCP 列表，添加用户的认证状态
   */
  private async enhanceMCPListWithUserAuth(mcps: any[], userId: string): Promise<any[]> {
    return Promise.all(mcps.map(mcp => this.enhanceMCPWithUserAuth(mcp, userId)));
  }
  
  /**
   * 执行任务的流式分析流程
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送分析结果
   * @param useIntelligentWorkflow 是否使用智能工作流引擎（可选，默认false）
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
      
      // 获取会话ID用于存储消息
      const conversationId = task.conversationId;
      if (!conversationId) {
        logger.warn(`Task ${taskId} has no associated conversation, messages will not be stored`);
      }
      
      // 分析阶段始终使用传统的 4 步分析流程
      // 智能工作流引擎只在执行阶段使用
      
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
      
      // 创建步骤1的流式消息
      let step1MessageId: string | undefined;
      if (conversationId) {
        const step1Message = await messageDao.createStreamingMessage({
          conversationId,
          content: 'Analyzing task requirements...',
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.ANALYSIS,
            stepNumber: 1,
            stepName: 'Analyze Task Requirements',
            totalSteps: 4,
            taskPhase: 'analysis'
          }
        });
        step1MessageId = step1Message.id;
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      // 这里使用常规的analyzeRequirements方法，而不是流式方法
      // 因为我们需要确保后续步骤能正常使用结构化的结果
      const requirementsResult = await this.analyzeRequirements(task.content);
      
      // 完成步骤1消息
      if (step1MessageId) {
        await messageDao.completeStreamingMessage(step1MessageId, requirementsResult.content);
      }
      
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
      
      // 创建步骤2的流式消息
      let step2MessageId: string | undefined;
      if (conversationId) {
        const step2Message = await messageDao.createStreamingMessage({
          conversationId,
          content: 'Identifying relevant MCP tools...',
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.MCP_SELECTION,
            stepNumber: 2,
            stepName: 'Identify Relevant MCP Tools',
            totalSteps: 4,
            taskPhase: 'analysis'
          }
        });
        step2MessageId = step2Message.id;
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      // 常规处理，不是流式方法
      const mcpResult = await this.identifyRelevantMCPs(
        task.content, 
        requirementsResult.content
      );
      
      // 完成步骤2消息
      if (step2MessageId) {
        await messageDao.completeStreamingMessage(step2MessageId, mcpResult.content);
      }
      
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
      
      // 创建步骤3的流式消息
      let step3MessageId: string | undefined;
      if (conversationId) {
        const step3Message = await messageDao.createStreamingMessage({
          conversationId,
          content: 'Confirming deliverables...',
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.DELIVERABLES,
            stepNumber: 3,
            stepName: 'Confirm Deliverables',
            totalSteps: 4,
            taskPhase: 'analysis'
          }
        });
        step3MessageId = step3Message.id;
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      // 常规处理，不是流式方法
      const deliverablesResult = await this.confirmDeliverables(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs
      );
      
      // 完成步骤3消息
      if (step3MessageId) {
        await messageDao.completeStreamingMessage(step3MessageId, deliverablesResult.content);
      }
      
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
      
      // 创建步骤4的流式消息
      let step4MessageId: string | undefined;
      if (conversationId) {
        const step4Message = await messageDao.createStreamingMessage({
          conversationId,
          content: 'Building MCP workflow...',
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.WORKFLOW,
            stepNumber: 4,
            stepName: 'Build MCP Workflow',
            totalSteps: 4,
            taskPhase: 'analysis'
          }
        });
        step4MessageId = step4Message.id;
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      // 常规处理，不是流式方法
      const workflowResult = await this.buildMCPWorkflow(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs,
        deliverablesResult.canBeFulfilled,
        deliverablesResult.deliverables
      );
      
      // 完成步骤4消息
      if (step4MessageId) {
        await messageDao.completeStreamingMessage(step4MessageId, workflowResult.content);
      }
      
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
      
      // 更新任务的MCP工作流信息（数据库存储用），包含用户认证状态
      const mcpWorkflowForDB = await Promise.all(
        mcpResult.recommendedMCPs.map(async mcp => {
          const enhancedMcp = await this.enhanceMCPWithUserAuth({
            name: mcp.name,
            description: mcp.description,
            authRequired: mcp.authRequired,
            ...(mcp.category ? { category: mcp.category } : {}),
            ...(mcp.imageUrl ? { imageUrl: mcp.imageUrl } : {}),
            ...(mcp.githubUrl ? { githubUrl: mcp.githubUrl } : {}),
            ...(mcp.authParams ? { authParams: mcp.authParams } : {})
          }, task.userId);
          
          // 数据库中存储简化的备选MCP信息（只存储名称，完整信息在返回前端时构建）
          if (mcp.alternatives && mcp.alternatives.length > 0) {
            enhancedMcp.alternatives = mcp.alternatives;
          }
          
          return enhancedMcp;
        })
      );

      const mcpWorkflow = {
        mcps: mcpWorkflowForDB,
        workflow: workflowResult.workflow
      };
      
      // 获取所有可用的MCP信息用于构建完整的备选列表
      const allAvailableMCPs = await this.getAvailableMCPs();
      
      // 为前端准备完整的mcpWorkflow数据，包含用户认证状态
      const enhancedMCPs = await Promise.all(
        mcpResult.recommendedMCPs.map(async mcp => {
          // 增强主 MCP 信息
          const enhancedMcp = await this.enhanceMCPWithUserAuth({
            name: mcp.name,
            description: mcp.description,
            authRequired: mcp.authRequired,
            category: mcp.category,
            imageUrl: mcp.imageUrl,
            githubUrl: mcp.githubUrl,
            ...(mcp.authRequired && mcp.authParams ? { authParams: mcp.authParams } : {})
          }, task.userId);

          // 如果有备选 MCP，也要增强它们
          if (mcp.alternatives && mcp.alternatives.length > 0) {
            const enhancedAlternatives = await Promise.all(
              mcp.alternatives.map(async (altName: string) => {
                const altMcp = allAvailableMCPs.find(availableMcp => availableMcp.name === altName);
                if (altMcp) {
                  return await this.enhanceMCPWithUserAuth({
                    name: altMcp.name,
                    description: altMcp.description,
                    authRequired: altMcp.authRequired,
                    category: altMcp.category,
                    imageUrl: altMcp.imageUrl,
                    githubUrl: altMcp.githubUrl,
                    ...(altMcp.authRequired && altMcp.authParams ? { authParams: altMcp.authParams } : {})
                  }, task.userId);
                } else {
                  return {
                    name: altName,
                    description: 'Alternative MCP tool',
                    authRequired: false,
                    authVerified: true,
                    saveAuth: true,
                    category: 'Unknown'
                  };
                }
              })
            );
            enhancedMcp.alternatives = enhancedAlternatives;
          }

          return enhancedMcp;
        })
      );

      const optimizedWorkflow = {
        mcps: enhancedMCPs,
        workflow: workflowResult.workflow
      };
      
      // 先将工作流和最终状态合并更新，确保原子性
      await taskService.updateTask(taskId, {
        mcpWorkflow,
        status: 'completed'
      });
      
      // 创建分析完成的总结消息
      if (conversationId) {
        const summaryMessage = await messageDao.createMessage({
          conversationId,
          content: `Task analysis completed. Identified ${mcpResult.recommendedMCPs.length} relevant tools and built ${workflowResult.workflow.length} execution steps.`,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.SUMMARY,
            stepName: 'Analysis Complete',
            taskPhase: 'analysis',
            isComplete: true
          }
        });
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      // 发送分析完成信息
      stream({ 
        event: 'analysis_complete', 
        data: { 
          taskId,
          mcpWorkflow: optimizedWorkflow,
          // 添加元信息
          metadata: {
            totalSteps: workflowResult.workflow.length,
            requiresAuth: mcpResult.recommendedMCPs.some(mcp => mcp.authRequired),
            mcpsRequiringAuth: mcpResult.recommendedMCPs
              .filter(mcp => mcp.authRequired)
              .map(mcp => mcp.name)
          }
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
   * Step 1: Analyze task requirements - 使用LangChain增强
   * @param taskContent Task content
   * @returns Requirements analysis result
   */
  public async analyzeRequirements(taskContent: string): Promise<{
    content: string;
    reasoning: string;
  }> {
    // 如果没有OpenAI API Key，直接使用简单的分析
    if (!process.env.OPENAI_API_KEY) {
      logger.info('No OpenAI API Key, using simple analysis');
      return {
        content: `Task Analysis: ${taskContent}`,
        reasoning: `This is a task about "${taskContent}". The system will attempt to find suitable tools to complete it.`
      };
    }
    
    try {
      logger.info('[LangChain] Starting task requirements analysis with structured prompts');
      
      // 创建一个带超时的Promise包装器
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Requirements analysis timeout')), timeoutMs);
          })
        ]);
      };
      
      // LLM分析逻辑
      const analysisLogic = async () => {
        // 使用LangChain的ChatPromptTemplate
        const analysisPrompt = ChatPromptTemplate.fromMessages([
          ['system', `You are a professional task analyst responsible for analyzing user task requirements.
Please analyze the following task content in detail, deconstructing and identifying:
1. Core goals and sub-goals
2. Key constraints
3. Necessary inputs and expected outputs
4. Potential challenges and risk points

You must output valid JSON with the following structure:
{format_instructions}`],
          ['human', '{taskContent}']
        ]);
        
        // 使用JsonOutputParser
        const outputParser = new JsonOutputParser();
        
        // 创建prompt with format instructions
        const formattedPrompt = await analysisPrompt.formatMessages({
          taskContent,
          format_instructions: JSON.stringify({
            analysis: "Task analysis summary for user (string)",
            detailed_reasoning: "Detailed reasoning process (string)"
          }, null, 2)
        });
        
        // 调用LLM并解析
        logger.info('[LangChain] Invoking LLM for requirements analysis');
        const response = await this.llm.invoke(formattedPrompt);
        logger.info('[LangChain] LLM response received, parsing...');
        
        try {
          // 使用JsonOutputParser解析响应
          const parsedResponse = await outputParser.parse(response.content.toString());
          
          logger.info('[LangChain] Successfully parsed requirements analysis');
          
          return {
            content: parsedResponse.analysis || "Unable to generate task analysis",
            reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning"
          };
        } catch (parseError) {
          logger.error('[LangChain] Failed to parse with JsonOutputParser, using fallback:', parseError);
          
          // 降级到正则匹配
          const responseText = response.content.toString();
          const contentMatch = responseText.match(/["']analysis["']\s*:\s*["'](.+?)["']/s);
          const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
          
          return {
            content: contentMatch ? contentMatch[1].trim() : "Unable to parse task analysis",
            reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText
          };
        }
      };
      
      // 使用超时包装器执行分析（8秒超时）
      const result = await withTimeout(analysisLogic(), 8000);
      logger.info('[LangChain] Requirements analysis completed successfully');
      return result;
      
    } catch (error) {
      logger.error('[LangChain] Task requirements analysis failed:', error);
      
      // 降级处理：如果LLM分析失败，使用基本分析
      logger.info('Using fallback analysis due to LLM failure');
      return {
        content: `Basic Task Analysis: ${taskContent}. The system will attempt to find suitable tools based on content keywords.`,
        reasoning: `Due to LLM analysis failure (${error instanceof Error ? error.message : 'Unknown error'}), using fallback analysis. Task content is "${taskContent}", will select appropriate MCP tools based on keyword matching.`
      };
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
      
      // Group MCPs by category for better LLM understanding and selection
      const mcpsByCategory = availableMCPs.reduce((acc, mcp) => {
        const category = mcp.category || 'Other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push({
          name: mcp.name,
          description: mcp.description
        });
        return acc;
      }, {} as Record<string, any[]>);

      // 使用重试机制
      let attemptCount = 0;
      const maxAttempts = 2;
      
      while (attemptCount < maxAttempts) {
        attemptCount++;
        
        try {
          const response = await this.llm.invoke([
            new SystemMessage(`You are an MCP tool selector. Your responsibility is to analyze the user's task and select the most appropriate MCP tool(s) needed to complete it, along with suitable alternative tools if they exist.

SELECTION PRINCIPLES:
✅ Choose tools that are DIRECTLY required for the task
✅ Be selective - only choose what is actually needed
✅ Consider the core functionality required
✅ For each selected tool, identify alternative tools ONLY if they can provide similar functionality
✅ Alternatives should be genuinely capable of serving the same purpose
✅ If no suitable alternatives exist for a tool, leave the alternatives array empty
❌ Do NOT select extra tools "just in case"
❌ Do NOT force alternatives if none are truly suitable
❌ Do NOT select tools based on loose associations

**Current task**: "${taskContent}"

Available MCP tools by category:
${JSON.stringify(availableMCPs.reduce((acc, mcp) => {
  const category = mcp.category || 'Other';
  if (!acc[category]) acc[category] = [];
  acc[category].push({ name: mcp.name, description: mcp.description });
  return acc;
}, {} as Record<string, any[]>), null, 2)}

**ALTERNATIVE IDENTIFICATION GUIDELINES**:
- Only suggest alternatives that can perform the same core function
- For cryptocurrency data: Other crypto data providers are valid alternatives
- For web automation: Other browser/web tools are valid alternatives
- For specific APIs: Only tools accessing the same or equivalent APIs are alternatives
- When in doubt, it's better to have no alternatives than wrong alternatives

Analyze the task and respond with valid JSON in this exact structure:
{
  "selected_mcps": [
    {
      "name": "primary_tool_name",
      "alternatives": []
    }
  ],
  "selection_explanation": "Brief explanation of why these tools were selected",
  "detailed_reasoning": "Detailed explanation of the selection logic and how these tools address the task requirements"
}`),
             new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
             new HumanMessage(`User task: ${taskContent}`)
          ]);
          
          logger.info(`[MCP Debug] LLM response successful (attempt ${attemptCount}), starting to parse MCP selection results`);
          
          // Parse the returned JSON
          const responseText = response.content.toString();
          logger.info(`[MCP Debug] LLM original response: ${responseText}`);
          
          // Clean possible Markdown formatting
          const cleanedText = responseText
            .replace(/```json\s*/g, '')
            .replace(/```\s*$/g, '')
            .trim();
          
          logger.info(`[MCP Debug] Cleaned response: ${cleanedText}`);
          
          const parsedResponse = JSON.parse(cleanedText);
          const selectedMCPsWithAlternatives = parsedResponse.selected_mcps || [];
          
          logger.info(`[MCP Debug] Selected MCPs with alternatives: ${JSON.stringify(selectedMCPsWithAlternatives)}`);
          
          // Process the new structure with alternatives
          const recommendedMCPs: MCPInfo[] = [];
          
          for (const mcpSelection of selectedMCPsWithAlternatives) {
            // Handle both old format (string) and new format (object with alternatives)
            let primaryMcpName: string;
            let alternatives: string[] = [];
            
            if (typeof mcpSelection === 'string') {
              // Backward compatibility: old format without alternatives
              primaryMcpName = mcpSelection;
            } else if (mcpSelection.name) {
              // New format with alternatives
              primaryMcpName = mcpSelection.name;
              alternatives = mcpSelection.alternatives || [];
          } else {
              logger.warn(`[MCP Debug] Invalid MCP selection format: ${JSON.stringify(mcpSelection)}`);
              continue;
            }
            
            // Find the primary MCP
            const primaryMcp = availableMCPs.find(mcp => mcp.name === primaryMcpName);
            if (primaryMcp) {
              // Add alternatives to the MCP info
              const mcpWithAlternatives = {
                ...primaryMcp,
                alternatives: alternatives.filter(altName => 
                  availableMCPs.some(mcp => mcp.name === altName)
                )
              };
              
              recommendedMCPs.push(mcpWithAlternatives);
              
              logger.info(`[MCP Debug] Added MCP ${primaryMcpName} with ${mcpWithAlternatives.alternatives.length} alternatives: ${JSON.stringify(mcpWithAlternatives.alternatives)}`);
            } else {
              logger.warn(`[MCP Debug] Primary MCP not found: ${primaryMcpName}`);
            }
          }
          
          logger.info(`[MCP Debug] Successfully processed ${recommendedMCPs.length} recommended MCPs with alternatives`);
          
          return {
            content: parsedResponse.selection_explanation || "Failed to provide tool selection explanation",
            reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
            recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
          };
          
        } catch (parseError) {
          logger.warn(`[MCP Debug] Attempt ${attemptCount} failed: ${parseError}`);
          
          if (attemptCount >= maxAttempts) {
            // 如果所有尝试都失败，抛出错误
            logger.info(`[MCP Debug] All LLM attempts failed, no fallback available`);
            throw parseError;
          }
          
          // 等待一小段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 不应该到达这里
      throw new Error('Unexpected error in MCP selection');
      
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

IMPORTANT: Always respond with VALID JSON format only, no additional text or explanations outside the JSON structure.

**CRITICAL INSTRUCTION**: Be POSITIVE and CONSTRUCTIVE. Even if the task cannot be 100% fulfilled, focus on what CAN be accomplished with available tools.

**APPROACH**: 
- Instead of saying "cannot be fulfilled", say "can be partially fulfilled" or "can be fulfilled with available data"
- Focus on what IS possible with the available tools
- Be generous in interpreting what can be accomplished
- Consider partial solutions and alternative approaches

Please assess based on the user's task requirements and selected MCP tools:
1. What parts of the requirements CAN be met (be generous in interpretation)
2. What valuable deliverables can be provided
3. Focus on the POSITIVE outcomes possible

Available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

MUST respond in exactly this JSON format (no extra text):
{
  "can_be_fulfilled": true,
  "deliverables": [
    "Specific deliverable 1",
    "Specific deliverable 2"
  ],
  "limitations": "If there are any limitations, explain here (but focus on what IS possible)",
  "conclusion": "Positive summary of what will be accomplished",
  "detailed_reasoning": "Detailed reasoning focusing on capabilities and positive outcomes"
}`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting and extract JSON
        let cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        // 如果响应不是以{开头，尝试提取JSON部分
        if (!cleanedText.startsWith('{')) {
          const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleanedText = jsonMatch[0];
          }
        }
        
        // 修复常见的JSON格式问题
        cleanedText = this.fixMalformedJSON(cleanedText);
        
        logger.info(`[MCP Debug] Cleaned deliverables response: ${cleanedText.substring(0, 500)}...`);
        
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
      input?: any;
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
              input: { "affiliation": "owner" }
            }
          ]
        };
      }
      
      // 即使需求无法完全满足，也要尝试构建基本工作流
      if (recommendedMCPs.length === 0) {
        return {
          content: "Unable to build an effective workflow due to lack of appropriate tool selection.",
          reasoning: "No appropriate tools were selected for this task.",
          workflow: []
        };
      }
      
      // 优化提示词，采用与identifyRelevantMCPs相似的清晰风格
      const response = await this.llm.invoke([
        new SystemMessage(`You are an MCP workflow designer. Your responsibility is to create an execution workflow based on selected MCP tools and task requirements.

WORKFLOW PRINCIPLES:
✅ Create practical workflows that maximize value with available tools
✅ Focus on what CAN be accomplished rather than limitations
✅ Use clear, natural language descriptions for actions
✅ Design logical step sequences with proper data flow
❌ Do NOT include authentication details (API keys, tokens) in workflow input
❌ Do NOT create workflows that cannot be executed with available tools

**Current task**: "${taskContent}"
**Requirements analysis**: ${requirementsAnalysis}
**Can be fully fulfilled**: ${canBeFulfilled}
**Available deliverables**: ${deliverables.join(', ') || 'Limited functionality available'}

**Available MCP tools**:
${JSON.stringify(recommendedMCPs.map(mcp => ({
  name: mcp.name,
  description: mcp.description
})), null, 2)}

Design a workflow that accomplishes the maximum possible with these tools and respond with valid JSON in this exact structure:
{
  "workflow": [
    {
      "step": 1,
      "mcp": "MCP service name",
      "action": "Task objective description in natural language",
      "input": {actual parameters only, no auth}
    }
  ],
  "workflow_summary": "Brief explanation of how the workflow accomplishes the task",
  "detailed_reasoning": "Detailed explanation of the workflow design logic and purpose of each step"
}`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      let jsonText = responseText.trim();
      
      try {
        // 优先从Markdown代码块中提取JSON
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonText = jsonMatch[1].trim();
          logger.info(`[MCP Debug] Extracted JSON from markdown block.`);
        } else {
          // 如果没有markdown块，尝试找到第一个和最后一个大括号来提取JSON对象
          const firstBrace = responseText.indexOf('{');
          const lastBrace = responseText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonText = responseText.substring(firstBrace, lastBrace + 1).trim();
            logger.info(`[MCP Debug] Extracted JSON by finding first and last braces.`);
          }
        }

        logger.info(`[MCP Debug] Attempting to parse cleaned JSON: ${jsonText.substring(0, 500)}...`);
        const parsedResponse = JSON.parse(jsonText);
        
        let workflow = parsedResponse.workflow || [];

        // 如果工作流仍然为空，创建一个基本的默认工作流
        if (workflow.length === 0 && recommendedMCPs.length > 0) {
          logger.warn(`[MCP Debug] LLM returned empty workflow, creating default workflow`);

          // 根据MCP类型创建基本工作流
          const primaryMcp = recommendedMCPs[0];
          let defaultAction = "Execute task using available tools and capabilities";
          let defaultInput: any = {};

          // 根据任务内容创建更具体的默认工作流
          const taskLower = taskContent.toLowerCase();
          if (taskLower.includes('price') || taskLower.includes('market') || taskLower.includes('币价')) {
            defaultAction = "get current market data and pricing information";
          } else if (taskLower.includes('analysis') || taskLower.includes('analyze') || taskLower.includes('分析')) {
            defaultAction = "analyze available data and provide insights";
          } else if (taskLower.includes('search') || taskLower.includes('find') || taskLower.includes('查找')) {
            defaultAction = "search and retrieve relevant information";
          } else if (taskLower.includes('get') || taskLower.includes('fetch') || taskLower.includes('获取')) {
            defaultAction = "retrieve requested information and data";
          } else {
            defaultAction = "process task using available tools and provide results";
          }

          workflow = [{
            step: 1,
            mcp: primaryMcp.name,
            action: defaultAction,
            input: defaultInput
          }];

          logger.info(`[MCP Debug] Created default workflow: ${JSON.stringify(workflow, null, 2)}`);
        }
        
        logger.info(`📋 Workflow step count: ${workflow.length}`);
        workflow.forEach((step: any, index: number) => {
          logger.info(`📝 Workflow step ${index + 1}: MCP=${step.mcp}, Action=${step.action}`);
        });
        
        return {
          content: parsedResponse.workflow_summary || "Workflow created to accomplish available tasks",
          reasoning: parsedResponse.detailed_reasoning || "Created workflow based on available tools and capabilities",
          workflow: workflow
        };
      } catch (parseError) {
        logger.error('Failed to parse MCP workflow construction result:', parseError);
        logger.error('Problematic JSON text:', jsonText);
        
        // 最后的后备方案：创建基本工作流
        let workflow: Array<{
          step: number;
          mcp: string;
          action: string;
          input?: any;
        }> = [];

        if (recommendedMCPs.length > 0) {
          const primaryMcp = recommendedMCPs[0];
          let fallbackAction = "Execute task using available tools and capabilities";
          let fallbackInput: any = {};

          // 根据任务内容创建更合适的后备工作流
          const taskLower = taskContent.toLowerCase();
          if (taskLower.includes('price') || taskLower.includes('market') || taskLower.includes('币价')) {
            fallbackAction = "get current market data and pricing information";
          } else if (taskLower.includes('analysis') || taskLower.includes('analyze') || taskLower.includes('分析')) {
            fallbackAction = "analyze available data and provide insights";
          } else if (taskLower.includes('search') || taskLower.includes('find') || taskLower.includes('查找')) {
            fallbackAction = "search and retrieve relevant information";
          } else {
            fallbackAction = "process task using available tools and provide results";
          }

          workflow = [{
            step: 1,
            mcp: primaryMcp.name,
            action: fallbackAction,
            input: fallbackInput
          }];

          logger.info(`[MCP Debug] Created fallback workflow due to parsing error: ${JSON.stringify(workflow, null, 2)}`);
        }
        
        return {
          content: "Workflow created with fallback parsing due to technical issues",
          reasoning: "Used fallback workflow generation due to parsing issues, but created a basic workflow to accomplish available tasks",
          workflow
        };
      }
    } catch (error) {
      logger.error('Failed to build MCP workflow:', error);

      // 最终的错误处理：即使出错也要尝试创建基本工作流
      if (recommendedMCPs.length > 0) {
        const basicWorkflow = [{
          step: 1,
          mcp: recommendedMCPs[0].name,
          action: "Execute task using available tools and capabilities",
          input: {}
        }];

        logger.info(`[MCP Debug] Created emergency fallback workflow: ${JSON.stringify(basicWorkflow, null, 2)}`);

        return {
          content: "Emergency workflow created due to technical issues",
          reasoning: "Created basic workflow as fallback due to system error",
          workflow: basicWorkflow
        };
      }

      throw error;
    }
  }
  
  // New method: Dynamically get available MCP list
  private async getAvailableMCPs(): Promise<MCPInfo[]> {
    try {
      logger.info(`[MCP Debug] Starting to get available MCP list from predefined MCPs`);
      
      // 从predefinedMCPs获取所有MCP服务并转换为MCPInfo格式
      const predefinedMCPServices = getAllPredefinedMCPs();
      const availableMCPs = predefinedMCPServices.map(mcpService => 
        convertMCPServiceToMCPInfo(mcpService)
      );
      
      logger.info(`[MCP Debug] Successfully retrieved available MCP list from predefined MCPs, total ${availableMCPs.length} MCPs`);
      logger.info(`[MCP Debug] Available MCP categories: ${JSON.stringify([...new Set(availableMCPs.map(mcp => mcp.category))])}`);
      
      // 按类别分组显示MCP信息
      const mcpsByCategory = availableMCPs.reduce((acc, mcp) => {
        const category = mcp.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(mcp.name);
        return acc;
      }, {} as Record<string, string[]>);
      
      logger.info(`[MCP Debug] MCPs by category: ${JSON.stringify(mcpsByCategory, null, 2)}`);
      
      return availableMCPs;

    } catch (error) {
      logger.error(`[MCP Debug] Failed to get available MCP list:`, error);
      logger.warn(`[MCP Debug] Using fallback - return empty list`);
      return []; // Return empty list on failure since AVAILABLE_MCPS no longer exists
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

  /**
   * 修复常见的JSON格式错误
   * @param jsonText 需要修复的JSON文本
   * @returns 修复后的JSON文本
   */
  private fixMalformedJSON(jsonText: string): string {
    try {
      let fixed = jsonText;
      
      // 1. 移除多余的逗号
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      // 2. 修复未引用的键
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
      
      // 3. 处理单引号字符串
      fixed = fixed.replace(/:\s*'([^']*)'(?=\s*[,}\]\n])/g, ':"$1"');
      
      // 4. 处理未引用的字符串值，但保留数字和布尔值
      fixed = fixed.replace(/:\s*([^",{\[\]}\s\n][^,}\]\n]*?)(?=\s*[,}\]\n])/g, (match, value) => {
        const trimmedValue = value.trim();
        
        // 跳过已经有引号的值
        if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
          return match;
        }
        
        // 保留数字、布尔值和null
        if (/^(true|false|null|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(trimmedValue)) {
          return `:${trimmedValue}`;
        }
        
        // 处理包含特殊字符的值，只转义双引号和换行符
        const escapedValue = trimmedValue
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        
        // 其他值加引号
        return `:"${escapedValue}"`;
      });
      
      // 5. 处理换行符和多余空白
      fixed = fixed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      // 6. 修复可能的双引号问题
      fixed = fixed.replace(/""([^"]*)""/g, '"$1"');
      
      // 7. 最后检查：确保所有冒号后的值都正确格式化
      fixed = fixed.replace(/:\s*([^",{\[\]}\s][^,}\]]*?)(?=\s*[,}\]])/g, (match, value) => {
        const trimmedValue = value.trim();
        
        // 如果值已经有引号或是数字/布尔值，保持不变
        if (trimmedValue.startsWith('"') || /^(true|false|null|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(trimmedValue)) {
          return `:${trimmedValue}`;
        }
        
        // 处理包含特殊字符的值，只转义双引号和换行符
        const escapedValue = trimmedValue
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        
        // 否则加引号
        return `:"${escapedValue}"`;
      });
      
      return fixed;
    } catch (error) {
      logger.error('Error in fixMalformedJSON:', error);
      return jsonText; // 如果修复失败，返回原始文本
    }
  }
} 