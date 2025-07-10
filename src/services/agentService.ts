import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { agentDao } from '../dao/agentDao.js';
import { 
  Agent, 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  GetAgentsQuery, 
  GenerateAgentNameRequest, 
  GenerateAgentDescriptionRequest,
  AgentNameValidation,
  AgentDescriptionValidation,
  AgentStats,
  AgentMarketplaceQuery,
  AgentUsage,
  TryAgentRequest,
  TryAgentResponse,
  MCPAuthCheckResult
} from '../models/agent.js';
import { getTaskService } from './taskService.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getConversationService } from './conversationService.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageType, MessageIntent } from '../models/conversation.js';
import { v4 as uuidv4 } from 'uuid';

export class AgentService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
      streaming: false,
    });
    this.mcpAuthService = new MCPAuthService();
  }

  /**
   * 创建Agent
   */
  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    try {
      // 验证Agent名称
      const nameValidation = await this.validateAgentName(request.name, request.userId);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.error);
      }

      // 验证Agent描述
      const descriptionValidation = this.validateAgentDescription(request.description);
      if (!descriptionValidation.isValid) {
        throw new Error(descriptionValidation.error);
      }

      // 如果有任务ID，检查任务是否存在且属于该用户
      if (request.taskId) {
        const task = await getTaskService().getTaskById(request.taskId);
        if (!task || task.userId !== request.userId) {
          throw new Error('任务不存在或无权访问');
        }

        // 如果没有提供工作流，从任务中获取
        if (!request.mcpWorkflow && task.mcpWorkflow) {
          request.mcpWorkflow = task.mcpWorkflow;
        }

        // 补充元数据
        if (!request.metadata) {
          request.metadata = {};
        }
        request.metadata.originalTaskTitle = task.title;
        request.metadata.originalTaskContent = task.content;
      }

      // 如果没有提供categories，从mcpWorkflow中提取
      if (!request.categories && request.mcpWorkflow) {
        request.categories = this.extractCategoriesFromMCPs(request.mcpWorkflow);
      } else if (!request.categories) {
        request.categories = ['General'];
      }

      const agent = await agentDao.createAgent(request);
      logger.info(`Agent创建成功: ${agent.id} (${agent.name})`);
      
      return agent;
    } catch (error) {
      logger.error('创建Agent失败:', error);
      throw error;
    }
  }

  /**
   * 更新Agent
   */
  async updateAgent(agentId: string, userId: string, request: UpdateAgentRequest): Promise<Agent> {
    try {
      // 检查Agent是否存在且属于该用户
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent不存在或无权访问');
      }

      // 验证Agent名称（如果更新了名称）
      if (request.name !== undefined) {
        const nameValidation = await this.validateAgentName(request.name, userId, agentId);
        if (!nameValidation.isValid) {
          throw new Error(nameValidation.error);
        }
      }

      // 验证Agent描述（如果更新了描述）
      if (request.description !== undefined) {
        const descriptionValidation = this.validateAgentDescription(request.description);
        if (!descriptionValidation.isValid) {
          throw new Error(descriptionValidation.error);
        }
      }

      const updatedAgent = await agentDao.updateAgent(agentId, request);
      if (!updatedAgent) {
        throw new Error('更新Agent失败');
      }

      logger.info(`Agent更新成功: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`更新Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * 删除Agent
   */
  async deleteAgent(agentId: string, userId: string): Promise<void> {
    try {
      // 检查Agent是否存在且属于该用户
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent不存在或无权访问');
      }

      const success = await agentDao.deleteAgent(agentId);
      if (!success) {
        throw new Error('删除Agent失败');
      }

      logger.info(`Agent删除成功: ${agentId}`);
    } catch (error) {
      logger.error(`删除Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取Agent详情
   */
  async getAgentById(agentId: string, userId?: string): Promise<Agent> {
    try {
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent不存在');
      }

      // 如果是私有Agent，需要检查权限
      if (agent.status === 'private' && agent.userId !== userId) {
        throw new Error('无权访问私有Agent');
      }

      return agent;
    } catch (error) {
      logger.error(`获取Agent详情失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取Agent列表
   */
  async getAgents(query: GetAgentsQuery): Promise<{ agents: Agent[]; total: number }> {
    try {
      return await agentDao.getAgents(query);
    } catch (error) {
      logger.error('获取Agent列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取Agent市场数据
   */
  async getAgentMarketplace(query: AgentMarketplaceQuery): Promise<{ agents: Agent[]; total: number }> {
    try {
      return await agentDao.getAgentMarketplace(query);
    } catch (error) {
      logger.error('获取Agent市场数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取Agent统计信息
   */
  async getAgentStats(userId?: string): Promise<AgentStats> {
    try {
      return await agentDao.getAgentStats(userId);
    } catch (error) {
      logger.error('获取Agent统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 记录Agent使用
   */
  async recordAgentUsage(agentId: string, userId: string, taskId?: string, conversationId?: string, executionResult?: any): Promise<AgentUsage> {
    try {
      // 检查Agent是否存在
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent不存在');
      }

      // 如果是私有Agent，需要检查权限
      if (agent.status === 'private' && agent.userId !== userId) {
        throw new Error('无权使用私有Agent');
      }

      return await agentDao.recordAgentUsage(agentId, userId, taskId, conversationId, executionResult);
    } catch (error) {
      logger.error('记录Agent使用失败:', error);
      throw error;
    }
  }

  /**
   * 根据任务ID获取Agent
   */
  async getAgentsByTaskId(taskId: string): Promise<Agent[]> {
    try {
      return await agentDao.getAgentsByTaskId(taskId);
    } catch (error) {
      logger.error(`根据任务ID获取Agent失败 [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 自动生成Agent名称
   */
  async generateAgentName(request: GenerateAgentNameRequest): Promise<string> {
    try {
      const mcpNames = request.mcpWorkflow?.mcps?.map(mcp => mcp.name).join(', ') || 'None';
      const workflowActions = request.mcpWorkflow?.workflow?.map(step => step.action).join(', ') || 'None';
      
      const systemPrompt = `You are a professional Agent naming expert. You need to generate a concise, professional name for an AI Agent based on task information.

Naming rules:
- Only use letters (A-Z), numbers (0-9), and underscores (_)
- Maximum 50 characters
- Name should be concise and clear, reflecting the Agent's functionality
- Avoid overly generic names
- Use English only

Task information:
- Task title: ${request.taskTitle}
- Task content: ${request.taskContent}
- MCP tools used: ${mcpNames}
- Workflow actions: ${workflowActions}

Please generate a suitable name for this Agent. Return only the name itself, no other explanation.`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('Please generate an Agent name')
      ]);

      let generatedName = response.content.toString().trim();
      
      // Clean the generated name to ensure it meets the rules
      generatedName = generatedName.replace(/[^A-Za-z0-9_]/g, '_');
      
      // Ensure length does not exceed 50 characters
      if (generatedName.length > 50) {
        generatedName = generatedName.substring(0, 50);
      }

      // If name is empty or only underscores, provide default name
      if (!generatedName || generatedName.replace(/_/g, '').length === 0) {
        generatedName = 'Custom_Agent_' + Date.now();
      }

      logger.info(`Auto-generated Agent name: ${generatedName}`);
      return generatedName;
    } catch (error) {
      logger.error('Failed to generate Agent name:', error);
      // Return default name
      return 'Custom_Agent_' + Date.now();
    }
  }

  /**
   * 自动生成Agent描述
   */
  async generateAgentDescription(request: GenerateAgentDescriptionRequest): Promise<string> {
    try {
      const mcpNames = request.mcpWorkflow?.mcps?.map(mcp => mcp.name).join(', ') || 'None';
      const workflowActions = request.mcpWorkflow?.workflow?.map(step => step.action).join(', ') || 'None';
      
      const systemPrompt = `You are a professional Agent description generation expert. You need to generate an attractive description for an AI Agent based on task information.

Description rules:
- Maximum 280 characters
- Description should be concise and clear, highlighting the Agent's core functionality and value
- Use English, language should be professional and easy to understand
- Avoid overly technical terms
- Focus on what problems the Agent can solve or what services it provides

Agent information:
- Agent name: ${request.name}
- Original task title: ${request.taskTitle}
- Original task content: ${request.taskContent}
- MCP tools used: ${mcpNames}
- Workflow actions: ${workflowActions}

Please generate a suitable description for this Agent. Return only the description itself, no other explanation.`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('Please generate an Agent description')
      ]);

      let generatedDescription = response.content.toString().trim();
      
      // Ensure length does not exceed 280 characters
      if (generatedDescription.length > 280) {
        generatedDescription = generatedDescription.substring(0, 280);
      }

      // If description is empty, provide default description
      if (!generatedDescription) {
        generatedDescription = 'This is an intelligent Agent that can help you complete various tasks.';
      }

      logger.info(`Auto-generated Agent description: ${generatedDescription}`);
      return generatedDescription;
    } catch (error) {
      logger.error('Failed to generate Agent description:', error);
      // Return default description
      return 'This is an intelligent Agent that can help you complete various tasks.';
    }
  }

  /**
   * 自动生成Agent相关问题
   */
  async generateRelatedQuestions(taskTitle: string, taskContent: string, mcpWorkflow?: Agent['mcpWorkflow']): Promise<string[]> {
    try {
      const mcpNames = mcpWorkflow?.mcps?.map(mcp => `${mcp.name} (${mcp.description})`).join(', ') || 'None';
      const workflowActions = mcpWorkflow?.workflow?.map(step => step.action).join(', ') || 'None';
      
      const systemPrompt = `You are a professional product manager skilled at designing user guidance questions to help users understand product functionality.

You need to generate 3 related questions for an AI Agent to help users better understand this Agent's purpose and functionality.

Question requirements:
- Each question should be between 20-100 characters
- Concise and clear, easy to understand
- Reflect the Agent's specific functionality and use cases
- Guide users to think about how to use this Agent
- Avoid overly technical expressions
- Use English only

Agent information:
- Task title: ${taskTitle}
- Task content: ${taskContent}
- MCP tools used: ${mcpNames}
- Workflow actions: ${workflowActions}

Please generate 3 questions, one per line, without numbering or other formatting, return the question text directly.`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('Please generate 3 related questions')
      ]);

      const questionsText = response.content.toString().trim();
      
      // Parse questions
      const questions = questionsText
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && q.length <= 100)
        .slice(0, 3); // Ensure only 3 questions

      // If not enough questions generated, add default questions
      while (questions.length < 3) {
        const defaultQuestions = [
          `What can this Agent help me with?`,
          `When is it appropriate to use this Agent?`,
          `How can I use this Agent for ${taskTitle.replace(/[^\w\s]/g, '').substring(0, 20)}?`
        ];
        
        for (const defaultQ of defaultQuestions) {
          if (questions.length < 3 && !questions.includes(defaultQ)) {
            questions.push(defaultQ);
          }
        }
      }

      logger.info(`自动生成Agent相关问题: ${questions.join(', ')}`);
      return questions;
    } catch (error) {
      logger.error('生成Agent相关问题失败:', error);
      // 返回默认问题
      return [
        `这个Agent能帮我做什么？`,
        `什么时候适合使用这个Agent？`,
        `如何使用这个Agent完成任务？`
      ];
    }
  }

  /**
   * 验证Agent名称
   */
  async validateAgentName(name: string, userId: string, excludeId?: string): Promise<AgentNameValidation> {
    try {
      // 检查长度
      if (!name || name.length === 0) {
        return { isValid: false, error: 'Agent名称不能为空' };
      }

      if (name.length > 50) {
        return { isValid: false, error: 'Agent名称最多50个字符' };
      }

      // 检查字符规则
      const validPattern = /^[A-Za-z0-9_]+$/;
      if (!validPattern.test(name)) {
        return { isValid: false, error: 'Only letters (A-Z), numbers (0-9), and underscores (_) are allowed' };
      }

      // 检查是否已存在
      const exists = await agentDao.isAgentNameExists(userId, name, excludeId);
      if (exists) {
        return { isValid: false, error: '该Agent名称已存在' };
      }

      return { isValid: true };
    } catch (error) {
      logger.error('验证Agent名称失败:', error);
      return { isValid: false, error: '验证失败' };
    }
  }

  /**
   * 验证Agent描述
   */
  validateAgentDescription(description: string): AgentDescriptionValidation {
    try {
      // 检查长度
      if (!description || description.length === 0) {
        return { isValid: false, error: 'Agent描述不能为空' };
      }

      if (description.length > 280) {
        return { isValid: false, error: 'Agent描述最多280个字符' };
      }

      return { isValid: true };
    } catch (error) {
      logger.error('验证Agent描述失败:', error);
      return { isValid: false, error: '验证失败' };
    }
  }

  /**
   * 发布Agent为公开
   */
  async publishAgent(agentId: string, userId: string): Promise<Agent> {
    try {
      // 检查Agent是否存在且属于该用户
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent不存在或无权访问');
      }

      // 检查是否已经是公开状态
      if (existingAgent.status === 'public') {
        return existingAgent;
      }

      // 更新为公开状态
      const updatedAgent = await agentDao.updateAgent(agentId, { status: 'public' });
      if (!updatedAgent) {
        throw new Error('发布Agent失败');
      }

      logger.info(`Agent已发布为公开: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`发布Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * 将Agent设为私有
   */
  async makeAgentPrivate(agentId: string, userId: string): Promise<Agent> {
    try {
      // 检查Agent是否存在且属于该用户
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent不存在或无权访问');
      }

      // 检查是否已经是私有状态
      if (existingAgent.status === 'private') {
        return existingAgent;
      }

      // 更新为私有状态
      const updatedAgent = await agentDao.updateAgent(agentId, { status: 'private' });
      if (!updatedAgent) {
        throw new Error('设为私有失败');
      }

      logger.info(`Agent已设为私有: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`设为私有失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * 生成Agent的name和description（供前端显示）
   */
  async generateAgentInfo(taskId: string, userId: string): Promise<{
    name: string;
    description: string;
  }> {
    try {
      // Get task information
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('Task not found or access denied');
      }

      // Check if task is completed
      if (task.status !== 'completed') {
        throw new Error('Task is not completed, cannot create Agent');
      }

      // Generate Agent name
      const name = await this.generateAgentName({
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // Generate Agent description
      const description = await this.generateAgentDescription({
        name,
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      return {
        name,
        description
      };
    } catch (error) {
      logger.error(`Failed to generate Agent info [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 预览从任务创建Agent的信息（用户保存前预览）
   */
  async previewAgentFromTask(taskId: string, userId: string): Promise<{
    suggestedName: string;
    suggestedDescription: string;
    relatedQuestions: string[];
    taskInfo: {
      title: string;
      content: string;
      status: string;
    };
    mcpWorkflow?: any;
  }> {
    try {
      // Get task information
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('Task not found or access denied');
      }

      // Check if task is completed
      if (task.status !== 'completed') {
        throw new Error('Task is not completed, cannot create Agent');
      }

      // Generate suggested name
      const suggestedName = await this.generateAgentName({
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // Generate suggested description
      const suggestedDescription = await this.generateAgentDescription({
        name: suggestedName,
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // Generate related questions
      const relatedQuestions = await this.generateRelatedQuestions(
        task.title,
        task.content,
        task.mcpWorkflow
      );

      return {
        suggestedName,
        suggestedDescription,
        relatedQuestions,
        taskInfo: {
          title: task.title,
          content: task.content,
          status: task.status
        },
        mcpWorkflow: task.mcpWorkflow
      };
    } catch (error) {
      logger.error(`Failed to preview Agent info [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 根据已完成的任务创建Agent
   */
  async createAgentFromTask(taskId: string, userId: string, status: 'private' | 'public' = 'private', customName?: string, customDescription?: string): Promise<Agent> {
    try {
      // Get task information
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('Task not found or access denied');
      }

      // Check if task is completed
      if (task.status !== 'completed') {
        throw new Error('Task is not completed, cannot create Agent');
      }

      // Use custom name or auto-generate Agent name
      let name = customName;
      if (!name) {
        name = await this.generateAgentName({
          taskTitle: task.title,
          taskContent: task.content,
          mcpWorkflow: task.mcpWorkflow
        });
      }

      // Use custom description or auto-generate Agent description
      let description = customDescription;
      if (!description) {
        description = await this.generateAgentDescription({
          name,
          taskTitle: task.title,
          taskContent: task.content,
          mcpWorkflow: task.mcpWorkflow
        });
      }

      // Auto-generate related questions
      const relatedQuestions = await this.generateRelatedQuestions(
        task.title,
        task.content,
        task.mcpWorkflow
      );

      // Extract categories from MCP workflow
      const categories = this.extractCategoriesFromMCPs(task.mcpWorkflow);

      // Create Agent
      const createRequest: CreateAgentRequest = {
        userId,
        name,
        description,
        status,
        taskId,
        categories,
        mcpWorkflow: task.mcpWorkflow,
        metadata: {
          originalTaskTitle: task.title,
          originalTaskContent: task.content,
          deliverables: [], // TODO: can extract from task results
          executionResults: task.result, // Store task execution results
          category: categories[0] // 为了向后兼容，保留单一类别
        },
        relatedQuestions
      };

      const agent = await this.createAgent(createRequest);
      logger.info(`Successfully created Agent from task: ${agent.id} (${agent.name}) - Status: ${status}`);
      
      return agent;
    } catch (error) {
      logger.error(`Failed to create Agent from task [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 从MCP工作流中提取分类列表
   */
  private extractCategoriesFromMCPs(mcpWorkflow?: any): string[] {
    if (!mcpWorkflow?.mcps || mcpWorkflow.mcps.length === 0) {
      return ['General'];
    }

    // 直接从MCP的category字段提取类别
    const categories = new Set<string>();
    
    mcpWorkflow.mcps.forEach((mcp: any) => {
      if (mcp.category) {
        categories.add(mcp.category);
      }
    });

    // 如果没有从category字段提取到类别，则根据MCP名称推断
    if (categories.size === 0) {
      const mcpNames = mcpWorkflow.mcps.map((mcp: any) => mcp.name.toLowerCase());
      
      if (mcpNames.some((name: string) => name.includes('github'))) {
        categories.add('Development Tools');
      }
      if (mcpNames.some((name: string) => name.includes('coingecko') || name.includes('coinmarketcap'))) {
        categories.add('Market Data');
      }
      if (mcpNames.some((name: string) => name.includes('playwright') || name.includes('web'))) {
        categories.add('Automation');
      }
      if (mcpNames.some((name: string) => name.includes('x-mcp') || name.includes('twitter'))) {
        categories.add('Social');
      }
      if (mcpNames.some((name: string) => name.includes('notion'))) {
        categories.add('Productivity');
      }

      // 如果还是没有类别，添加默认值
      if (categories.size === 0) {
        categories.add('General');
      }
    }

    return Array.from(categories);
  }

  /**
   * 检查Agent工作流中涉及的MCP认证状态
   */
  private async checkAgentMCPAuth(agent: Agent, userId: string): Promise<MCPAuthCheckResult> {
    try {
      const mcpWorkflow = agent.mcpWorkflow;
      if (!mcpWorkflow?.mcps || mcpWorkflow.mcps.length === 0) {
        return {
          needsAuth: false,
          missingAuth: [],
          message: 'This Agent does not require MCP authentication'
        };
      }

      const missingAuth: Array<{
        mcpName: string;
        description: string;
        authParams?: Record<string, any>;
      }> = [];

      // 检查每个需要认证的MCP
      for (const mcp of mcpWorkflow.mcps) {
        if (mcp.authRequired) {
          // 检查用户是否已经验证了这个MCP
          const authData = await this.mcpAuthService.getUserMCPAuth(userId, mcp.name);
          if (!authData || !authData.isVerified) {
            missingAuth.push({
              mcpName: mcp.name,
              description: mcp.description,
              authParams: mcp.authParams
            });
          }
        }
      }

      if (missingAuth.length > 0) {
        return {
          needsAuth: true,
          missingAuth,
          message: 'Please verify auth for all relevant MCP servers first.'
        };
      }

              return {
          needsAuth: false,
          missingAuth: [],
          message: 'All MCP servers have been authenticated'
        };
    } catch (error) {
      logger.error(`检查Agent MCP认证状态失败 [Agent: ${agent.id}]:`, error);
      return {
        needsAuth: true,
        missingAuth: [],
        message: 'Error occurred while checking authentication status'
      };
    }
  }

  /**
   * 开始与Agent的多轮对话
   */
  async tryAgent(request: TryAgentRequest): Promise<TryAgentResponse> {
    try {
      const { agentId, content, userId } = request;

      // 获取Agent信息
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        return {
          success: false,
          message: 'Agent not found'
        };
      }

      // 检查Agent是否为公开或属于当前用户
      if (agent.status === 'private' && agent.userId !== userId) {
        return {
          success: false,
          message: 'Access denied: This is a private Agent'
        };
      }

      // 检查MCP认证状态
      const authCheck = await this.checkAgentMCPAuth(agent, userId);
      if (authCheck.needsAuth) {
        return {
          success: false,
          needsAuth: true,
          missingAuth: authCheck.missingAuth,
          message: authCheck.message
        };
      }

      // 创建Agent试用会话（使用特殊前缀标识Agent试用会话）
      const conversationService = getConversationService();
      const conversation = await conversationService.createConversation(
        userId,
        `[AGENT:${agent.id}] Try ${agent.name}`
      );

      // 发送欢迎消息
      const welcomeMessage = `Hello! I'm ${agent.name}. ${agent.description}\n\nYou can:\n- Chat with me about anything\n- Ask me to help with tasks related to my capabilities\n\nHow can I assist you today?`;
      
      await messageDao.createMessage({
        conversationId: conversation.id,
        content: welcomeMessage,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });

      // 如果用户提供了初始内容，记录用户消息
      let firstMessage: any = null;
      if (content) {
        firstMessage = await messageDao.createMessage({
          conversationId: conversation.id,
          content: content,
          type: MessageType.USER,
          intent: MessageIntent.CHAT
        });
        
        await conversationDao.incrementMessageCount(conversation.id);
      }
 
      // 记录Agent使用
      await this.recordAgentUsage(agentId, userId, undefined, conversation.id);

      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          agentInfo: {
            id: agent.id,
            name: agent.name,
            description: agent.description
          }
        },
        message: 'Agent trial conversation started successfully'
      };
    } catch (error) {
      logger.error(`Start Agent trial failed [Agent: ${request.agentId}]:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to start Agent trial'
      };
    }
  }

  /**
   * 处理Agent试用会话中的消息
   */
  async handleAgentTrialMessage(conversationId: string, content: string, agent: Agent, userId: string): Promise<void> {
    try {
      // 使用AI分析用户意图
      const intent = await this.analyzeUserIntent(content, agent);
      
      if (intent.type === 'task') {
        // 用户想要执行任务，使用Agent的工作流
        const response = await this.executeAgentTask(content, agent, userId, conversationId);
        
        await messageDao.createMessage({
          conversationId,
          content: response,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK
        });
      } else {
        // 用户想要对话，进行普通聊天
        const response = await this.chatWithAgent(content, agent);
        
        await messageDao.createMessage({
          conversationId,
          content: response,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });
      }
    } catch (error) {
      logger.error(`Handle agent trial message failed:`, error);
      
      // 发送错误消息
      await messageDao.createMessage({
        conversationId,
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
    }
  }

  /**
   * 分析用户意图：对话 vs 任务
   */
  private async analyzeUserIntent(content: string, agent: Agent): Promise<{ type: 'chat' | 'task'; confidence: number }> {
    try {
      const prompt = `Analyze the user's intent based on their message and the agent's capabilities.

Agent: ${agent.name}
Description: ${agent.description}
Capabilities: ${agent.mcpWorkflow ? JSON.stringify(agent.mcpWorkflow.mcps?.map(m => m.name)) : 'general'}

User message: "${content}"

Determine if the user wants to:
1. "task" - Execute a specific task using the agent's workflow capabilities
2. "chat" - Have a general conversation

Look for action words, specific requests, or task-oriented language.

Respond with ONLY a JSON object:
{"type": "chat" | "task", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

      const response = await this.llm.invoke([{ role: 'user', content: prompt }]);
      const result = JSON.parse(response.content as string);
      
      return {
        type: result.type,
        confidence: result.confidence
      };
    } catch (error) {
      logger.error('Analyze user intent failed:', error);
      // 默认为对话
      return { type: 'chat', confidence: 0.5 };
    }
  }

  /**
   * 执行Agent任务
   */
  private async executeAgentTask(content: string, agent: Agent, userId: string, conversationId: string): Promise<string> {
    try {
      // 创建任务
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: `Agent Task: ${agent.name}`,
        content: content,
        conversationId
      });

      // 使用Agent的工作流
      await taskService.updateTask(task.id, {
        mcpWorkflow: agent.mcpWorkflow,
        status: 'in_progress'
      });

      // 执行任务（这里简化处理，实际应该调用任务执行服务）
      // TODO: 集成真正的任务执行逻辑
      
      return `I'll help you with that task. Let me use my capabilities to process your request: "${content}".\n\nTask created with ID: ${task.id}\n\n*[This would normally execute the agent's workflow and return real results]*`;
    } catch (error) {
      logger.error('Execute agent task failed:', error);
      return 'Sorry, I encountered an error while trying to execute that task. Please try again or rephrase your request.';
    }
  }

  /**
   * 与Agent聊天
   */
  private async chatWithAgent(content: string, agent: Agent): Promise<string> {
    try {
      const prompt = `You are ${agent.name}, an AI agent with the following characteristics:

Description: ${agent.description}

Your capabilities include: ${agent.mcpWorkflow ? 
        agent.mcpWorkflow.mcps?.map((m: any) => m.description).join(', ') : 
        'general assistance'}

Respond to the user's message in a helpful and friendly manner, staying in character as this agent. 
If they ask about your capabilities, mention what you can help with based on your description and tools.

User message: "${content}"

Respond naturally and helpfully:`;

      const response = await this.llm.invoke([{ role: 'user', content: prompt }]);
      return response.content as string;
    } catch (error) {
      logger.error('Chat with agent failed:', error);
      return `Hello! I'm ${agent.name}. I'd be happy to help you. Could you tell me more about what you need assistance with?`;
    }
  }
}

export const agentService = new AgentService(); 