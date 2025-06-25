import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * MCP替代方案数据访问对象
 * 负责与MCP替代方案相关的数据库操作
 */
export class MCPAlternativeDao {
  /**
   * 获取任务的工作流配置
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
      logger.error(`获取任务MCP工作流失败 [任务: ${taskId}]`, error);
      throw error;
    }
  }
  
  /**
   * 替换任务工作流中的MCP
   */
  async replaceMCPInWorkflow(
    taskId: string,
    originalMcpName: string,
    newMcpName: string,
    newMcpDescription: string,
    newMcpAuthRequired: boolean,
    extraInfo?: {
      category?: string;
      imageUrl?: string;
      githubUrl?: string;
      authParams?: Record<string, any>;
    }
  ): Promise<boolean> {
    try {
      // 获取当前工作流
      const mcpWorkflow = await this.getTaskMCPWorkflow(taskId);
      
      if (!mcpWorkflow) {
        return false;
      }
      
      // 确保mcpWorkflow是对象而不是字符串
      const workflowObj = typeof mcpWorkflow === 'string' 
        ? JSON.parse(mcpWorkflow) 
        : mcpWorkflow;
      
      // 更新MCP列表
      if (workflowObj.mcps && Array.isArray(workflowObj.mcps)) {
        // 查找原始MCP的索引
        const mcpIndex = workflowObj.mcps.findIndex((mcp: any) => mcp.name === originalMcpName);
        
        if (mcpIndex >= 0) {
          // 替换为新的MCP
          workflowObj.mcps[mcpIndex] = {
            name: newMcpName,
            description: newMcpDescription,
            authRequired: newMcpAuthRequired,
            authVerified: false, // 新替换的MCP需要重新验证授权
            // 添加额外信息
            ...(extraInfo || {}),
          };
        }
      }
      
      // 更新工作流步骤
      if (workflowObj.workflow && Array.isArray(workflowObj.workflow)) {
        workflowObj.workflow = workflowObj.workflow.map((step: any) => {
          if (step.mcp === originalMcpName) {
            return {
              ...step,
              mcp: newMcpName
            };
          }
          return step;
        });
      }
      
      // 更新任务
      await db.query(
        `
        UPDATE tasks
        SET mcp_workflow = $1, updated_at = NOW()
        WHERE id = $2
        `,
        [JSON.stringify(workflowObj), taskId]
      );
      
      logger.info(`替换任务MCP成功 [任务: ${taskId}, 原MCP: ${originalMcpName}, 新MCP: ${newMcpName}]`);
      return true;
    } catch (error) {
      logger.error(`替换任务MCP失败 [任务: ${taskId}]`, error);
      return false;
    }
  }
  
  /**
   * 保存MCP替代方案推荐记录
   * 可用于记录系统推荐的替代方案，以便后续分析
   */
  async saveAlternativeRecommendation(
    taskId: string,
    originalMcpName: string,
    alternatives: string[],
    context: string
  ): Promise<boolean> {
    try {
      await db.query(
        `
        INSERT INTO mcp_alternative_records (task_id, original_mcp, alternatives, context)
        VALUES ($1, $2, $3, $4)
        `,
        [taskId, originalMcpName, JSON.stringify(alternatives), context]
      );
      
      logger.info(`保存MCP替代方案记录成功 [任务: ${taskId}, 原MCP: ${originalMcpName}]`);
      return true;
    } catch (error) {
      logger.error(`保存MCP替代方案记录失败 [任务: ${taskId}]`, error);
      return false;
    }
  }
}

// 导出DAO单例
export const mcpAlternativeDao = new MCPAlternativeDao(); 