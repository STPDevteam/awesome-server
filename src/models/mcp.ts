// 备选MCP信息类型（与主MCP格式完全一致）
export interface AlternativeMCPInfo {
  name: string;
  description: string;
  authRequired: boolean;
  authVerified?: boolean; // 认证状态
  authData?: Record<string, any>; // 认证数据
  category?: string;
  imageUrl?: string;
  githubUrl?: string;
  authParams?: Record<string, any>; // 认证参数配置
}

/**
 * MCP信息接口
 */
export interface MCPInfo {
  name: string;
  description: string;
  authRequired: boolean;
  category?: string;
  imageUrl?: string;
  githubUrl?: string;
  authParams?: Record<string, any>;
  alternatives?: string[]; // 备选MCP名称列表（内部处理用）
  alternativesInfo?: AlternativeMCPInfo[]; // 完整的备选MCP信息列表（返回给前端用）
  // 🔧 新增：预定义的工具信息
  predefinedTools?: MCPTool[];
}

/**
 * MCP连接配置
 */
export interface MCPConnection {
  name: string;
  path: string;
  args: string[];
  env?: Record<string, string>;
  isConnected: boolean;
}

/**
 * MCP工具定义
 */
export interface MCPTool {
  name: string;
  description?: string;
  parameters?: any;
  returnType?: string;
}

/**
 * MCP调用结果接口
 */
export interface MCPCallResult {
  success: boolean;
  content?: any;
  error?: string;
}

/**
 * MCP替代方案记录
 */
export interface MCPAlternativeRecord {
  taskId: string;
  originalMcp: string;
  alternatives: string[];
  context: string;
  createdAt: Date;
} 