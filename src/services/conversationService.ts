import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate, ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BufferMemory } from 'langchain/memory';
import { conversationDao } from '../dao/conversationDao.js';
import { messageDao } from '../dao/messageDao.js';
import { logger } from '../utils/logger.js';
import { Conversation, ConversationSearchOptions, Message, MessageType, MessageIntent } from '../models/conversation.js';
import { getTaskService } from './taskService.js';
import { TaskExecutorService } from './taskExecutorService.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { titleGeneratorService } from './llmTasks/titleGenerator.js';
import { db } from '../config/database.js';
import { userService } from './auth/userService.js';
// import { HttpsProxyAgent } from 'https-proxy-agent';
// const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
// const agent = new HttpsProxyAgent(proxy);
/**
 * Conversation Service
 * Handles conversations and messages, as well as user intent recognition
 */
export class ConversationService {
  private llm: ChatOpenAI;
  private taskService = getTaskService();
  private mcpToolAdapter: MCPToolAdapter;
  private taskExecutorService: TaskExecutorService;
  private conversationMemories: Map<string, BufferMemory>;
  
  constructor(mcpToolAdapter: MCPToolAdapter, taskExecutorService: TaskExecutorService) {
    this.mcpToolAdapter = mcpToolAdapter;
    this.taskExecutorService = taskExecutorService;
    this.conversationMemories = new Map();
    
    this.llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  
  /**
   * 获取或创建会话记忆
   */
  private getConversationMemory(conversationId: string): BufferMemory {
    if (!this.conversationMemories.has(conversationId)) {
      const memory = new BufferMemory({
        returnMessages: true,
        memoryKey: 'chat_history'
      });
      this.conversationMemories.set(conversationId, memory);
    }
    return this.conversationMemories.get(conversationId)!;
  }
  
  /**
   * 使用LangChain增强的聊天处理
   */
  private async handleChatIntentEnhanced(conversationId: string, userId: string, content: string): Promise<{
    response: Message;
    taskId: undefined;
  }> {
    try {
      logger.info(`[LangChain] Processing chat intent with enhanced features [Conversation ID: ${conversationId}]`);
      
      // 获取会话记忆
      const memory = this.getConversationMemory(conversationId);
      
      // 从记忆中获取历史消息
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = memoryVariables.chat_history || [];
      
      // 创建增强的提示模板
      const enhancedPrompt = ChatPromptTemplate.fromMessages([
        ['system', `You are a helpful AI assistant having a conversation with a user.
Remember the conversation context and provide coherent, helpful responses.
If the user asks about performing specific tasks, you can suggest creating a task for them.`],
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
      
      // 格式化提示
      const formattedMessages = await enhancedPrompt.formatMessages({});
      
      // 调用LLM
      const response = await this.llm.invoke(formattedMessages);
      
      // 保存到记忆
      await memory.saveContext(
        { input: content },
        { output: response.content.toString() }
      );
      
      // 保存助手回复
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: response.content.toString(),
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // 增量会话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      logger.info(`[LangChain] Chat intent processed successfully with memory`);
      
      return {
        response: assistantMessage,
        taskId: undefined
      };
    } catch (error) {
      logger.error(`[LangChain] Error processing enhanced chat intent:`, error);
      
      // 降级到原有实现
      return this.handleChatIntent(conversationId, userId, content);
    }
  }
  
  /**
   * Create new conversation
   */
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    try {
      // Ensure user exists before creating conversation
      await userService.findOrCreateUserById(userId);
      
      // If no title provided, use default title
      const conversationTitle = title || `Conversation ${new Date().toLocaleString('en-US')}`;
      
      return await conversationDao.createConversation({
        userId,
        title: conversationTitle
      });
    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }
  
  /**
   * Create new conversation with first message and auto-generate title
   * 创建会话并基于第一条消息生成标题，但不存储消息（由前端后续调用发送消息接口处理）
   */
  async createConversationWithFirstMessage(
    userId: string, 
    firstMessage: string, 
    title?: string
  ): Promise<{
    conversation: Conversation;
    generatedTitle: string;
  }> {
    try {
      // Ensure user exists before creating conversation
      await userService.findOrCreateUserById(userId);
      
      logger.info(`Creating conversation with first message for title generation [User ID: ${userId}]`);
      
      // 1. 生成标题（如果没有提供）
      let conversationTitle = title;
      if (!conversationTitle) {
        logger.info('Generating title for conversation based on first message');
        try {
          // 尝试生成标题，如果失败则使用默认标题
          conversationTitle = await titleGeneratorService.generateTitle(firstMessage);
          logger.info(`Generated title: ${conversationTitle}`);
        } catch (error) {
          logger.warn('Title generation failed, using fallback title:', error);
          // 使用消息内容的前30个字符作为标题
          conversationTitle = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        }
      }
      
      // 2. 创建会话（不处理消息）
      const conversation = await conversationDao.createConversation({
        userId,
        title: conversationTitle
      });
      
      logger.info(`Conversation created with ID: ${conversation.id}, Title: ${conversationTitle}`);
      logger.info('First message will be processed by subsequent message sending request');
      
      return {
        conversation,
        generatedTitle: conversationTitle
      };
    } catch (error) {
      logger.error('Error creating conversation with first message:', error);
      throw error;
    }
  }
  
  /**
   * Create new conversation with first message (streaming version)
   * 创建会话并基于第一条消息生成标题的流式版本，但不存储消息
   */
  async createConversationWithFirstMessageStream(
    userId: string,
    firstMessage: string,
    title: string | undefined,
    streamCallback: (chunk: any) => void
  ): Promise<{
    conversationId: string;
    generatedTitle: string;
  }> {
    try {
      // Ensure user exists before creating conversation
      await userService.findOrCreateUserById(userId);

      logger.info(`Creating streaming conversation with first message for title generation [User ID: ${userId}]`);
      
      // 发送开始事件
      streamCallback({
        event: 'conversation_creation_start',
        data: { userId, message: 'Starting conversation creation...' }
      });
      
      // 1. 生成标题（如果没有提供）
      let conversationTitle = title;
      if (!conversationTitle) {
        streamCallback({
          event: 'title_generation_start',
          data: { message: 'Generating conversation title...' }
        });
        
        try {
          conversationTitle = await titleGeneratorService.generateTitle(firstMessage);
          
          streamCallback({
            event: 'title_generated',
            data: { title: conversationTitle }
          });
        } catch (error) {
          logger.warn('Title generation failed in stream, using fallback title:', error);
          conversationTitle = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
          
          streamCallback({
            event: 'title_generated',
            data: { title: conversationTitle, fallback: true }
          });
        }
      }
      
      // 2. 创建会话
      streamCallback({
        event: 'conversation_creating',
        data: { message: 'Creating conversation record...' }
      });
      
      const conversation = await conversationDao.createConversation({
        userId,
        title: conversationTitle
      });
      
      streamCallback({
        event: 'conversation_created',
        data: { 
          conversationId: conversation.id,
          title: conversationTitle,
          message: 'Conversation created successfully. First message will be processed by subsequent message request.'
        }
      });
      
      logger.info(`Streaming conversation created with ID: ${conversation.id}, Title: ${conversationTitle}`);
      logger.info('First message will be processed by subsequent message sending request');
      
      return {
        conversationId: conversation.id,
        generatedTitle: conversationTitle
      };
    } catch (error) {
      logger.error('Error creating streaming conversation with first message:', error);
      streamCallback({
        event: 'error',
        data: {
          message: 'Error creating conversation',
          details: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }
  
  /**
   * Get conversation details
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      return await conversationDao.getConversationById(conversationId);
    } catch (error) {
      logger.error(`Error getting conversation [ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string, options?: ConversationSearchOptions): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      return await conversationDao.getUserConversations(userId, options);
    } catch (error) {
      logger.error(`Error getting user conversation list [UserID: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Get all messages for a conversation
   */
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    try {
      return await messageDao.getConversationMessages(conversationId);
    } catch (error) {
      logger.error(`Error getting conversation messages [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Soft delete conversation and related data
   */
  async softDeleteConversation(conversationId: string): Promise<boolean> {
    try {
      logger.info(`Starting soft delete for conversation [ID: ${conversationId}]`);
      
      // Use DAO method to perform soft delete
      const success = await conversationDao.softDeleteConversation(conversationId);
      
      if (success) {
        // Clear conversation memory if it exists
        if (this.conversationMemories.has(conversationId)) {
          this.conversationMemories.delete(conversationId);
          logger.info(`Cleared conversation memory for [ID: ${conversationId}]`);
        }
        
        logger.info(`Conversation soft deleted successfully [ID: ${conversationId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Error soft deleting conversation [ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Process user message - Core functionality
   * 1. Check if this is an Agent trial conversation
   * 2. Identify user intent (chat vs task)
   * 3. Process message based on intent
   */
  async processUserMessage(conversationId: string, userId: string, content: string): Promise<{
    message: Message;
    response: Message;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      logger.info(`Processing user message [Conversation ID: ${conversationId}]`);
      
      // 1. Create user message record
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN // Initial state is unknown intent
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      // 2. Check if this is an Agent trial conversation
      const conversation = await conversationDao.getConversationById(conversationId);
      if (conversation && conversation.title.startsWith('[AGENT:')) {
        // This is an Agent trial conversation, use Agent-specific logic
        return this.handleAgentTrialConversation(conversationId, userId, content, userMessage);
      }
      
      // 3. Identify user intent for regular conversations
      const intentResult = await this.identifyUserIntent(conversationId, content, userId);
      const userIntent = intentResult.intent;
      
      // Update message intent
      await messageDao.updateMessageIntent(userMessage.id, userIntent);
      
      // 4. Process message based on intent
      let response: Message;
      let taskId: string | undefined;
      
      if (userIntent === MessageIntent.TASK) {
        // Handle task intent
        const taskResult = await this.handleTaskIntent(conversationId, userId, content);
        response = taskResult.response;
        taskId = taskResult.taskId;
        
        // Link user message to task
        await messageDao.linkMessageToTask(userMessage.id, taskId);
        
        // Increment conversation task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Handle chat intent - 使用增强版本
        const chatResult = await this.handleChatIntentEnhanced(conversationId, userId, content);
        response = chatResult.response;
        taskId = chatResult.taskId;
      }
      
      // 5. Return processing result
      return {
        message: userMessage,
        response,
        intent: userIntent,
        taskId
      };
    } catch (error) {
      logger.error(`Error processing user message [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Identify user intent - determine if chat or task
   */
  private async identifyUserIntent(conversationId: string, content: string, userId?: string): Promise<{
    intent: MessageIntent;
    confidence: number;
    explanation: string;
  }> {
    try {
      logger.info(`Identifying user intent [Conversation ID: ${conversationId}]`);
      
      // Get conversation context (recent messages)
      const recentMessages = await messageDao.getRecentMessages(conversationId, 5);
      
      // Build context prompt
      let contextPrompt = '';
      if (recentMessages.length > 0) {
        contextPrompt = 'Recent conversation context:\n' + recentMessages.map(msg => {
          const role = msg.type === MessageType.USER ? 'User' : 'AI';
          return `${role}: ${msg.content}`;
        }).join('\n') + '\n\n';
      }
      
      // Get available tools list, pass userId for multi-user isolation
      const availableTools = await this.mcpToolAdapter.getAllTools(userId);
      const toolDescriptions = availableTools.map(tool => 
        `Tool name: ${tool.name}\nDescription: ${tool.description}`
      ).join('\n\n');
      
      // Build intent recognition prompt
      const intentPrompt = `
As an intent recognition system, you need to determine if the user message is "regular chat" or "task execution".
Please make your judgment based on the following criteria:

- If the user explicitly requests to perform specific actions, retrieve information, or use tools to accomplish something, classify as "task execution"
- If the user is just engaging in social conversation, casual chat, asking for AI opinions, discussing topics, etc., classify as "regular chat"

${contextPrompt}

Available system tools:
${toolDescriptions}

User message: "${content}"

Please analyze the user intent and return the result in JSON format:
{
  "intent": "chat" or "task",
  "confidence": value between 0-1,
  "explanation": "brief explanation of your judgment"
}`;

      // Use LLM to identify intent
      const response = await this.llm.invoke([new SystemMessage(intentPrompt)]);
      
      // Parse result
      const responseText = response.content.toString();
      try {
        // Extract JSON part
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Unable to parse JSON in response");
        }
        
        const parsedResult = JSON.parse(jsonMatch[0]);
        const intent = parsedResult.intent === 'task' ? MessageIntent.TASK : MessageIntent.CHAT;
        const confidence = parsedResult.confidence || 0.5;
        const explanation = parsedResult.explanation || 'No explanation';
        
        logger.info(`User intent recognition result: ${intent}, confidence: ${confidence} [Conversation ID: ${conversationId}]`);
        
        return {
          intent,
          confidence,
          explanation
        };
      } catch (parseError) {
        // Default handling when parsing fails
        logger.error(`Intent recognition result parsing failed: ${parseError}, response content: ${responseText}`);
        return {
          intent: responseText.toLowerCase().includes('task') ? MessageIntent.TASK : MessageIntent.CHAT,
          confidence: 0.5,
          explanation: 'Intent recognition result parsing failed, using default judgment'
        };
      }
    } catch (error) {
      logger.error(`Error identifying user intent:`, error);
      // Default to chat intent when error occurs
      return {
        intent: MessageIntent.CHAT,
        confidence: 0.5,
        explanation: 'Error in intent recognition process, defaulting to chat intent'
      };
    }
  }
  
  /**
   * Handle chat intent
   */
  private async handleChatIntent(conversationId: string, userId: string, content: string): Promise<{
    response: Message;
    taskId: undefined;  // Using undefined type to match with processUserMessage method
  }> {
    try {
      logger.info(`Processing chat intent [Conversation ID: ${conversationId}]`);
      
      // Get conversation history for context
      const conversationHistory = await messageDao.getRecentMessages(conversationId, 10);
      const messages = conversationHistory.map(msg => {
        if (msg.type === MessageType.USER) {
          return new HumanMessage(msg.content);
        } else if (msg.type === MessageType.ASSISTANT) {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });
      
      // Add current user message
      messages.push(new HumanMessage(content));
      
      // Call LLM to generate response
      const response = await this.llm.invoke(messages);
      
      // Save assistant response
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: response.content.toString(),
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      return {
        response: assistantMessage,
        taskId: undefined
      };
    } catch (error) {
      logger.error(`Error processing chat intent [Conversation ID: ${conversationId}]:`, error);
      throw new Error('Error processing message');
    }
  }
  
  /**
   * Handle task intent
   */
  private async handleTaskIntent(conversationId: string, userId: string, content: string): Promise<{
    response: Message;
    taskId: string;
  }> {
    try {
      logger.info(`Handling task intent [Conversation ID: ${conversationId}]`);
      
      // 1. Create task
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId // Directly link to conversation
      });
      
      // 2. Create assistant message reply
      const response = await messageDao.createMessage({
        conversationId,
        content: `Task created: ${task.title}\n`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      // 3. Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      logger.info(`Task intent handling complete [Conversation ID: ${conversationId}, Task ID: ${task.id}]`);
      
      return {
        response,
        taskId: task.id
      };
    } catch (error) {
      logger.error(`Error handling task intent [Conversation ID: ${conversationId}]:`, error);
      
      // Create error response
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `Sorry, there was a problem creating the task. ${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT // Downgrade to regular chat
      });
      
      throw error;
    }
  }
  
  /**
   * Handle Agent trial conversation
   */
  private async handleAgentTrialConversation(
    conversationId: string, 
    userId: string, 
    content: string, 
    userMessage: Message
  ): Promise<{
    message: Message;
    response: Message;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // Extract agentId from conversation title
      const conversation = await conversationDao.getConversationById(conversationId);
      const agentId = this.extractAgentIdFromTitle(conversation?.title || '');
      
      if (!agentId) {
        throw new Error('Invalid Agent trial conversation');
      }
      
      // Import AgentService dynamically to avoid circular dependency
      const { AgentService } = await import('./agentService.js');
      const agentService = new AgentService();
      
      // Get Agent information
      const agent = await agentService.getAgentById(agentId, userId);
      
      // Use Agent-specific intent analysis
      const intent = await this.analyzeAgentUserIntent(content, agent);
      
      // Update message intent
      await messageDao.updateMessageIntent(userMessage.id, intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT);
      
      // Process message using Agent logic
      let response: Message;
      let taskId: string | undefined;
      
      if (intent.type === 'task') {
        // Execute Agent task
        const taskResult = await this.executeAgentTask(content, agent, userId, conversationId);
        response = await messageDao.createMessage({
          conversationId,
          content: taskResult,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK
        });
        
        // Increment conversation task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Chat with Agent (with memory support)
        const chatResult = await this.chatWithAgent(content, agent, conversationId);
        response = await messageDao.createMessage({
          conversationId,
          content: chatResult,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });
      }
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      return {
        message: userMessage,
        response,
        intent: intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT,
        taskId
      };
    } catch (error) {
      logger.error(`Error handling Agent trial conversation [Conversation ID: ${conversationId}]:`, error);
      
      // Create error response
      const errorResponse = await messageDao.createMessage({
        conversationId,
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      return {
        message: userMessage,
        response: errorResponse,
        intent: MessageIntent.CHAT,
        taskId: undefined
      };
    }
  }
  
  /**
   * Extract Agent ID from conversation title
   */
  private extractAgentIdFromTitle(title: string): string | null {
    const match = title.match(/^\[AGENT:([^\]]+)\]/);
    return match ? match[1] : null;
  }
  
  /**
   * Analyze user intent for Agent conversations
   */
  private async analyzeAgentUserIntent(content: string, agent: any): Promise<{ type: 'chat' | 'task'; confidence: number }> {
    try {
      const prompt = `Analyze the user's intent based on their message and the agent's capabilities.

Agent: ${agent.name}
Description: ${agent.description}
Capabilities: ${agent.mcpWorkflow ? JSON.stringify(agent.mcpWorkflow.mcps?.map((m: any) => m.name)) : 'general'}

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
  private async executeAgentTask(content: string, agent: any, userId: string, conversationId: string): Promise<string> {
    try {
      // Create task based on Agent's workflow
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
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
      }
      
      // Execute the task using Agent's workflow
      try {
        const executionSuccess = await this.taskExecutorService.executeTaskStream(task.id, (data) => {
          // Silent execution for non-streaming context
          logger.debug(`Task execution progress: ${JSON.stringify(data)}`);
        });
        
        if (executionSuccess) {
          // Get the completed task with results
          const completedTask = await taskService.getTaskById(task.id);
          
          const successMessage = `✅ Task completed successfully using ${agent.name}'s capabilities!

**Task**: ${task.title}
**Agent**: ${agent.name}
**Status**: ${completedTask?.status || 'completed'}

I've successfully executed this task using my specialized tools and workflow. The task has been completed and the results are available.`;

          return successMessage;
        } else {
          return `⚠️ Task was created but execution encountered issues. Task ID: ${task.id}

I'll help you with this task using my capabilities. You can check the task status and results separately.`;
        }
      } catch (executionError) {
        logger.error(`Agent task execution failed [Task: ${task.id}]:`, executionError);
        
        return `⚠️ Task created but execution failed: ${task.title}

**Agent**: ${agent.name}
**Error**: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}

The task has been saved and you can try executing it again later.`;
      }
    } catch (error) {
      logger.error('Execute Agent task failed:', error);
      return `❌ I encountered an error while creating and executing the task. Please try again or rephrase your request.

**Error**: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Chat with Agent (with memory support)
   */
  private async chatWithAgent(content: string, agent: any, conversationId: string): Promise<string> {
    try {
      logger.info(`[Agent Chat] Processing chat with ${agent.name} [Conversation ID: ${conversationId}]`);
      
      // 获取会话记忆
      const memory = this.getConversationMemory(conversationId);
      
      // 从记忆中获取历史消息
      const memoryVariables = await memory.loadMemoryVariables({});
      const chatHistory = memoryVariables.chat_history || [];
      
      // 创建Agent角色的提示模板
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
      
      // 格式化提示
      const formattedMessages = await agentPrompt.formatMessages({});
      
      // 调用LLM
      const response = await this.llm.invoke(formattedMessages);
      
      // 保存到记忆
      await memory.saveContext(
        { input: content },
        { output: response.content.toString() }
      );
      
      logger.info(`[Agent Chat] Successfully processed chat with memory support`);
      
      return response.content as string;
    } catch (error) {
      logger.error('Chat with Agent failed:', error);
      return `Hello! I'm ${agent.name}. I'd be happy to help you. Could you tell me more about what you need assistance with?`;
    }
  }

  /**
   * Handle streaming user message (for real-time response)
   */
  async processUserMessageStream(conversationId: string, userId: string, content: string, streamCallback: (chunk: any) => void): Promise<{
    messageId: string;
    responseId: string;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // 1. Create user message record
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      // Send processing start message
      streamCallback({
        event: 'processing_start',
        data: { messageId: userMessage.id }
      });
      
      // 2. Check if this is an Agent trial conversation
      const conversation = await conversationDao.getConversationById(conversationId);
      const agentId = this.extractAgentIdFromTitle(conversation?.title || '');
      
      if (agentId) {
        // Handle Agent trial conversation (streaming)
        streamCallback({
          event: 'agent_detection',
          data: { status: 'processing', agentId }
        });
        
        const agentResult = await this.handleAgentTrialConversationStream(
          conversationId,
          userId,
          content,
          userMessage,
          agentId,
          streamCallback
        );
        
        return {
          messageId: userMessage.id,
          responseId: agentResult.responseId,
          intent: agentResult.intent,
          taskId: agentResult.taskId
        };
      }
      
      // 3. Regular conversation processing
      streamCallback({
        event: 'intent_detection',
        data: { status: 'processing' }
      });
      
      const intentResult = await this.identifyUserIntent(conversationId, content, userId);
      const userIntent = intentResult.intent;
      
      // Update message intent
      await messageDao.updateMessageIntent(userMessage.id, userIntent);
      
      // Send intent detection result
      streamCallback({
        event: 'intent_detection',
        data: { 
          status: 'completed',
          intent: userIntent,
          confidence: intentResult.confidence,
          explanation: intentResult.explanation
        }
      });
      
      // 4. Process message based on intent
      let responseId: string;
      let taskId: string | undefined;
      
      if (userIntent === MessageIntent.TASK) {
        // Handle task intent (streaming)
        const taskResult = await this.handleTaskIntentStream(
          conversationId,
          userId,
          content,
          (chunk) => streamCallback({ event: 'task_processing', data: chunk })
        );
        
        responseId = taskResult.responseId;
        taskId = taskResult.taskId;
        
        // Link user message to task
        await messageDao.linkMessageToTask(userMessage.id, taskId);
        
        // Increment conversation task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Handle chat intent (streaming)
        const chatResult = await this.handleChatIntentStream(
          conversationId,
          userId,
          content,
          (chunk) => streamCallback({ event: 'chat_response', data: { content: chunk } })
        );
        
        responseId = chatResult.responseId;
        taskId = chatResult.taskId;
      }
      
      // Send processing complete message
      streamCallback({
        event: 'processing_complete',
        data: { 
          messageId: userMessage.id,
          responseId,
          intent: userIntent,
          taskId
        }
      });
      
      // 5. Return processing result
      return {
        messageId: userMessage.id,
        responseId,
        intent: userIntent,
        taskId
      };
    } catch (error) {
      logger.error(`Error processing user message stream [Conversation ID: ${conversationId}]:`, error);
      
      // Send error message
      streamCallback({
        event: 'error',
        data: { 
          message: 'Error processing message',
          details: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Stream chat intent handling
   */
  private async handleChatIntentStream(
    conversationId: string, 
    userId: string, 
    content: string,
    streamCallback: (chunk: string) => void
  ): Promise<{ responseId: string; taskId: undefined }> {
    try {
      // Create an empty reply message
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: '',  // Empty content, will be updated after stream processing
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      // Get conversation history for context
      const conversationHistory = await messageDao.getRecentMessages(conversationId, 10);
      const messages = conversationHistory.map(msg => {
        if (msg.type === MessageType.USER) {
          return new HumanMessage(msg.content);
        } else if (msg.type === MessageType.ASSISTANT) {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });
      
      // Add current user message
      messages.push(new HumanMessage(content));
      
      // Prepare streaming response handling
      let fullResponse = '';
      
      // Call LLM with streaming
      const stream = await this.llm.stream(messages);
      
      // Process streaming response
      for await (const chunk of stream) {
        if (chunk.content) {
          fullResponse += chunk.content;
          streamCallback(chunk.content as string);
        }
      }
      
      // Update assistant message with complete content
      await messageDao.updateMessageContent(assistantMessage.id, fullResponse);
      
      return {
        responseId: assistantMessage.id,
        taskId: undefined
      };
    } catch (error) {
      logger.error(`Error processing chat intent stream [Conversation ID: ${conversationId}]:`, error);
      throw new Error('Error processing message');
    }
  }
  
  /**
   * Handle Agent trial conversation (streaming version)
   */
  private async handleAgentTrialConversationStream(
    conversationId: string, 
    userId: string, 
    content: string, 
    userMessage: Message,
    agentId: string,
    streamCallback: (chunk: any) => void
  ): Promise<{
    responseId: string;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // Get Agent information
      streamCallback({
        event: 'agent_loading',
        data: { status: 'loading_agent', agentId }
      });
      
      // Import AgentService dynamically to avoid circular dependency
      const { AgentService } = await import('./agentService.js');
      const agentService = new AgentService();
      
      // Get Agent information
      const agent = await agentService.getAgentById(agentId, userId);
      
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      
      streamCallback({
        event: 'agent_loaded',
        data: { 
          status: 'loaded',
          agent: {
            id: agent.id,
            name: agent.name,
            description: agent.description
          }
        }
      });
      
      // Use Agent-specific intent analysis (streaming)
      streamCallback({
        event: 'agent_intent_analysis',
        data: { status: 'analyzing' }
      });
      
      const intent = await this.analyzeAgentUserIntentStream(content, agent, streamCallback);
      
      // Update message intent
      await messageDao.updateMessageIntent(userMessage.id, intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT);
      
      streamCallback({
        event: 'agent_intent_analysis',
        data: { 
          status: 'completed',
          intent: intent.type,
          confidence: intent.confidence
        }
      });
      
      // Process message using Agent logic (streaming)
      let responseId: string;
      let taskId: string | undefined;
      
      if (intent.type === 'task') {
        // Execute Agent task (streaming)
        const taskResult = await this.executeAgentTaskStream(
          content, 
          agent, 
          userId, 
          conversationId,
          (chunk) => streamCallback({ event: 'agent_task_execution', data: chunk })
        );
        
        responseId = taskResult.responseId;
        taskId = taskResult.taskId;
        
        // Link user message to task
        if (taskId) {
          await messageDao.linkMessageToTask(userMessage.id, taskId);
        }
        
        // Increment conversation task count
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // Chat with Agent (streaming with memory support)
        const chatResult = await this.chatWithAgentStream(
          content, 
          agent, 
          conversationId,
          (chunk) => streamCallback({ event: 'agent_chat_response', data: { content: chunk } })
        );
        
        responseId = chatResult.responseId;
        taskId = chatResult.taskId;
      }
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      // Send Agent processing complete message
      streamCallback({
        event: 'agent_processing_complete',
        data: { 
          responseId,
          intent: intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT,
          taskId,
          agentId: agent.id,
          agentName: agent.name
        }
      });
      
      return {
        responseId,
        intent: intent.type === 'task' ? MessageIntent.TASK : MessageIntent.CHAT,
        taskId
      };
    } catch (error) {
      logger.error(`Error handling Agent trial conversation stream [Conversation ID: ${conversationId}]:`, error);
      
      // Create error response
      const errorResponse = await messageDao.createMessage({
        conversationId,
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      // Send error through stream
      streamCallback({
        event: 'agent_error',
        data: { 
          message: 'Error processing Agent request',
          details: error instanceof Error ? error.message : String(error)
        }
      });
      
      return {
        responseId: errorResponse.id,
        intent: MessageIntent.CHAT,
        taskId: undefined
      };
    }
  }

  /**
   * Stream task intent handling
   */
  private async handleTaskIntentStream(
    conversationId: string, 
    userId: string, 
    content: string,
    streamCallback: (chunk: any) => void
  ): Promise<{ responseId: string; taskId: string }> {
    try {
      // Create task
      streamCallback({ status: 'creating_task' });
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId // Direct conversation link
      });
      
      streamCallback({ 
        status: 'task_created',
        taskId: task.id,
        title: task.title
      });
      
      // Create an assistant message reply
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: `Task created: ${task.title}\n`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      return { 
        responseId: assistantMessage.id,
        taskId: task.id
      };
    } catch (error) {
      logger.error(`Error handling task intent stream [Conversation ID: ${conversationId}]:`, error);
      
      // Create error response
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `Sorry, there was a problem creating the task. ${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT // Downgrade to regular chat
      });
      
      throw error;
    }
  }

  /**
   * Analyze Agent user intent (streaming version)
   */
  private async analyzeAgentUserIntentStream(
    content: string, 
    agent: any, 
    streamCallback: (chunk: any) => void
  ): Promise<{ type: 'chat' | 'task'; confidence: number }> {
    try {
      streamCallback({
        event: 'intent_analysis_start',
        data: { message: 'Analyzing user intent with Agent context...' }
      });

      const prompt = `Analyze the user's intent based on their message and the agent's capabilities.

Agent: ${agent.name}
Description: ${agent.description}
Capabilities: ${agent.mcpWorkflow ? JSON.stringify(agent.mcpWorkflow.mcps?.map((m: any) => m.name)) : 'general'}

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
      
      streamCallback({
        event: 'intent_analysis_complete',
        data: { 
          type: result.type,
          confidence: result.confidence,
          reasoning: result.reasoning
        }
      });
      
      return {
        type: result.type,
        confidence: result.confidence
      };
    } catch (error) {
      logger.error('Analyze Agent user intent stream failed:', error);
      
      streamCallback({
        event: 'intent_analysis_error',
        data: { message: 'Intent analysis failed, defaulting to chat' }
      });
      
      // Default to chat
      return { type: 'chat', confidence: 0.5 };
    }
  }

  /**
   * Execute Agent task (streaming version)
   */
  private async executeAgentTaskStream(
    content: string, 
    agent: any, 
    userId: string, 
    conversationId: string,
    streamCallback: (chunk: any) => void
  ): Promise<{ responseId: string; taskId: string | undefined }> {
    try {
      streamCallback({
        event: 'task_creation_start',
        data: { message: 'Creating task based on Agent workflow...' }
      });

      // Create task based on Agent's workflow
      const taskService = getTaskService();
      const task = await taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
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

        if (executionSuccess) {
          streamCallback({
            event: 'task_execution_complete',
            data: { 
              message: 'Task execution completed successfully',
              taskId: task.id,
              success: true
            }
          });
        } else {
          streamCallback({
            event: 'task_execution_warning',
            data: { 
              message: 'Task execution completed with warnings',
              taskId: task.id,
              success: false
            }
          });
        }
      } catch (error) {
        executionError = error instanceof Error ? error : new Error('Unknown execution error');
        logger.error(`Agent task execution failed [Task: ${task.id}]:`, executionError);
        
        streamCallback({
          event: 'task_execution_error',
          data: { 
            message: 'Task execution failed',
            error: executionError.message,
            taskId: task.id
          }
        });
      }

      // Get the completed task with results
      const completedTask = await taskService.getTaskById(task.id);

      // Create response message based on execution results
      let responseContent: string;
      
      if (executionSuccess) {
        responseContent = `✅ Task completed successfully using ${agent.name}'s capabilities!

**Task**: ${task.title}
**Agent**: ${agent.name}
**Status**: ${completedTask?.status || 'completed'}
**Capabilities Used**: ${agent.mcpWorkflow ? 
        agent.mcpWorkflow.mcps?.map((m: any) => m.name).join(', ') : 
        'general assistance'}

I've successfully executed this task using my specialized tools and workflow. The task has been completed and the results are available.`;
      } else if (executionError) {
        responseContent = `⚠️ Task created but execution failed: ${task.title}

**Agent**: ${agent.name}
**Error**: ${executionError.message}
**Task ID**: ${task.id}

The task has been saved and you can try executing it again later.`;
      } else {
        responseContent = `⚠️ Task was created but execution encountered issues: ${task.title}

**Agent**: ${agent.name}
**Status**: ${completedTask?.status || 'unknown'}
**Task ID**: ${task.id}

I'll help you with this task using my capabilities. You can check the task status and results separately.`;
      }

      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: responseContent,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK
      });

      streamCallback({
        event: 'task_response_complete',
        data: { 
          responseId: assistantMessage.id,
          taskId: task.id,
          message: 'Task processing completed',
          executionSuccess
        }
      });

      return {
        responseId: assistantMessage.id,
        taskId: task.id
      };
    } catch (error) {
      logger.error('Execute Agent task stream failed:', error);
      
      streamCallback({
        event: 'task_execution_error',
        data: { message: 'Task creation and execution failed' }
      });

      // Create error response
      const errorContent = `❌ I encountered an error while creating and executing the task. Please try again or rephrase your request.

**Error**: ${error instanceof Error ? error.message : 'Unknown error'}`;

      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: errorContent,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK
      });

      return {
        responseId: errorMessage.id,
        taskId: undefined
      };
    }
  }

  /**
   * Chat with Agent (streaming version with memory support)
   */
  private async chatWithAgentStream(
    content: string, 
    agent: any, 
    conversationId: string,
    streamCallback: (chunk: string) => void
  ): Promise<{ responseId: string; taskId: undefined }> {
    try {
      logger.info(`[Agent Chat Stream] Processing chat with ${agent.name} [Conversation ID: ${conversationId}]`);
      
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
        responseId: assistantMessage.id,
        taskId: undefined
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
        responseId: fallbackMessage.id,
        taskId: undefined
      };
    }
  }
}

// Export service instance getter function
let conversationServiceInstance: ConversationService | null = null;

export function getConversationService(
  mcpToolAdapter?: MCPToolAdapter,
  taskExecutorService?: TaskExecutorService
): ConversationService {
  if (!conversationServiceInstance && mcpToolAdapter && taskExecutorService) {
    conversationServiceInstance = new ConversationService(mcpToolAdapter, taskExecutorService);
  }
  
  if (!conversationServiceInstance) {
    throw new Error('ConversationService not properly initialized, mcpToolAdapter and taskExecutorService required');
  }
  
  return conversationServiceInstance;
} 