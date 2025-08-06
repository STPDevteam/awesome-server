import { Router, Request, Response } from 'express';
import { getAgentService } from '../services/agentService.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
import { MCPAuthService } from '../services/mcpAuthService.js';
import { getAgentConversationService } from '../services/agentConversationService.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  GetAgentsQuery, 
  GenerateAgentNameRequest, 
  GenerateAgentDescriptionRequest,
  AgentMarketplaceQuery,
  FavoriteAgentRequest
} from '../models/agent.js';

const router = Router();

// Categories cache
interface CategoriesCache {
  data: Array<{ name: string; count: number }>;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

let categoriesCache: CategoriesCache | null = null;
const CATEGORIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to clear categories cache
const clearCategoriesCache = () => {
  categoriesCache = null;
  logger.info('Categories cache cleared');
};

// Initialize services
let agentService: ReturnType<typeof getAgentService>;
const mcpAuthService = new MCPAuthService();

// 添加一个健康检查路由来验证服务是否正常 - 在中间件之前
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Agent routes are working',
    timestamp: new Date().toISOString()
  });
});

// Simplified middleware: Get agentService from app context
router.use((req, res, next) => {
  if (!agentService) {
    // Get TaskExecutorService instance from app
    const taskExecutorService = req.app.get('taskExecutorService') as TaskExecutorService;
    if (!taskExecutorService) {
      logger.error('TaskExecutorService not found in app context');
      return res.status(500).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'Task executor service not available'
      });
    }
    agentService = getAgentService(taskExecutorService);
    logger.info('AgentService initialized successfully');
  }
  next();
});

/**
 * Create Agent
 * POST /api/agent
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { 
      name, 
      description, 
      status, 
      taskId, 
      mcpWorkflow, 
      metadata, 
      username, 
      avatar, 
      categories,
      relatedQuestions 
    } = req.body;

    // Validate required fields
    if (!name || !description || !status) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: name, description, status'
      });
    }

    // Validate status value
    if (!['private', 'public', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'Status must be one of: private, public, draft'
      });
    }

    // Validate categories format (if provided)
    if (categories && !Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORIES',
        message: 'Categories must be an array of strings'
      });
    }

    // Validate relatedQuestions format (if provided)
    if (relatedQuestions && !Array.isArray(relatedQuestions)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RELATED_QUESTIONS',
        message: 'RelatedQuestions must be an array of strings'
      });
    }

    const createRequest: CreateAgentRequest = {
      userId,
      username,
      avatar,
      name,
      description,
      status,
      taskId,
      categories,
      mcpWorkflow,
      metadata,
      relatedQuestions
    };

    const agent = await agentService.createAgent(createRequest);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Failed to create Agent:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to create Agent'
    });
  }
});

/**
 * Get Agent List (Unified Interface)
 * GET /api/agent
 * 
 * Query Parameters:
 * - queryType: 'public' | 'my-private' | 'my-saved' | 'all' (default: 'public')
 *   - public: Public Agents (no login required)
 *   - my-private: My Private Agents (login required)
 *   - my-saved: My Saved Agents (login required)
 *   - all: All Visible Agents (login required)
 * - search: 搜索关键词
 * - category: 分类过滤
 * - orderBy: 排序字段 ('createdAt' | 'updatedAt' | 'usageCount' | 'name')
 * - order: 排序方向 ('asc' | 'desc')
 * - offset: 分页偏移量 (默认: 0)
 * - limit: 每页数量 (默认: 20, 最大: 100)
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    // 参数验证和默认值
    let queryType = req.query.queryType as 'public' | 'my-private' | 'my-saved' | 'all' || 'public';
    
    // 兼容性处理: 如果status参数是查询类型，映射到queryType
    const statusParam = req.query.status as string;
    if (statusParam && ['public', 'my-private', 'my-saved'].includes(statusParam)) {
      queryType = statusParam as 'public' | 'my-private' | 'my-saved';
    }

    const userId = req.user?.id;
    
    // 检查需要登录的查询类型
    if (['my-private', 'my-saved', 'all'].includes(queryType) && !userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }
    
    // 参数验证
    const rawOffset = req.query.offset as string;
    const rawLimit = req.query.limit as string;
    
    let offset = 0;
    let limit = 20;
    
    if (rawOffset) {
      const parsedOffset = parseInt(rawOffset);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PARAMETER',
          message: 'offset must be a non-negative integer'
        });
      }
      offset = parsedOffset;
    }
    
    if (rawLimit) {
      const parsedLimit = parseInt(rawLimit);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PARAMETER',
          message: 'limit must be an integer between 1 and 100'
        });
      }
      limit = parsedLimit;
    }
    
    // 验证orderBy参数
    const validOrderBy = ['createdAt', 'updatedAt', 'usageCount', 'name'];
    const orderBy = req.query.orderBy as string;
    if (orderBy && !validOrderBy.includes(orderBy)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETER',
        message: `orderBy must be one of: ${validOrderBy.join(', ')}`
      });
    }
    
    // 验证order参数
    const order = req.query.order as string;
    if (order && !['asc', 'desc'].includes(order)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETER',
        message: 'order must be either "asc" or "desc"'
      });
    }
    
    const query: GetAgentsQuery = {
      userId,
      queryType,
      status: ['public', 'my-private', 'my-saved'].includes(statusParam) ? undefined : req.query.status as any,
      search: req.query.search as string,
      category: req.query.category as string,
      orderBy: orderBy as any,
      order: order as any,
      offset,
      limit
    };

    const result = await agentService.getAgents(query);

    // Count category information from current query results
    const categoryMap = new Map<string, number>();
    result.agents.forEach(agent => {
      if (agent.categories && Array.isArray(agent.categories)) {
        agent.categories.forEach(category => {
          categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        });
      }
    });

    // Convert to array and sort by count in descending order
    const categories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        ...result,
        categories
      },
      pagination: {
        offset,
        limit,
        total: result.total,
        hasMore: offset + limit < result.total
      }
    });
  } catch (error) {
    logger.error('Failed to get Agent list:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get Agent list'
    });
  }
});

/**
 * Get Agent Statistics
 * GET /api/agent/stats
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const stats = await agentService.getAgentStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get Agent statistics:', error);
    res.status(500).json({
          success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get Agent statistics'
        });
      }
});

/**
 * Get All Agent Categories List
 * GET /api/agent/categories
 * 获取所有Agent分类列表，按使用频次排序
 * 
 * Query Parameters:
 * - fresh: 'true' | 'false' - 强制刷新缓存 (默认: false)
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const forceFresh = req.query.fresh === 'true';
    const now = Date.now();
    
    // 检查缓存是否有效
    if (!forceFresh && categoriesCache && (now - categoriesCache.timestamp < categoriesCache.ttl)) {
      return res.json({
        success: true,
        data: categoriesCache.data,
        cached: true,
        cachedAt: new Date(categoriesCache.timestamp).toISOString()
      });
    }
    
    // 获取最新数据
    const categories = await agentService.getAllCategories();
    
    // 更新缓存
    categoriesCache = {
      data: categories,
      timestamp: now,
      ttl: CATEGORIES_CACHE_TTL
    };

    res.json({
      success: true,
      data: categories,
      cached: false
    });
  } catch (error) {
    logger.error('Failed to get Agent categories:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get Agent categories'
    });
  }
});

/**
 * Generate Agent Name
 * POST /api/agent/generate-name
 */
router.post('/generate-name', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { taskTitle, taskContent, mcpWorkflow } = req.body;

    if (!taskTitle || !taskContent) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: taskTitle, taskContent'
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
    logger.error('Failed to generate Agent name:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to generate Agent name'
    });
  }
});

/**
 * Generate Agent Description
 * POST /api/agent/generate-description
 */
router.post('/generate-description', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { name, taskTitle, taskContent, mcpWorkflow } = req.body;

    if (!name || !taskTitle || !taskContent) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: name, taskTitle, taskContent'
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
    logger.error('Failed to generate Agent description:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to generate Agent description'
    });
  }
});

/**
 * Generate Agent Related Questions
 * POST /api/agent/generate-questions
 */
router.post('/generate-questions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { taskTitle, taskContent, mcpWorkflow } = req.body;

    if (!taskTitle || !taskContent) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: taskTitle, taskContent'
      });
    }

    const relatedQuestions = await agentService.generateRelatedQuestions(
      taskTitle,
      taskContent,
      mcpWorkflow
    );

    res.json({
      success: true,
      data: {
        relatedQuestions
      }
    });
  } catch (error) {
    logger.error('Failed to generate Agent related questions:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to generate Agent related questions'
    });
  }
});

/**
 * Verify MCP Authentication for Agent Usage
 * POST /api/agent/mcp/verify-auth
 */
router.post('/mcp/verify-auth', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { mcpName, authData, saveAuth = true } = req.body;

    // Validate required fields
    if (!mcpName || !authData) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required fields: mcpName, authData'
      });
    }

    logger.info(`🔐 Agent MCP authentication request - User: ${userId}, MCP: ${mcpName}`);

    // Agent MCP认证逻辑：不依赖任务，直接为用户验证和保存MCP认证信息
    const verificationResult = await verifyAgentMCPAuth(userId, mcpName, authData);

    if (verificationResult.success) {
      logger.info(`✅ Agent MCP authentication successful - User: ${userId}, MCP: ${mcpName}`);

    res.json({
      success: true,
        message: verificationResult.message,
      data: {
          verified: true,
          mcpName,
          userId,
          details: verificationResult.details
        }
      });
    } else {
      logger.warn(`❌ Agent MCP authentication failed - User: ${userId}, MCP: ${mcpName}: ${verificationResult.message}`);
      
      res.json({
        success: false,
        error: 'VERIFICATION_FAILED',
        message: verificationResult.message
      });
    }
  } catch (error) {
    logger.error(`Agent MCP authentication error:`, error);
    
    // Use the new error handler to analyze errors
    const { MCPErrorHandler } = await import('../services/mcpErrorHandler.js');
    const errorToAnalyze = error instanceof Error ? error : new Error(String(error));
    const errorDetails = await MCPErrorHandler.analyzeError(errorToAnalyze, req.body.mcpName);
    const formattedError = MCPErrorHandler.formatErrorForFrontend(errorDetails);
    
    res.status(errorDetails.httpStatus || 500).json({
      success: false,
      ...formattedError
    });
  }
});

/**
 * Get User's MCP Authentication Status
 * GET /api/agent/mcp/auth-status
 */
router.get('/mcp/auth-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { mcpNames } = req.query;

    if (!mcpNames) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required query parameter: mcpNames'
      });
    }

    // Parse MCP names (comma-separated)
    const mcpNameList = (mcpNames as string).split(',').map(name => name.trim());
    
    // Get authentication status for each MCP
    const authStatuses = await Promise.all(
      mcpNameList.map(async (mcpName) => {
        const authData = await mcpAuthService.getUserMCPAuth(userId, mcpName);
        return {
          mcpName,
          isAuthenticated: authData && authData.isVerified,
          hasAuthData: !!authData?.authData
        };
      })
    );

    res.json({
      success: true,
      data: {
        userId,
        authStatuses
      }
    });
  } catch (error) {
    logger.error(`Get Agent MCP auth status error:`, error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get MCP authentication status'
    });
  }
});

/**
 * Get Agent List by Category
 * GET /api/agent/category/:category
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const category = req.params.category;
    const query: AgentMarketplaceQuery = {
      category,
      search: req.query.search as string,
      orderBy: req.query.orderBy as any,
      order: req.query.order as any,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    };

    const result = await agentService.getAgentMarketplace(query);

    res.json({
      success: true,
      data: {
        category,
        ...result
      }
    });
  } catch (error) {
    logger.error(`Failed to get Agents by category [Category: ${req.params.category}]:`, error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get Agents by category'
    });
  }
});

/**
 * Get Agent by Task ID
 * GET /api/agent/task/:taskId
 */
router.get('/task/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const taskId = req.params.taskId;
    const agents = await agentService.getAgentsByTaskId(taskId);

    // Filter to return only Agents that user can access
    const accessibleAgents = agents.filter(agent => 
      agent.userId === userId || agent.status === 'public'
    );

    res.json({
      success: true,
      data: accessibleAgents
    });
  } catch (error) {
    logger.error(`Failed to get Agent by task ID [TaskID: ${req.params.taskId}]:`, error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get Agent by task ID'
    });
  }
});

/**
 * Generate Agent name and description (for frontend display)
 * POST /api/agent/generate-info/:taskId
 */
router.post('/generate-info/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const taskId = req.params.taskId;
    
    // Add debug logging
    logger.info(`Generate Agent info request - TaskID: ${taskId}, UserID: ${userId}`);
    
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TASK_ID',
        message: 'Task ID is required'
      });
    }
    
    // Generate Agent name and description
    const generatedInfo = await agentService.generateAgentInfo(taskId, userId);

    res.json({
      success: true,
      data: generatedInfo
    });
  } catch (error) {
    logger.error(`Failed to generate Agent info [TaskID: ${req.params.taskId}]:`, error);
    
    if (error instanceof Error) {
      // 更详细的错误处理
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'TASK_NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('Access denied') || error.message.includes('belongs to another user')) {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: error.message
        });
      }
      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          error: 'TASK_NOT_COMPLETED',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to generate Agent info'
    });
  }
});

/**
 * Preview Agent information created from Task (User preview before saving)
 * GET /api/agent/preview/:taskId
 */
router.get('/preview/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const taskId = req.params.taskId;
    
    // Get preview information
    const preview = await agentService.previewAgentFromTask(taskId, userId);

    res.json({
      success: true,
      data: preview
    });
  } catch (error) {
    logger.error(`Failed to preview Agent info [TaskID: ${req.params.taskId}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          error: 'TASK_NOT_COMPLETED',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to preview Agent info'
    });
  }
});

/**
 * Create Agent from completed task
 * POST /api/agent/create/:taskId
 */
router.post('/create/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const taskId = req.params.taskId;
    const { status = 'private', name, description } = req.body;

    // Validate status value
    if (!['private', 'public'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'Status must be either private or public'
      });
    }

    const agent = await agentService.createAgentFromTask(taskId, userId, status, name, description);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`Failed to create Agent from task [TaskID: ${req.params.taskId}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          error: 'TASK_NOT_COMPLETED',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to create Agent from Task'
    });
  }
});

/**
 * Get Agent Details
 * GET /api/agent/:id
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.getAgentById(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`Failed to get Agent details [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('access denied') || error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to get Agent details'
    });
  }
});

/**
 * Update Agent
 * PUT /api/agent/:id
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const { name, description, status, metadata, relatedQuestions } = req.body;
    
    // Validate status value (if provided)
    if (status && !['private', 'public', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'Status must be one of: private, public, draft'
      });
    }

    // Validate relatedQuestions format (if provided)
    if (relatedQuestions && !Array.isArray(relatedQuestions)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RELATED_QUESTIONS',
        message: 'RelatedQuestions must be an array of strings'
      });
    }

    const updateRequest: UpdateAgentRequest = {
      name,
      description,
      status,
      metadata,
      relatedQuestions
    };

    const agent = await agentService.updateAgent(agentId, userId, updateRequest);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`Failed to update Agent [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('no permission')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('already exists') || error.message.includes('allowed')) {
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
      message: error instanceof Error ? error.message : 'Failed to update Agent'
    });
  }
});

/**
 * Delete Agent
 * DELETE /api/agent/:id
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    await agentService.deleteAgent(agentId, userId);

    res.json({
      success: true,
      data: {
        message: 'Agent has been deleted',
        agentId: agentId,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Failed to delete Agent [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to delete Agent'
    });
  }
});

/**
 * Publish Agent as Public
 * POST /api/agent/:id/publish
 */
router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.publishAgent(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`Failed to publish Agent [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to publish Agent'
    });
  }
});

/**
 * Set Agent to Private
 * POST /api/agent/:id/private
 */
router.post('/:id/private', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const agent = await agentService.makeAgentPrivate(agentId, userId);

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error(`Failed to make Agent private [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to make Agent private'
    });
  }
});

/**
 * Record Agent Usage
 * POST /api/agent/:id/usage
 */
router.post('/:id/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
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
    logger.error(`Failed to record Agent usage [ID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to record Agent usage'
    });
  }
});

/**
 * Initialize Agent Conversation (Prepare Environment)
 * POST /api/agent/:id/init
 */
router.post('/:id/init', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;

    // 1. First check if user already has a conversation with this agent
    const { conversationDao } = await import('../dao/conversationDao.js');
    const existingConversation = await conversationDao.getUserAgentConversation(userId, agentId);

    if (existingConversation) {
      // User already has a conversation with this agent, return existing conversation
      logger.info(`Returning existing conversation for user ${userId} and agent ${agentId}: ${existingConversation.id}`);
      
      // Get agent info for response
      const agent = await agentService.getAgentById(agentId, userId);
      
      res.json({
        success: true,
        data: {
          conversationId: existingConversation.id,
          agentInfo: {
            id: agent.id,
            name: agent.name,
            description: agent.description
          },
          ready: true,
          isExistingConversation: true
        }
      });
      return;
    }

    // 2. No existing conversation found, create new one
    logger.info(`Creating new conversation for user ${userId} and agent ${agentId}`);
    
    // Initialize Agent conversation (prepare environment)
    const result = await agentService.tryAgent({
      agentId,
      content: '', // Empty content for initialization only
      userId
    });

    if (result.success && result.conversation) {
      res.json({
        success: true,
        data: {
          conversationId: result.conversation.id,
          agentInfo: result.conversation.agentInfo,
          ready: true,
          isExistingConversation: false
        }
      });
    } else {
      // If authentication is required, return special response format
      if (result.needsAuth) {
        res.status(200).json({
          success: false,
          error: 'MCP_AUTH_REQUIRED',
          needsAuth: true,
          missingAuth: result.missingAuth,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'INIT_FAILED',
          message: result.message || 'Failed to initialize Agent conversation'
        });
      }
    }
  } catch (error) {
    logger.error(`Failed to initialize Agent conversation [AgentID: ${req.params.id}]:`, error);
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to initialize Agent conversation'
    });
  }
});



/**
 * Favorite Agent
 * POST /api/agent/:id/favorite
 */
router.post('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const result = await agentService.addFavorite(userId, agentId);

    res.json({
      success: result.success,
      data: {
        message: result.message,
        agentId: result.agentId,
        isFavorited: result.isFavorited
      }
    });
  } catch (error) {
    logger.error(`Failed to favorite Agent [AgentID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('can only favorite')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_OPERATION',
          message: error.message
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to favorite Agent'
    });
  }
});

/**
 * Unfavorite Agent
 * DELETE /api/agent/:id/favorite
 */
router.delete('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const result = await agentService.removeFavorite(userId, agentId);

    res.json({
      success: result.success,
      data: {
        message: result.message,
        agentId: result.agentId,
        isFavorited: result.isFavorited
      }
    });
  } catch (error) {
    logger.error(`Failed to unfavorite Agent [AgentID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
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
      message: error instanceof Error ? error.message : 'Failed to unfavorite Agent'
    });
  }
});

/**
 * Check Agent Favorite Status
 * GET /api/agent/:id/favorite/status
 */
router.get('/:id/favorite/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const isFavorited = await agentService.checkFavoriteStatus(userId, agentId);

    res.json({
      success: true,
      data: {
        agentId,
        isFavorited
      }
    });
  } catch (error) {
    logger.error(`Failed to check Agent favorite status [AgentID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to check Agent favorite status'
    });
  }
});

/**
 * Agent专用MCP认证函数
 * 不依赖任务，直接为用户验证和保存MCP认证信息
 */
async function verifyAgentMCPAuth(
  userId: string,
  mcpName: string,
  authData: Record<string, string>
): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    logger.info(`🔐 Starting Agent MCP auth verification - User: ${userId}, MCP: ${mcpName}`);
    
    // 1. 验证认证数据的有效性
    const validationResult = await validateMCPAuthData(mcpName, authData);
    if (!validationResult.success) {
      return validationResult;
    }

    // 2. 保存认证信息（标记为已验证）
    await mcpAuthService.saveAuthData(userId, mcpName, authData, true);
    
    logger.info(`✅ Agent MCP auth saved successfully - User: ${userId}, MCP: ${mcpName}`);
    
    return {
      success: true,
      message: `MCP ${mcpName} authentication verified and saved successfully`,
      details: 'Authentication data has been validated and stored for Agent usage'
    };
  } catch (error) {
    logger.error(`❌ Agent MCP auth verification failed - User: ${userId}, MCP: ${mcpName}:`, error);
    return {
      success: false,
      message: 'Authentication verification failed',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 验证MCP认证数据的有效性
 */
async function validateMCPAuthData(
  mcpName: string,
  authData: Record<string, string>
): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    // 检查是否有空字段
    const hasEmptyFields = Object.values(authData).some(value => !value || value.trim() === '');
    if (hasEmptyFields) {
      return {
        success: false,
        message: 'All authentication fields must be filled',
        details: 'Please provide values for all required authentication parameters'
      };
    }

    // 根据MCP类型进行特定验证
    switch (mcpName.toLowerCase()) {
      case 'github-mcp-server':
      case 'github-mcp':
        return await validateGitHubAuth(authData);
      
      case 'coingecko-server':
      case 'coingecko-mcp':
        return await validateCoinGeckoAuth(authData);
      
      case 'google-search-mcp':
        return await validateGoogleSearchAuth(authData);
      
      case 'twitter-mcp':
      case 'x-mcp':
        return await validateTwitterAuth(authData);
      
      default:
        // 对于未知的MCP，只做基本验证
        return {
          success: true,
          message: `Authentication data for ${mcpName} has been validated`,
          details: 'Basic validation passed - all fields are provided'
        };
    }
  } catch (error) {
    logger.error(`Validation error for MCP ${mcpName}:`, error);
    return {
      success: false,
      message: 'Validation failed',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 验证GitHub认证
 */
async function validateGitHubAuth(authData: Record<string, string>): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    const token = authData.GITHUB_TOKEN || authData.github_token;
    if (!token) {
      return {
        success: false,
        message: 'GitHub token is required',
        details: 'Please provide GITHUB_TOKEN'
      };
    }

    // 验证GitHub Token
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.ok) {
      const userData = await response.json() as { login?: string };
      return {
        success: true,
        message: 'GitHub authentication verified successfully',
        details: `Authenticated as ${userData.login || 'unknown'}`
      };
    } else {
      const errorData = await response.json() as { message?: string };
      return {
        success: false,
        message: 'GitHub authentication failed',
        details: errorData.message || `HTTP Error: ${response.status}`
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'GitHub authentication validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 验证CoinGecko认证
 */
async function validateCoinGeckoAuth(authData: Record<string, string>): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    const apiKey = authData.COINGECKO_API_KEY || authData.coingecko_api_key;
    if (!apiKey) {
      return {
        success: false,
        message: 'CoinGecko API key is required',
        details: 'Please provide COINGECKO_API_KEY'
      };
    }

    // 验证CoinGecko API Key
    const response = await fetch(`https://api.coingecko.com/api/v3/ping?x_cg_demo_api_key=${apiKey}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      return {
        success: true,
        message: 'CoinGecko API key verified successfully',
        details: 'API key is valid and active'
      };
    } else {
      return {
        success: false,
        message: 'CoinGecko API key validation failed',
        details: `HTTP Error: ${response.status}`
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'CoinGecko authentication validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 验证Google Search认证
 */
async function validateGoogleSearchAuth(authData: Record<string, string>): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    const apiKey = authData.GOOGLE_API_KEY;
    const searchEngineId = authData.CUSTOM_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
      return {
        success: false,
        message: 'Google API key and Custom Search Engine ID are required',
        details: 'Please provide both GOOGLE_API_KEY and CUSTOM_SEARCH_ENGINE_ID'
      };
    }

    // 测试Google Custom Search API
    const testQuery = 'test';
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${testQuery}`;
    
    const response = await fetch(url);
    
    if (response.ok) {
      return {
        success: true,
        message: 'Google Search authentication verified successfully',
        details: 'API key and search engine ID are valid'
      };
    } else {
      const errorData = await response.json() as { error?: { message?: string } };
      return {
        success: false,
        message: 'Google Search authentication failed',
        details: errorData.error?.message || `HTTP Error: ${response.status}`
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Google Search authentication validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 验证Twitter认证
 */
async function validateTwitterAuth(authData: Record<string, string>): Promise<{ success: boolean; message: string; details?: string }> {
  try {
    const apiKey = authData.TWITTER_API_KEY;
    const apiSecret = authData.TWITTER_API_SECRET;
    const accessToken = authData.TWITTER_ACCESS_TOKEN;
    const accessSecret = authData.TWITTER_ACCESS_TOKEN_SECRET;
    
    // 检查必需字段
    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      const missingFields = [];
      if (!apiKey) missingFields.push('TWITTER_API_KEY');
      if (!apiSecret) missingFields.push('TWITTER_API_SECRET');
      if (!accessToken) missingFields.push('TWITTER_ACCESS_TOKEN');
      if (!accessSecret) missingFields.push('TWITTER_ACCESS_TOKEN_SECRET');
      
      return {
        success: false,
        message: 'Missing required Twitter authentication fields',
        details: `Please provide: ${missingFields.join(', ')}`
      };
    }
    
    // Twitter API需要OAuth，这里只做基本验证
    // 实际的API调用验证会在MCP工具使用时进行
    return {
      success: true,
      message: 'Twitter authentication data validated successfully',
      details: 'All required Twitter authentication fields are provided'
    };
  } catch (error) {
    return {
      success: false,
      message: 'Twitter authentication validation error',
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get Agent Conversation Details
 * GET /api/agent/:id/conversations?conversationId=xxx
 */
router.get('/:id/conversations', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const agentId = req.params.id;
    const { conversationId } = req.query;

    // 检查是否传入了conversationId
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CONVERSATION_ID',
        message: 'conversationId is required as query parameter'
      });
    }

    // 验证Agent是否存在和用户权限
    const agent = await agentService.getAgentById(agentId, userId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Agent not found'
      });
    }

    // 使用conversationDao获取会话详情
    const { conversationDao } = await import('../dao/conversationDao.js');
    
    // 获取会话基本信息
    const conversation = await conversationDao.getConversationById(conversationId as string);
    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Conversation not found'
      });
    }

    // 验证会话是否属于该Agent
    if (conversation.agentId !== agentId) {
      return res.status(400).json({
        success: false,
        error: 'CONVERSATION_AGENT_MISMATCH',
        message: 'Conversation does not belong to this agent'
      });
    }

    // 获取会话的所有消息（使用现有的service方法）
    const { messageDao } = await import('../dao/messageDao.js');
    const messages = await messageDao.getConversationMessages(conversationId as string);

    // 获取关联的任务详情
    const { taskDao } = await import('../dao/taskDao.js');
    const messageDetails = await Promise.all(
      messages.map(async (msg: any) => {
        let taskDetails = null;
        
        if (msg.taskId) {
          try {
            const task = await taskDao.getTaskById(msg.taskId);
            if (task) {
              taskDetails = {
                id: task.id,
                title: task.title,
                status: task.status,
                taskType: task.task_type,
                result: task.result,
                mcpWorkflow: task.mcp_workflow
              };
            }
          } catch (error) {
            logger.warn(`Failed to get task details for message ${msg.id}:`, error);
          }
        }

        return {
          id: msg.id,
          content: msg.content,
          type: msg.type,
          intent: msg.intent,
          taskId: msg.taskId,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
          taskDetails: taskDetails
        };
      })
    );

    res.json({
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          type: conversation.type,
          agentId: conversation.agentId,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messageCount,
          taskCount: conversation.taskCount
        },
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          categories: agent.categories
        },
        messages: messageDetails
      }
    });
  } catch (error) {
    logger.error(`Failed to get Agent conversation [AgentID: ${req.params.id}]:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message
        });
      }
      if (error.message.includes('access denied') || error.message.includes('no permission')) {
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
      message: error instanceof Error ? error.message : 'Failed to get Agent conversation'
    });
  }
});

export default router; 