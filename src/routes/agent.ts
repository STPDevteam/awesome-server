import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { agentService } from '../services/agentService.js';
import { logger } from '../utils/logger.js';
import { 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  GetAgentsQuery, 
  GenerateAgentNameRequest, 
  GenerateAgentDescriptionRequest,
  AgentMarketplaceQuery
} from '../models/agent.js';

const router = Router();

/**
 * 创建Agent
 * POST /api/agent
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const { name, description, status, taskId, mcpWorkflow, metadata } = req.body;

    // 验证必需字段
    if (!name || !description || !status) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少必需字段：name, description, status'
      });
    }

    // 验证status值
    if (!['private', 'public', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'status必须是private, public或draft之一'
      });
    }

    const createRequest: CreateAgentRequest = {
      userId,
      name,
      description,
      status,
      taskId,
      mcpWorkflow,
      metadata
    };

    const agent = await agentService.createAgent(createRequest);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('创建Agent失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '创建Agent失败'
    });
  }
});

/**
 * 获取Agent列表
 * GET /api/agent
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const query: GetAgentsQuery = {
      userId,
      status: req.query.status as any,
      search: req.query.search as string,
      category: req.query.category as string,
      orderBy: req.query.orderBy as any,
      order: req.query.order as any,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    };

    const result = await agentService.getAgents(query);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('获取Agent列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '获取Agent列表失败'
    });
  }
});

/**
 * 获取Agent详情
 * GET /api/agent/:id
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.getAgentById(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`获取Agent详情失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('无权访问')) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '获取Agent详情失败'
    });
  }
});

/**
 * 更新Agent
 * PUT /api/agent/:id
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    const { name, description, status, metadata } = req.body;

    // 验证status值（如果提供）
    if (status && !['private', 'public', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'status必须是private, public或draft之一'
      });
    }

    const updateRequest: UpdateAgentRequest = {
      name,
      description,
      status,
      metadata
    };

    const agent = await agentService.updateAgent(agentId, userId, updateRequest);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`更新Agent失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在') || error.message.includes('无权访问')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('已存在') || error.message.includes('allowed')) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '更新Agent失败'
    });
  }
});

/**
 * 删除Agent
 * DELETE /api/agent/:id
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    await agentService.deleteAgent(agentId, userId);

    res.json({
      success: true,
      message: 'Agent已删除'
    });
  } catch (error) {
    logger.error(`删除Agent失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在') || error.message.includes('无权访问')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '删除Agent失败'
    });
  }
});

/**
 * 生成Agent名称
 * POST /api/agent/generate-name
 */
router.post('/generate-name', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const { taskTitle, taskContent, mcpWorkflow } = req.body;

    if (!taskTitle || !taskContent) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少必需字段：taskTitle, taskContent'
      });
    }

    const generateRequest: GenerateAgentNameRequest = {
      taskTitle,
      taskContent,
      mcpWorkflow
    };

    const generatedName = await agentService.generateAgentName(generateRequest);

    res.json({
      success: true,
      data: {
        name: generatedName
      }
    });
  } catch (error) {
    logger.error('生成Agent名称失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '生成Agent名称失败'
    });
  }
});

/**
 * 生成Agent描述
 * POST /api/agent/generate-description
 */
router.post('/generate-description', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const { name, taskTitle, taskContent, mcpWorkflow } = req.body;

    if (!name || !taskTitle || !taskContent) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少必需字段：name, taskTitle, taskContent'
      });
    }

    const generateRequest: GenerateAgentDescriptionRequest = {
      name,
      taskTitle,
      taskContent,
      mcpWorkflow
    };

    const generatedDescription = await agentService.generateAgentDescription(generateRequest);

    res.json({
      success: true,
      data: {
        description: generatedDescription
      }
    });
  } catch (error) {
    logger.error('生成Agent描述失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '生成Agent描述失败'
    });
  }
});

/**
 * 发布Agent为公开
 * POST /api/agent/:id/publish
 */
router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.publishAgent(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`发布Agent失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在') || error.message.includes('无权访问')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '发布Agent失败'
    });
  }
});

/**
 * 将Agent设为私有
 * POST /api/agent/:id/private
 */
router.post('/:id/private', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.makeAgentPrivate(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`设为私有失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在') || error.message.includes('无权访问')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '设为私有失败'
    });
  }
});

/**
 * 根据任务创建Agent
 * POST /api/agent/from-task/:taskId
 */
router.post('/from-task/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const taskId = req.params.taskId;
    const { name, description, status = 'private' } = req.body;

    // 验证status值
    if (!['private', 'public'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'status必须是private或public之一'
      });
    }

    const agent = await agentService.createAgentFromTask(taskId, userId, name, description, status);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`从任务创建Agent失败 [TaskID: ${req.params.taskId}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在') || error.message.includes('无权访问')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('已存在') || error.message.includes('allowed')) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '从任务创建Agent失败'
    });
  }
});

/**
 * 获取Agent市场数据（公开Agent）
 * GET /api/agent/marketplace
 */
router.get('/marketplace', async (req: Request, res: Response) => {
  try {
    const query: AgentMarketplaceQuery = {
      search: req.query.search as string,
      category: req.query.category as string,
      orderBy: req.query.orderBy as any,
      order: req.query.order as any,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    };

    const result = await agentService.getAgentMarketplace(query);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('获取Agent市场数据失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '获取Agent市场数据失败'
    });
  }
});

/**
 * 获取Agent统计信息
 * GET /api/agent/stats
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const stats = await agentService.getAgentStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('获取Agent统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '获取Agent统计信息失败'
    });
  }
});

/**
 * 记录Agent使用
 * POST /api/agent/:id/usage
 */
router.post('/:id/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const agentId = req.params.id;
    const { taskId, conversationId, executionResult } = req.body;

    const usage = await agentService.recordAgentUsage(agentId, userId, taskId, conversationId, executionResult);

    res.json({
      success: true,
      data: usage
    });
  } catch (error) {
    logger.error(`记录Agent使用失败 [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('不存在')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('无权使用')) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '记录Agent使用失败'
    });
  }
});

/**
 * 根据任务ID获取Agent
 * GET /api/agent/task/:taskId
 */
router.get('/task/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '用户未认证'
      });
    }

    const taskId = req.params.taskId;
    const agents = await agentService.getAgentsByTaskId(taskId);

    // 过滤只返回用户可以访问的Agent
    const accessibleAgents = agents.filter(agent => 
      agent.userId === userId || agent.status === 'public'
    );

    res.json({
      success: true,
      data: accessibleAgents
    });
  } catch (error) {
    logger.error(`根据任务ID获取Agent失败 [TaskID: ${req.params.taskId}]:`, error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : '根据任务ID获取Agent失败'
    });
  }
});

export default router; 