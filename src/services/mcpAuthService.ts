import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { mcpAuthDao, MCPAuthDbRow } from '../dao/mcpAuthDao.js';
import { MCPAuthData, AuthVerificationResult } from '../models/mcpAuth.js';
import { getPredefinedMCP, mcpNameMapping } from './predefinedMCPs.js';
import { taskDao } from '../dao/taskDao.js';
import { getEncryptionService } from '../utils/encryption.js';

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
   * 删除用户的MCP授权信息
   * @param userId 用户ID
   * @param mcpName MCP名称
   */
  async deleteMCPAuth(userId: string, mcpName: string): Promise<boolean> {
    try {
      return await mcpAuthDao.deleteMCPAuth(userId, mcpName);
    } catch (error) {
      logger.error(`删除MCP授权数据失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 删除用户的所有MCP授权信息
   * @param userId 用户ID
   */
  async deleteAllUserMCPAuths(userId: string): Promise<number> {
    try {
      return await mcpAuthDao.deleteAllUserMCPAuths(userId);
    } catch (error) {
      logger.error(`删除用户所有MCP授权数据失败 [用户: ${userId}]:`, error);
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
      logger.info(`[verifyAuth] Verifying auth for user ${userId}, mcp ${mcpName}`);
      
      let verificationResult: AuthVerificationResult;
           // 对于未明确定义验证逻辑的MCP，如果需要授权则返回简单验证
          if (authData && Object.keys(authData).length > 0) {
            // 检查是否所有必需字段都已提供
            const hasEmptyFields = Object.values(authData).some(value => !value || value === '');
            if (hasEmptyFields) {
              verificationResult = {
                success: false,
                message: '请填写所有必需的认证字段'
              };
            } else {
              verificationResult = { 
                success: true, 
                message: '认证信息已保存' 
              };
            }
          } else {
            verificationResult = { 
              success: true, 
              message: '该MCP无需授权验证' 
            };
          }
      
      // 在这里，我们将乐观地设置 is_verified
      // 如果验证逻辑（比如检查字段是否为空）通过，则is_verified为true
      const isVerified = verificationResult.success;
      
      // 更新或保存授权数据，并传入 is_verified 状态
      await this.saveAuthData(userId, mcpName, authData, isVerified);
      
      // 更新任务工作流中的状态
      // 注意：这里我们假设 taskId 是可用的，如果不是，则需要调整
      // 在当前路由下，我们没有taskId，所以这一步应该在路由处理器中完成
      
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
      const normalizedMcpName = this.normalizeMCPName(mcpName);
      return await mcpAuthDao.updateTaskMCPAuthStatus(taskId, userId, normalizedMcpName, isVerified);
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
      logger.info(`[SERVICE_CHECK] Task ${taskId}: Checking all MCPs.`);
      
      // 首先，从DAO获取工作流
      let mcpWorkflow = await mcpAuthDao.getTaskMCPWorkflow(taskId);
      
      // 如果从专用DAO未获取到，则从主任务表获取
      if (!mcpWorkflow || !mcpWorkflow.workflow) {
        logger.warn(`[SERVICE_CHECK] Task ${taskId}: MCP workflow not found via dedicated DAO. Falling back to main task object.`);
        const task = await taskDao.getTaskById(taskId);
        if (task && typeof task.mcp_workflow === 'string') {
          mcpWorkflow = JSON.parse(task.mcp_workflow);
        } else if (task && typeof task.mcp_workflow === 'object') {
          mcpWorkflow = task.mcp_workflow;
        }
      }

      if (!mcpWorkflow || !Array.isArray(mcpWorkflow.workflow)) {
        logger.warn(`[SERVICE_CHECK] Task ${taskId}: No valid MCP workflow found.`);
        return false;
      }
      
      logger.info(`[SERVICE_CHECK] Task ${taskId}: Workflow is ${JSON.stringify(mcpWorkflow)}`);
      
      // 从工作流中提取所有唯一的、需要认证的MCP
      const uniqueMcpActions = mcpWorkflow.workflow.reduce((acc: Record<string, any>, step: any) => {
        const key = `${step.mcp}-${step.action}`;
        if (!acc[key]) {
          acc[key] = step;
        }
        return acc;
      }, {});
      
      const mcpSteps = Object.values(uniqueMcpActions);

      const requiredAuthMCPs = mcpWorkflow.mcps.filter((mcp: any) => mcp.authRequired === true);

      if (requiredAuthMCPs.length === 0) {
        logger.info(`[SERVICE_CHECK] Task ${taskId}: No MCPs require authentication.`);
        return true;
      }
      
      const allVerified = requiredAuthMCPs.every((mcp: any) => mcp.authVerified === true);
      
      if(allVerified) {
        logger.info(`[SERVICE_CHECK] Task ${taskId}: Verification PASSED.`);
      } else {
        logger.error(`[SERVICE_CHECK] Task ${taskId}: Verification FAILED.`);
      }
      
      return allVerified;
    } catch (error) {
      logger.error(`[SERVICE_CHECK] Task ${taskId}: Error during check:`, error);
      return false;
    }
  }
  
  /**
   * 从数据库行记录映射到应用层实体（解密认证数据）
   */
  private mapAuthFromDb(row: MCPAuthDbRow): MCPAuthData {
    let authData = {};
    
    // 处理并解密authData
    if (row.auth_data) {
      try {
        const encryptionService = getEncryptionService();
        
        // 解析存储的数据
        let parsedData = row.auth_data;
        if (typeof row.auth_data === 'string') {
          parsedData = JSON.parse(row.auth_data);
        }
        
        // 检查是否为新的加密格式
        if (parsedData && typeof parsedData === 'object' && parsedData.encrypted && parsedData.version) {
          // 新格式：解密加密的数据
          try {
            authData = encryptionService.decryptObject(parsedData.encrypted);
            logger.info(`成功解密新格式认证数据 [用户: ${row.user_id}, MCP: ${row.mcp_name}]`);
          } catch (decryptError) {
            logger.error(`解密新格式数据失败 [用户: ${row.user_id}, MCP: ${row.mcp_name}]:`, decryptError);
            authData = {};
          }
        } else if (typeof parsedData === 'string') {
          // 可能是旧的加密格式（直接的Base64字符串）
          try {
            authData = encryptionService.decryptObject(parsedData);
            logger.info(`成功解密旧格式认证数据 [用户: ${row.user_id}, MCP: ${row.mcp_name}]`);
          } catch (decryptError) {
            // 如果解密失败，可能是未加密的JSON字符串
            logger.warn(`解密失败，尝试直接解析JSON [用户: ${row.user_id}, MCP: ${row.mcp_name}]:`, decryptError);
            try {
              authData = JSON.parse(parsedData);
              logger.info(`成功解析未加密的JSON字符串 [用户: ${row.user_id}, MCP: ${row.mcp_name}]`);
            } catch (parseError) {
              logger.error(`无法解析认证数据 [用户: ${row.user_id}, MCP: ${row.mcp_name}]:`, parseError);
              authData = {};
            }
          }
        } else {
          // 旧格式：直接使用对象数据（未加密）
          authData = parsedData;
          logger.info(`使用未加密的对象格式认证数据 [用户: ${row.user_id}, MCP: ${row.mcp_name}]`);
        }
      } catch (error) {
        logger.error(`处理认证数据失败 [用户: ${row.user_id}, MCP: ${row.mcp_name}]:`, error);
        authData = {};
      }
    }
    
    return {
      id: row.id,
      userId: row.user_id,
      mcpName: row.mcp_name,
      authData,
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
  

  private normalizeMCPName(mcpName: string): string {
    return mcpNameMapping[mcpName] || mcpName;
  }
} 