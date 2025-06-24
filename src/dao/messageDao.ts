import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Message, MessageType, MessageIntent } from '../models/conversation.js';

// Database row record interface
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
 * Message DAO - Responsible for database operations related to messages
 */
export class MessageDao {
  /**
   * Create new message
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

      logger.info(`Message record created successfully: ${messageId}`);
      
      // Update conversation's latest message content and time
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
      logger.error('Failed to create message record:', error);
      throw error;
    }
  }

  /**
   * Get all messages for a conversation
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
      logger.error(`Failed to get conversation messages [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Get all messages related to a task
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
      logger.error(`Failed to get task messages [Task ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * Get specific message
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
      logger.error(`Failed to get message [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * Update message intent
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

      logger.info(`Message intent updated successfully [ID: ${messageId}, Intent: ${intent}]`);
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to update message intent [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * Link message to task
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

      logger.info(`Message linked to task successfully [Message ID: ${messageId}, Task ID: ${taskId}]`);
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to link message to task [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * Get recent N messages from conversation for context
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

      // Reverse order to have earliest messages first
      return result.rows.map(row => this.mapMessageFromDb(row)).reverse();
    } catch (error) {
      logger.error(`Failed to get recent messages [Conversation ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * Update message content
   */
  async updateMessageContent(messageId: string, content: string): Promise<Message | null> {
    try {
      const result = await db.query<MessageDbRow>(
        `
        UPDATE messages
        SET content = $1
        WHERE id = $2
        RETURNING *
        `,
        [content, messageId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      logger.info(`Message content updated successfully [ID: ${messageId}]`);
      return this.mapMessageFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to update message content [ID: ${messageId}]:`, error);
      throw error;
    }
  }

  /**
   * Map database row to message object
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

// Export DAO singleton
export const messageDao = new MessageDao(); 