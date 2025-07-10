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
  MCPAuthCheckResult,
  AgentFavorite,
  FavoriteAgentRequest,
  FavoriteAgentResponse
} from '../models/agent.js';
import { getTaskService } from './taskService.js';
import { MCPAuthService } from './mcpAuthService.js';
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
      const mcpNames = request.mcpWorkflow?.mcps?.map(mcp => mcp.name).join(', ') || '无';
      const workflowActions = request.mcpWorkflow?.workflow?.map(step => step.action).join(', ') || '无';
      
      const systemPrompt = `你是一个专业的Agent命名专家。你需要根据任务信息为AI Agent生成一个简洁、专业的名称。

命名规则：
- 只能使用字母(A-Z)、数字(0-9)和下划线(_)
- 最多50个字符
- 名称要简洁明了，能体现Agent的功能
- 避免使用过于通用的名称
- 优先使用英文，如果需要中文概念可以用拼音或英文表达

任务信息：
- 任务标题：${request.taskTitle}
- 任务内容：${request.taskContent}
- 使用的MCP工具：${mcpNames}
- 工作流操作：${workflowActions}

请为这个Agent生成一个合适的名称，只返回名称本身，不要其他解释。`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('请生成Agent名称')
      ]);

      let generatedName = response.content.toString().trim();
      
      // 清理生成的名称，确保符合规则
      generatedName = generatedName.replace(/[^A-Za-z0-9_]/g, '_');
      
      // 确保长度不超过50个字符
      if (generatedName.length > 50) {
        generatedName = generatedName.substring(0, 50);
      }

      // 如果名称为空或只有下划线，提供默认名称
      if (!generatedName || generatedName.replace(/_/g, '').length === 0) {
        generatedName = 'Custom_Agent_' + Date.now();
      }

      logger.info(`自动生成Agent名称: ${generatedName}`);
      return generatedName;
    } catch (error) {
      logger.error('生成Agent名称失败:', error);
      // 返回默认名称
      return 'Custom_Agent_' + Date.now();
    }
  }

  /**
   * 自动生成Agent描述
   */
  async generateAgentDescription(request: GenerateAgentDescriptionRequest): Promise<string> {
    try {
      const mcpNames = request.mcpWorkflow?.mcps?.map(mcp => mcp.name).join(', ') || '无';
      const workflowActions = request.mcpWorkflow?.workflow?.map(step => step.action).join(', ') || '无';
      
      const systemPrompt = `你是一个专业的Agent描述生成专家。你需要根据任务信息为AI Agent生成一个吸引人的描述。

描述规则：
- 最多280个字符
- 描述要简洁明了，突出Agent的核心功能和价值
- 使用中文，语言要专业且易懂
- 避免过于技术性的术语
- 重点说明Agent能解决什么问题或提供什么服务

Agent信息：
- Agent名称：${request.name}
- 原始任务标题：${request.taskTitle}
- 原始任务内容：${request.taskContent}
- 使用的MCP工具：${mcpNames}
- 工作流操作：${workflowActions}

请为这个Agent生成一个合适的描述，只返回描述本身，不要其他解释。`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('请生成Agent描述')
      ]);

      let generatedDescription = response.content.toString().trim();
      
      // 确保长度不超过280个字符
      if (generatedDescription.length > 280) {
        generatedDescription = generatedDescription.substring(0, 280);
      }

      // 如果描述为空，提供默认描述
      if (!generatedDescription) {
        generatedDescription = '这是一个智能Agent，能够帮助您完成各种任务。';
      }

      logger.info(`自动生成Agent描述: ${generatedDescription}`);
      return generatedDescription;
    } catch (error) {
      logger.error('生成Agent描述失败:', error);
      // 返回默认描述
      return '这是一个智能Agent，能够帮助您完成各种任务。';
    }
  }

  /**
   * 自动生成Agent相关问题
   */
  async generateRelatedQuestions(taskTitle: string, taskContent: string, mcpWorkflow?: Agent['mcpWorkflow']): Promise<string[]> {
    try {
      const mcpNames = mcpWorkflow?.mcps?.map(mcp => `${mcp.name} (${mcp.description})`).join(', ') || '无';
      const workflowActions = mcpWorkflow?.workflow?.map(step => step.action).join(', ') || '无';
      
      const systemPrompt = `你是一个专业的产品经理，擅长设计用户引导问题来帮助用户理解产品功能。

你需要为AI Agent生成3个相关问题，帮助用户更好地理解这个Agent的用途和功能。

问题要求：
- 每个问题20-40字之间
- 简洁明了，易于理解
- 体现Agent的具体功能和应用场景
- 引导用户思考如何使用这个Agent
- 避免过于技术性的表达

Agent信息：
- 任务标题：${taskTitle}
- 任务内容：${taskContent}
- 使用的MCP工具：${mcpNames}
- 工作流操作：${workflowActions}

请生成3个问题，每行一个，不要编号或其他格式，直接返回问题文本。`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('请生成3个相关问题')
      ]);

      const questionsText = response.content.toString().trim();
      
      // 解析问题
      const questions = questionsText
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && q.length <= 40)
        .slice(0, 3); // 确保只有3个问题

      // 如果生成的问题不够3个，添加默认问题
      while (questions.length < 3) {
        const defaultQuestions = [
          `这个Agent能帮我做什么？`,
          `什么时候适合使用这个Agent？`,
          `如何使用这个Agent来${taskTitle.replace(/[^\u4e00-\u9fa5\w\s]/g, '').substring(0, 10)}？`
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
      // 获取任务信息
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('任务不存在或无权访问');
      }

      // 检查任务是否已完成
      if (task.status !== 'completed') {
        throw new Error('任务未完成，无法创建Agent');
      }

      // 生成建议的名称
      const suggestedName = await this.generateAgentName({
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // 生成建议的描述
      const suggestedDescription = await this.generateAgentDescription({
        name: suggestedName,
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // 生成相关问题
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
      logger.error(`预览Agent信息失败 [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 根据已完成的任务创建Agent
   */
  async createAgentFromTask(taskId: string, userId: string, status: 'private' | 'public' = 'private'): Promise<Agent> {
    try {
      // 获取任务信息
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('任务不存在或无权访问');
      }

      // 检查任务是否已完成
      if (task.status !== 'completed') {
        throw new Error('任务未完成，无法创建Agent');
      }

      // 自动生成Agent名称
      const name = await this.generateAgentName({
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // 自动生成Agent描述
      const description = await this.generateAgentDescription({
        name,
        taskTitle: task.title,
        taskContent: task.content,
        mcpWorkflow: task.mcpWorkflow
      });

      // 自动生成相关问题
      const relatedQuestions = await this.generateRelatedQuestions(
        task.title,
        task.content,
        task.mcpWorkflow
      );

      // 创建Agent
      const createRequest: CreateAgentRequest = {
        userId,
        name,
        description,
        status,
        taskId,
        mcpWorkflow: task.mcpWorkflow,
        metadata: {
          originalTaskTitle: task.title,
          originalTaskContent: task.content,
          deliverables: [], // TODO: 可以从任务结果中提取
          executionResults: task.result, // 存储任务执行结果
          category: this.extractCategoryFromMCPs(task.mcpWorkflow)
        },
        relatedQuestions
      };

      const agent = await this.createAgent(createRequest);
      logger.info(`从任务创建Agent成功: ${agent.id} (${agent.name}) - 状态: ${status}`);
      
      return agent;
    } catch (error) {
      logger.error(`从任务创建Agent失败 [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 从MCP工作流中提取分类
   */
  private extractCategoryFromMCPs(mcpWorkflow?: any): string {
    if (!mcpWorkflow?.mcps || mcpWorkflow.mcps.length === 0) {
      return 'general';
    }

    // 根据使用的MCP工具推断分类
    const mcpNames = mcpWorkflow.mcps.map((mcp: any) => mcp.name.toLowerCase());
    
    if (mcpNames.some((name: string) => name.includes('github'))) {
      return 'development';
    }
    if (mcpNames.some((name: string) => name.includes('coingecko') || name.includes('coinmarketcap'))) {
      return 'crypto';
    }
    if (mcpNames.some((name: string) => name.includes('playwright') || name.includes('web'))) {
      return 'automation';
    }
    if (mcpNames.some((name: string) => name.includes('x-mcp') || name.includes('twitter'))) {
      return 'social';
    }
    if (mcpNames.some((name: string) => name.includes('notion'))) {
      return 'productivity';
    }

    return 'general';
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
   * 使用Agent执行任务
   */
  async tryAgent(request: TryAgentRequest): Promise<TryAgentResponse> {
    try {
      const { agentId, taskContent, userId } = request;

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

      // 创建临时任务来执行Agent的工作流
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: `Try Agent: ${agent.name}`,
        content: taskContent,
        conversationId: undefined
      });

      // 更新任务的工作流信息
      await taskService.updateTask(task.id, {
        mcpWorkflow: agent.mcpWorkflow,
        status: 'completed' // 设置为已完成状态，因为分析已由Agent提供
      });

      // 记录Agent使用
      await this.recordAgentUsage(agentId, userId, task.id);

      // 返回成功响应，包含任务ID用于后续跟踪
      return {
        success: true,
        executionResult: {
          taskId: task.id,
          message: 'Task created successfully. Agent workflow is ready to execute.',
          agentName: agent.name,
          agentDescription: agent.description,
          mcpWorkflow: agent.mcpWorkflow
        }
      };
    } catch (error) {
      logger.error(`Try Agent失败 [Agent: ${request.agentId}]:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to try Agent'
      };
    }
  }

  /**
   * 添加收藏
   */
  async addFavorite(userId: string, agentId: string): Promise<FavoriteAgentResponse> {
    try {
      // 检查Agent是否存在且为公开状态
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent不存在');
      }
      
      if (agent.status !== 'public') {
        throw new Error('只能收藏公开的Agent');
      }
      
      // 检查是否已收藏
      const isFavorited = await agentDao.isFavorited(userId, agentId);
      if (isFavorited) {
        return {
          success: true,
          message: '已经收藏过此Agent',
          agentId,
          isFavorited: true
        };
      }
      
      // 添加收藏
      await agentDao.addFavorite(userId, agentId);
      
      return {
        success: true,
        message: '收藏成功',
        agentId,
        isFavorited: true
      };
    } catch (error) {
      logger.error('添加收藏失败:', error);
      throw error;
    }
  }

  /**
   * 取消收藏
   */
  async removeFavorite(userId: string, agentId: string): Promise<FavoriteAgentResponse> {
    try {
      // 检查Agent是否存在
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent不存在');
      }
      
      // 取消收藏
      const success = await agentDao.removeFavorite(userId, agentId);
      
      if (!success) {
        return {
          success: true,
          message: '您还没有收藏此Agent',
          agentId,
          isFavorited: false
        };
      }
      
      return {
        success: true,
        message: '取消收藏成功',
        agentId,
        isFavorited: false
      };
    } catch (error) {
      logger.error('取消收藏失败:', error);
      throw error;
    }
  }

  /**
   * 检查收藏状态
   */
  async checkFavoriteStatus(userId: string, agentId: string): Promise<boolean> {
    try {
      return await agentDao.isFavorited(userId, agentId);
    } catch (error) {
      logger.error('检查收藏状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户收藏的Agent列表
   */
  async getFavoriteAgents(userId: string, offset: number = 0, limit: number = 20): Promise<{ agents: Agent[]; total: number }> {
    try {
      return await agentDao.getFavoriteAgents(userId, offset, limit);
    } catch (error) {
      logger.error('获取收藏Agent列表失败:', error);
      throw error;
    }
  }
}

export const agentService = new AgentService(); 