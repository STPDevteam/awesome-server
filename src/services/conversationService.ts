import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { conversationDao } from '../dao/conversationDao.js';
import { messageDao } from '../dao/messageDao.js';
import { logger } from '../utils/logger.js';
import { Conversation, ConversationSearchOptions, Message, MessageType, MessageIntent } from '../models/conversation.js';
import { getTaskService } from './taskService.js';
import { TaskExecutorService } from './taskExecutorService.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { db } from '../config/database.js';
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
  
  constructor(mcpToolAdapter: MCPToolAdapter, taskExecutorService: TaskExecutorService) {
    this.mcpToolAdapter = mcpToolAdapter;
    this.taskExecutorService = taskExecutorService;
    
    // Initialize LLM
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.CONVERSATION_MODEL || 'gpt-4o', // Default to GPT-4o
      temperature: 0.7, // Higher temperature for chat mode
    //   configuration: {
    //     httpAgent: agent
    //   }
    });
  }
  
  /**
   * Create new conversation
   */
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    try {
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
      const intentResult = await this.identifyUserIntent(conversationId, content);
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
  private async identifyUserIntent(conversationId: string, content: string): Promise<{
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
      
      // Get available tools list
      const availableTools = await this.mcpToolAdapter.getAllTools();
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
        content: `Task created: ${task.title}\nTask ID: ${task.id}\n请在任务页面查看并执行此任务。`,
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
      
      const intentResult = await this.identifyUserIntent(conversationId, content);
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
        content: `Task created: ${task.title}\nTask ID: ${task.id}\n请在任务页面查看并执行此任务。`,
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