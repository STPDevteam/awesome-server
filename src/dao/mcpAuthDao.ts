import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { getEncryptionService } from '../utils/encryption.js';

/**
 * 数据库行记录接口
 */
export interface MCPAuthDbRow {
  id: string;
  user_id: string;
  mcp_name: string;
  auth_data: any; // 使用any类型以匹配数据库返回的类型
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * MCP授权数据访问对象
 */
export class MCPAuthDao {
  /**
   * 保存MCP授权信息到数据库（加密存储）
   */
  async saveAuthData(
    userId: string,
    mcpName: string,
    authData: Record<string, string>,
    isVerified: boolean = false
  ): Promise<MCPAuthDbRow> {
    try {
      // 加密认证数据并包装成JSON对象
      const encryptionService = getEncryptionService();
      const encryptedData = encryptionService.encryptObject(authData);
      
      // 将加密字符串包装成JSON对象以符合JSONB字段要求
      const encryptedAuthData = {
        encrypted: encryptedData,
        version: 1 // 版本号，用于未来兼容性
      };
      
      logger.info(`加密认证数据 [用户: ${userId}, MCP: ${mcpName}]`);
      
      // 检查是否已存在授权记录
      const existingAuth = await this.getUserMCPAuth(userId, mcpName);
      
      if (existingAuth) {
        // 更新现有记录
        const result = await db.query<MCPAuthDbRow>(
          `
          UPDATE mcp_auth
          SET auth_data = $1, is_verified = $2, updated_at = NOW()
          WHERE id = $3
          RETURNING *
          `,
          [JSON.stringify(encryptedAuthData), isVerified, existingAuth.id]
        );
        
        logger.info(`更新MCP授权数据记录 [用户: ${userId}, MCP: ${mcpName}]`);
        return result.rows[0];
      } else {
        // 创建新记录
        const authId = uuidv4();
        const result = await db.query<MCPAuthDbRow>(
          `
          INSERT INTO mcp_auth (id, user_id, mcp_name, auth_data, is_verified)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
          `,
          [authId, userId, mcpName, JSON.stringify(encryptedAuthData), isVerified]
        );
        
        logger.info(`创建MCP授权数据记录 [用户: ${userId}, MCP: ${mcpName}]`);
        return result.rows[0];
      }
    } catch (error) {
      logger.error(`保存MCP授权数据记录失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取用户的MCP授权信息
   */
  async getUserMCPAuth(userId: string, mcpName: string): Promise<MCPAuthDbRow | null> {
    try {
      const result = await db.query<MCPAuthDbRow>(
        `
        SELECT * FROM mcp_auth
        WHERE user_id = $1 AND mcp_name = $2
        `,
        [userId, mcpName]
      );
      
      return result.rows.length === 0 ? null : result.rows[0];
    } catch (error) {
      logger.error(`获取MCP授权数据记录失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取用户的所有MCP授权信息
   */
  async getUserAllMCPAuths(userId: string): Promise<MCPAuthDbRow[]> {
    try {
      const result = await db.query<MCPAuthDbRow>(
        `
        SELECT * FROM mcp_auth
        WHERE user_id = $1
        ORDER BY updated_at DESC
        `,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      logger.error(`获取所有MCP授权数据记录失败 [用户: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 删除用户的MCP授权信息
   */
  async deleteMCPAuth(userId: string, mcpName: string): Promise<boolean> {
    try {
      const result = await db.query(
        `
        DELETE FROM mcp_auth
        WHERE user_id = $1 AND mcp_name = $2
        `,
        [userId, mcpName]
      );
      
      logger.info(`删除MCP授权数据记录 [用户: ${userId}, MCP: ${mcpName}]`);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      logger.error(`删除MCP授权数据记录失败 [用户: ${userId}, MCP: ${mcpName}]:`, error);
      throw error;
    }
  }
  
  /**
   * 删除用户的所有MCP授权信息
   */
  async deleteAllUserMCPAuths(userId: string): Promise<number> {
    try {
      const result = await db.query(
        `
        DELETE FROM mcp_auth
        WHERE user_id = $1
        `,
        [userId]
      );
      
      logger.info(`删除用户所有MCP授权数据记录 [用户: ${userId}]`);
      return result.rowCount || 0;
    } catch (error) {
      logger.error(`删除用户所有MCP授权数据记录失败 [用户: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取任务的MCP工作流
   */
  async getTaskMCPWorkflow(taskId: string): Promise<any> {
    try {
      const result = await db.query(
        `
        SELECT mcp_workflow FROM tasks
        WHERE id = $1
        `,
        [taskId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].mcp_workflow;
    } catch (error) {
      logger.error(`获取任务MCP工作流失败 [任务: ${taskId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 更新任务MCP的授权状态
   */
  async updateTaskMCPAuthStatus(
    taskId: string,
    userId: string,
    mcpName: string,
    isVerified: boolean
  ): Promise<boolean> {
    try {
      logger.info(`[DAO_UPDATE] Task ${taskId}: Updating MCP ${mcpName} to verified=${isVerified}.`);
      const mcpWorkflow = await this.getTaskMCPWorkflow(taskId);
      
      if (!mcpWorkflow) {
        logger.error(`[DAO_UPDATE] Task ${taskId}: Workflow not found.`);
        return false;
      }
      
      const workflowObj = typeof mcpWorkflow === 'string' 
        ? JSON.parse(mcpWorkflow) 
        : mcpWorkflow;
      
      logger.info(`[DAO_UPDATE] Task ${taskId}: Original workflow is ${JSON.stringify(workflowObj)}`);

      let wasUpdated = false;
      if (workflowObj.mcps && Array.isArray(workflowObj.mcps)) {
        workflowObj.mcps = workflowObj.mcps.map((mcp: any) => {
          if (mcp.name === mcpName) {
            wasUpdated = true;
            return { ...mcp, authVerified: isVerified };
          }
          return mcp;
        });
      }

      if(!wasUpdated) {
        logger.warn(`[DAO_UPDATE] Task ${taskId}: MCP ${mcpName} not found in workflow. No update performed.`);
      }
      
      const newWorkflowString = JSON.stringify(workflowObj);
      logger.info(`[DAO_UPDATE] Task ${taskId}: New workflow is ${newWorkflowString}`);
      
      const result = await db.query(
        `UPDATE tasks SET mcp_workflow = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [newWorkflowString, taskId, userId]
      );
      
      logger.info(`[DAO_UPDATE] Task ${taskId}: DB query result: ${result.rowCount} row(s) affected.`);
      return true;
    } catch (error) {
      logger.error(`[DAO_UPDATE] Task ${taskId}: Error during update:`, error);
      return false;
    }
  }
}

// 导出DAO单例
export const mcpAuthDao = new MCPAuthDao(); 