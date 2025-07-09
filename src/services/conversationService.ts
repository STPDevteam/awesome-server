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
   * 获取或创建会话记忆（增强版，自动加载历史消息）
   */
  private async getConversationMemory(conversationId: string): Promise<BufferMemory> {
    if (!this.conversationMemories.has(conversationId)) {
      const memory = new BufferMemory({
        returnMessages: true,
        memoryKey: 'chat_history',
        inputKey: 'input',
        outputKey: 'output'
      });
      
      // 从数据库加载历史消息到记忆中
      await this.loadHistoryToMemory(conversationId, memory);
      
      this.conversationMemories.set(conversationId, memory);
    }
    return this.conversationMemories.get(conversationId)!;
  }

  /**
   * 从数据库加载历史消息到记忆中（智能处理任务消息）
   */
  private async loadHistoryToMemory(conversationId: string, memory: BufferMemory): Promise<void> {
    try {
      const recentMessages = await messageDao.getRecentMessages(conversationId, 20);
      
      let conversationPairs = 0;
      let i = 0;
      
      while (i < recentMessages.length) {
        const currentMessage = recentMessages[i];
        
        if (currentMessage?.type === MessageType.USER) {
          // 找到用户消息，寻找后续的助手回复
          let assistantResponses: string[] = [];
          let j = i + 1;
          
          // 收集所有连续的助手消息（包括任务相关的多条消息）
          while (j < recentMessages.length && recentMessages[j]?.type === MessageType.ASSISTANT) {
            assistantResponses.push(recentMessages[j].content);
            j++;
          }
          
          // 如果有助手回复，将它们合并成一个对话对
          if (assistantResponses.length > 0) {
            const combinedResponse = assistantResponses.join('\n\n');
            
            await memory.saveContext(
              { input: currentMessage.content },
              { output: combinedResponse }
            );
            
            conversationPairs++;
          }
          
          // 跳到下一个用户消息
          i = j;
        } else {
          // 如果不是用户消息，继续寻找
          i++;
        }
      }
      
      logger.info(`✅ 已加载 ${conversationPairs} 条历史对话到记忆中 [对话ID: ${conversationId}]`);
    } catch (error) {
      logger.error(`❌ 加载历史对话到记忆失败 [对话ID: ${conversationId}]:`, error);
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
   * 1. Identify user intent (chat vs task)
   * 2. Process message based on intent
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
      
      // 2. Identify user intent
      const intentResult = await this.identifyUserIntent(conversationId, content, userId);
      const userIntent = intentResult.intent;
      
      // Update message intent
      await messageDao.updateMessageIntent(userMessage.id, userIntent);
      
      // 3. Process message based on intent
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
        // Handle chat intent
        const chatResult = await this.handleChatIntent(conversationId, userId, content);
        response = chatResult.response;
        taskId = chatResult.taskId;
      }
      
      // 4. Return processing result
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
      
      // 尝试使用增强记忆功能
      try {
        // 获取对话记忆
        const memory = await this.getConversationMemory(conversationId);
        
        // 获取完整的历史对话（包含任务消息）
        const conversationHistory = await messageDao.getRecentMessages(conversationId, 15);
        const completeHistory = conversationHistory.map(msg => {
          if (msg.type === MessageType.USER) {
            return new HumanMessage(msg.content);
          } else if (msg.type === MessageType.ASSISTANT) {
            return new AIMessage(msg.content);
          } else {
            return new SystemMessage(msg.content);
          }
        });
        
        // 构建增强的系统提示
        const systemPrompt = `你是一个智能助手，具有以下能力：
- 记住对话历史和上下文
- 提供连贯、有用的回复
- 如果用户需要执行具体任务，可以建议创建任务

**重要提示**：对话历史中可能包含任务执行的完整过程，包括：
- 📋 任务创建
- 🔍 任务分析  
- ⚙️ 任务执行开始
- 🔧 工具调用详情
- ✅ 任务执行完成
- 📊 任务总结

请基于这些信息提供有针对性的回复。`;
        
        const enhancedMessages = [
          new SystemMessage(systemPrompt),
          ...completeHistory,
          new HumanMessage(content)
        ];
        
        // 调用LLM生成回复
        const response = await this.llm.invoke(enhancedMessages);
        
        // 更新记忆
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
        
        logger.info(`✅ Enhanced chat intent processed successfully with memory`);
        
        return {
          response: assistantMessage,
          taskId: undefined
        };
        
      } catch (memoryError) {
        logger.warn(`Memory enhancement failed, falling back to standard processing:`, memoryError);
        
        // 降级到原有实现
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
      }
      
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
      logger.info(`🚀 任务处理开始 [对话ID: ${conversationId}]`);
      
      // 1. 创建任务
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId
      });
      
      // 2. 创建任务确认消息
      const taskMessage = await messageDao.createMessage({
        conversationId,
        content: `任务已创建并开始执行: ${task.title}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      // 3. 异步执行任务（让真实的执行系统处理）
      this.taskExecutorService.executeTaskStream(task.id, (data: any) => {
        // 任务执行过程中的回调，真实的执行系统会处理消息创建
        logger.debug(`任务执行事件 [${task.id}]:`, data);
      }).catch(error => {
        logger.error(`任务执行失败 [${task.id}]:`, error);
      });
      
      logger.info(`✅ 任务创建完成，正在后台执行 [对话ID: ${conversationId}, 任务ID: ${task.id}]`);
      
      return {
        response: taskMessage,
        taskId: task.id
      };
      
    } catch (error) {
      logger.error(`❌ 任务创建失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误消息
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `任务创建失败: ${error instanceof Error ? error.message : String(error)}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      throw error;
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
      
      // 2. Identify user intent
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
      
      // 3. Process message based on intent
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
      
      // 4. Return processing result
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
   * Stream chat intent handling - 增强版
   */
  private async handleChatIntentStream(
    conversationId: string, 
    userId: string, 
    content: string,
    streamCallback: (chunk: string) => void
  ): Promise<{ responseId: string; taskId: undefined }> {
    try {
      logger.info(`🧠 增强版流式聊天处理开始 [对话ID: ${conversationId}]`);
      
      // 获取或创建对话记忆
      const memory = await this.getConversationMemory(conversationId);
      
      // Create an empty reply message
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: '',  // Empty content, will be updated after stream processing
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // Increment conversation message count
      await conversationDao.incrementMessageCount(conversationId);
      
      // 获取完整的历史对话（包含任务消息）
      const conversationHistory = await messageDao.getRecentMessages(conversationId, 15);
      const completeHistory = conversationHistory.map(msg => {
        if (msg.type === MessageType.USER) {
          return new HumanMessage(msg.content);
        } else if (msg.type === MessageType.ASSISTANT) {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });
      
      // 构建增强的系统提示
      const systemPrompt = `你是一个智能助手，具有以下能力：
- 记住对话历史和上下文
- 提供连贯、有用的回复
- 如果用户需要执行具体任务，可以建议创建任务

**重要提示**：对话历史中可能包含任务执行的完整过程，包括：
- 📋 任务创建
- 🔍 任务分析  
- ⚙️ 任务执行开始
- 🔧 工具调用详情
- ✅ 任务执行完成
- 📊 任务总结

请基于这些信息提供有针对性的回复。`;
      
      const enhancedMessages = [
        new SystemMessage(systemPrompt),
        ...completeHistory,
        new HumanMessage(content)
      ];
      
      // Prepare streaming response handling
      let fullResponse = '';
      
      // Call LLM with streaming
      const stream = await this.llm.stream(enhancedMessages);
      
      // Process streaming response
      for await (const chunk of stream) {
        if (chunk.content) {
          fullResponse += chunk.content;
          streamCallback(chunk.content as string);
        }
      }
      
      // 更新记忆
      try {
        await memory.saveContext(
          { input: content },
          { output: fullResponse }
        );
      } catch (memoryError) {
        logger.warn(`记忆更新失败:`, memoryError);
      }
      
      // Update assistant message with complete content
      await messageDao.updateMessageContent(assistantMessage.id, fullResponse);
      
      logger.info(`✅ 增强版流式聊天处理完成 [对话ID: ${conversationId}]`);
      
      return {
        responseId: assistantMessage.id,
        taskId: undefined
      };
    } catch (error) {
      logger.error(`❌ 增强版流式聊天处理失败，降级到简单处理 [对话ID: ${conversationId}]:`, error);
      
      // 降级到简单处理
      try {
        // Create an empty reply message
        const assistantMessage = await messageDao.createMessage({
          conversationId,
          content: '',
          type: MessageType.ASSISTANT,
          intent: MessageIntent.CHAT
        });
        
        await conversationDao.incrementMessageCount(conversationId);
        
        // Simple LLM call without memory
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
        
        messages.push(new HumanMessage(content));
        
        let fullResponse = '';
        const stream = await this.llm.stream(messages);
        
        for await (const chunk of stream) {
          if (chunk.content) {
            fullResponse += chunk.content;
            streamCallback(chunk.content as string);
          }
        }
        
        await messageDao.updateMessageContent(assistantMessage.id, fullResponse);
        
        return {
          responseId: assistantMessage.id,
          taskId: undefined
        };
      } catch (fallbackError) {
        logger.error(`❌ 简单流式聊天处理也失败 [对话ID: ${conversationId}]:`, fallbackError);
        throw new Error('Error processing message');
      }
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
      logger.info(`🚀 流式任务处理开始 [对话ID: ${conversationId}]`);
      
      // 1. 创建任务
      streamCallback({ 
        status: 'creating_task', 
        message: '正在创建任务...' 
      });
      
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId
      });
      
      streamCallback({ 
        status: 'task_created',
        taskId: task.id,
        title: task.title,
        message: `任务已创建: ${task.title}`
      });
      
      // 2. 创建任务确认消息
      const taskMessage = await messageDao.createMessage({
        conversationId,
        content: `任务已创建并开始执行: ${task.title}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      // 3. 开始执行任务（使用真实的执行系统）
      streamCallback({
        status: 'starting_execution',
        message: '开始执行任务...'
      });
      
      // 执行真实的任务，将执行过程的事件传递给前端
      this.taskExecutorService.executeTaskStream(task.id, (executionData: any) => {
        // 将真实执行系统的事件转发给前端
        streamCallback({
          status: 'execution_event',
          data: executionData,
          message: `任务执行中...`
        });
      }).catch(error => {
        logger.error(`任务执行失败 [${task.id}]:`, error);
        streamCallback({
          status: 'execution_error',
          error: error.message,
          message: '任务执行出现错误'
        });
      });
      
      streamCallback({
        status: 'task_initiated',
        message: '任务已启动，请查看对话历史了解执行进度'
      });
      
      logger.info(`✅ 流式任务创建完成，正在后台执行 [对话ID: ${conversationId}, 任务ID: ${task.id}]`);
      
      return { 
        responseId: taskMessage.id,
        taskId: task.id
      };
      
    } catch (error) {
      logger.error(`❌ 流式任务创建失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误消息
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `任务创建失败: ${error instanceof Error ? error.message : String(error)}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      await conversationDao.incrementMessageCount(conversationId);
      
      streamCallback({
        status: 'task_creation_failed',
        error: error instanceof Error ? error.message : String(error),
        message: '任务创建失败'
      });
      
      throw error;
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