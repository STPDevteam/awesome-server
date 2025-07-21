import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { taskDao, TaskDbRow, TaskStepDbRow } from '../dao/taskDao.js';
import { Task, TaskStatus, TaskStep, TaskStepType, TaskType } from '../models/task.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageIntent, MessageType } from '../models/conversation.js';

// Task Service - Responsible for business logic
export class TaskService {
  // Create new task
  async createTask(data: {
    userId: string;
    title: string;
    content: string;
    taskType?: TaskType; // 新增：任务类型，默认为'mcp'
    agentId?: string; // 新增：Agent ID（如果是Agent任务）
    conversationId?: string; // Associated conversation ID
  }): Promise<Task> {
    try {
      const taskType = data.taskType || 'mcp';
      
      // Add appropriate tag prefix to title based on task type
      let taggedTitle = data.title;
      if (taskType === 'mcp') {
        taggedTitle = `【flow】${data.title}`;
      } else if (taskType === 'agent') {
        taggedTitle = `【robot】${data.title}`;
      }
      
      // Call DAO layer to create task, use tagged title
      const taskRecord = await taskDao.createTask({
        userId: data.userId,
        title: taggedTitle,
        content: data.content,
        taskType: taskType,
        agentId: data.agentId,
        conversationId: data.conversationId
      });
      
      // Map database record to application entity
      const task = this.mapTaskFromDb(taskRecord);
      logger.info(`Task created successfully: ${task.id} (Type: ${task.taskType}, Title: ${taggedTitle})`);
      
      // If conversationId is provided, only increment task count (don't create duplicate message)
      if (data.conversationId) {
        // Increment conversation task count
        await conversationDao.incrementTaskCount(data.conversationId);
      }
      
      return task;
    } catch (error) {
      logger.error('Failed to create task:', error);
      throw error;
    }
  }



  // 获取任务详情
  async getTaskById(taskId: string): Promise<Task | null> {
    try {
      // 调用DAO层获取任务
      const taskRecord = await taskDao.getTaskById(taskId);
      
      if (!taskRecord) {
        return null;
      }

      return this.mapTaskFromDb(taskRecord);
    } catch (error) {
      logger.error(`获取任务失败 [ID: ${taskId}]:`, error);
      throw error;
    }
  }

  // 更新任务
  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Task | null> {
    try {
      // 转换为DAO层参数格式
      const daoUpdates: Parameters<typeof taskDao.updateTask>[1] = {};
      
      if (updates.title !== undefined) {
        daoUpdates.title = updates.title;
      }
      
      if (updates.content !== undefined) {
        daoUpdates.content = updates.content;
      }
      
      if (updates.status !== undefined) {
        daoUpdates.status = updates.status;
      }
      
      if (updates.mcpWorkflow !== undefined) {
        daoUpdates.mcpWorkflow = updates.mcpWorkflow;
      }
      
      if (updates.result !== undefined) {
        daoUpdates.result = updates.result;
      }
      
      if (updates.conversationId !== undefined) {
        daoUpdates.conversationId = updates.conversationId;
      }

      // 调用DAO层更新任务
      const updatedTaskRecord = await taskDao.updateTask(taskId, daoUpdates);
      
      if (!updatedTaskRecord) {
        return null;
      }

      const updatedTask = this.mapTaskFromDb(updatedTaskRecord);
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
    conversationId?: string; // 新增：按对话过滤
  }): Promise<{ tasks: Task[]; total: number }> {
    try {
      // 调用DAO层获取任务列表
      const result = await taskDao.getUserTasks(userId, options);
      
      const tasks = result.rows.map(row => this.mapTaskFromDb(row));
      return { tasks, total: result.total };
    } catch (error) {
      logger.error(`获取用户任务列表失败 [UserID: ${userId}]:`, error);
      throw error;
    }
  }

  // 获取对话关联的任务
  async getConversationTasks(conversationId: string): Promise<Task[]> {
    try {
      const taskRecords = await taskDao.getConversationTasks(conversationId);
      return taskRecords.map(record => this.mapTaskFromDb(record));
    } catch (error) {
      logger.error(`获取对话关联任务失败 [对话ID: ${conversationId}]:`, error);
      throw error;
    }
  }

  // 数据库字段映射到应用层实体
  private mapTaskFromDb(row: TaskDbRow): Task {
    
    // 处理mcpWorkflow，确保它是一个对象而不是字符串
    let mcpWorkflow = row.mcp_workflow;
    if (mcpWorkflow && typeof mcpWorkflow === 'string') {
      try {
        mcpWorkflow = JSON.parse(mcpWorkflow);
      } catch (e) {
        logger.error(`解析mcpWorkflow失败 [ID: ${row.id}]:`, e);
        // 保持原样，不做处理
      }
    }
    
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      status: row.status as TaskStatus,
      taskType: row.task_type as TaskType, // 新增：任务类型映射
      mcpWorkflow: mcpWorkflow,
      result: row.result ? row.result : undefined,
      conversationId: row.conversation_id || undefined,
      agentId: row.agent_id || undefined, // 新增：Agent ID映射
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      isDeleted: row.is_deleted || false
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
      // 调用DAO层创建任务步骤
      const stepRecord = await taskDao.createTaskStep({
        ...data,
        stepType: data.stepType
      });
      
      const step = this.mapTaskStepFromDb(stepRecord);
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
      // 调用DAO层获取任务步骤
      const stepRecords = await taskDao.getTaskSteps(taskId);
      
      return stepRecords.map(row => this.mapTaskStepFromDb(row));
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
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      isDeleted: row.is_deleted || false
    };
  }
}

// 创建服务实例但不直接导出
const taskServiceInstance = new TaskService();

// 提供获取实例的函数，解决循环依赖问题
export function getTaskService() {
  return taskServiceInstance;
} 