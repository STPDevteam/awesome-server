// src/dao/taskDao.ts
import { v4 as uuidv4 } from 'uuid';
import { db, TypedQueryResult } from '../config/database.js';
import { logger } from '../utils/logger.js';

// 数据库行记录接口
export interface TaskDbRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  status: string;
  mcp_workflow?: any;
  result?: any;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TaskStepDbRow {
  id: string;
  task_id: string;
  step_type: string;
  title: string;
  content?: string;
  reasoning?: string;
  reasoning_time?: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * 任务DAO - 负责任务相关的数据库操作
 */
export class TaskDao {
  /**
   * 创建新任务
   */
  async createTask(data: {
    userId: string;
    title: string;
    content: string;
  }): Promise<TaskDbRow> {
    try {
      const taskId = uuidv4();
      const result = await db.query<TaskDbRow>(
        `
        INSERT INTO tasks (id, user_id, title, content, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [taskId, data.userId, data.title, data.content, 'created']
      );

      logger.info(`任务记录创建成功: ${taskId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('创建任务记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取任务详情
   */
  async getTaskById(taskId: string): Promise<TaskDbRow | null> {
    try {
      const result = await db.query<TaskDbRow>(
        `
        SELECT * FROM tasks
        WHERE id = $1
        `,
        [taskId]
      );

      return result.rows.length === 0 ? null : result.rows[0];
    } catch (error) {
      logger.error(`获取任务记录失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 更新任务
   */
  async updateTask(taskId: string, updates: {
    title?: string;
    content?: string;
    status?: string;
    mcpWorkflow?: any;
    result?: any;
    completedAt?: Date;
  }): Promise<TaskDbRow | null> {
    try {
      // 构建更新字段
      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.title !== undefined) {
        updateFields.push(`title = $${valueIndex}`);
        values.push(updates.title);
        valueIndex++;
      }

      if (updates.content !== undefined) {
        updateFields.push(`content = $${valueIndex}`);
        values.push(updates.content);
        valueIndex++;
      }

      if (updates.status !== undefined) {
        updateFields.push(`status = $${valueIndex}`);
        values.push(updates.status);
        valueIndex++;

        // 如果状态更新为已完成，设置完成时间
        if (updates.status === 'completed') {
          updateFields.push(`completed_at = $${valueIndex}`);
          values.push(updates.completedAt || new Date());
          valueIndex++;
        }
      }

      if (updates.mcpWorkflow !== undefined) {
        updateFields.push(`mcp_workflow = $${valueIndex}`);
        values.push(JSON.stringify(updates.mcpWorkflow));
        valueIndex++;
      }

      if (updates.result !== undefined) {
        updateFields.push(`result = $${valueIndex}`);
        values.push(JSON.stringify(updates.result));
        valueIndex++;
      }

      // 如果没有字段需要更新，则直接返回null
      if (updateFields.length === 0) {
        return this.getTaskById(taskId);
      }

      updateFields.push(`updated_at = $${valueIndex}`);
      values.push(new Date());
      valueIndex++;

      values.push(taskId);

      const query = `
        UPDATE tasks
        SET ${updateFields.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `;

      const result = await db.query<TaskDbRow>(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      logger.info(`任务记录更新成功: ${taskId}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`更新任务记录失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取用户的任务列表
   */
  async getUserTasks(userId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }): Promise<{ rows: TaskDbRow[]; total: number }> {
    try {
      // 构建查询条件
      const conditions = ['user_id = $1'];
      const values = [userId];
      let paramIndex = 2;

      if (options?.status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(options.status);
        paramIndex++;
      }

      // 构建排序
      const sortField = options?.sortBy || 'created_at';
      const sortDirection = options?.sortDir || 'desc';
      const sort = `${sortField} ${sortDirection}`;

      // 构建分页
      const limit = options?.limit || 10;
      const offset = options?.offset || 0;

      // 查询总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tasks
        WHERE ${conditions.join(' AND ')}
      `;
      const countResult = await db.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total, 10);

      // 查询任务列表
      const query = `
        SELECT *
        FROM tasks
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${sort}
        LIMIT ${limit} OFFSET ${offset}
      `;
      const result = await db.query<TaskDbRow>(query, values);

      return { rows: result.rows, total };
    } catch (error) {
      logger.error(`获取用户任务列表失败 [UserID: ${userId}]:`, error);
      throw error;
    }
  }

  /**
   * 创建任务步骤
   */
  async createTaskStep(data: {
    taskId: string;
    stepType: string;
    title: string;
    content?: string;
    reasoning?: string;
    reasoningTime?: number;
    orderIndex: number;
  }): Promise<TaskStepDbRow> {
    try {
      const stepId = uuidv4();
      const result = await db.query<TaskStepDbRow>(
        `
        INSERT INTO task_steps (id, task_id, step_type, title, content, reasoning, reasoning_time, order_index)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          stepId,
          data.taskId,
          data.stepType,
          data.title,
          data.content || null,
          data.reasoning || null,
          data.reasoningTime || null,
          data.orderIndex
        ]
      );

      logger.info(`任务步骤记录创建成功: ${stepId} [任务: ${data.taskId}]`);
      return result.rows[0];
    } catch (error) {
      logger.error(`创建任务步骤记录失败 [任务: ${data.taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取任务的所有步骤
   */
  async getTaskSteps(taskId: string): Promise<TaskStepDbRow[]> {
    try {
      const result = await db.query<TaskStepDbRow>(
        `
        SELECT * FROM task_steps
        WHERE task_id = $1
        ORDER BY order_index ASC
        `,
        [taskId]
      );

      return result.rows;
    } catch (error) {
      logger.error(`获取任务步骤记录失败 [任务: ${taskId}]:`, error);
      throw error;
    }
  }
}

// 导出DAO单例
export const taskDao = new TaskDao();