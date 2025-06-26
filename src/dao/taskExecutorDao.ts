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
        WHERE id = $1::varchar
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
        SET status = $1::varchar, updated_at = NOW()
        WHERE id = $2::varchar
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
      // 确保result是有效的JSON对象或null
      let processedResult: any = null;
      if (result !== null && result !== undefined) {
        if (typeof result === 'object') {
          processedResult = result;
        } else if (typeof result === 'string') {
          try {
            processedResult = JSON.parse(result);
          } catch (parseError) {
            processedResult = { error: result };
          }
        } else {
          processedResult = { value: result };
        }
      }
      
      logger.info(`[updateTaskResult] 准备更新任务 ${taskId}：status=${status}, result类型=${typeof processedResult}`);
      
      const updateResult = await db.query(
        `
        UPDATE tasks
        SET status = $1::varchar, result = $2::jsonb, updated_at = NOW(),
            completed_at = CASE WHEN $1::varchar IN ('completed', 'failed') THEN NOW() ELSE completed_at END
        WHERE id = $3::varchar
        `,
        [status, JSON.stringify(processedResult), taskId]
      );
      
      logger.info(`[updateTaskResult] 更新结果：影响行数=${updateResult.rowCount}`);
      
      // 验证更新是否成功
      if (updateResult.rowCount === 0) {
        logger.error(`[updateTaskResult] 更新失败：未找到任务 ${taskId}`);
        return false;
      }
      
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
        WHERE id = $1::varchar
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
      let taskResult;
      
      // 处理task.result，确保它是对象而不是字符串
      if (typeof task.result === 'string') {
        try {
          taskResult = JSON.parse(task.result);
        } catch (parseError) {
          logger.warn(`任务结果是无效的JSON字符串，创建新对象 [任务ID: ${taskId}]`);
          taskResult = {};
        }
      } else {
        taskResult = task.result || {};
      }
      
      const steps = taskResult.steps || [];
      
      // 处理result，确保它是可序列化的
      let processedResult = result;
      if (typeof result === 'string') {
        try {
          // 尝试解析JSON字符串
          processedResult = JSON.parse(result);
        } catch (parseError) {
          // 如果解析失败，保持原始字符串
          processedResult = result;
        }
      }
      
      // 更新或添加步骤结果
      const stepIndex = steps.findIndex((s: any) => s.step === stepNumber);
      const stepResult = {
        step: stepNumber,
        success,
        ...(success ? { result: processedResult } : { error: processedResult })
      };
      
      if (stepIndex >= 0) {
        steps[stepIndex] = stepResult;
      } else {
        steps.push(stepResult);
      }
      
      // 更新任务结果
      taskResult.steps = steps;
      
      // 使用JSON.stringify确保转换为字符串
      const jsonString = JSON.stringify(taskResult);
      
      // 保存到数据库
      await db.query(
        `
        UPDATE tasks
        SET result = $1::jsonb, updated_at = NOW()
        WHERE id = $2::varchar
        `,
        [jsonString, taskId]
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