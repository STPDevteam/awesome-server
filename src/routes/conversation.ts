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
import { conversationLimitService } from '../services/conversationLimitService.js';
import { ConversationType } from '../models/conversation.js';

const router = Router();

// Get necessary services in routes
let mcpToolAdapter: MCPToolAdapter;
let taskExecutorService: TaskExecutorService;

// Use app to get service instances in routes
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
  title: z.string().optional(),
  firstMessage: z.string().min(1, 'First message content cannot be empty').optional()
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

    const { title, firstMessage } = validationResult.data;
    
    // 获取用户ID
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }

    logger.info(`Creating conversation request [User ID: ${userId}]`);

    // Check user conversation creation limit
    const limitInfo = await conversationLimitService.checkConversationLimit(userId);
    if (!limitInfo.canCreate) {
      const limitMessage = 'You\'ve reached the conversation limit for current plan. Please upgrade your plan to unlock more.';
      
      return res.status(429).json({
        success: false,
        error: 'Daily Limit Exceeded',
        message: limitMessage,
        data: {
          membershipType: limitInfo.membershipType,
          dailyLimit: limitInfo.dailyLimit,
          todayCreated: limitInfo.todayCreated,
          remainingCount: limitInfo.remainingCount
        }
      });
    }

    // Get conversation service
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // If first message is provided, create conversation and generate title (without processing message)
    if (firstMessage) {
      const result = await conversationService.createConversationWithFirstMessage(
        userId, 
        firstMessage, 
        title
      );
      
      res.json({
        success: true,
        data: {
          conversation: result.conversation,
          generatedTitle: result.generatedTitle,
          message: 'Conversation created successfully. Please send the first message using the message endpoint.'
        }
      });
    } else {
      // If no first message, use original creation method
      const conversation = await conversationService.createConversation(userId, title);
      
      res.json({
        success: true,
        data: {
          conversation
        }
      });
    }
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
 * Create new conversation (streaming version)
 * POST /api/conversation/stream
 */
router.post('/stream', requireAuth, async (req: Request, res: Response) => {
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

    const { title, firstMessage } = validationResult.data;
    
    // Get user ID
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }

    // Streaming creation requires first message
    if (!firstMessage) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'First message is required for streaming conversation creation'
      });
    }

    logger.info(`Creating streaming conversation request [User ID: ${userId}]`);

    // Check user conversation creation limit
    const limitInfo = await conversationLimitService.checkConversationLimit(userId);
    if (!limitInfo.canCreate) {
      const limitMessage = 'You\'ve reached the conversation limit for current plan. Please upgrade your plan to unlock more.';
      
      return res.status(429).json({
        success: false,
        error: 'Daily Limit Exceeded',
        message: limitMessage,
        data: {
          membershipType: limitInfo.membershipType,
          dailyLimit: limitInfo.dailyLimit,
          todayCreated: limitInfo.todayCreated,
          remainingCount: limitInfo.remainingCount
        }
      });
    }

    // Set SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Stream callback function
    const streamHandler = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // Get conversation service
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // Stream create conversation and process first message
    const processingPromise = conversationService.createConversationWithFirstMessageStream(
      userId,
      firstMessage,
      title,
      streamHandler
    );
    
    // Send completion marker after processing
    processingPromise
      .then((result: {
        conversationId: string;
        generatedTitle: string;
      }) => {
        res.write(`data: ${JSON.stringify({
          event: 'conversation_creation_complete',
          data: {
            conversationId: result.conversationId,
            title: result.generatedTitle,
            message: 'Conversation created successfully. Please send the first message using the message endpoint.'
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`Error creating conversation with stream:`, error);
        res.write(`data: ${JSON.stringify({
          event: 'error',
          data: {
            message: 'Error creating conversation',
            details: error instanceof Error ? error.message : String(error)
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`Error initializing stream conversation creation:`, error);
    
    // For initial setup errors, use standard JSON response
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * Get user conversation creation limit info
 * GET /api/conversation/limit
 */
router.get('/limit', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get user ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // Get user conversation limit info
    const limitInfo = await conversationLimitService.getConversationLimitInfo(userId);
    
    res.json({
      success: true,
      data: limitInfo
    });
  } catch (error) {
    logger.error(`Error getting conversation limit info [User ID: ${req.user?.id || req.query.userId}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * Get conversation list
 * GET /api/conversation
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit, offset, sortBy, sortDir, type } = req.query;
    
    // Get user ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // Get conversation service
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    const result = await conversationService.getUserConversations(userId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      sortBy: sortBy as string,
      sortDir: sortDir as 'asc' | 'desc',
      type: type as ConversationType
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
 * Get specific conversation
 * GET /api/conversation/:id
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
    // Get user ID
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }

    // Get conversation service
    const conversationService = getConversationService(mcpToolAdapter, taskExecutorService);
    
    // Get conversation info
    const conversation = await conversationService.getConversation(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }
    
    // Check permissions
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this conversation'
      });
    }
    
    // Get conversation messages
    const messages = await conversationService.getConversationMessages(conversationId);
    
    // Extract last used MCP information from messages (返回数组)
    let lastUsedMcp: any[] = [];
    
    // Iterate through messages in reverse order to find the most recent MCP usage
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      
      // Parse metadata if it's a string
      let parsedMetadata: any = null;
      if (message.metadata) {
        try {
          parsedMetadata = typeof message.metadata === 'string' 
            ? JSON.parse(message.metadata) 
            : message.metadata;
        } catch (e) {
          logger.warn(`Failed to parse message metadata for message ${message.id}:`, e);
          parsedMetadata = null;
        }
      }
      
      // Check if message has task-related metadata with MCP information
      if (parsedMetadata && parsedMetadata.stepType === 'execution' && message.taskId) {
        // Get the task to extract MCP workflow information
        try {
          const taskService = getTaskService();
          const task = await taskService.getTaskById(message.taskId);
          
          logger.info(`Found execution message [TaskID: ${message.taskId}], checking task workflow...`);
          
          if (!task) {
            logger.warn(`Task not found for TaskID: ${message.taskId}`);
            continue; // Continue searching other messages
          }
          
          logger.info(`Task found [TaskID: ${message.taskId}], status: ${task.status}, mcpWorkflow: ${task.mcpWorkflow ? 'exists' : 'null'}`);
          
          if (task && task.mcpWorkflow && task.mcpWorkflow.mcps && Array.isArray(task.mcpWorkflow.mcps)) {
            logger.info(`Found ${task.mcpWorkflow.mcps.length} MCPs in task workflow for TaskID: ${message.taskId}`);
            
            // 返回最后一个任务中使用的所有 MCP 的完整信息
            lastUsedMcp = task.mcpWorkflow.mcps.map(mcp => {
              // 包含完整的 MCP 信息，匹配用户期望的数据格式
              const mcpData: any = {
                name: mcp.name,
                description: mcp.description,
                category: mcp.category,
                imageUrl: mcp.imageUrl,
                githubUrl: mcp.githubUrl,
                authRequired: mcp.authRequired || false,
                authVerified: mcp.authVerified || false // 注意：这里应该已经从数据库增强过了
              };

              // 🔧 新增：添加预定义工具信息
              if (mcp.predefinedTools && Array.isArray(mcp.predefinedTools)) {
                mcpData.predefinedTools = mcp.predefinedTools;
              }

              // 添加认证参数（如果需要认证）
              if (mcp.authRequired && mcp.authParams) {
                mcpData.authParams = mcp.authParams;
              }

              // 添加完整的 alternatives 信息，确保每个 alternative 包含完整的字段
              if (mcp.alternatives && Array.isArray(mcp.alternatives)) {
                mcpData.alternatives = mcp.alternatives.map(alt => ({
                  name: alt.name,
                  description: alt.description,
                  category: alt.category,
                  imageUrl: alt.imageUrl,
                  githubUrl: alt.githubUrl,
                  authRequired: alt.authRequired || false,
                  authVerified: alt.authVerified || false, // 注意：这里应该已经从数据库增强过了
                  // 🔧 新增：备选MCP也包含预定义工具信息
                  ...(alt.predefinedTools && Array.isArray(alt.predefinedTools) ? { predefinedTools: alt.predefinedTools } : {}),
                  // 添加认证参数（如果需要认证）
                  ...(alt.authRequired && alt.authParams ? { authParams: alt.authParams } : {})
                }));
              } else {
                // 如果没有 alternatives 数组，设置为空数组
                mcpData.alternatives = [];
              }

              return mcpData;
            });
            
            logger.info(`Found lastUsedMcp array with ${lastUsedMcp.length} MCPs for task ${message.taskId}`);
            break; // Found the most recent task with MCP usage, stop searching
          }
        } catch (taskError) {
          logger.warn(`Failed to get task details for MCP extraction [TaskID: ${message.taskId}]:`, taskError);
          // Continue searching other messages
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        conversation,
        messages,
        lastUsedMcp
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
router.post('/:id/message', requireAuth, async (req: Request, res: Response) => {
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
router.post('/:id/message/stream', requireAuth, async (req: Request, res: Response) => {
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
router.get('/:id/tasks', requireAuth, async (req: Request, res: Response) => {
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

/**
 * 软删除对话
 * DELETE /api/conversation/:id
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id;
    
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
        message: 'No permission to delete this conversation'
      });
    }
    
    // 执行软删除
    const success = await conversationService.softDeleteConversation(conversationId);
    
    if (success) {
      res.json({
        success: true,
        data: {
          conversationId,
          message: 'Conversation and related data have been deleted successfully'
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conversation not found or already deleted'
      });
    }
  } catch (error) {
    logger.error(`Error deleting conversation [Conversation ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

export default router; 