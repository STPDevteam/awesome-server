/**
 * 对话模型
 * 用于存储用户与AI之间的对话
 */

// 消息类型
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

// 消息意图类型
export enum MessageIntent {
  CHAT = 'chat',      // 普通聊天
  TASK = 'task',      // 执行任务
  UNKNOWN = 'unknown' // 未确定意图
}

// 消息
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: MessageType;
  intent?: MessageIntent;
  taskId?: string;    // 如果是任务相关消息，关联到任务ID
  metadata?: any;     // 额外元数据
  createdAt: Date;
}

// 对话
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

// 对话搜索选项
export interface ConversationSearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
} 