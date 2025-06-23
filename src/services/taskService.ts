import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { taskDao, TaskDbRow, TaskStepDbRow } from '../dao/taskDao.js';
import { Task, TaskStatus, TaskStep, TaskStepType } from '../models/task.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageIntent, MessageType } from '../models/conversation.js';

// 任务服务 - 负责业务逻辑
export class TaskService {
  // 创建新任务
  async createTask(data: {
    userId: string;
    title: string;
    content: string;
    conversationId?: string; // 关联的对话ID
  }): Promise<Task> {
    try {
      // 调用DAO层创建任务，直接传入conversationId
      const taskRecord = await taskDao.createTask({
        userId: data.userId,
        title: data.title,
        content: data.content,
        conversationId: data.conversationId
      });
      
      // 将数据库记录映射为应用层实体
      const task = this.mapTaskFromDb(taskRecord);
      logger.info(`任务创建成功: ${task.id}`);
      
      // 如果提供了conversationId，创建系统消息通知
      if (data.conversationId) {
        await this.addTaskNotificationToConversation(task.id, data.conversationId, task.title);
        // 增加对话任务计数
        await conversationDao.incrementTaskCount(data.conversationId);
      }
      
      return task;
    } catch (error) {
      logger.error('创建任务失败:', error);
      throw error;
    }
  }

  // 添加任务通知到对话（内部方法）
  private async addTaskNotificationToConversation(
    taskId: string, 
    conversationId: string, 
    taskTitle: string
  ): Promise<void> {
    try {
      // 创建系统消息，通知任务已创建
      await messageDao.createMessage({
        conversationId,
        content: `已创建任务: ${taskTitle}`,
        type: MessageType.SYSTEM,
        intent: MessageIntent.TASK,
        taskId
      });
      
      logger.info(`已添加任务通知到对话 [任务ID: ${taskId}, 对话ID: ${conversationId}]`);
    } catch (error) {
      logger.error(`添加任务通知到对话失败 [任务ID: ${taskId}, 对话ID: ${conversationId}]:`, error);
      // 非关键错误，不抛出异常
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
      conversationId: row.conversation_id || undefined,
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
      updatedAt: new Date(row.updated_at)
    };
  }
}

// 创建服务实例但不直接导出
const taskServiceInstance = new TaskService();

// 提供获取实例的函数，解决循环依赖问题
export function getTaskService() {
  return taskServiceInstance;
} 