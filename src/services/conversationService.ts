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
 * 对话服务
 * 处理对话和消息，以及用户意图识别
 */
export class ConversationService {
  private llm: ChatOpenAI;
  private taskService = getTaskService();
  private mcpToolAdapter: MCPToolAdapter;
  private taskExecutorService: TaskExecutorService;
  
  constructor(mcpToolAdapter: MCPToolAdapter, taskExecutorService: TaskExecutorService) {
    this.mcpToolAdapter = mcpToolAdapter;
    this.taskExecutorService = taskExecutorService;
    
    // 初始化LLM
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.CONVERSATION_MODEL || 'gpt-4o', // 默认使用GPT-4o
      temperature: 0.7, // 聊天模式使用较高的温度
    //   configuration: {
    //     httpAgent: agent
    //   }
    });
  }
  
  /**
   * 创建新对话
   */
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    try {
      // 如果没有提供标题，使用默认标题
      const conversationTitle = title || `对话 ${new Date().toLocaleString('zh-CN')}`;
      
      return await conversationDao.createConversation({
        userId,
        title: conversationTitle
      });
    } catch (error) {
      logger.error('创建对话失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取对话详情
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      return await conversationDao.getConversationById(conversationId);
    } catch (error) {
      logger.error(`获取对话失败 [ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取用户的所有对话
   */
  async getUserConversations(userId: string, options?: ConversationSearchOptions): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      return await conversationDao.getUserConversations(userId, options);
    } catch (error) {
      logger.error(`获取用户对话列表失败 [UserID: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取对话的所有消息
   */
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    try {
      return await messageDao.getConversationMessages(conversationId);
    } catch (error) {
      logger.error(`获取对话消息失败 [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 处理用户消息 - 核心功能
   * 1. 识别用户意图（聊天 vs 任务）
   * 2. 根据意图处理消息
   */
  async processUserMessage(conversationId: string, userId: string, content: string): Promise<{
    message: Message;
    response: Message;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      logger.info(`处理用户消息 [对话ID: ${conversationId}]`);
      
      // 1. 创建用户消息记录
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN // 初始状态为未知意图
      });
      
      // 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      // 2. 识别用户意图
      const intentResult = await this.identifyUserIntent(conversationId, content);
      const userIntent = intentResult.intent;
      
      // 更新消息意图
      await messageDao.updateMessageIntent(userMessage.id, userIntent);
      
      // 3. 根据意图处理消息
      let response: Message;
      let taskId: string | undefined;
      
      if (userIntent === MessageIntent.TASK) {
        // 处理任务意图
        const taskResult = await this.handleTaskIntent(conversationId, userId, content);
        response = taskResult.response;
        taskId = taskResult.taskId;
        
        // 关联用户消息到任务
        await messageDao.linkMessageToTask(userMessage.id, taskId);
        
        // 增加对话任务计数
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // 处理聊天意图
        response = await this.handleChatIntent(conversationId, userId, content);
      }
      
      // 4. 返回处理结果
      return {
        message: userMessage,
        response,
        intent: userIntent,
        taskId
      };
    } catch (error) {
      logger.error(`处理用户消息失败 [对话ID: ${conversationId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 识别用户意图 - 判断是聊天还是任务
   */
  private async identifyUserIntent(conversationId: string, content: string): Promise<{
    intent: MessageIntent;
    confidence: number;
    explanation: string;
  }> {
    try {
      logger.info(`正在识别用户意图 [对话ID: ${conversationId}]`);
      
      // 获取对话上下文（最近的几条消息）
      const recentMessages = await messageDao.getRecentMessages(conversationId, 5);
      
      // 构建上下文提示
      let contextPrompt = '';
      if (recentMessages.length > 0) {
        contextPrompt = '最近的对话上下文:\n' + recentMessages.map(msg => {
          const role = msg.type === MessageType.USER ? '用户' : 'AI';
          return `${role}: ${msg.content}`;
        }).join('\n') + '\n\n';
      }
      
      // 获取可用的工具列表
      const availableTools = await this.mcpToolAdapter.getAllTools();
      const toolDescriptions = availableTools.map(tool => 
        `工具名称: ${tool.name}\n描述: ${tool.description}`
      ).join('\n\n');
      
      // 构建意图识别提示
      const intentPrompt = `
作为一个意图识别系统，你需要判断用户消息是"普通聊天"还是"执行任务"。
请基于以下条件做出判断：

- 如果用户明确要求执行特定操作、获取信息、或需要使用工具完成某事，则判断为"执行任务"
- 如果用户只是在社交对话、闲聊、询问AI观点、探讨话题等，则判断为"普通聊天"

${contextPrompt}

以下是系统可用的工具:
${toolDescriptions}

用户消息: "${content}"

请分析用户意图，并以 JSON 格式返回结果:
{
  "intent": "chat" 或 "task",
  "confidence": 0-1 之间的数值,
  "explanation": "简短解释你的判断原因"
}`;

      // 使用LLM识别意图
      const response = await this.llm.invoke([new SystemMessage(intentPrompt)]);
      
      // 解析结果
      const responseText = response.content.toString();
      try {
        // 提取JSON部分
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("无法解析响应中的JSON");
        }
        
        const parsedResult = JSON.parse(jsonMatch[0]);
        const intent = parsedResult.intent === 'task' ? MessageIntent.TASK : MessageIntent.CHAT;
        const confidence = parsedResult.confidence || 0.5;
        const explanation = parsedResult.explanation || '无解释';
        
        logger.info(`用户意图识别结果: ${intent}, 置信度: ${confidence} [对话ID: ${conversationId}]`);
        
        return {
          intent,
          confidence,
          explanation
        };
      } catch (parseError) {
        // 解析失败时的默认处理
        logger.error(`意图识别结果解析失败: ${parseError}, 响应内容: ${responseText}`);
        return {
          intent: responseText.toLowerCase().includes('task') ? MessageIntent.TASK : MessageIntent.CHAT,
          confidence: 0.5,
          explanation: '意图识别结果解析失败，使用默认判断'
        };
      }
    } catch (error) {
      logger.error(`识别用户意图失败:`, error);
      // 出错时默认为聊天意图
      return {
        intent: MessageIntent.CHAT,
        confidence: 0.5,
        explanation: '意图识别过程出错，默认视为聊天意图'
      };
    }
  }
  
  /**
   * 处理聊天意图
   */
  private async handleChatIntent(conversationId: string, userId: string, content: string): Promise<Message> {
    try {
      logger.info(`处理聊天意图 [对话ID: ${conversationId}]`);
      
      // 获取对话历史用作上下文
      const conversationHistory = await messageDao.getRecentMessages(conversationId, 10);
      
      // 构建消息历史
      const messages = conversationHistory.map(msg => {
        if (msg.type === MessageType.USER) {
          return new HumanMessage(msg.content);
        } else if (msg.type === MessageType.ASSISTANT) {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });
      
      // 添加当前用户消息
      messages.push(new HumanMessage(content));
      
      // 使用LLM生成回复
      const response = await this.llm.invoke(messages);
      const responseContent = response.content.toString();
      
      // 创建助手回复消息
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: responseContent,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      return assistantMessage;
    } catch (error) {
      logger.error(`处理聊天意图失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误响应消息
      return await messageDao.createMessage({
        conversationId,
        content: `抱歉，处理您的消息时出现了问题。${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
    }
  }
  
  /**
   * 处理任务意图
   */
  private async handleTaskIntent(conversationId: string, userId: string, content: string): Promise<{
    response: Message;
    taskId: string;
  }> {
    try {
      logger.info(`处理任务意图 [对话ID: ${conversationId}]`);
      
      // 1. 创建任务
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId // 直接在创建任务时关联到对话
      });
      
      // 2. 创建助手消息回复
      const response = await messageDao.createMessage({
        conversationId,
        content: `已为您创建任务：${task.title}\n任务ID：${task.id}\n我将开始执行此任务。`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      // 3. 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      logger.info(`任务意图处理完成 [对话ID: ${conversationId}, 任务ID: ${task.id}]`);
      
      return {
        response,
        taskId: task.id
      };
    } catch (error) {
      logger.error(`处理任务意图失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误响应
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `抱歉，创建任务时出现了问题。${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT // 降级为普通聊天
      });
      
      throw error;
    }
  }
  
  /**
   * 处理流式用户消息（用于实时响应）
   */
  async processUserMessageStream(conversationId: string, userId: string, content: string, streamCallback: (chunk: any) => void): Promise<{
    messageId: string;
    responseId: string;
    intent: MessageIntent;
    taskId?: string;
  }> {
    try {
      // 1. 创建用户消息记录
      const userMessage = await messageDao.createMessage({
        conversationId,
        content,
        type: MessageType.USER,
        intent: MessageIntent.UNKNOWN
      });
      
      // 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      // 发送正在处理的消息
      streamCallback({
        event: 'processing_start',
        data: { messageId: userMessage.id }
      });
      
      // 2. 识别用户意图
      streamCallback({
        event: 'intent_detection',
        data: { status: 'processing' }
      });
      
      const intentResult = await this.identifyUserIntent(conversationId, content);
      const userIntent = intentResult.intent;
      
      // 更新消息意图
      await messageDao.updateMessageIntent(userMessage.id, userIntent);
      
      // 发送意图识别结果
      streamCallback({
        event: 'intent_detection',
        data: { 
          status: 'completed',
          intent: userIntent,
          confidence: intentResult.confidence,
          explanation: intentResult.explanation
        }
      });
      
      // 3. 根据意图处理消息
      let responseId: string;
      let taskId: string | undefined;
      
      if (userIntent === MessageIntent.TASK) {
        // 处理任务意图（流式）
        const taskResult = await this.handleTaskIntentStream(
          conversationId,
          userId,
          content,
          (chunk) => streamCallback({ event: 'task_processing', data: chunk })
        );
        
        responseId = taskResult.responseId;
        taskId = taskResult.taskId;
        
        // 关联用户消息到任务
        await messageDao.linkMessageToTask(userMessage.id, taskId);
        
        // 增加对话任务计数
        await conversationDao.incrementTaskCount(conversationId);
      } else {
        // 处理聊天意图（流式）
        const chatResult = await this.handleChatIntentStream(
          conversationId,
          userId,
          content,
          (chunk) => streamCallback({ event: 'chat_response', data: { content: chunk } })
        );
        
        responseId = chatResult.responseId;
      }
      
      // 发送处理完成消息
      streamCallback({
        event: 'processing_complete',
        data: { 
          messageId: userMessage.id,
          responseId,
          intent: userIntent,
          taskId
        }
      });
      
      // 4. 返回处理结果
      return {
        messageId: userMessage.id,
        responseId,
        intent: userIntent,
        taskId
      };
    } catch (error) {
      logger.error(`流式处理用户消息失败 [对话ID: ${conversationId}]:`, error);
      
      // 发送错误消息
      streamCallback({
        event: 'error',
        data: { 
          message: '处理消息时出错',
          details: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }
  
  /**
   * 流式处理聊天意图
   */
  private async handleChatIntentStream(
    conversationId: string, 
    userId: string, 
    content: string,
    streamCallback: (chunk: string) => void
  ): Promise<{ responseId: string }> {
    try {
      // 创建一个空的回复消息
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: '',  // 空内容，会在流式处理完成后更新
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      // 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      // 获取对话历史用作上下文
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
      
      // 添加当前用户消息
      messages.push(new HumanMessage(content));
      
      // 使用流式LLM生成回复
      let fullResponse = '';
      const stream = await this.llm.stream(messages);
      
      for await (const chunk of stream) {
        const chunkContent = typeof chunk.content === 'string' 
          ? chunk.content 
          : JSON.stringify(chunk.content);
        fullResponse += chunkContent;
        
        // 发送内容块
        streamCallback(chunkContent);
      }
      
      // 更新消息内容
      await db.query(
        `
        UPDATE messages
        SET content = $1
        WHERE id = $2
        `,
        [fullResponse, assistantMessage.id]
      );
      
      return { responseId: assistantMessage.id };
    } catch (error) {
      logger.error(`流式处理聊天意图失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误响应
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `抱歉，处理您的消息时出现了问题。${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT
      });
      
      return { responseId: errorMessage.id };
    }
  }
  
  /**
   * 流式处理任务意图
   */
  private async handleTaskIntentStream(
    conversationId: string, 
    userId: string, 
    content: string,
    streamCallback: (chunk: any) => void
  ): Promise<{ responseId: string; taskId: string }> {
    try {
      // 创建任务
      streamCallback({ status: 'creating_task' });
      const task = await this.taskService.createTask({
        userId,
        title: content.length > 30 ? content.substring(0, 30) + '...' : content,
        content,
        conversationId // 直接关联对话
      });
      
      streamCallback({ 
        status: 'task_created',
        taskId: task.id,
        title: task.title
      });
      
      // 创建一个空的回复消息
      const assistantMessage = await messageDao.createMessage({
        conversationId,
        content: `已为您创建任务：${task.title}\n任务ID：${task.id}\n我将开始执行此任务。`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: task.id
      });
      
      // 增加对话消息计数
      await conversationDao.incrementMessageCount(conversationId);
      
      // 流式执行任务
      streamCallback({ status: 'executing_task' });
      
      // 使用自定义流回调
      await this.taskExecutorService.executeTaskStream(
        task.id,
        (data) => {
          streamCallback(data);
        }
      );
      
      return { 
        responseId: assistantMessage.id,
        taskId: task.id
      };
    } catch (error) {
      logger.error(`流式处理任务意图失败 [对话ID: ${conversationId}]:`, error);
      
      // 创建错误响应
      const errorMessage = await messageDao.createMessage({
        conversationId,
        content: `抱歉，创建任务时出现了问题。${error instanceof Error ? error.message : ''}`,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.CHAT // 降级为普通聊天
      });
      
      throw error;
    }
  }
}

// 导出服务实例获取函数
let conversationServiceInstance: ConversationService | null = null;

export function getConversationService(
  mcpToolAdapter?: MCPToolAdapter,
  taskExecutorService?: TaskExecutorService
): ConversationService {
  if (!conversationServiceInstance && mcpToolAdapter && taskExecutorService) {
    conversationServiceInstance = new ConversationService(mcpToolAdapter, taskExecutorService);
  }
  
  if (!conversationServiceInstance) {
    throw new Error('ConversationService未正确初始化，需要提供mcpToolAdapter和taskExecutorService');
  }
  
  return conversationServiceInstance;
} 