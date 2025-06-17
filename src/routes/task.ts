import { Router, Request, Response } from 'express';
import { titleGeneratorService } from '../services/llmTasks/titleGenerator.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import { taskService } from '../models/task.js';

const router = Router();

// 验证请求内容的Schema
const generateTitleSchema = z.object({
  content: z.string().min(5, '任务内容至少需要5个字符').max(5000, '任务内容不能超过5000个字符')
});

// 创建任务的Schema
const createTaskSchema = z.object({
  content: z.string().min(5, '任务内容至少需要5个字符').max(5000, '任务内容不能超过5000个字符'),
  title: z.string().optional() // 标题可选，如果未提供将使用LLM生成
});

/**
 * 生成任务标题
 * POST /api/task/title
 */
router.post('/title', requireAuth, async (req: Request, res: Response) => {
  try {
    const validationResult = generateTitleSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '无效的请求参数',
        details: validationResult.error.errors
      });
    }

    const { content } = validationResult.data;
    logger.info(`接收到生成标题请求 [用户ID: ${req.user?.id}]`);

    // 调用标题生成服务
    const title = await titleGeneratorService.generateTitle(content);

    res.json({
      success: true,
      data: {
        title,
        originalContent: content
      }
    });
  } catch (error) {
    logger.error('生成标题错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 创建任务
 * POST /api/task
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const validationResult = createTaskSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '无效的请求参数',
        details: validationResult.error.errors
      });
    }

    const { content, title } = validationResult.data;

    // 如果未提供标题，使用LLM生成
    const taskTitle = title || await titleGeneratorService.generateTitle(content);

    // 创建任务
    const task = await taskService.createTask({
      userId: req.user!.id,
      title: taskTitle,
      content
    });

    res.json({
      success: true,
      data: {
        task
      }
    });
  } catch (error) {
    logger.error('创建任务错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取用户的任务列表
 * GET /api/task
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, limit, offset, sortBy, sortDir } = req.query;
    
    const result = await taskService.getUserTasks(req.user!.id, {
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      sortBy: sortBy as string,
      sortDir: sortDir as 'asc' | 'desc'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('获取任务列表错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取任务详情
 * GET /api/task/:id
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: '任务不存在'
      });
    }
    
    // 确保用户只能访问自己的任务
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权访问该任务'
      });
    }
    
    // 获取任务步骤
    const steps = await taskService.getTaskSteps(taskId);
    
    res.json({
      success: true,
      data: {
        task,
        steps
      }
    });
  } catch (error) {
    logger.error('获取任务详情错误:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

export default router; 