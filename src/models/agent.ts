// Agent状态类型
export type AgentStatus = 'private' | 'public' | 'draft';

// Agent类型定义
export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: AgentStatus;
  taskId?: string; // 来源任务ID
  mcpWorkflow?: {
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
    }>;
    workflow: Array<{
      step: number;
      mcp: string;
      action: string;
      input?: string | any;
    }>;
  };
  metadata?: {
    originalTaskTitle?: string;
    originalTaskContent?: string;
    deliverables?: string[];
    executionResults?: any;
    tags?: string[];
    category?: string;
  };
  relatedQuestions?: string[]; // 三个相关问题，帮助用户理解Agent的用途
  usageCount: number; // 使用次数
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  isFavorited?: boolean; // 是否被当前用户收藏
}

// Agent创建请求参数
export interface CreateAgentRequest {
  userId: string;
  name: string;
  description: string;
  status: AgentStatus;
  taskId?: string;
  mcpWorkflow?: Agent['mcpWorkflow'];
  metadata?: Agent['metadata'];
  relatedQuestions?: string[];
}

// Agent更新请求参数
export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  status?: AgentStatus;
  metadata?: Agent['metadata'];
  relatedQuestions?: string[];
}

// Agent查询参数
export interface GetAgentsQuery {
  userId?: string;
  status?: AgentStatus;
  search?: string;
  category?: string;
  orderBy?: 'createdAt' | 'updatedAt' | 'usageCount' | 'name';
  order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  // 新增查询类型
  queryType?: 'public' | 'my-private' | 'my-saved' | 'all';
}

// Agent名称生成请求
export interface GenerateAgentNameRequest {
  taskTitle: string;
  taskContent: string;
  mcpWorkflow: Agent['mcpWorkflow'];
}

// Agent描述生成请求
export interface GenerateAgentDescriptionRequest {
  name: string;
  taskTitle: string;
  taskContent: string;
  mcpWorkflow: Agent['mcpWorkflow'];
}

// Agent名称验证规则
export interface AgentNameValidation {
  isValid: boolean;
  error?: string;
}

// Agent描述验证规则
export interface AgentDescriptionValidation {
  isValid: boolean;
  error?: string;
}

// Agent统计信息
export interface AgentStats {
  totalAgents: number;
  privateAgents: number;
  publicAgents: number;
  totalUsage: number;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
}

// Agent市场查询参数
export interface AgentMarketplaceQuery {
  search?: string;
  category?: string;
  orderBy?: 'createdAt' | 'updatedAt' | 'usageCount' | 'name';
  order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

// Agent使用记录
export interface AgentUsage {
  id: string;
  agentId: string;
  userId: string;
  taskId?: string;
  conversationId?: string;
  executionResult?: any;
  createdAt: Date;
}

// Agent收藏记录
export interface AgentFavorite {
  id: string;
  userId: string;
  agentId: string;
  createdAt: Date;
}

// Agent收藏操作请求
export interface FavoriteAgentRequest {
  agentId: string;
  userId: string;
}

// Agent收藏操作响应
export interface FavoriteAgentResponse {
  success: boolean;
  message: string;
  agentId: string;
  isFavorited: boolean;
}

// Try Agent请求参数
export interface TryAgentRequest {
  agentId: string;
  taskContent: string;
  userId: string;
}

// Try Agent响应
export interface TryAgentResponse {
  success: boolean;
  needsAuth?: boolean;
  missingAuth?: Array<{
    mcpName: string;
    description: string;
    authParams?: Record<string, any>;
  }>;
  message?: string;
  executionResult?: any;
}

// MCP认证状态检查结果
export interface MCPAuthCheckResult {
  needsAuth: boolean;
  missingAuth: Array<{
    mcpName: string;
    description: string;
    authParams?: Record<string, any>;
  }>;
  message?: string;
} 