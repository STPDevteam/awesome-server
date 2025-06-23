import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Conversation, ConversationSearchOptions } from '../models/conversation.js';

// 数据库行记录接口
export interface ConversationDbRow {
  id: string;
  user_id: string;
  title: string;
  last_message_content?: string;
  last_message_at?: string;
  task_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * 对话DAO - 负责对话相关的数据库操作
 */
export class ConversationDao {
  /**
   * 创建新对话
   */
  async createConversation(data: {
    userId: string;
    title: string;
  }): Promise<Conversation> {
    try {
      const conversationId = uuidv4();
      const now = new Date();
      
      const result = await db.query<ConversationDbRow>(
        `
        INSERT INTO conversations (id, user_id, title, task_count, message_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [conversationId, data.userId, data.title, 0, 0, now, now]
      );

      logger.info(`对话记录创建成功: ${conversationId}`);
      return this.mapConversationFromDb(result.rows[0]);
    } catch (error) {
      logger.error('创建对话记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取对话详情
   */
  async getConversationById(conversationId: string): Promise<Conversation | null> {
    try {
      const result = await db.query<ConversationDbRow>(
        `
        SELECT * FROM conversations
        WHERE id = $1
        `,
        [conversationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapConversationFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`获取对话记录失败 [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取用户的所有对话
   */
  async getUserConversations(userId: string, options?: ConversationSearchOptions): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      // 设置默认排序和分页
      const sortField = options?.sortBy || 'last_message_at';
      const sortDirection = options?.sortDir || 'desc';
      const limit = options?.limit || 10;
      const offset = options?.offset || 0;

      // 查询总数
      const countResult = await db.query(
        `
        SELECT COUNT(*) as total
        FROM conversations
        WHERE user_id = $1
        `,
        [userId]
      );
      
      const total = parseInt(countResult.rows[0].total, 10);

      // 查询对话列表
      const result = await db.query<ConversationDbRow>(
        `
        SELECT *
        FROM conversations
        WHERE user_id = $1
        ORDER BY ${sortField} ${sortDirection}
        LIMIT ${limit} OFFSET ${offset}
        `,
        [userId]
      );

      const conversations = result.rows.map(row => this.mapConversationFromDb(row));

      return { conversations, total };
    } catch (error) {
      logger.error(`获取用户对话列表失败 [UserID: ${userId}]:`, error);
      throw error;
    }
  }

  /**
   * 更新对话
   */
  async updateConversation(conversationId: string, updates: {
    title?: string;
    lastMessageContent?: string;
    lastMessageAt?: Date;
    taskCount?: number;
    messageCount?: number;
  }): Promise<Conversation | null> {
    try {
      // 构建更新字段
      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.title !== undefined) {
        updateFields.push(`title = $${valueIndex}`);
        values.push(updates.title);
        valueIndex++;
      }

      if (updates.lastMessageContent !== undefined) {
        updateFields.push(`last_message_content = $${valueIndex}`);
        values.push(updates.lastMessageContent);
        valueIndex++;
      }

      if (updates.lastMessageAt !== undefined) {
        updateFields.push(`last_message_at = $${valueIndex}`);
        values.push(updates.lastMessageAt);
        valueIndex++;
      }

      if (updates.taskCount !== undefined) {
        updateFields.push(`task_count = $${valueIndex}`);
        values.push(updates.taskCount);
        valueIndex++;
      }

      if (updates.messageCount !== undefined) {
        updateFields.push(`message_count = $${valueIndex}`);
        values.push(updates.messageCount);
        valueIndex++;
      }

      // 如果没有字段需要更新，则直接返回对话
      if (updateFields.length === 0) {
        return this.getConversationById(conversationId);
      }

      // 添加更新时间
      updateFields.push(`updated_at = $${valueIndex}`);
      values.push(new Date());
      valueIndex++;

      // 添加ID条件
      values.push(conversationId);

      const query = `
        UPDATE conversations
        SET ${updateFields.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `;

      const result = await db.query<ConversationDbRow>(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      logger.info(`对话记录更新成功: ${conversationId}`);
      return this.mapConversationFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`更新对话记录失败 [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 增加对话中的任务计数
   */
  async incrementTaskCount(conversationId: string): Promise<void> {
    try {
      await db.query(
        `
        UPDATE conversations
        SET task_count = task_count + 1, updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId]
      );
      logger.info(`增加对话任务计数成功: ${conversationId}`);
    } catch (error) {
      logger.error(`增加对话任务计数失败 [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 增加对话中的消息计数
   */
  async incrementMessageCount(conversationId: string): Promise<void> {
    try {
      await db.query(
        `
        UPDATE conversations
        SET message_count = message_count + 1, updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId]
      );
      logger.info(`增加对话消息计数成功: ${conversationId}`);
    } catch (error) {
      logger.error(`增加对话消息计数失败 [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      // 开启事务，删除对话以及关联的消息
      await db.transaction([
        {
          text: 'DELETE FROM messages WHERE conversation_id = $1',
          params: [conversationId]
        },
        {
          text: 'DELETE FROM conversations WHERE id = $1',
          params: [conversationId]
        }
      ]);

      logger.info(`对话及其消息删除成功: ${conversationId}`);
      return true;
    } catch (error) {
      logger.error(`删除对话失败 [ID: ${conversationId}]:`, error);
      return false;
    }
  }

  /**
   * 将数据库行映射为对话对象
   */
  private mapConversationFromDb(row: ConversationDbRow): Conversation {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      lastMessageContent: row.last_message_content,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : undefined,
      taskCount: row.task_count,
      messageCount: row.message_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// 导出DAO单例
export const conversationDao = new ConversationDao(); 