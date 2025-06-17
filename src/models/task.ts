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

// 任务状态类型
export type TaskStatus = 'created' | 'in_progress' | 'completed' | 'failed';

// MCP工作流配置类型
export interface MCPWorkflow {
  mcps: Array<{
    name: string;
    description: string;
    authRequired: boolean;
    authVerified?: boolean;
    authData?: Record<string, any>;
  }>;
  workflow: Array<{
    step: number;
    mcp: string;
    action: string;
    input?: string;
    output?: string;
  }>;
}

// 任务类型
export interface Task {
  id: string;
  userId: string;
  title: string;
  content: string;
  status: TaskStatus;
  mcpWorkflow?: MCPWorkflow;
  result?: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// 任务步骤类型
export type TaskStepType = 'analysis' | 'mcp_selection' | 'deliverables' | 'workflow';

export interface TaskStep {
  id: string;
  taskId: string;
  stepType: TaskStepType;
  title: string;
  content?: string;
  reasoning?: string;
  reasoningTime?: number; // 以毫秒为单位
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

// 任务数据服务
export class TaskService {
  // 创建新任务
  async createTask(data: {
    userId: string;
    title: string;
    content: string;
  }): Promise<Task> {
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

      const task = this.mapTaskFromDb(result.rows[0]);
      logger.info(`任务创建成功: ${task.id}`);
      return task;
    } catch (error) {
      logger.error('创建任务失败:', error);
      throw error;
    }
  }

  // 获取任务详情
  async getTaskById(taskId: string): Promise<Task | null> {
    try {
      const result = await db.query<TaskDbRow>(
        `
        SELECT * FROM tasks
        WHERE id = $1
        `,
        [taskId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapTaskFromDb(result.rows[0]);
    } catch (error) {
      logger.error(`获取任务失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  // 更新任务
  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Task | null> {
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
          values.push(new Date());
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

      // 如果没有字段需要更新，则直接返回现有任务
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

      const updatedTask = this.mapTaskFromDb(result.rows[0]);
      logger.info(`任务更新成功: ${taskId}`);
      return updatedTask;
    } catch (error) {
      logger.error(`更新任务失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  // 获取用户的任务列表
  async getUserTasks(userId: string, options?: {
    status?: TaskStatus;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }): Promise<{ tasks: Task[]; total: number }> {
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

      const tasks = result.rows.map(row => this.mapTaskFromDb(row));
      return { tasks, total };
    } catch (error) {
      logger.error(`获取用户任务列表失败 [UserID: ${userId}]:`, error);
      throw error;
    }
  }

  // 数据库字段映射到应用层实体
  private mapTaskFromDb(row: TaskDbRow): Task {
    if (!row) {
      throw new Error('无效的任务数据记录');
    }
    
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      status: row.status as TaskStatus,
      mcpWorkflow: row.mcp_workflow ? row.mcp_workflow : undefined,
      result: row.result ? row.result : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    };
  }

  // 创建任务步骤
  async createTaskStep(data: {
    taskId: string;
    stepType: TaskStepType;
    title: string;
    content?: string;
    reasoning?: string;
    reasoningTime?: number;
    orderIndex: number;
  }): Promise<TaskStep> {
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

      const step = this.mapTaskStepFromDb(result.rows[0]);
      logger.info(`任务步骤创建成功: ${step.id} [任务: ${data.taskId}]`);
      return step;
    } catch (error) {
      logger.error(`创建任务步骤失败 [任务: ${data.taskId}]:`, error);
      throw error;
    }
  }

  // 获取任务的所有步骤
  async getTaskSteps(taskId: string): Promise<TaskStep[]> {
    try {
      const result = await db.query<TaskStepDbRow>(
        `
        SELECT * FROM task_steps
        WHERE task_id = $1
        ORDER BY order_index ASC
        `,
        [taskId]
      );

      return result.rows.map(row => this.mapTaskStepFromDb(row));
    } catch (error) {
      logger.error(`获取任务步骤失败 [任务: ${taskId}]:`, error);
      throw error;
    }
  }

  // 数据库字段映射到应用层实体 (TaskStep)
  private mapTaskStepFromDb(row: TaskStepDbRow): TaskStep {
    if (!row) {
      throw new Error('无效的任务步骤数据记录');
    }
    
    return {
      id: row.id,
      taskId: row.task_id,
      stepType: row.step_type as TaskStepType,
      title: row.title,
      content: row.content || undefined,
      reasoning: row.reasoning || undefined,
      reasoningTime: row.reasoning_time || undefined,
      orderIndex: row.order_index,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// 创建服务实例
export const taskService = new TaskService(); 