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
  AgentUsage
} from '../models/agent.js';
import { getTaskService } from './taskService.js';

export class AgentService {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
      streaming: false,
    });
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
   * 根据任务创建Agent的快捷方法
   */
  async createAgentFromTask(taskId: string, userId: string, name?: string, description?: string, status: 'private' | 'public' = 'private'): Promise<Agent> {
    try {
      // 获取任务信息
      const task = await getTaskService().getTaskById(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('任务不存在或无权访问');
      }

      // 如果没有提供名称，自动生成
      if (!name) {
        name = await this.generateAgentName({
          taskTitle: task.title,
          taskContent: task.content,
          mcpWorkflow: task.mcpWorkflow
        });
      }

      // 如果没有提供描述，自动生成
      if (!description) {
        description = await this.generateAgentDescription({
          name,
          taskTitle: task.title,
          taskContent: task.content,
          mcpWorkflow: task.mcpWorkflow
        });
      }

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
          originalTaskContent: task.content
        }
      };

      return await this.createAgent(createRequest);
    } catch (error) {
      logger.error(`从任务创建Agent失败 [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }
}

export const agentService = new AgentService(); 