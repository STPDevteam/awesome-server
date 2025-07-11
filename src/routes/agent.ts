import { Router, Request, Response } from 'express';
import { getAgentService } from '../services/agentService.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
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

// Initialize agentService with TaskExecutorService dependency
let agentService: ReturnType<typeof getAgentService>;

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
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Task not found or access denied'
        });
      }
      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          error: 'TASK_NOT_COMPLETED',
          message: 'Task is not completed'
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

// Removed /api/agent/marketplace endpoint
// Use unified GET /api/agent?queryType=public endpoint instead

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
      // If authentication is required, return special response format
      if (result.needsAuth) {
        res.status(403).json({
          success: false,
          error: 'AUTH_REQUIRED',
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

export default router; 