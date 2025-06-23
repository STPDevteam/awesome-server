import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { mcpAuthDao, MCPAuthDbRow } from '../dao/mcpAuthDao.js';
import { MCPAuthData, AuthVerificationResult } from '../models/mcpAuth.js';

/**
 * MCP授权管理服务
 */
export class MCPAuthService {
  constructor() {
    // The mcpManager dependency was here, but it was unused.
    // It has been removed as part of the refactoring to a pure HTTP architecture.
  }
  
  /**
   * 保存MCP授权信息
   * @param userId 用户ID
   * @param mcpName MCP名称
   * @param authData 授权数据
   * @param isVerified 是否已验证
   */
  async saveAuthData(
    userId: string,
    mcpName: string,
    authData: Record<string, string>,
    isVerified: boolean = false
  ): Promise<MCPAuthData> {
    try {
      // 调用DAO层保存授权数据
      const authRecord = await mcpAuthDao.saveAuthData(userId, mcpName, authData, isVerified);
      
      // 转换为业务层实体
      return this.mapAuthFromDb(authRecord);
    } catch (error) {
      logger.error(`保存MCP授权数据失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取用户的MCP授权信息
   * @param userId 用户ID
   * @param mcpName MCP名称
   */
  async getUserMCPAuth(userId: string, mcpName: string): Promise<MCPAuthData | null> {
    try {
      // 调用DAO层获取授权信息
      const authRecord = await mcpAuthDao.getUserMCPAuth(userId, mcpName);
      
      if (!authRecord) {
        return null;
      }
      
      return this.mapAuthFromDb(authRecord);
    } catch (error) {
      logger.error(`获取MCP授权数据失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取用户的所有MCP授权信息
   * @param userId 用户ID
   */
  async getUserAllMCPAuths(userId: string): Promise<MCPAuthData[]> {
    try {
      // 调用DAO层获取所有授权信息
      const authRecords = await mcpAuthDao.getUserAllMCPAuths(userId);
      
      return authRecords.map(record => this.mapAuthFromDb(record));
    } catch (error) {
      logger.error(`获取所有MCP授权数据失败 [用户: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 验证MCP授权
   * @param userId 用户ID
   * @param mcpName MCP名称
   * @param authData 授权数据
   */
  async verifyAuth(
    userId: string,
    mcpName: string, 
    authData: Record<string, string>
  ): Promise<AuthVerificationResult> {
    try {
      logger.info(`验证MCP授权 [用户: ${userId}, MCP: ${mcpName}]`);
      
      // 根据MCP类型执行不同的验证逻辑
      let verificationResult: AuthVerificationResult;
      
      switch (mcpName) {
        case 'GitHubTool':
          verificationResult = await this.verifyGitHubAuth(authData);
          break;
        case 'GoogleSearchTool':
          verificationResult = await this.verifyGoogleSearchAuth(authData);
          break;
        case 'DatabaseQueryTool':
          verificationResult = await this.verifyDatabaseAuth(authData);
          break;
        case 'ImageAnalysisTool':
          verificationResult = await this.verifyImageAnalysisAuth(authData);
          break;
        case 'WeatherTool':
          verificationResult = await this.verifyWeatherAuth(authData);
          break;
        default:
          // 对于不需要授权的MCP，直接返回成功
          verificationResult = { 
            success: true, 
            message: '该MCP无需授权验证' 
          };
      }
      
      // 更新授权验证状态
      await this.saveAuthData(userId, mcpName, authData, verificationResult.success);
      
      return verificationResult;
    } catch (error) {
      logger.error(`验证MCP授权失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      return {
        success: false,
        message: '授权验证过程中发生错误',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 为任务更新MCP的授权状态
   * @param taskId 任务ID
   * @param userId 用户ID
   * @param mcpName MCP名称
   * @param isVerified 是否已验证
   */
  async updateTaskMCPAuthStatus(
    taskId: string,
    userId: string,
    mcpName: string,
    isVerified: boolean
  ): Promise<boolean> {
    try {
      // 调用DAO层更新任务MCP授权状态
      return await mcpAuthDao.updateTaskMCPAuthStatus(taskId, userId, mcpName, isVerified);
    } catch (error) {
      logger.error(`更新任务MCP授权状态失败 [任务: ${taskId}, MCP: ${mcpName}]:`, error);
      return false;
    }
  }
  
  /**
   * 检查任务的所有MCP是否都已验证
   * @param taskId 任务ID
   */
  async checkAllMCPsVerified(taskId: string): Promise<boolean> {
    try {
      // 获取当前任务的工作流
      const mcpWorkflow = await mcpAuthDao.getTaskMCPWorkflow(taskId);
      
      if (!mcpWorkflow) {
        return false;
      }
      
      // 检查需要授权的MCP是否都已验证
      const requiredAuthMCPs = (mcpWorkflow.mcps || []).filter((mcp: { authRequired: boolean }) => 
        mcp.authRequired === true
      );
      
      if (requiredAuthMCPs.length === 0) {
        return true; // 没有需要授权的MCP
      }
      
      return requiredAuthMCPs.every((mcp: { authVerified: boolean }) => 
        mcp.authVerified === true
      );
    } catch (error) {
      logger.error(`检查任务MCP授权状态失败 [任务: ${taskId}]:`, error);
      return false;
    }
  }
  
  /**
   * 从数据库行记录映射到应用层实体
   */
  private mapAuthFromDb(row: MCPAuthDbRow): MCPAuthData {
    return {
      id: row.id,
      userId: row.user_id,
      mcpName: row.mcp_name,
      authData: row.auth_data || {},
      isVerified: row.is_verified,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  /**
   * GitHub授权验证
   * @param authData 授权数据
   */
  private async verifyGitHubAuth(authData: Record<string, string>): Promise<AuthVerificationResult> {
    try {
      const token = authData.GITHUB_TOKEN;
      
      if (!token) {
        return { 
          success: false,
          message: 'GitHub令牌不能为空'
        };
      }
      
      // 尝试调用GitHub API验证令牌
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.ok) {
        return {
          success: true,
          message: 'GitHub授权验证成功'
        };
      } else {
        const errorData = await response.json() as { message?: string };
        return {
          success: false,
          message: 'GitHub授权验证失败',
          details: errorData.message || `HTTP错误: ${response.status}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'GitHub授权验证过程中发生错误',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Google搜索授权验证
   * @param authData 授权数据
   */
  private async verifyGoogleSearchAuth(authData: Record<string, string>): Promise<AuthVerificationResult> {
    try {
      const apiKey = authData.GOOGLE_API_KEY;
      const searchEngineId = authData.CUSTOM_SEARCH_ENGINE_ID;
      
      if (!apiKey || !searchEngineId) {
        return {
          success: false,
          message: 'Google API密钥和自定义搜索引擎ID都不能为空'
        };
      }
      
      // 尝试执行一个测试搜索
      const testQuery = 'test';
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${testQuery}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        return {
          success: true,
          message: 'Google搜索授权验证成功'
        };
      } else {
        const errorData = await response.json() as { error?: { message?: string } };
        return {
          success: false,
          message: 'Google搜索授权验证失败',
          details: errorData.error?.message || `HTTP错误: ${response.status}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Google搜索授权验证过程中发生错误',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 数据库授权验证
   * @param authData 授权数据
   */
  private async verifyDatabaseAuth(authData: Record<string, string>): Promise<AuthVerificationResult> {
    // 这里应该根据实际数据库类型实现验证逻辑
    // 为了简化示例，我们只检查是否提供了连接字符串
    const connectionString = authData.DB_CONNECTION_STRING;
    
    if (!connectionString) {
      return {
        success: false,
        message: '数据库连接字符串不能为空'
      };
    }
    
    // 在实际应用中，应该尝试连接数据库验证
    // 这里简单返回成功
    return {
      success: true,
      message: '数据库授权信息已记录（实际应用中应验证连接）'
    };
  }
  
  /**
   * 图像分析授权验证
   * @param authData 授权数据
   */
  private async verifyImageAnalysisAuth(authData: Record<string, string>): Promise<AuthVerificationResult> {
    const apiKey = authData.VISION_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        message: '视觉API密钥不能为空'
      };
    }
    
    // 简化的验证，实际应调用相应API
    return {
      success: true,
      message: '图像分析授权信息已记录（实际应用中应验证API密钥）'
    };
  }
  
  /**
   * 天气服务授权验证
   * @param authData 授权数据
   */
  private async verifyWeatherAuth(authData: Record<string, string>): Promise<AuthVerificationResult> {
    const apiKey = authData.WEATHER_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        message: '天气API密钥不能为空'
      };
    }
    
    // 简化的验证，实际应调用天气API
    return {
      success: true,
      message: '天气服务授权信息已记录（实际应用中应验证API密钥）'
    };
  }
} 