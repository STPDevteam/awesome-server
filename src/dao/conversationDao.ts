import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Conversation, ConversationSearchOptions, ConversationType } from '../models/conversation.js';

// Database row record interface
export interface ConversationDbRow {
  id: string;
  user_id: string;
  title: string;
  type: string;
  agent_id?: string;
  last_message_content?: string;
  last_message_at?: string;
  task_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  is_deleted: boolean;
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
    type?: ConversationType;
    agentId?: string;
  }): Promise<Conversation> {
    try {
      const conversationId = uuidv4();
      const now = new Date();
      const conversationType = data.type || ConversationType.NORMAL;
      
      const result = await db.query<ConversationDbRow>(
        `
        INSERT INTO conversations (id, user_id, title, type, agent_id, task_count, message_count, created_at, updated_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [conversationId, data.userId, data.title, conversationType, data.agentId || null, 0, 0, now, now, false]
      );

      logger.info(`Conversation record created successfully: ${conversationId} (Type: ${conversationType})`);
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
        WHERE id = $1 AND is_deleted = FALSE
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

      // Build WHERE clause
      let whereClause = 'WHERE user_id = $1 AND is_deleted = FALSE';
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      if (options?.type) {
        whereClause += ` AND type = $${paramIndex}`;
        queryParams.push(options.type);
        paramIndex++;
      }

      // Query total count
      const countResult = await db.query(
        `
        SELECT COUNT(*) as total
        FROM conversations
        ${whereClause}
        `,
        queryParams
      );
      
      const total = parseInt(countResult.rows[0].total, 10);

      // Query conversation list
      const result = await db.query<ConversationDbRow>(
        `
        SELECT *
        FROM conversations
        ${whereClause}
        ORDER BY ${sortField} ${sortDirection}
        LIMIT ${limit} OFFSET ${offset}
        `,
        queryParams
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
    type?: ConversationType;
    agentId?: string;
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

      if (updates.type !== undefined) {
        updateFields.push(`type = $${valueIndex}`);
        values.push(updates.type);
        valueIndex++;
      }

      if (updates.agentId !== undefined) {
        updateFields.push(`agent_id = $${valueIndex}`);
        values.push(updates.agentId);
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
        WHERE id = $2 AND is_deleted = FALSE
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
        WHERE id = $2 AND is_deleted = FALSE
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
   * Soft delete conversation and related data
   */
  async softDeleteConversation(conversationId: string): Promise<boolean> {
    try {
      const now = new Date();
      
      // Start transaction to ensure data consistency
      const queries = [
        // Soft delete related messages
        {
          text: `
            UPDATE messages
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE conversation_id = $2 AND is_deleted = FALSE
          `,
          params: [now, conversationId]
        },
        // Soft delete related tasks
        {
          text: `
            UPDATE tasks
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE conversation_id = $2 AND is_deleted = FALSE
          `,
          params: [now, conversationId]
        },
        // Soft delete related task steps
        {
          text: `
            UPDATE task_steps
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE task_id IN (
              SELECT id FROM tasks WHERE conversation_id = $2
            ) AND is_deleted = FALSE
          `,
          params: [now, conversationId]
        },
        // Soft delete the conversation
        {
          text: `
            UPDATE conversations
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE id = $2 AND is_deleted = FALSE
            RETURNING id
          `,
          params: [now, conversationId]
        }
      ];

      const results = await db.transaction(queries);
      const conversationResult = results[results.length - 1];
      
      const success = conversationResult.rowCount !== null && conversationResult.rowCount > 0;
      if (success) {
        logger.info(`Conversation soft deleted successfully [ID: ${conversationId}]`);
      } else {
        logger.warn(`Conversation not found for soft deletion [ID: ${conversationId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Failed to soft delete conversation [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Hard delete conversation (permanently remove from database)
   * This method is kept for admin/cleanup purposes
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
      
      // Delete related task steps
      await db.query(
        `
        DELETE FROM task_steps
        WHERE task_id IN (
          SELECT id FROM tasks WHERE conversation_id = $1
        )
        `,
        [conversationId]
      );
      
      // Delete related tasks
      await db.query(
        `
        DELETE FROM tasks
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
        logger.info(`Conversation permanently deleted successfully [ID: ${conversationId}]`);
      } else {
        logger.warn(`Conversation not found for permanent deletion [ID: ${conversationId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`Failed to permanently delete conversation [ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Get existing conversation between user and agent
   * Returns the most recent conversation if multiple exist (for compatibility with previous behavior)
   */
  async getUserAgentConversation(userId: string, agentId: string): Promise<Conversation | null> {
    try {
      // First check how many conversations exist for debugging
      const countResult = await db.query(
        `
        SELECT COUNT(*) as total
        FROM conversations
        WHERE user_id = $1 
          AND agent_id = $2 
          AND type = $3 
          AND is_deleted = false
        `,
        [userId, agentId, ConversationType.AGENT]
      );

      const totalConversations = parseInt(countResult.rows[0]?.total || '0');
      logger.info(`Found ${totalConversations} existing conversations between user ${userId} and agent ${agentId}`);

      if (totalConversations === 0) {
        logger.info(`No existing conversation found between user ${userId} and agent ${agentId}`);
        return null;
      }

      // Get the most recent conversation
      const result = await db.query<ConversationDbRow>(
        `
        SELECT *
        FROM conversations
        WHERE user_id = $1 
          AND agent_id = $2 
          AND type = $3 
          AND is_deleted = false
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId, agentId, ConversationType.AGENT]
      );

      const conversation = this.mapConversationFromDb(result.rows[0]);
      logger.info(`Returning most recent conversation between user ${userId} and agent ${agentId}: ${conversation.id} (created: ${conversation.createdAt})`);
      
      if (totalConversations > 1) {
        logger.info(`Note: User has ${totalConversations} total conversations with this agent, returning the most recent one`);
      }

      return conversation;
    } catch (error) {
      logger.error(`Failed to get user-agent conversation [UserId: ${userId}, AgentId: ${agentId}]:`, error);
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
      type: row.type as ConversationType,
      agentId: row.agent_id || undefined,
      lastMessageContent: row.last_message_content,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : undefined,
      taskCount: row.task_count,
      messageCount: row.message_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      isDeleted: row.is_deleted || false
    };
  }
}

// Export DAO singleton
export const conversationDao = new ConversationDao(); 