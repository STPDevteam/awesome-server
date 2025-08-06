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

// 会话类型
export enum ConversationType {
  NORMAL = 'normal',   // 正常会话
  AGENT = 'agent'      // Agent会话
}

// 新增：消息步骤类型
export enum MessageStepType {
  ANALYSIS = 'analysis',           // 需求分析
  MCP_SELECTION = 'mcp_selection', // MCP选择
  DELIVERABLES = 'deliverables',   // 可交付确认
  WORKFLOW = 'workflow',           // 工作流构建
  EXECUTION = 'execution',         // 任务执行
  TASK_CREATION = 'task_creation', // 任务创建
  SUMMARY = 'summary'              // 结果摘要
}

// 新增：消息元数据接口
export interface MessageMetadata {
  stepType?: MessageStepType;
  stepNumber?: number;
  stepName?: string;
  totalSteps?: number;
  isStreaming?: boolean;
  isComplete?: boolean;
  // 任务相关
  taskPhase?: 'analysis' | 'execution';
  // 其他扩展字段
  [key: string]: any;
}

// Message
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: MessageType;
  intent?: MessageIntent;
  taskId?: string;    // If message is task-related, link to task ID
  metadata?: MessageMetadata;     // 使用强类型的元数据接口
  createdAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}

// Conversation
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  type: ConversationType;  // 新增：会话类型字段
  agentId?: string;        // 新增：如果是Agent会话，记录Agent ID
  language?: string;       // 新增：会话语言设置，可覆盖Agent默认语言
  lastMessageContent?: string;
  lastMessageAt?: Date;
  taskCount: number;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}

// Conversation search options
export interface ConversationSearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  type?: ConversationType;  // 新增：按会话类型过滤
} 