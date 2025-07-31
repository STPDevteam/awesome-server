/**
 * MCP授权数据接口
 */
export interface MCPAuthData {
  id: string;
  userId: string;
  mcpName: string;
  authData: Record<string, string>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MCP授权验证响应
 */
export interface AuthVerificationResult {
  success: boolean;
  message: string;
  details?: string;
} 