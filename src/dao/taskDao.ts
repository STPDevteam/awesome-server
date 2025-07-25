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
  task_type: string; // 新增：任务类型字段
  agent_id?: string; // 新增：Agent ID字段
  mcp_workflow?: any;
  result?: any;
  conversation_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  deleted_at?: string;
  is_deleted: boolean;
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
  deleted_at?: string;
  is_deleted: boolean;
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
    taskType: string; // 新增：任务类型
    agentId?: string; // 新增：Agent ID
    conversationId?: string;
  }): Promise<TaskDbRow> {
    try {
      const taskId = uuidv4();
      const result = await db.query<TaskDbRow>(
        `
        INSERT INTO tasks (id, user_id, title, content, status, task_type, agent_id, conversation_id, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [taskId, data.userId, data.title, data.content, 'created', data.taskType, data.agentId || null, data.conversationId || null, false]
      );

      logger.info(`任务记录创建成功: ${taskId} (类型: ${data.taskType})`);
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
        WHERE id = $1 AND is_deleted = FALSE
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
    conversationId?: string;
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
        // 确保mcpWorkflow是JSON字符串
        if (typeof updates.mcpWorkflow === 'object') {
          updateFields.push(`mcp_workflow = $${valueIndex}`);
          values.push(JSON.stringify(updates.mcpWorkflow));
          valueIndex++;
        } else if (typeof updates.mcpWorkflow === 'string') {
          // 如果已经是字符串，尝试解析确保是有效的JSON
          try {
            const parsed = JSON.parse(updates.mcpWorkflow);
            updateFields.push(`mcp_workflow = $${valueIndex}`);
            values.push(updates.mcpWorkflow); // 使用原始字符串
            valueIndex++;
          } catch (e) {
            logger.error(`Invalid mcpWorkflow JSON string: ${updates.mcpWorkflow}`);
            // 跳过无效的JSON
          }
        }
      }

      if (updates.result !== undefined) {
        updateFields.push(`result = $${valueIndex}`);
        values.push(JSON.stringify(updates.result));
        valueIndex++;
      }

      if (updates.conversationId !== undefined) {
        updateFields.push(`conversation_id = $${valueIndex}`);
        values.push(updates.conversationId);
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
  taskType?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  conversationId?: string;
}): Promise<{ rows: TaskDbRow[]; total: number }> {
  try {
    // 构建查询条件
    const conditions = ['user_id = $1', 'is_deleted = FALSE'];
    const values = [userId];
    let paramIndex = 2;

    if (options?.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(options.status);
      paramIndex++;
    }

    if (options?.taskType) {
      conditions.push(`task_type = $${paramIndex}`);
      values.push(options.taskType);
      paramIndex++;
    }

    if (options?.agentId) {
      conditions.push(`agent_id = $${paramIndex}`);
      values.push(options.agentId);
      paramIndex++;
    }

    if (options?.conversationId) {
      conditions.push(`conversation_id = $${paramIndex}`);
      values.push(options.conversationId);
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
   * 获取对话关联的任务
   */
  async getConversationTasks(conversationId: string): Promise<TaskDbRow[]> {
    try {
      const result = await db.query<TaskDbRow>(
        `
        SELECT *
        FROM tasks
        WHERE conversation_id = $1 AND is_deleted = FALSE
        ORDER BY created_at DESC
        `,
        [conversationId]
      );

      return result.rows;
    } catch (error) {
      logger.error(`获取对话关联任务失败 [对话ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  /**
   * 获取对话相关的最后一个任务的MCP工作流
   * @param conversationId 对话ID
   * @param userId 用户ID
   * @returns MCP工作流信息
   */
  async getLastTaskMcpWorkflowByConversation(
    conversationId: string,
    userId: string
  ): Promise<any> {
    try {
      const result = await db.query<TaskDbRow>(
        `
        SELECT mcp_workflow, created_at
        FROM tasks
        WHERE conversation_id = $1 AND user_id = $2 AND is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [conversationId, userId]
      );
      
      if (result.rows.length === 0) {
        logger.info(`No tasks found for conversation ${conversationId}`);
        return null;
      }
      
      const mcpWorkflow = result.rows[0].mcp_workflow;
      
      // 如果是字符串，解析为对象
      if (typeof mcpWorkflow === 'string') {
        try {
          return JSON.parse(mcpWorkflow);
        } catch (parseError) {
          logger.error(`Failed to parse MCP workflow JSON for conversation ${conversationId}:`, parseError);
          return null;
        }
      }
      
      return mcpWorkflow;
    } catch (error) {
      logger.error(`获取对话最后任务MCP工作流失败 [对话: ${conversationId}]:`, error);
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
        INSERT INTO task_steps (id, task_id, step_type, title, content, reasoning, reasoning_time, order_index, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          data.orderIndex,
          false
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
   * 获取任务步骤
   */
  async getTaskSteps(taskId: string): Promise<TaskStepDbRow[]> {
    try {
      const result = await db.query<TaskStepDbRow>(
        `
        SELECT *
        FROM task_steps
        WHERE task_id = $1 AND is_deleted = FALSE
        ORDER BY order_index ASC
        `,
        [taskId]
      );

      return result.rows;
    } catch (error) {
      logger.error(`获取任务步骤记录失败 [任务ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 软删除任务及其相关步骤
   */
  async softDeleteTask(taskId: string): Promise<boolean> {
    try {
      const now = new Date();
      
      // 使用事务确保数据一致性
      const queries = [
        // 软删除任务步骤
        {
          text: `
            UPDATE task_steps
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE task_id = $2 AND is_deleted = FALSE
          `,
          params: [now, taskId]
        },
        // 软删除任务
        {
          text: `
            UPDATE tasks
            SET is_deleted = TRUE, deleted_at = $1, updated_at = $1
            WHERE id = $2 AND is_deleted = FALSE
            RETURNING id
          `,
          params: [now, taskId]
        }
      ];

      const results = await db.transaction(queries);
      const taskResult = results[results.length - 1];
      
      const success = taskResult.rowCount !== null && taskResult.rowCount > 0;
      if (success) {
        logger.info(`任务软删除成功 [ID: ${taskId}]`);
      } else {
        logger.warn(`任务未找到或已删除 [ID: ${taskId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`任务软删除失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  /**
   * 硬删除任务（永久删除）
   * 此方法保留用于管理员/清理目的
   */
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      // 先删除任务步骤
      await db.query(
        `
        DELETE FROM task_steps
        WHERE task_id = $1
        `,
        [taskId]
      );
      
      // 然后删除任务
      const result = await db.query(
        `
        DELETE FROM tasks
        WHERE id = $1
        RETURNING id
        `,
        [taskId]
      );
      
      const success = result.rowCount !== null && result.rowCount > 0;
      if (success) {
        logger.info(`任务永久删除成功 [ID: ${taskId}]`);
      } else {
        logger.warn(`任务未找到 [ID: ${taskId}]`);
      }
      
      return success;
    } catch (error) {
      logger.error(`任务永久删除失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }
}

// 创建DAO实例
export const taskDao = new TaskDao();