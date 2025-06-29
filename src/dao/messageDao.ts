import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Message, MessageType, MessageIntent, MessageMetadata } from '../models/conversation.js';

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
  updated_at?: string;
  deleted_at?: string;
  is_deleted: boolean;
}

/**
 * Message DAO - Responsible for database operations related to messages
 */
export class MessageDao {
  private db = db;

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
      
      const result = await this.db.query<MessageDbRow>(
        `
        INSERT INTO messages (id, conversation_id, content, type, intent, task_id, metadata, created_at, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          now,
          false
        ]
      );

      logger.info(`Message record created successfully: ${messageId}`);
      
      // Update conversation's latest message content and time
      await this.db.query(
        `
        UPDATE conversations
        SET last_message_content = $1, last_message_at = $2, updated_at = $2
        WHERE id = $3 AND is_deleted = FALSE
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
      const result = await this.db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE conversation_id = $1 AND is_deleted = FALSE
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
      const result = await this.db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE task_id = $1 AND is_deleted = FALSE
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
      const result = await this.db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE id = $1 AND is_deleted = FALSE
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
      const result = await this.db.query<MessageDbRow>(
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
      const result = await this.db.query<MessageDbRow>(
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
      const result = await this.db.query<MessageDbRow>(
        `
        SELECT * FROM messages
        WHERE conversation_id = $1 AND is_deleted = FALSE
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
      const result = await this.db.query<MessageDbRow>(
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
   * 创建流式占位消息
   */
  async createStreamingMessage(data: {
    conversationId: string;
    content?: string;
    type: MessageType;
    intent?: MessageIntent;
    taskId?: string;
    metadata?: MessageMetadata;
  }): Promise<Message> {
    const query = `
      INSERT INTO messages (
        id, conversation_id, content, type, intent, task_id, metadata, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
      ) RETURNING *
    `;

    const values = [
      data.conversationId,
      data.content || '', // 空内容或初始内容
      data.type,
      data.intent,
      data.taskId,
      data.metadata ? JSON.stringify({
        ...data.metadata,
        isStreaming: true,
        isComplete: false
      }) : null
    ];

    const result = await this.db.query<MessageDbRow>(query, values);
    return this.mapMessageFromDb(result.rows[0]);
  }

  /**
   * 更新流式消息内容（追加模式）
   */
  async appendStreamingContent(messageId: string, additionalContent: string): Promise<Message | null> {
    const query = `
      UPDATE messages 
      SET 
        content = content || $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query<MessageDbRow>(query, [messageId, additionalContent]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapMessageFromDb(result.rows[0]);
  }

  /**
   * 完成流式消息（标记为完成状态）
   */
  async completeStreamingMessage(messageId: string, finalContent?: string): Promise<Message | null> {
    // 如果提供了最终内容，则替换整个内容；否则只更新元数据
    const query = finalContent ? `
      UPDATE messages 
      SET 
        content = $2,
        metadata = CASE 
          WHEN metadata IS NOT NULL 
          THEN jsonb_set(jsonb_set(metadata::jsonb, '{isStreaming}', 'false'), '{isComplete}', 'true')
          ELSE '{"isStreaming": false, "isComplete": true}'::jsonb
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    ` : `
      UPDATE messages 
      SET 
        metadata = CASE 
          WHEN metadata IS NOT NULL 
          THEN jsonb_set(jsonb_set(metadata::jsonb, '{isStreaming}', 'false'), '{isComplete}', 'true')
          ELSE '{"isStreaming": false, "isComplete": true}'::jsonb
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const values = finalContent ? [messageId, finalContent] : [messageId];
    const result = await this.db.query<MessageDbRow>(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapMessageFromDb(result.rows[0]);
  }

  /**
   * 批量创建任务步骤消息
   */
  async createTaskStepMessages(data: {
    conversationId: string;
    taskId: string;
    steps: Array<{
      stepType: string;
      stepNumber: number;
      stepName: string;
      content: string;
      totalSteps: number;
      taskPhase: 'analysis' | 'execution';
    }>;
  }): Promise<Message[]> {
    const messages: Message[] = [];

    for (const step of data.steps) {
      const message = await this.createMessage({
        conversationId: data.conversationId,
        content: step.content,
        type: MessageType.ASSISTANT,
        intent: MessageIntent.TASK,
        taskId: data.taskId,
        metadata: {
          stepType: step.stepType as any,
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          totalSteps: step.totalSteps,
          taskPhase: step.taskPhase,
          isStreaming: false,
          isComplete: true
        }
      });
      messages.push(message);
    }

    return messages;
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
      createdAt: new Date(row.created_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      isDeleted: row.is_deleted || false
    };
  }
}

// Export DAO singleton
export const messageDao = new MessageDao(); 