import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import { MCPToolAdapter } from '../services/mcpToolAdapter.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
import { getConversationService } from '../services/conversationService.js';
import { MessageIntent, MessageType } from '../models/conversation.js';
import { getTaskService } from '../services/taskService.js';
import { messageDao } from '../dao/messageDao.js';

const router = Router();

// 在路由中获取必要的服务
let mcpToolAdapter: MCPToolAdapter;
let taskExecutorService: TaskExecutorService;

// 在路由中使用app获取服务实例
router.use((req, res, next) => {
  if (!mcpToolAdapter) {
    mcpToolAdapter = req.app.get('mcpToolAdapter');
  }
  if (!taskExecutorService) {
    taskExecutorService = req.app.get('taskExecutorService');
  }
  next();
});

// 验证请求内容的Schema
const createConversationSchema = z.object({
  title: z.string().optional()
});

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty')
});

/**
 * 创建新对话
 * POST /api/conversation
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const validationResult = createConversationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }

    const { title } = validationResult.data;
    const userId = req.user!.id;

    logger.info(`Creating conversation request [User ID: ${userId}]`);

    // 获取对话服务
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    const conversation = await conversationService.createConversation(userId, title);

    res.json({
      success: true,
      data: {
        conversation
      }
    });
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取对话列表
 * GET /api/conversation
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { limit, offset, sortBy, sortDir } = req.query;
    
    // 获取用户ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // 获取对话服务
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    const result = await conversationService.getUserConversations(userId, {
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
    logger.error('Error getting conversation list:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取特定对话
 * GET /api/conversation/:id
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
    // 获取用户ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // 获取对话服务
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // 获取对话信息
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }
    
    // 检查权限
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this conversation'
      });
    }
    
    // 获取对话消息
    const messages = await conversationService.getConversationMessages(conversationId);
    
    res.json({
      success: true,
      data: {
        conversation,
        messages
      }
    });
  } catch (error) {
    logger.error(`Error getting conversation details [ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 发送消息
 * POST /api/conversation/:id/message
 */
router.post('/:id/message', optionalAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
    const validationResult = sendMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }

    const { content } = validationResult.data;
    
    // 获取用户ID
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }

    // 获取对话服务
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // 检查对话是否存在和权限
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }
    
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this conversation'
      });
    }
    
    // 处理用户消息
    const result = await conversationService.processUserMessage(conversationId, userId, content);
    
    res.json({
      success: true,
      data: {
        userMessage: result.message,
        assistantResponse: result.response,
        intent: result.intent,
        taskId: result.taskId
      }
    });
  } catch (error) {
    logger.error(`Error sending message [Conversation ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 流式发送消息
 * POST /api/conversation/:id/message/stream
 */
router.post('/:id/message/stream', optionalAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
    const validationResult = sendMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }

    const { content } = validationResult.data;
    
    // 获取用户ID
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }

    // 获取对话服务
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // 检查对话是否存在和权限
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(400).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }
    
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this conversation'
      });
    }
    
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 流式回调函数
    const streamHandler = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // 流式处理用户消息
    const processingPromise = conversationService.processUserMessageStream(
      conversationId,
      userId,
      content,
      streamHandler
    );
    
    // 处理完成后发送完成标记
    processingPromise
      .then((result) => {
        res.write(`data: ${JSON.stringify({
          event: 'complete',
          data: {
            messageId: result.messageId,
            responseId: result.responseId,
            intent: result.intent,
            taskId: result.taskId
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error) => {
        logger.error(`Error processing user message stream [Conversation ID: ${conversationId}]:`, error);
        res.write(`data: ${JSON.stringify({
          event: 'error',
          data: {
            message: 'Error processing message',
            details: error instanceof Error ? error.message : String(error)
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`Error initializing stream processing [Conversation ID: ${req.params.id}]:`, error);
    
    // 对于初始设置错误，使用标准JSON响应
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取对话关联的任务列表
 * GET /api/conversation/:id/tasks
 */
router.get('/:id/tasks', optionalAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
    // 获取用户ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // 获取对话信息
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }
    
    // 检查权限
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this conversation'
      });
    }
    
    // 获取任务服务
    const taskService = getTaskService();
    
    // 获取对话关联的任务
    const tasks = await taskService.getConversationTasks(conversationId);
    
    res.json({
      success: true,
      data: {
        conversationId,
        tasks,
        count: tasks.length
      }
    });
  } catch (error) {
    logger.error(`Error getting conversation related tasks [Conversation ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

export default router; 