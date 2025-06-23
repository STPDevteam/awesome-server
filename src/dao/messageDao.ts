import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Message, MessageType, MessageIntent } from '../models/conversation.js';

// 数据库行记录接口
export interface MessageDbRow {
  id: string;
  conversation_id: string;
  content: string;
  type: string;
  intent?: string;
  task_id?: string;
  metadata?: any;
  created_at: string;
}

/**
 * 消息DAO - 负责消息相关的数据库操作
 */
export class MessageDao {
  /**
   * 创建新消息
   */
  async createMessage(data: {
    conversationId: string;
    content: string;
    type: MessageType;
    intent?: MessageIntent;
    taskId?: string;
    metadata?: any;
  }): Promise<Message> {
    try {
      const messageId = uuidv4();
      const now = new Date();
      
      const result = await db.query<MessageDbRow>(
        `
        INSERT INTO messages (id, conversation_id, content, type, intent, task_id, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          messageId, 
          data.conversationId, 
          data.content, 
          data.type,
          data.intent || null,
          data.taskId || null, 
          data.metadata ? JSON.stringify(data.metadata) : null, 
          now
        ]
      );

      logger.info(`消息记录创建成功: ${messageId}`);
      
      // 更新对话的最新消息内容和时间
      await db.query(
        `
        UPDATE conversations
        SET last_message_content = $1, last_message_at = $2, updated_at = $2
        WHERE id = $3
        `,
        [data.content, now, data.conversationId]
      );
      
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error('创建消息记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取对话的所有消息
   */
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        `,
        [conversationId]
      );

      return result.rows.map(row => this.mapMessageFromDb(row));
    } catch (error) {
      logger.error(`获取对话消息失败 [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取某个任务相关的所有消息
   */
  async getTaskMessages(taskId: string): Promise<Message[]> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE task_id = $1
        ORDER BY created_at ASC
        `,
        [taskId]
      );

      return result.rows.map(row => this.mapMessageFromDb(row));
    } catch (error) {
      logger.error(`获取任务消息失败 [Task ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取特定消息
   */
  async getMessageById(messageId: string): Promise<Message | null> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE id = $1
        `,
        [messageId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`获取消息失败 [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * 更新消息意图
   */
  async updateMessageIntent(messageId: string, intent: MessageIntent): Promise<Message | null> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        UPDATE messages
        SET intent = $1
        WHERE id = $2
        RETURNING *
        `,
        [intent, messageId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info(`消息意图更新成功 [ID: ${messageId}, Intent: ${intent}]`);
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`更新消息意图失败 [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * 关联消息到任务
   */
  async linkMessageToTask(messageId: string, taskId: string): Promise<Message | null> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        UPDATE messages
        SET task_id = $1, intent = $2
        WHERE id = $3
        RETURNING *
        `,
        [taskId, MessageIntent.TASK, messageId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info(`消息关联到任务成功 [消息ID: ${messageId}, 任务ID: ${taskId}]`);
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`关联消息到任务失败 [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取对话中最近的N条消息用于上下文
   */
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [conversationId, limit]
      );

      // 反转顺序，使最早的消息在前
      return result.rows.map(row => this.mapMessageFromDb(row)).reverse();
    } catch (error) {
      logger.error(`获取最近消息失败 [对话ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 将数据库行映射为消息对象
   */
  private mapMessageFromDb(row: MessageDbRow): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      content: row.content,
      type: row.type as MessageType,
      intent: row.intent as MessageIntent | undefined,
      taskId: row.task_id,
      metadata: row.metadata,
      createdAt: new Date(row.created_at)
    };
  }
}

// 导出DAO单例
export const messageDao = new MessageDao(); 