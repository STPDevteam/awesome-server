import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * 任务执行器数据访问对象
 * 负责与任务执行相关的数据库操作
 */
export class TaskExecutorDao {
  /**
   * 获取任务详情
   */
  async getTaskById(taskId: string): Promise<any> {
    try {
      const result = await db.query(
        `
        SELECT * FROM tasks
        WHERE id = $1
        `,
        [taskId]
      );
      
      return result.rows.length === 0 ? null : result.rows[0];
    } catch (error) {
      logger.error(`获取任务详情失败 [任务ID: ${taskId}]`, error);
      throw error;
    }
  }
  
  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: string): Promise<boolean> {
    try {
      await db.query(
        `
        UPDATE tasks
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        `,
        [status, taskId]
      );
      
      return true;
    } catch (error) {
      logger.error(`更新任务状态失败 [任务ID: ${taskId}]`, error);
      return false;
    }
  }
  
  /**
   * 更新任务结果
   */
  async updateTaskResult(
    taskId: string, 
    status: string, 
    result: any
  ): Promise<boolean> {
    try {
      // 确保结果是 JSON 字符串格式，避免类型不匹配问题
      const jsonResult = typeof result === 'string' ? result : JSON.stringify(result);
      
      await db.query(
        `
        UPDATE tasks
        SET status = $1, result = $2::jsonb, updated_at = NOW(),
            completed_at = CASE WHEN $1::text = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $3
        `,
        [status, jsonResult, taskId]
      );
      
      return true;
    } catch (error) {
      logger.error(`更新任务结果失败 [任务ID: ${taskId}]`, error);
      return false;
    }
  }
  
  /**
   * 获取任务的工作流
   */
  async getTaskWorkflow(taskId: string): Promise<any> {
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
      logger.error(`获取任务工作流失败 [任务ID: ${taskId}]`, error);
      throw error;
    }
  }
  
  /**
   * 记录任务执行步骤结果
   */
  async saveStepResult(
    taskId: string,
    stepNumber: number,
    success: boolean,
    result: any
  ): Promise<boolean> {
    try {
      // 获取当前任务结果
      const task = await this.getTaskById(taskId);
      if (!task) {
        return false;
      }
      
      // 初始化或获取现有结果
      const taskResult = task.result || {};
      const steps = taskResult.steps || [];
      
      // 更新或添加步骤结果
      const stepIndex = steps.findIndex((s: any) => s.step === stepNumber);
      const stepResult = {
        step: stepNumber,
        success,
        ...(success ? { result } : { error: result })
      };
      
      if (stepIndex >= 0) {
        steps[stepIndex] = stepResult;
      } else {
        steps.push(stepResult);
      }
      
      // 更新任务结果
      taskResult.steps = steps;
      
      // 确保结果是 JSON 字符串格式
      const jsonResult = JSON.stringify(taskResult);
      
      // 保存到数据库
      await db.query(
        `
        UPDATE tasks
        SET result = $1::jsonb, updated_at = NOW()
        WHERE id = $2
        `,
        [jsonResult, taskId]
      );
      
      return true;
    } catch (error) {
      logger.error(`记录任务步骤结果失败 [任务ID: ${taskId}, 步骤: ${stepNumber}]`, error);
      return false;
    }
  }
}

// 导出DAO单例
export const taskExecutorDao = new TaskExecutorDao(); 