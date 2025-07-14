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
import { getConversationService } from './conversationService.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageType, MessageIntent } from '../models/conversation.js';
import { v4 as uuidv4 } from 'uuid';
import { userService } from './auth/userService.js';
import { generateAgentAvatarUrl, generateAvatarSeed, getRecommendedAvatarStyle } from '../utils/avatarGenerator.js';
import { TaskExecutorService } from './taskExecutorService.js';

export class AgentService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;
  private taskExecutorService?: TaskExecutorService;

  constructor(taskExecutorService?: TaskExecutorService) {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
      streaming: false,
    });
    this.mcpAuthService = new MCPAuthService();
    this.taskExecutorService = taskExecutorService;
  }

  /**
   * Create Agent
   */
  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    try {
      // Validate Agent name
      const nameValidation = await this.validateAgentName(request.name, request.userId);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.error);
      }

      // Validate Agent description
      const descriptionValidation = this.validateAgentDescription(request.description);
      if (!descriptionValidation.isValid) {
        throw new Error(descriptionValidation.error);
      }

      // Get user info, sync username and avatar
      if (!request.username || !request.avatar) {
        const user = await userService.getUserById(request.userId);
        if (user) {
          request.username = request.username || user.username;
          request.avatar = request.avatar || user.avatar;
        }
      }

      // Auto-generate Agent avatar (if not provided)
      if (!request.agentAvatar) {
        // Extract categories for choosing appropriate avatar style
        let categories = request.categories;
        if (!categories && request.mcpWorkflow) {
          categories = this.extractCategoriesFromMCPs(request.mcpWorkflow);
        }
        
        // Choose avatar style based on categories
        const avatarStyle = getRecommendedAvatarStyle(categories);
        
        // Generate avatar seed value
        const avatarSeed = generateAvatarSeed(request.name);
        
        // Generate avatar URL
        request.agentAvatar = generateAgentAvatarUrl(avatarSeed, avatarStyle);
        
        logger.info(`Generated avatar for Agent: ${request.name} -> ${request.agentAvatar}`);
      }

      // If there's a task ID, check if task exists and belongs to the user
      if (request.taskId) {
        const task = await getTaskService().getTaskById(request.taskId);
        if (!task || task.userId !== request.userId) {
          throw new Error('Task not found or access denied');
        }

        // If no workflow provided, get from task
        if (!request.mcpWorkflow && task.mcpWorkflow) {
          request.mcpWorkflow = task.mcpWorkflow;
        }

        // Add metadata
        if (!request.metadata) {
          request.metadata = {};
        }
        request.metadata.originalTaskTitle = task.title;
        request.metadata.originalTaskContent = task.content;
      }

      // If no categories provided, extract from mcpWorkflow
      if (!request.categories && request.mcpWorkflow) {
        request.categories = this.extractCategoriesFromMCPs(request.mcpWorkflow);
      } else if (!request.categories) {
        request.categories = ['General'];
      }

      const agent = await agentDao.createAgent(request);
      logger.info(`Agent created successfully: ${agent.id} (${agent.name})`);
      
      return agent;
    } catch (error) {
      logger.error('Failed to create Agent:', error);
      throw error;
    }
  }

  /**
   * Update Agent
   */
  async updateAgent(agentId: string, userId: string, request: UpdateAgentRequest): Promise<Agent> {
    try {
      // Check if Agent exists and belongs to the user
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent not found or access denied');
      }

      // Validate Agent name (if name was updated)
      if (request.name !== undefined) {
        const nameValidation = await this.validateAgentName(request.name, userId, agentId);
        if (!nameValidation.isValid) {
          throw new Error(nameValidation.error);
        }
      }

      // Validate Agent description (if description was updated)
      if (request.description !== undefined) {
        const descriptionValidation = this.validateAgentDescription(request.description);
        if (!descriptionValidation.isValid) {
          throw new Error(descriptionValidation.error);
        }
      }

      const updatedAgent = await agentDao.updateAgent(agentId, request);
      if (!updatedAgent) {
        throw new Error('Failed to update Agent');
      }

      logger.info(`Agent updated successfully: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`Failed to update Agent [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * Delete Agent
   */
  async deleteAgent(agentId: string, userId: string): Promise<void> {
    try {
      // Check if Agent exists and belongs to the user
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent not found or access denied');
      }

      const success = await agentDao.deleteAgent(agentId);
      if (!success) {
        throw new Error('Failed to delete Agent');
      }

      logger.info(`Agent deleted successfully: ${agentId}`);
    } catch (error) {
      logger.error(`Failed to delete Agent [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * Get Agent Details
   */
  async getAgentById(agentId: string, userId?: string): Promise<Agent> {
    try {
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // If it's a private Agent, check permissions
      if (agent.status === 'private' && agent.userId !== userId) {
        throw new Error('Access denied for private Agent');
      }

      return agent;
    } catch (error) {
      logger.error(`Failed to get Agent details [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * Get Agent List
   */
  async getAgents(query: GetAgentsQuery): Promise<{ agents: Agent[]; total: number }> {
    try {
      return await agentDao.getAgents(query);
    } catch (error) {
      logger.error('Failed to get Agent list:', error);
      throw error;
    }
  }

  /**
   * Get Agent Marketplace Data
   */
  async getAgentMarketplace(query: AgentMarketplaceQuery): Promise<{ agents: Agent[]; total: number }> {
    try {
      return await agentDao.getAgentMarketplace(query);
    } catch (error) {
      logger.error('Failed to get Agent marketplace data:', error);
      throw error;
    }
  }

  /**
   * 获取所有分类及其数量统计
   */
  async getAllCategories(): Promise<Array<{ name: string; count: number }>> {
    try {
      return await agentDao.getAllCategories();
    } catch (error) {
      logger.error('获取所有分类失败:', error);
      throw error;
    }
  }

  /**
   * Get Agent Statistics
   */
  async getAgentStats(userId?: string): Promise<AgentStats> {
    try {
      return await agentDao.getAgentStats(userId);
    } catch (error) {
      logger.error('Failed to get Agent statistics:', error);
      throw error;
    }
  }

  /**
   * Record Agent Usage
   */
  async recordAgentUsage(agentId: string, userId: string, taskId?: string, conversationId?: string, executionResult?: any): Promise<AgentUsage> {
    try {
      // Check if Agent exists
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // If it's a private Agent, check permissions
      if (agent.status === 'private' && agent.userId !== userId) {
        throw new Error('No permission to use private Agent');
      }

      return await agentDao.recordAgentUsage(agentId, userId, taskId, conversationId, executionResult);
    } catch (error) {
      logger.error('Failed to record Agent usage:', error);
      throw error;
    }
  }

  /**
   * Get Agents by Task ID
   */
  async getAgentsByTaskId(taskId: string): Promise<Agent[]> {
    try {
      return await agentDao.getAgentsByTaskId(taskId);
    } catch (error) {
      logger.error(`Failed to get Agents by task ID [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * Auto-generate Agent Name
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
   * Auto-generate Agent Description
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
   * Auto-generate Agent Related Questions
   */
  async generateRelatedQuestions(taskTitle: string, taskContent: string, mcpWorkflow?: Agent['mcpWorkflow']): Promise<string[]> {
    try {
      const mcpNames = mcpWorkflow?.mcps?.map(mcp => `${mcp.name} (${mcp.description})`).join(', ') || 'None';
      const workflowActions = mcpWorkflow?.workflow?.map(step => step.action).join(', ') || 'None';
      
      const systemPrompt = `You are a professional product manager skilled at designing user guidance questions to help users understand product functionality.

You need to generate 3 related questions for an AI Agent to help users better understand this Agent's purpose and functionality.

IMPORTANT: Generate questions as ACTION REQUESTS, not as general inquiries. Users should be able to click on these questions to directly execute tasks with the Agent.

Question requirements:
- Each question should be between 20-100 characters
- Write as action requests or task descriptions (e.g., "Help me analyze...", "Show me how to...", "Create a report about...")
- Avoid question words like "What", "How", "When", "Why"
- Use imperative or request tone that implies task execution
- Reflect the Agent's specific functionality and use cases
- Guide users to directly use the Agent's capabilities
- Avoid overly technical expressions
- Use English only

Agent information:
- Task title: ${taskTitle}
- Task content: ${taskContent}
- MCP tools used: ${mcpNames}
- Workflow actions: ${workflowActions}

Generate 3 task-oriented requests that users can directly execute with this Agent.
Please generate 3 questions, one per line, without numbering or other formatting, return the question text directly.`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('Please generate 3 related task requests')
      ]);

      const questionsText = response.content.toString().trim();
      
      // Parse questions
      const questions = questionsText
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && q.length <= 100)
        .slice(0, 3); // Ensure only 3 questions

      // If not enough questions generated, add default task-oriented questions
      while (questions.length < 3) {
        const defaultQuestions = [
          `Help me with ${taskTitle.replace(/[^\w\s]/g, '').substring(0, 30)}`,
          `Show me how to use this Agent's capabilities`,
          `Execute a task similar to ${taskTitle.replace(/[^\w\s]/g, '').substring(0, 25)}`
        ];
        
        for (const defaultQ of defaultQuestions) {
          if (questions.length < 3 && !questions.includes(defaultQ)) {
            questions.push(defaultQ);
          }
        }
      }

      logger.info(`Auto-generated Agent related task questions: ${questions.join(', ')}`);
      return questions;
    } catch (error) {
      logger.error('Failed to generate Agent related questions:', error);
      // Return default task-oriented questions
      return [
        `Help me use this Agent's capabilities`,
        `Execute a task with this Agent`,
        `Show me what this Agent can do`
      ];
    }
  }

  /**
   * Validate Agent Name
   */
  async validateAgentName(name: string, userId: string, excludeId?: string): Promise<AgentNameValidation> {
    try {
      // Check length
      if (!name || name.length === 0) {
        return { isValid: false, error: 'Agent name cannot be empty' };
      }

      if (name.length > 50) {
        return { isValid: false, error: 'Agent name must be 50 characters or less' };
      }

      // Check character rules
      const validPattern = /^[A-Za-z0-9_]+$/;
      if (!validPattern.test(name)) {
        return { isValid: false, error: 'Only letters (A-Z), numbers (0-9), and underscores (_) are allowed' };
      }

      // Check if name already exists
      const exists = await agentDao.isAgentNameExists(userId, name, excludeId);
      if (exists) {
        return { isValid: false, error: 'Agent name already exists' };
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Failed to validate Agent name:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }

  /**
   * Validate Agent Description
   */
  validateAgentDescription(description: string): AgentDescriptionValidation {
    try {
      // Check length
      if (!description || description.length === 0) {
        return { isValid: false, error: 'Agent description cannot be empty' };
      }

      if (description.length > 280) {
        return { isValid: false, error: 'Agent description must be 280 characters or less' };
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Failed to validate Agent description:', error);
      return { isValid: false, error: 'Validation failed' };
    }
  }

  /**
   * Publish Agent as Public
   */
  async publishAgent(agentId: string, userId: string): Promise<Agent> {
    try {
      // Check if Agent exists and belongs to the user
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent not found or access denied');
      }

      // Check if already public
      if (existingAgent.status === 'public') {
        return existingAgent;
      }

      // Update to public status
      const updatedAgent = await agentDao.updateAgent(agentId, { status: 'public' });
      if (!updatedAgent) {
        throw new Error('Failed to publish Agent');
      }

      logger.info(`Agent published as public: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`Failed to publish Agent [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * Make Agent Private
   */
  async makeAgentPrivate(agentId: string, userId: string): Promise<Agent> {
    try {
      // Check if Agent exists and belongs to the user
      const existingAgent = await agentDao.getAgentById(agentId);
      if (!existingAgent || existingAgent.userId !== userId) {
        throw new Error('Agent not found or access denied');
      }

      // Check if already private
      if (existingAgent.status === 'private') {
        return existingAgent;
      }

      // Update to private status
      const updatedAgent = await agentDao.updateAgent(agentId, { status: 'private' });
      if (!updatedAgent) {
        throw new Error('Failed to make Agent private');
      }

      logger.info(`Agent made private: ${agentId} (${updatedAgent.name})`);
      return updatedAgent;
    } catch (error) {
      logger.error(`Failed to make Agent private [ID: ${agentId}]:`, error);
      throw error;
    }
  }

  /**
   * Generate Agent name and description (for frontend display)
   */
  async generateAgentInfo(taskId: string, userId: string): Promise<{
    name: string;
    description: string;
  }> {
    try {
      logger.info(`Generating Agent info for task ${taskId} by user ${userId}`);
      
      // Get task information
      const task = await getTaskService().getTaskById(taskId);
      
      // 详细的错误检查和日志
      if (!task) {
        logger.warn(`Task not found: ${taskId} (requested by user: ${userId})`);
        throw new Error(`Task with ID ${taskId} not found`);
      }
      
      if (task.userId !== userId) {
        logger.warn(`Access denied: User ${userId} attempted to access task ${taskId} owned by user ${task.userId}`);
        throw new Error(`Access denied: This task belongs to another user`);
      }

      // Check if task is completed
      if (task.status !== 'completed') {
        logger.warn(`Task ${taskId} is not completed (status: ${task.status}), cannot create Agent`);
        throw new Error(`Task is not completed (status: ${task.status}), cannot create Agent`);
      }

      logger.info(`Task ${taskId} validation passed, generating Agent info...`);

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

      logger.info(`Successfully generated Agent info for task ${taskId}: name="${name}"`);

      return {
        name,
        description
      };
    } catch (error) {
      logger.error(`Failed to generate Agent info [TaskID: ${taskId}, UserID: ${userId}]:`, error);
      throw error;
    }
  }

  /**
   * Preview Agent information created from task (user preview before saving)
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
   * Create Agent from completed task
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

      // Get user information for username and avatar
      const user = await userService.getUserById(userId);

      // Create Agent
      const createRequest: CreateAgentRequest = {
        userId,
        username: user?.username,
        avatar: user?.avatar,
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
          category: categories[0] // For backward compatibility, keep single category
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
   * Extract category list from MCP workflow
   */
  private extractCategoriesFromMCPs(mcpWorkflow?: any): string[] {
    if (!mcpWorkflow?.mcps || mcpWorkflow.mcps.length === 0) {
      return ['General'];
    }

    // Extract categories directly from MCP category field
    const categories = new Set<string>();
    
    mcpWorkflow.mcps.forEach((mcp: any) => {
      if (mcp.category) {
        categories.add(mcp.category);
      }
    });

    // If no categories extracted from category field, infer from MCP names
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

      // If still no categories, add default
      if (categories.size === 0) {
        categories.add('General');
      }
    }

    return Array.from(categories);
  }

  /**
   * Check MCP authentication status for Agent workflow
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

      // Check each MCP that requires authentication
      for (const mcp of mcpWorkflow.mcps) {
        if (mcp.authRequired) {
          // Check if user has verified this MCP
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
      logger.error(`Failed to check Agent MCP authentication status [Agent: ${agent.id}]:`, error);
      return {
        needsAuth: true,
        missingAuth: [],
        message: 'Error occurred while checking authentication status'
      };
    }
  }

  /**
   * Start multi-turn conversation with Agent
   * Now uses dedicated AgentConversationService
   */
  async tryAgent(request: TryAgentRequest): Promise<TryAgentResponse> {
    try {
      // Check if TaskExecutorService is available
      if (!this.taskExecutorService) {
        return {
          success: false,
          message: 'Task executor service not available'
        };
      }

      // Import AgentConversationService dynamically to avoid circular dependency
      const { getAgentConversationService } = await import('./agentConversationService.js');

      // Get AgentConversationService instance
      const agentConversationService = getAgentConversationService(this.taskExecutorService);
      
      // Delegate to dedicated Agent conversation service
      return await agentConversationService.startAgentTrial(request);
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
        const response = await this. chatWithAgent(content, agent);
        
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

TASK INDICATORS (classify as "task"):
- Action requests: "Help me...", "Show me...", "Create...", "Generate...", "Analyze...", "Get...", "Find...", "Execute..."
- Imperative statements: "Do this...", "Make a...", "Build...", "Search for...", "Retrieve..."
- Task-oriented requests related to the agent's capabilities
- Questions that expect the agent to perform actions or use its tools
- Requests for the agent to demonstrate its functionality

CHAT INDICATORS (classify as "chat"):
- General conversation: "Hello", "How are you?", "Nice to meet you"
- Philosophical discussions or opinions
- Casual small talk
- Questions about the agent's nature or feelings (not capabilities)

Look for action words, specific requests, or task-oriented language.
If the user's message relates to using the agent's capabilities or tools, classify as "task".
If the user's message is asking the agent to perform any action, classify as "task".

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
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content: content,
        conversationId
      });

      // 应用Agent的工作流
      if (agent.mcpWorkflow) {
      await taskService.updateTask(task.id, {
        mcpWorkflow: agent.mcpWorkflow,
          status: 'created'
        });
        
        logger.info(`Applied Agent workflow to task [Agent: ${agent.name}, Task: ${task.id}]`);
      }

      // 检查是否有TaskExecutorService
      if (!this.taskExecutorService) {
        logger.warn('TaskExecutorService not available, returning task creation confirmation');
        return `Task created with ${agent.name}'s capabilities: "${task.title}"\n\nTask ID: ${task.id}\n\n*Note: Task execution service not available. Task has been queued for execution.*`;
      }

      // 执行任务使用Agent的工作流
      try {
        logger.info(`Executing task with Agent workflow [Agent: ${agent.name}, Task: ${task.id}]`);
        
        const executionSuccess = await this.taskExecutorService.executeTaskStream(task.id, (data) => {
          // Silent execution for non-streaming context
          logger.debug(`Task execution progress: ${JSON.stringify(data)}`);
        });

        if (executionSuccess) {
          // 获取完成后的任务结果
          const completedTask = await taskService.getTaskById(task.id);
          
          const successMessage = `✅ Task completed successfully using ${agent.name}'s capabilities!

**Task**: ${task.title}
**Agent**: ${agent.name}
**Status**: ${completedTask?.status || 'completed'}

I've successfully executed this task using my specialized tools and workflow. The task has been completed and the results are available.`;

          return successMessage;
        } else {
          return `⚠️ Task execution completed with warnings using ${agent.name}'s capabilities.

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

The task has been processed, but some steps may have encountered issues. Please check the task details for more information.`;
        }
      } catch (executionError) {
        logger.error(`Agent task execution failed [Task: ${task.id}]:`, executionError);
        return `❌ Task execution failed: ${executionError instanceof Error ? executionError.message : 'Unknown error'}

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

I encountered an error while executing this task. Please try again or check the task configuration.`;
      }
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

  /**
   * 生成Agent欢迎语
   */
  async generateAgentWelcomeMessage(agentId: string): Promise<string> {
    try {
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const capabilities = agent.mcpWorkflow && agent.mcpWorkflow.mcps 
        ? agent.mcpWorkflow.mcps.map((m: any) => m.description || m.name).join(', ')
        : 'general assistance';

      return `Hello! I'm ${agent.name}. ${agent.description}

My capabilities include: ${capabilities}

You can:
- Chat with me about anything
- Ask me to help with tasks related to my capabilities
- Request me to demonstrate my functionality

How can I assist you today?`;
    } catch (error) {
      logger.error(`Failed to generate welcome message for agent ${agentId}:`, error);
      throw error;
    }
  }
}

// 单例实例
let agentServiceInstance: AgentService | null = null;

/**
 * 获取AgentService实例
 */
export function getAgentService(taskExecutorService?: TaskExecutorService): AgentService {
  if (!agentServiceInstance) {
    agentServiceInstance = new AgentService(taskExecutorService);
  }
  return agentServiceInstance;
}

// 向后兼容的导出（不建议使用，因为没有TaskExecutorService）
export const agentService = new AgentService(); 