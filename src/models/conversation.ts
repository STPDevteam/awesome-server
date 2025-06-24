/**
 * Conversation Model
 * Used to store conversations between users and AI
 */

// Message types
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

// Message intent types
export enum MessageIntent {
  CHAT = 'chat',      // Regular chat
  TASK = 'task',      // Task execution
  UNKNOWN = 'unknown' // Undetermined intent
}

// Message
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: MessageType;
  intent?: MessageIntent;
  taskId?: string;    // If message is task-related, link to task ID
  metadata?: any;     // Additional metadata
  createdAt: Date;
}

// Conversation
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  lastMessageContent?: string;
  lastMessageAt?: Date;
  taskCount: number;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Conversation search options
export interface ConversationSearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
} 