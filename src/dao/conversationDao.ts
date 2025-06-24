import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Conversation, ConversationSearchOptions } from '../models/conversation.js';

// Database row record interface
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
 * Conversation DAO - Responsible for database operations related to conversations
 */
export class ConversationDao {
  /**
   * Create new conversation
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

      logger.info(`Conversation record created successfully: ${conversationId}`);
      return this.mapConversationFromDb(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create conversation record:', error);
      throw error;
    }
  }

  /**
   * Get conversation details
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
      logger.error(`Failed to get conversation record [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string, options?: ConversationSearchOptions): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      // Set default sorting and pagination
      const sortField = options?.sortBy || 'last_message_at';
      const sortDirection = options?.sortDir || 'desc';
      const limit = options?.limit || 10;
      const offset = options?.offset || 0;

      // Query total count
      const countResult = await db.query(
        `
        SELECT COUNT(*) as total
        FROM conversations
        WHERE user_id = $1
        `,
        [userId]
      );
      
      const total = parseInt(countResult.rows[0].total, 10);

      // Query conversation list
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
      logger.error(`Failed to get user conversation list [UserID: ${userId}]:`, error);
      throw error;
    }
  }

  /**
   * Update conversation
   */
  async updateConversation(conversationId: string, updates: {
    title?: string;
    lastMessageContent?: string;
    lastMessageAt?: Date;
    taskCount?: number;
    messageCount?: number;
  }): Promise<Conversation | null> {
    try {
      // Build update fields
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

      // If no fields to update, return conversation directly
      if (updateFields.length === 0) {
        return this.getConversationById(conversationId);
      }

      // Add update time
      updateFields.push(`updated_at = $${valueIndex}`);
      values.push(new Date());
      valueIndex++;

      // Add ID condition
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

      logger.info(`Conversation record updated successfully: ${conversationId}`);
      return this.mapConversationFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to update conversation record [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Increment task count in conversation
   */
  async incrementTaskCount(conversationId: string): Promise<void> {
    try {
      await db.query(
        `
        UPDATE conversations
        SET task_count = task_count + 1, updated_at = $1
        WHERE id = $2
        `,
        [new Date(), conversationId]
      );
      
      logger.info(`Task count incremented for conversation [ID: ${conversationId}]`);
    } catch (error) {
      logger.error(`Failed to increment task count [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Increment message count in conversation
   */
  async incrementMessageCount(conversationId: string): Promise<void> {
    try {
      await db.query(
        `
        UPDATE conversations
        SET message_count = message_count + 1, updated_at = $1
        WHERE id = $2
        `,
        [new Date(), conversationId]
      );
      
      logger.info(`Message count incremented for conversation [ID: ${conversationId}]`);
    } catch (error) {
      logger.error(`Failed to increment message count [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      // Delete related messages first
      await db.query(
        `
        DELETE FROM messages
        WHERE conversation_id = $1
        `,
        [conversationId]
      );
      
      // Then delete the conversation
      const result = await db.query(
        `
        DELETE FROM conversations
        WHERE id = $1
        RETURNING id
        `,
        [conversationId]
      );
      
      const success = result.rowCount !== null && result.rowCount > 0;
      if (success) {
        logger.info(`Conversation deleted successfully [ID: ${conversationId}]`);
      } else {
        logger.warn(`Conversation not found for deletion [ID: ${conversationId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Failed to delete conversation [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Map database row to conversation object
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

// Export DAO singleton
export const conversationDao = new ConversationDao(); 