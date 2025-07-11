import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { BufferMemory } from 'langchain/memory';
import { logger } from '../utils/logger.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { agentDao } from '../dao/agentDao.js';
import { getTaskService } from './taskService.js';
import { TaskExecutorService } from './taskExecutorService.js';
import { MCPAuthService } from './mcpAuthService.js';
import { 
  Agent, 
  TryAgentRequest, 
  TryAgentResponse,
  MCPAuthCheckResult 
} from '../models/agent.js';
import { 
  Message, 
  MessageType, 
  MessageIntent, 
  Conversation 
} from '../models/conversation.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent Conversation Service - Dedicated service for Agent multi-turn conversations
 * 
 * This service handles all Agent-specific conversation logic independently from
 * traditional task execution conversations, providing:
 * - Agent trial conversation management
 * - Agent-specific intent analysis
 * - Agent task execution with specialized workflow
 * - Agent chat with personality and context
 * - Streaming responses for real-time interaction
 */
export class AgentConversationService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;
  private taskExecutorService: TaskExecutorService;
  private conversationMemories: Map<string, BufferMemory> = new Map();

  constructor(taskExecutorService: TaskExecutorService) {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
      streaming: true,
    });
    this.mcpAuthService = new MCPAuthService();
    this.taskExecutorService = taskExecutorService;
  }

  /**
   * Start Agent trial conversation
   */
  async startAgentTrial(request: TryAgentRequest): Promise<TryAgentResponse> {
    try {
      const { agentId, content, userId } = request;

      // Get Agent information
      const agent = await agentDao.getAgentById(agentId);
      if (!agent) {
        return {
          success: false,
          message: 'Agent not found'
        };
      }

      // Check if Agent is accessible
      if (agent.status === 'private' && agent.userId !== userId) {
        return {
          success: false,
          message: 'Access denied: This is a private Agent'
        };
      }

      // Check MCP authentication status
      const authCheck = await this.checkAgentMCPAuth(agent, userId);
      if (authCheck.needsAuth) {
        return {
          success: false,
          needsAuth: true,
          missingAuth: authCheck.missingAuth,
          message: authCheck.message
        };
      }

      // Create Agent conversation
      const conversation = await this.createAgentConversation(userId, agent);

      // Send welcome message
      const welcomeMessage = await this.generateWelcomeMessage(agent);
      await messageDao.createMessage({
        conversationId: conversation.id,
        content: welcomeMessage,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });

      // If user provided initial content, process it
      if (content && content.trim()) {
        await this.processAgentMessage(conversation.id, userId, content, agent);
      }

      // Record Agent usage
      await agentDao.recordAgentUsage(agentId, userId, undefined, conversation.id);

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
   * Process Agent message (non-streaming)
   */
  async processAgentMessage(
    conversationId: string, 
    userId: string, 
    content: string, 
    agent?: Agent
  ): Promise<{
    userMessage: Message;
    assistantMessage: Message;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // Get Agent if not provided
      if (!agent) {
        const agentId = await this.extractAgentIdFromConversation(conversationId);
        if (!agentId) {
          throw new Error('Invalid Agent conversation');
        }
        
        const agentRecord = await agentDao.getAgentById(agentId);
        if (!agentRecord) {
          throw new Error('Agent not found');
        }
        agent = agentRecord;
      }

      // 🔧 重要修复：在消息处理前检查MCP认证状态
      const authCheck = await this.checkAgentMCPAuth(agent, userId);
      if (authCheck.needsAuth) {
        // 创建用户消息
        const userMessage = await messageDao.createMessage({
          conversationId,
          content,
          type: MessageType.USER,
          intent: MessageIntent.UNKNOWN
        });

        // 创建认证提示消息
        const authMessage = this.generateMCPAuthMessage(authCheck.missingAuth);
        const assistantMessage = await messageDao.createMessage({
          conversationId,
          content: authMessage,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });

        return {
          userMessage,
          assistantMessage,
          intent: MessageIntent.CHAT
        };
      }

      // Create user message
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN
      });

      // Increment message count
      await conversationDao.incrementMessageCount(conversationId);

      // Analyze user intent
      const intent = await this.analyzeAgentUserIntent(content, agent);

      // Update user message intent
      await messageDao.updateMessageIntent(
        userMessage.id, 
        intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT
      );

      // Process based on intent
      let assistantMessage: Message;
      let taskId: string | undefined;

      if (intent.type === 'task') {
        // Execute Agent task
        const taskResult = await this.executeAgentTask(content, agent, userId, conversationId);
        
        assistantMessage = await messageDao.createMessage({
          conversationId,
          content: taskResult.response,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK
        });
        
        taskId = taskResult.taskId;
        
        // Link user message to task
        if (taskId) {
          await messageDao.linkMessageToTask(userMessage.id, taskId);
        }
        
        // Increment task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Chat with Agent
        const chatResponse = await this.chatWithAgent(content, agent, conversationId);
        
        assistantMessage = await messageDao.createMessage({
          conversationId,
          content: chatResponse,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });
      }

      // Increment message count
      await conversationDao.incrementMessageCount(conversationId);

      return {
        userMessage,
        assistantMessage,
        intent: intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT,
        taskId
      };
    } catch (error) {
      logger.error(`Process Agent message failed [Conversation: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Process Agent message (streaming)
   */
  async processAgentMessageStream(
    conversationId: string,
    userId: string,
    content: string,
    streamCallback: (chunk: any) => void,
    agent?: Agent
  ): Promise<{
    userMessageId: string;
    assistantMessageId: string;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // Get Agent if not provided
      if (!agent) {
        streamCallback({
          event: 'agent_loading',
          data: { status: 'loading' }
        });

        const agentId = await this.extractAgentIdFromConversation(conversationId);
        if (!agentId) {
          throw new Error('Invalid Agent conversation');
        }
        
        const agentRecord = await agentDao.getAgentById(agentId);
        if (!agentRecord) {
          throw new Error('Agent not found');
        }
        agent = agentRecord;

        streamCallback({
          event: 'agent_loaded',
          data: { 
            agentId: agent.id,
            agentName: agent.name
          }
        });
      }

      // 🔧 重要修复：在消息处理前检查MCP认证状态
      streamCallback({
        event: 'auth_checking',
        data: { message: 'Checking MCP authentication status...' }
      });

      const authCheck = await this.checkAgentMCPAuth(agent, userId);
      if (authCheck.needsAuth) {
        streamCallback({
          event: 'auth_required',
          data: { 
            message: 'MCP authentication required',
            missingAuth: authCheck.missingAuth
          }
        });

        // 创建用户消息
        const userMessage = await messageDao.createMessage({
          conversationId,
          content,
          type: MessageType.USER,
          intent: MessageIntent.UNKNOWN
        });

        // 创建认证提示消息
        const authMessage = this.generateMCPAuthMessage(authCheck.missingAuth);
        const assistantMessage = await messageDao.createMessage({
          conversationId,
          content: authMessage,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });

        streamCallback({
          event: 'message_complete',
          data: { 
            messageId: assistantMessage.id,
            content: authMessage
          }
        });

        return {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          intent: MessageIntent.CHAT
        };
      }

      streamCallback({
        event: 'auth_verified',
        data: { message: 'MCP authentication verified' }
      });

      // Create user message
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN
      });

      streamCallback({
        event: 'user_message_created',
        data: { messageId: userMessage.id }
      });

      // Increment message count
      await conversationDao.incrementMessageCount(conversationId);

      // Analyze user intent
      streamCallback({
        event: 'intent_analysis_start',
        data: { message: 'Analyzing user intent...' }
      });

      const intent = await this.analyzeAgentUserIntent(content, agent);

      streamCallback({
        event: 'intent_analysis_complete',
        data: { 
          intent: intent.type,
          confidence: intent.confidence
        }
      });

      // Update user message intent
      await messageDao.updateMessageIntent(
        userMessage.id, 
        intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT
      );

      // Process based on intent
      let assistantMessageId: string;
      let taskId: string | undefined;

      if (intent.type === 'task') {
        // Execute Agent task with streaming
        const taskResult = await this.executeAgentTaskStream(content, agent, userId, conversationId, streamCallback);
        assistantMessageId = taskResult.assistantMessageId;
        taskId = taskResult.taskId;
        
        // Link user message to task
        if (taskId) {
          await messageDao.linkMessageToTask(userMessage.id, taskId);
        }
        
        // Increment task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Chat with Agent using streaming
        const chatResult = await this.chatWithAgentStream(content, agent, conversationId, (chunk) => {
          streamCallback({
            event: 'chat_chunk',
            data: { content: chunk }
          });
        });
        
        assistantMessageId = chatResult.assistantMessageId;
      }

      // Increment message count
      await conversationDao.incrementMessageCount(conversationId);

      return {
        userMessageId: userMessage.id,
        assistantMessageId,
        intent: intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT,
        taskId
      };
    } catch (error) {
      logger.error(`Process Agent message stream failed [Conversation: ${conversationId}]:`, error);
      
      streamCallback({
        event: 'error',
        data: { 
          message: 'Failed to process message',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      
      throw error;
    }
  }

  /**
   * Analyze user intent for Agent conversations
   */
  private async analyzeAgentUserIntent(
    content: string, 
    agent: Agent
  ): Promise<{ type: 'chat' | 'task'; confidence: number }> {
    try {
      const prompt = `Analyze the user's intent based on their message and the agent's capabilities.

Agent: ${agent.name}
Description: ${agent.description}
Capabilities: ${agent.mcpWorkflow ? 
  JSON.stringify(agent.mcpWorkflow.mcps?.map((m: any) => m.name)) : 
  'general assistance'}

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

      const response = await this.llm.invoke([new SystemMessage(prompt)]);
      const result = JSON.parse(response.content as string);
      
      return {
        type: result.type,
        confidence: result.confidence
      };
    } catch (error) {
      logger.error('Analyze Agent user intent failed:', error);
      // Default to chat
      return { type: 'chat', confidence: 0.5 };
    }
  }

  /**
   * Execute Agent task
   */
  private async executeAgentTask(
    content: string, 
    agent: Agent, 
    userId: string, 
    conversationId: string
  ): Promise<{ response: string; taskId: string }> {
    try {
      // Create task based on Agent's workflow
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: content.length > 50 ? content.substring(0, 50) + '...' : content,
        content,
        conversationId
      });

      // Apply Agent's workflow to the task
      if (agent.mcpWorkflow) {
        await taskService.updateTask(task.id, {
          mcpWorkflow: agent.mcpWorkflow,
          status: 'created'
        });
        
        logger.info(`Applied Agent workflow to task [Agent: ${agent.name}, Task: ${task.id}]`);
        
        // 🔧 关键修复：在任务执行前验证和预连接所需的MCP
        await this.ensureAgentMCPsConnected(agent, userId, task.id);
      }

      // Execute the task using Agent's workflow
      try {
        logger.info(`Executing Agent task [Agent: ${agent.name}, Task: ${task.id}]`);
        
        const executionSuccess = await this.taskExecutorService.executeTaskStream(task.id, (data) => {
          // Silent execution for non-streaming context
          logger.debug(`Agent task execution progress: ${JSON.stringify(data)}`);
        });

        if (executionSuccess) {
          // Get the completed task with results
          const completedTask = await taskService.getTaskById(task.id);
          
          const successResponse = `✅ Task completed successfully using ${agent.name}'s capabilities!

**Task**: ${task.title}
**Agent**: ${agent.name}
**Status**: ${completedTask?.status || 'completed'}

I've successfully executed this task using my specialized tools and workflow. The task has been completed and the results are available.`;

          return { response: successResponse, taskId: task.id };
        } else {
          const warningResponse = `⚠️ Task execution completed with warnings using ${agent.name}'s capabilities.

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

The task has been processed, but some steps may have encountered issues. Please check the task details for more information.`;

          return { response: warningResponse, taskId: task.id };
        }
      } catch (executionError) {
        logger.error(`Agent task execution failed [Task: ${task.id}]:`, executionError);
        
        const errorResponse = `❌ Task execution failed: ${executionError instanceof Error ? executionError.message : 'Unknown error'}

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

I encountered an error while executing this task. Please try again or check the task configuration.`;

        return { response: errorResponse, taskId: task.id };
      }
    } catch (error) {
      logger.error('Execute Agent task failed:', error);
      throw error;
    }
  }

  /**
   * Execute Agent task (streaming)
   */
  private async executeAgentTaskStream(
    content: string, 
    agent: Agent, 
    userId: string, 
    conversationId: string,
    streamCallback: (chunk: any) => void
  ): Promise<{ assistantMessageId: string; taskId: string }> {
    try {
      streamCallback({
        event: 'task_creation_start',
        data: { message: 'Creating task based on Agent workflow...' }
      });

      // Create task based on Agent's workflow
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: content.length > 50 ? content.substring(0, 50) + '...' : content,
        content,
        conversationId
      });

      streamCallback({
        event: 'task_created',
        data: { 
          taskId: task.id,
          title: task.title,
          message: `Task created: ${task.title}`
        }
      });

      // Apply Agent's workflow to the task
      if (agent.mcpWorkflow) {
        streamCallback({
          event: 'workflow_applying',
          data: { message: 'Applying Agent workflow configuration...' }
        });

        await taskService.updateTask(task.id, {
          mcpWorkflow: agent.mcpWorkflow,
          status: 'created'
        });

        streamCallback({
          event: 'workflow_applied',
          data: { 
            message: 'Agent workflow applied successfully',
            mcpCount: agent.mcpWorkflow.mcps?.length || 0
          }
        });
        
        // 🔧 关键修复：在任务执行前验证和预连接所需的MCP
        streamCallback({
          event: 'mcp_connection_start',
          data: { message: 'Verifying and connecting required MCP services...' }
        });
        
        try {
          await this.ensureAgentMCPsConnected(agent, userId, task.id);
          streamCallback({
            event: 'mcp_connection_success',
            data: { message: 'All required MCP services connected successfully' }
          });
        } catch (mcpError) {
          streamCallback({
            event: 'mcp_connection_error',
            data: { 
              message: 'Failed to connect required MCP services',
              error: mcpError instanceof Error ? mcpError.message : 'Unknown error'
            }
          });
          throw mcpError;
        }
      }

      // Execute the task using Agent's workflow
      let executionSuccess = false;
      let executionError: Error | null = null;

      try {
        streamCallback({
          event: 'task_execution_start',
          data: { message: 'Starting task execution with Agent workflow...' }
        });

        executionSuccess = await this.taskExecutorService.executeTaskStream(task.id, (executionData) => {
          // Forward task execution events to the client
          streamCallback({
            event: 'task_execution_progress',
            data: executionData
          });
        });

        streamCallback({
          event: 'task_execution_complete',
          data: { 
            message: executionSuccess ? 'Task execution completed successfully' : 'Task execution completed with warnings',
            taskId: task.id,
            success: executionSuccess
          }
        });
      } catch (error) {
        executionError = error instanceof Error ? error : new Error(String(error));
        streamCallback({
          event: 'task_execution_error',
          data: { 
            message: 'Task execution failed',
            error: executionError.message,
            taskId: task.id
          }
        });
      }

      // Create assistant message based on execution result
      let assistantContent: string;
      if (executionError) {
        assistantContent = `❌ Task execution failed: ${executionError.message}

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

I encountered an error while executing this task. Please try again or check the task configuration.`;
      } else if (executionSuccess) {
        assistantContent = `✅ Task completed successfully using ${agent.name}'s capabilities!

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

I've successfully executed this task using my specialized tools and workflow. The task has been completed and the results are available.`;
      } else {
        assistantContent = `⚠️ Task execution completed with warnings using ${agent.name}'s capabilities.

**Task**: ${task.title}
**Agent**: ${agent.name}
**Task ID**: ${task.id}

The task has been processed, but some steps may have encountered issues. Please check the task details for more information.`;
      }

      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: assistantContent,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK
      });

      streamCallback({
        event: 'message_complete',
        data: { 
          messageId: assistantMessage.id,
          content: assistantContent,
          taskId: task.id
        }
      });

      return { 
        assistantMessageId: assistantMessage.id, 
        taskId: task.id 
      };
    } catch (error) {
      logger.error('Execute Agent task stream failed:', error);
      throw error;
    }
  }

  /**
   * 🔧 新增：确保Agent所需的MCP服务已连接并具有正确的认证信息（多用户隔离）
   */
  private async ensureAgentMCPsConnected(agent: Agent, userId: string, taskId: string): Promise<void> {
    if (!agent.mcpWorkflow || !agent.mcpWorkflow.mcps || agent.mcpWorkflow.mcps.length === 0) {
      logger.info(`Agent ${agent.name} does not require MCP services`);
      return;
    }

    // 通过TaskExecutorService访问MCPManager
    const mcpManager = (this.taskExecutorService as any).mcpManager;
    const requiredMCPs = agent.mcpWorkflow.mcps.filter((mcp: any) => mcp.authRequired);

    if (requiredMCPs.length === 0) {
      logger.info(`Agent ${agent.name} does not require authenticated MCP services`);
      return;
    }

    logger.info(`Ensuring MCP connections for Agent ${agent.name} (User: ${userId}), required MCPs: ${requiredMCPs.map((mcp: any) => mcp.name).join(', ')}`);

    for (const mcpInfo of requiredMCPs) {
      try {
        // 🔧 重要修复：检查用户特定的MCP连接
        const connectedMCPs = mcpManager.getConnectedMCPs(userId);
        const isConnected = connectedMCPs.some((mcp: any) => mcp.name === mcpInfo.name);

        if (!isConnected) {
          logger.info(`MCP ${mcpInfo.name} not connected for user ${userId}, attempting to connect for Agent task...`);
          
          // 获取MCP配置
          const { getPredefinedMCP } = await import('./predefinedMCPs.js');
          const mcpConfig = getPredefinedMCP(mcpInfo.name);
          
          if (!mcpConfig) {
            throw new Error(`MCP ${mcpInfo.name} configuration not found`);
          }

          // 获取用户认证信息
          const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpInfo.name);
          if (!userAuth || !userAuth.isVerified || !userAuth.authData) {
            throw new Error(`User authentication not found or not verified for MCP ${mcpInfo.name}. Please authenticate this MCP service first.`);
          }

          // 动态注入认证信息
          const dynamicEnv = { ...mcpConfig.env };
          if (mcpConfig.env) {
            for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
              if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                dynamicEnv[envKey] = userAuth.authData[envKey];
                logger.info(`Injected authentication for ${envKey} in MCP ${mcpInfo.name} for user ${userId}`);
              }
            }
          }

          // 创建带认证信息的MCP配置
          const authenticatedMcpConfig = {
            ...mcpConfig,
            env: dynamicEnv
          };

          // 🔧 重要修复：连接MCP时传递用户ID实现多用户隔离
          const connected = await mcpManager.connectPredefined(authenticatedMcpConfig, userId);
          if (!connected) {
            throw new Error(`Failed to connect to MCP ${mcpInfo.name} for user ${userId}`);
          }

          logger.info(`✅ Successfully connected MCP ${mcpInfo.name} for user ${userId} and Agent task`);
        } else {
          logger.info(`✅ MCP ${mcpInfo.name} already connected for user ${userId}`);
        }
      } catch (error) {
        logger.error(`Failed to ensure MCP connection for ${mcpInfo.name} (User: ${userId}):`, error);
        throw new Error(`Failed to connect required MCP service ${mcpInfo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`✅ All required MCP services connected for Agent ${agent.name} (User: ${userId})`);
  }

  /**
   * Chat with Agent
   */
  private async chatWithAgent(
    content: string, 
    agent: Agent, 
    conversationId: string
  ): Promise<string> {
    try {
      logger.info(`[Agent Chat] Processing chat with ${agent.name} [Conversation: ${conversationId}]`);
      
      // Get conversation memory
      const memory = this.getConversationMemory(conversationId);
      
      // Load memory variables
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = memoryVariables.chat_history || [];
      
      // Create Agent role prompt template
      const agentPrompt = ChatPromptTemplate.fromMessages([
        ['system', `You are ${agent.name}, an AI agent with the following characteristics:

Description: ${agent.description}

Your capabilities include: ${agent.mcpWorkflow ? 
        agent.mcpWorkflow.mcps?.map((m: any) => m.description).join(', ') : 
        'general assistance'}

Respond to the user's message in a helpful and friendly manner, staying in character as this agent. 
If they ask about your capabilities, mention what you can help with based on your description and tools.
Remember the conversation context and provide coherent, helpful responses.`],
        ...chatHistory.map((msg: any) => {
          if (msg._getType() === 'human') {
            return ['human', msg.content];
          } else if (msg._getType() === 'ai') {
            return ['assistant', msg.content];
          }
          return ['system', msg.content];
        }),
        ['human', content]
      ]);
      
      // Format messages
      const formattedMessages = await agentPrompt.formatMessages({});
      
      // Call LLM
      const response = await this.llm.invoke(formattedMessages);
      
      // Save to memory
      await memory.saveContext(
        { input: content },
        { output: response.content.toString() }
      );
      
      logger.info(`[Agent Chat] Successfully processed chat with memory support`);
      
      return response.content.toString();
    } catch (error) {
      logger.error(`[Agent Chat] Error processing chat with ${agent.name}:`, error);
      
      // Return fallback response
      return `Hello! I'm ${agent.name}. I'd be happy to help you, but I encountered an error processing your message. Could you please try again?`;
    }
  }

  /**
   * Chat with Agent (streaming)
   */
  private async chatWithAgentStream(
    content: string, 
    agent: Agent, 
    conversationId: string,
    streamCallback: (chunk: string) => void
  ): Promise<{ assistantMessageId: string }> {
    try {
      logger.info(`[Agent Chat Stream] Processing chat with ${agent.name} [Conversation: ${conversationId}]`);
      
      // Create empty assistant message
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: '',  // Empty content, will be updated after stream processing
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // Get conversation memory
      const memory = this.getConversationMemory(conversationId);
      
      // Load memory variables
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = memoryVariables.chat_history || [];
      
      // Create Agent role prompt template
      const agentPrompt = ChatPromptTemplate.fromMessages([
        ['system', `You are ${agent.name}, an AI agent with the following characteristics:

Description: ${agent.description}

Your capabilities include: ${agent.mcpWorkflow ? 
        agent.mcpWorkflow.mcps?.map((m: any) => m.description).join(', ') : 
        'general assistance'}

Respond to the user's message in a helpful and friendly manner, staying in character as this agent. 
If they ask about your capabilities, mention what you can help with based on your description and tools.
Remember the conversation context and provide coherent, helpful responses.`],
        ...chatHistory.map((msg: any) => {
          if (msg._getType() === 'human') {
            return ['human', msg.content];
          } else if (msg._getType() === 'ai') {
            return ['assistant', msg.content];
          }
          return ['system', msg.content];
        }),
        ['human', content]
      ]);
      
      // Format messages
      const formattedMessages = await agentPrompt.formatMessages({});
      
      // Prepare streaming response handling
      let fullResponse = '';
      
      // Call LLM with streaming
      const stream = await this.llm.stream(formattedMessages);
      
      // Process streaming response
      for await (const chunk of stream) {
        if (chunk.content) {
          fullResponse += chunk.content;
          streamCallback(chunk.content as string);
        }
      }
      
      // Update assistant message with complete content
      await messageDao.updateMessageContent(assistantMessage.id, fullResponse);
      
      // Save to memory
      await memory.saveContext(
        { input: content },
        { output: fullResponse }
      );
      
      logger.info(`[Agent Chat Stream] Chat completed with ${agent.name}, response length: ${fullResponse.length}`);
      
      return {
        assistantMessageId: assistantMessage.id
      };
    } catch (error) {
      logger.error(`[Agent Chat Stream] Error processing chat with ${agent.name}:`, error);
      
      // Create fallback response
      const fallbackResponse = `Hello! I'm ${agent.name}. I'd be happy to help you, but I encountered an error processing your message. Could you please try again?`;
      
      const fallbackMessage = await messageDao.createMessage({
        conversationId,
        content: fallbackResponse,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      streamCallback(fallbackResponse);
      
      return {
        assistantMessageId: fallbackMessage.id
      };
    }
  }

  /**
   * Create Agent conversation
   */
  private async createAgentConversation(userId: string, agent: Agent): Promise<Conversation> {
    const conversation = await conversationDao.createConversation({
      userId,
      title: `[AGENT:${agent.id}] Try ${agent.name}`
    });

    return conversation;
  }

  /**
   * Generate welcome message for Agent
   */
  private async generateWelcomeMessage(agent: Agent): Promise<string> {
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
  }

  /**
   * Check Agent MCP authentication
   */
  private async checkAgentMCPAuth(agent: Agent, userId: string): Promise<MCPAuthCheckResult> {
    if (!agent.mcpWorkflow || !agent.mcpWorkflow.mcps) {
      return { needsAuth: false, missingAuth: [] };
    }

    const missingAuth: any[] = [];
    
    for (const mcp of agent.mcpWorkflow.mcps) {
      if (mcp.authRequired) {
        const authData = await this.mcpAuthService.getUserMCPAuth(userId, mcp.name);
        const isAuthenticated = authData && authData.isVerified;
        if (!isAuthenticated) {
          // 🔧 重要修复：返回完整的认证参数信息给前端
          missingAuth.push({
            mcpName: mcp.name,
            description: mcp.description || mcp.name,
            category: mcp.category || 'Unknown',
            imageUrl: mcp.imageUrl,
            githubUrl: mcp.githubUrl,
            authParams: mcp.authParams || {},
            // 添加认证指引信息
            authInstructions: this.generateAuthInstructions(mcp.name, mcp.authParams)
          });
        }
      }
    }

    if (missingAuth.length > 0) {
      return {
        needsAuth: true,
        missingAuth,
        message: 'Please verify authentication for all relevant MCP servers first.'
      };
    }

    return { needsAuth: false, missingAuth: [] };
  }

  /**
   * 🔧 新增：生成MCP认证指引信息
   */
  private generateAuthInstructions(mcpName: string, authParams?: Record<string, any>): string {
    const baseInstructions = `To use ${mcpName}, you need to provide authentication credentials.`;
    
    if (!authParams || Object.keys(authParams).length === 0) {
      return baseInstructions;
    }

    const paramsList = Object.entries(authParams).map(([key, config]: [string, any]) => {
      const description = config.description || `${key} parameter`;
      const required = config.required ? ' (Required)' : ' (Optional)';
      return `• ${key}: ${description}${required}`;
    }).join('\n');

    return `${baseInstructions}\n\nRequired parameters:\n${paramsList}`;
  }

  /**
   * 🔧 新增：生成MCP认证提示消息
   */
  private generateMCPAuthMessage(missingAuth: any[]): string {
    const mcpNames = missingAuth.map(auth => auth.mcpName).join(', ');
    
    let message = `🔐 **Authentication Required**

To use my capabilities, you need to authenticate the following MCP services: **${mcpNames}**

`;

    missingAuth.forEach((auth, index) => {
      message += `**${index + 1}. ${auth.mcpName}**\n`;
      message += `${auth.description}\n`;
      
      if (auth.authInstructions) {
        message += `${auth.authInstructions}\n`;
      }
      
      if (auth.authParams && Object.keys(auth.authParams).length > 0) {
        message += `\nRequired authentication parameters:\n`;
        Object.entries(auth.authParams).forEach(([key, config]: [string, any]) => {
          const description = config.description || key;
          const required = config.required ? ' ✅' : ' ⚪';
          message += `${required} **${key}**: ${description}\n`;
        });
      }
      
      message += '\n';
    });

    message += `Please use the MCP authentication interface to provide your credentials, then try again.

💡 **How to authenticate:**
1. Go to the MCP settings page
2. Find the required MCP services listed above
3. Click "Authenticate" and provide your credentials
4. Return here and try your request again

Once authenticated, I'll be able to help you with tasks using these powerful tools! 🚀`;

    return message;
  }

  /**
   * Extract Agent ID from conversation
   */
  private async extractAgentIdFromConversation(conversationId: string): Promise<string | null> {
    const conversation = await conversationDao.getConversationById(conversationId);
    if (!conversation) return null;

    // Parse Agent ID from title
    const match = conversation.title.match(/^\[AGENT:([^\]]+)\]/);
    return match ? match[1] : null;
  }

  /**
   * Get conversation memory
   */
  private getConversationMemory(conversationId: string): BufferMemory {
    if (!this.conversationMemories.has(conversationId)) {
      const memory = new BufferMemory({
        memoryKey: 'chat_history',
        returnMessages: true,
        inputKey: 'input',
        outputKey: 'output'
      });
      this.conversationMemories.set(conversationId, memory);
    }
    return this.conversationMemories.get(conversationId)!;
  }

  /**
   * Clear conversation memory
   */
  async clearConversationMemory(conversationId: string): Promise<void> {
    if (this.conversationMemories.has(conversationId)) {
      const memory = this.conversationMemories.get(conversationId)!;
      await memory.clear();
      this.conversationMemories.delete(conversationId);
    }
  }

  /**
   * Check if conversation is Agent conversation
   */
  async isAgentConversation(conversationId: string): Promise<boolean> {
    const agentId = await this.extractAgentIdFromConversation(conversationId);
    return agentId !== null;
  }

  /**
   * Get Agent from conversation
   */
  async getAgentFromConversation(conversationId: string): Promise<Agent | null> {
    const agentId = await this.extractAgentIdFromConversation(conversationId);
    if (!agentId) return null;

    return await agentDao.getAgentById(agentId);
  }
}

// Singleton instance
let agentConversationServiceInstance: AgentConversationService | null = null;

/**
 * Get AgentConversationService instance
 */
export function getAgentConversationService(taskExecutorService: TaskExecutorService): AgentConversationService {
  if (!agentConversationServiceInstance) {
    agentConversationServiceInstance = new AgentConversationService(taskExecutorService);
  }
  return agentConversationServiceInstance;
} 