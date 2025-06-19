/**
 * MCP信息接口
 */
export interface MCPInfo {
  name: string;
  description: string;
  capabilities: string[];
  authRequired: boolean;
  authFields?: string[];
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