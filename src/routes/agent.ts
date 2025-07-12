import { Router, Request, Response } from 'express';
import { getAgentService } from '../services/agentService.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
import { MCPAuthService } from '../services/mcpAuthService.js';
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

// Initialize services
let agentService: ReturnType<typeof getAgentService>;
const mcpAuthService = new MCPAuthService();

// Middleware: Ensure agentService is initialized
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
 * - queryType: 'public' | 'my-private' | 'my-saved' | 'all'
 *   - public: Public Agents (no login required)
 *   - my-private: My Private Agents (login required)
 *   - my-saved: My Saved Agents (login required)
 *   - all: All Visible Agents (login required)
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    let queryType = req.query.queryType as 'public' | 'my-private' | 'my-saved' | 'all' || 'all';
    
    // Compatibility handling: if status parameter is a query type, map it to queryType
    const statusParam = req.query.status as string;
    if (statusParam && ['public', 'my-private', 'my-saved'].includes(statusParam)) {
      queryType = statusParam as 'public' | 'my-private' | 'my-saved';
    }

    const userId = req.user?.id;
    
    // Check query types that require login
    if (['my-private', 'my-saved', 'all'].includes(queryType) && !userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }
    
    const query: GetAgentsQuery = {
      userId,
      queryType,
      status: ['public', 'my-private', 'my-saved'].includes(statusParam) ? undefined : req.query.status as any,
      search: req.query.search as string,
      category: req.query.category as string,
      orderBy: req.query.orderBy as any,
      order: req.query.order as any,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
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
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    // Use statistics endpoint to get category information (does not require user authentication for global stats)
    const marketplace = await agentService.getAgentMarketplace({
      limit: 1 // Only need category statistics, not specific Agent data
    });

    // Extract all categories from public Agents
    const categories = new Set<string>();
    // Note: Need to add logic to get all categories in agentService
    // Temporarily return empty array, need to implement in service layer
    const categoryList: Array<{name: string, count: number}> = [];

    res.json({
      success: true,
      data: categoryList,
      message: 'Category list functionality is under development'
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
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to verify MCP authentication'
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
 * Start Multi-turn Conversation with Agent
 * POST /api/agent/:id/try
 */
router.post('/:id/try', requireAuth, async (req: Request, res: Response) => {
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
    const { content } = req.body;

    // content can be empty, indicating wanting to start conversation only
    if (content !== undefined && typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT',
        message: 'Content must be a string'
      });
    }

    // Start multi-turn conversation with Agent
    const result = await agentService.tryAgent({
      agentId,
      content: content || '',
      userId
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          conversation: result.conversation,
          message: result.message
        }
      });
    } else {
      // If authentication is required, return special response format with 200 status
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
          error: 'TRY_AGENT_FAILED',
          message: result.message
        });
      }
    }
  } catch (error) {
    logger.error(`Failed to start Agent conversation [AgentID: ${req.params.id}]:`, error);
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to start Agent conversation'
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
    const accessSecret = authData.TWITTER_ACCESS_SECRET;
    
    // 检查必需字段
    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
      const missingFields = [];
      if (!apiKey) missingFields.push('TWITTER_API_KEY');
      if (!apiSecret) missingFields.push('TWITTER_API_SECRET');
      if (!accessToken) missingFields.push('TWITTER_ACCESS_TOKEN');
      if (!accessSecret) missingFields.push('TWITTER_ACCESS_SECRET');
      
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

export default router; 