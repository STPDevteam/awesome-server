// 任务状态类型
export type TaskStatus = 'created' | 'in_progress' | 'completed' | 'failed';

// 备选MCP信息类型（与主MCP格式完全一致）
export interface AlternativeMCP {
  name: string;
  description: string;
  authRequired: boolean;
  authVerified?: boolean; // 认证状态，方便前端处理
  authData?: Record<string, any>; // 认证数据
  category?: string;
  imageUrl?: string;
  githubUrl?: string;
  authParams?: Record<string, any>; // 认证参数配置
}

// MCP工作流配置类型
export interface MCPWorkflow {
  mcps: Array<{
    name: string;
    description: string;
    authRequired: boolean;
    authVerified?: boolean;
    authData?: Record<string, any>;
    category?: string;
    imageUrl?: string;
    githubUrl?: string;
    authParams?: Record<string, any>;
    alternatives?: AlternativeMCP[]; // 完整的备选MCP信息列表
  }>;
  workflow: Array<{
    step: number;
    mcp: string;
    action: string;
    input?: string | any;
  }>;
}

// 任务类型
export interface Task {
  id: string;
  userId: string;
  title: string;
  content: string;
  status: TaskStatus;
  mcpWorkflow?: MCPWorkflow;
  result?: any;
  conversationId?: string;  // 任务创建来源的对话ID，一个任务只能来自一个对话
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}

// 任务步骤类型
export type TaskStepType = 'analysis' | 'mcp_selection' | 'deliverables' | 'workflow';

export interface TaskStep {
  id: string;
  taskId: string;
  stepType: TaskStepType;
  title: string;
  content?: string;
  reasoning?: string;
  reasoningTime?: number; // 以毫秒为单位
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}