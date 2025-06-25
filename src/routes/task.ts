import { Router, Request, Response } from 'express';
import { titleGeneratorService } from '../services/llmTasks/titleGenerator.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import { getTaskService } from '../services/taskService.js';
import { MCPAuthService } from '../services/mcpAuthService.js';
import { TaskAnalysisService } from '../services/llmTasks/taskAnalysisService.js';
import { MCPAlternativeService } from '../services/mcpAlternativeService.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
import { HTTPMCPAdapter } from '../services/httpMcpAdapter.js';
import { spawn } from 'child_process';
import { getPredefinedMCP } from '../services/predefinedMCPs.js';
import { MCPService } from '../services/mcpManager.js';
import { getConversationService } from '../services/conversationService.js';

const router = Router();

// 创建服务实例
const taskService = getTaskService();
const httpMcpAdapter = new HTTPMCPAdapter();
const mcpAuthService = new MCPAuthService();
const taskAnalysisService = new TaskAnalysisService(httpMcpAdapter);
const mcpAlternativeService = new MCPAlternativeService();

// 获取mcpManager实例，将在应用启动时通过app.set设置
let mcpManager: any;

// 在路由中使用app.get('mcpManager')获取mcpManager实例
router.use((req, res, next) => {
  if (!mcpManager) {
    mcpManager = req.app.get('mcpManager');
  }
  next();
});

// 初始化taskExecutorService，使用mcpManager
let taskExecutorService: TaskExecutorService;

// 使用中间件确保 taskExecutorService 已初始化
router.use((req, res, next) => {
  if (!taskExecutorService) {
    // 从 app 获取 taskExecutorService 实例，如果存在
    const appTaskExecutorService = req.app.get('taskExecutorService');
    if (appTaskExecutorService) {
      taskExecutorService = appTaskExecutorService;
    } else {
      // 如果 app 中没有，则创建新实例
      taskExecutorService = new TaskExecutorService(httpMcpAdapter, mcpAuthService, mcpManager);
    }
  }
  next();
});

// 验证请求内容的Schema
const generateTitleSchema = z.object({
  content: z.string().min(1, 'Task content must have at least 1 character')
});

// 创建任务的Schema
const createTaskSchema = z.object({
  // todo 最大要限制多少
  content: z.string().min(1, 'Task content must have at least 1 character'),
  title: z.string().optional(), // 标题可选，如果未提供将使用LLM生成
  conversationId: z.string().optional() // 关联到对话
});

// MCP验证Schema
const verifyMCPAuthSchema = z.object({
  mcpName: z.string().min(1, 'MCP name cannot be empty'),
  authData: z.record(z.string(), z.string()),
  saveForLater: z.boolean().optional()
});

// 替换MCP Schema
const replaceMCPSchema = z.object({
  originalMcpName: z.string().min(1, 'Original MCP name cannot be empty'),
  newMcpName: z.string().min(1, 'New MCP name cannot be empty')
});

/**
 * 生成任务标题
 * POST /api/task/title
 * todo 冗余接口
 */
router.post('/title', requireAuth, async (req: Request, res: Response) => {
  try {
    const validationResult = generateTitleSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }

    const { content } = validationResult.data;
    logger.info(`Received title generation request [User ID: ${req.user?.id}]`);

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
    logger.error('Title generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

// 启动Playwright MCP服务
router.post('/playwright/start', requireAuth, async (req, res) => {
  try {
    logger.info('Starting Playwright MCP service...');
    
    // 使用spawn启动Playwright MCP
    const process = spawn('npx', ['-y', '@playwright/mcp@latest'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
      logger.info(`Playwright MCP stdout: ${data.toString()}`);
    });
    
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
      logger.error(`Playwright MCP stderr: ${data.toString()}`);
    });
    
    // 等待一段时间，确保进程启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (process.killed) {
      return res.status(500).json({
        success: false,
        message: 'Playwright MCP service failed to start',
        error: stderrData
      });
    }
    
    res.json({
      success: true,
      message: 'Playwright MCP service started',
      pid: process.pid,
      output: stdoutData
    });
  } catch (error) {
    logger.error('Failed to start Playwright MCP service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start Playwright MCP service',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加Playwright MCP测试路由
router.post('/test-playwright-mcp', async (req, res) => {
  try {
    const { url, searchText } = req.body;
    
    // 获取服务实例
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 检查Playwright MCP是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const playwrightConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'playwright');
    
    // 如果未连接，尝试连接
    if (!playwrightConnected) {
      logger.info('Playwright MCP not connected, attempting to connect...');
      const playwrightMCP = getPredefinedMCP('playwright');
      if (!playwrightMCP) {
        return res.status(500).json({ error: 'Playwright MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(playwrightMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to Playwright MCP' });
      }
      logger.info('Playwright MCP connected successfully');
    }
    
    // 获取Playwright MCP的工具列表
    logger.info('Getting Playwright MCP tools list...');
    const tools = await mcpManager.getTools('playwright');
    
    // 返回结果
    res.json({
      success: true,
      message: 'Playwright MCP test successful',
      tools: tools
    });
  } catch (error) {
    logger.error('Playwright MCP test failed:', error);
    res.status(500).json({ 
      error: 'Playwright MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加AWE Core MCP测试路由
router.post('/test-awe-mcp', async (req, res) => {
  try {
    // 获取服务实例
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 检查AWE Core MCP是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const aweConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'AWE Core MCP Server');
    
    // 如果未连接，尝试连接
    if (!aweConnected) {
      logger.info('AWE Core MCP未连接，尝试连接...');
      const aweMCP = getPredefinedMCP('AWE Core MCP Server');
      if (!aweMCP) {
        return res.status(500).json({ error: 'AWE Core MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(aweMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to AWE Core MCP' });
      }
      logger.info('AWE Core MCP连接成功');
    }
    
    // 获取AWE Core MCP的工具列表
    logger.info('获取AWE Core MCP工具列表...');
    const tools = await mcpManager.getTools('AWE Core MCP Server');
    
    // 返回结果
    res.json({
      success: true,
      message: 'AWE Core MCP测试成功',
      tools: tools
    });
  } catch (error) {
    logger.error('AWE Core MCP测试失败:', error);
    res.status(500).json({ 
      error: 'AWE Core MCP测试失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加Playwright MCP直接测试路由
router.post('/test-playwright-direct', async (req, res) => {
  try {
    const { url, searchText } = req.body;
    
    logger.info('启动Playwright MCP并直接测试...');
    
    // 使用spawn启动Playwright MCP
    const playwrightProcess = spawn('npx', ['-y', '@playwright/mcp@latest'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    playwrightProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      logger.info(`Playwright MCP stdout: ${data.toString()}`);
    });
    
    playwrightProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      logger.error(`Playwright MCP stderr: ${data.toString()}`);
    });
    
    // 等待一段时间，确保进程启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (playwrightProcess.killed) {
      return res.status(500).json({
        success: false,
        message: 'Playwright MCP服务启动失败',
        error: stderrData
      });
    }
    
    // 返回结果
    res.json({
      success: true,
      message: 'Playwright MCP直接测试成功',
      pid: playwrightProcess.pid,
      output: stdoutData,
      error: stderrData
    });
  } catch (error) {
    logger.error('Playwright MCP直接测试失败:', error);
    res.status(500).json({ 
      error: 'Playwright MCP直接测试失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 创建或更新任务
 * POST /api/task[/:id]
 */
router.post(['/', '/:id'], optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    
    // 如果提供了任务ID，则是更新操作
    if (taskId) {
      // 获取现有任务
      const existingTask = await taskService.getTaskById(taskId);
      
      if (!existingTask) {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Task not found'
        });
      }
      
      // 从URL查询参数获取userId或使用req.user.id
      const userId = req.user?.id || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
        });
      }
      
      // 确保用户只能更新自己的任务
      if (existingTask.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'No permission to update this task'
        });
      }
      
      // 更新任务
      const updateData = {
        ...req.body
      };
      
      // 如果提供了新的标题，更新标题
      if (req.body.title) {
        updateData.title = req.body.title;
      }
      
      // 如果提供了新的内容，更新内容
      if (req.body.content) {
        updateData.content = req.body.content;
      }
      
      // 如果提供了MCP工作流，更新工作流
      if (req.body.mcpWorkflow) {
        updateData.mcpWorkflow = req.body.mcpWorkflow;
      }
      
      // 更新任务
      const updatedTask = await taskService.updateTask(taskId, updateData);
      
      return res.json({
        success: true,
        data: {
          task: updatedTask
        }
      });
    } else {
      // 创建新任务
      const validationResult = createTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid request parameters',
          details: validationResult.error.errors
        });
      }

      const { content, title, conversationId } = validationResult.data;

      // 如果未提供标题，并且有OPENAI_API_KEY，才使用LLM生成
      const taskTitle = (!title && process.env.OPENAI_API_KEY) 
        ? await titleGeneratorService.generateTitle(content)
        : title || content.substring(0, 30); // 如果没有提供标题也没有key，使用内容作为标题

      // 创建任务 - 如果req.user不存在，则使用请求体中的userId
      const userId = req.user?.id || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
        });
      }

      const task = await taskService.createTask({
        userId,
        title: taskTitle,
        content,
        conversationId // 关联到对话
      });

      // 如果是从对话创建的任务，返回更多信息
      const responseData = conversationId 
        ? {
            task,
            conversationId,
            message: '已成功创建任务并关联到对话'
          }
        : {
            task
          };

      return res.json({
        success: true,
        data: responseData
      });
    }
  } catch (error) {
    logger.error('Error creating or updating task:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取用户的任务列表
 * GET /api/task
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { status, limit, offset, sortBy, sortDir } = req.query;
    
    // 从URL查询参数获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }
    
    const result = await taskService.getUserTasks(userId, {
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
    logger.error('Error getting task list:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取任务详情
 * GET /api/task/:id
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 从URL查询参数获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }
    
    // 确保用户只能访问自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this task'
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
    logger.error('Error getting task details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 启动任务分析
 * POST /api/task/:id/analyze
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const taskId = req.params.id;
    // const { userId } = req.body; // userId 暂时不用

    const taskAnalysisService = req.app.get('taskAnalysisService');
    const workflow = await taskAnalysisService.analyzeTask(taskId);

    if (workflow) {
      const updatedTask = await taskService.getTaskById(taskId);
      res.json({
        success: true,
        data: {
          message: 'Task analysis completed',
          taskId: taskId,
          mcpWorkflow: updatedTask?.mcpWorkflow
        }
      });
    } else {
      res.status(500).json({ success: false, error: 'Analysis Failed', message: 'Task analysis failed, please check logs for more information' });
    }
  } catch (error) {
    logger.error(`Task analysis error [Task ID: ${req.params.id}]:`, error);
    res.status(500).json({ success: false, error: 'Internal Server Error', message: 'Internal server error' });
  }
});

/**
 * 验证MCP授权
 * POST /api/task/:id/verify-auth
 */
router.post('/:id/verify-auth',  async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const validationResult = verifyMCPAuthSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }
    
    const { mcpName, authData, saveForLater } = validationResult.data;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 确保用户只能为自己的任务验证授权
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to verify authorization for this task'
      });
    }
    
    // 验证授权
    const verificationResult = await mcpAuthService.verifyAuth(
      req.user!.id,
      mcpName,
      authData
    );
    
    // 更新任务中MCP的授权状态
    await mcpAuthService.updateTaskMCPAuthStatus(
      taskId,
      req.user!.id,
      mcpName,
      verificationResult.success
    );
    
    res.json({
      success: true,
      data: {
        verified: verificationResult.success,
        message: verificationResult.message,
        details: verificationResult.details,
        mcpName
      }
    });
  } catch (error) {
    logger.error(`MCP authorization verification error [Task ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取MCP替代选项
 * GET /api/task/:id/mcp-alternatives/:mcpName
 */
router.get('/:id/mcp-alternatives/:mcpName', optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const mcpName = req.params.mcpName;
    
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    // 确保用户只能为自己的任务获取替代选项
    if (userId && task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to get alternatives for this task'
      });
    }
    
    // 获取替代选项
    const alternatives = await mcpAlternativeService.getAlternativeMCPs(mcpName, task.content);
    
    res.json({
      success: true,
      data: {
        originalMcp: mcpName,
        alternatives
      }
    });
  } catch (error) {
    logger.error(`获取MCP替代选项错误 [任务ID: ${req.params.id}, MCP: ${req.params.mcpName}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 替换MCP
 * POST /api/task/:id/replace-mcp
 * todo 这些接口看一下是否需要内部使用的情况
 */
router.post('/:id/replace-mcp', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const validationResult = replaceMCPSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '无效的请求参数',
        details: validationResult.error.errors
      });
    }
    
    const { originalMcpName, newMcpName } = validationResult.data;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 确保用户只能为自己的任务替换MCP
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to replace MCP for this task'
      });
    }
    
    // 替换MCP
    const replaced = await mcpAlternativeService.replaceMCPInWorkflow(
      taskId,
      originalMcpName,
      newMcpName
    );
    
    if (!replaced) {
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: '替换MCP失败'
      });
    }
    
    res.json({
      success: true,
      data: {
        message: 'MCP替换成功',
        originalMcpName,
        newMcpName
      }
    });
  } catch (error) {
    logger.error(`替换MCP错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 执行任务
 * POST /api/task/:id/execute
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskExecutorService = req.app.get('taskExecutorService');
    
    // 获取用户ID（可选认证）
    const userId = req.user?.id || req.body.userId;
    
    // 验证任务归属权
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    if (userId && task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to execute this task'
      });
    }
    
    // 执行任务并获取详细结果
    const executionResult = await taskExecutorService.executeTask(taskId, { skipAuthCheck: true });
    
    // 返回详细执行结果
    res.json({
      success: executionResult.success,
      data: {
        taskId: taskId,
        status: executionResult.status,
        summary: executionResult.summary,
        message: executionResult.success ? '任务执行成功' : '任务执行失败',
        steps: executionResult.steps,
        error: executionResult.error
      }
    });
  } catch (error) {
    logger.error(`执行任务路由错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error', 
      message: '启动任务执行失败',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 流式分析任务
 * POST /api/task/:id/analyze/stream
 */
router.post('/:id/analyze/stream', optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }
    
    // 确保用户只能分析自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to analyze this task'
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
    
    // 执行流式任务分析
    const analysisStarted = taskAnalysisService.analyzeTaskStream(taskId, streamHandler);
    
    // 分析结束后发送完成标记
    analysisStarted
      .then((success: boolean) => {
        if (!success) {
          res.write(`data: ${JSON.stringify({ event: 'error', data: { message: 'Task analysis failed' } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式分析任务错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: 'Error occurred during task analysis',
            details: error instanceof Error ? error.message : String(error)
          } 
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`流式分析任务错误 [任务ID: ${req.params.id}]:`, error);
    
    // 对于初始设置错误，使用标准JSON响应
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 流式执行任务
 * POST /api/task/:id/execute/stream
 */
router.post('/:id/execute/stream', optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId parameter or use a valid authentication token'
      });
    }
    
    // 确保用户只能执行自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to execute this task'
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
    
    // 执行流式任务执行
    const executionStarted = taskExecutorService.executeTaskStream(taskId, streamHandler);
    
    // 执行结束后发送完成标记
    executionStarted
      .then((success: boolean) => {
        if (!success) {
          res.write(`data: ${JSON.stringify({ event: 'error', data: { message: 'Task execution failed' } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式执行任务错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: 'Error occurred during task execution',
            details: error instanceof Error ? error.message : String(error)
          } 
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`流式执行任务错误 [任务ID: ${req.params.id}]:`, error);
    
    // 对于初始设置错误，使用标准JSON响应
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

// 添加Playwright MCP直接执行路由
router.post('/execute-playwright-search', async (req, res) => {
  try {
    const { searchText } = req.body;
    const searchTerm = searchText || 'MCP协议';
    
    // 获取服务实例
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 检查Playwright MCP是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const playwrightConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'playwright');
    
    // 如果未连接，尝试连接
    if (!playwrightConnected) {
      logger.info('Playwright MCP未连接，尝试连接...');
      const playwrightMCP = getPredefinedMCP('playwright');
      if (!playwrightMCP) {
        return res.status(500).json({ error: 'Playwright MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(playwrightMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to Playwright MCP' });
      }
      logger.info('Playwright MCP连接成功');
    }
    
    // 执行搜索操作
    logger.info(`开始执行百度搜索: ${searchTerm}`);
    
    // 步骤1: 访问百度
    logger.info('步骤1: 访问百度');
    const navigateResult = await mcpManager.callTool('playwright', 'browser_navigate', { 
      url: 'https://www.baidu.com' 
    });
    
    // 步骤2: 在搜索框中输入搜索词
    logger.info(`步骤2: 输入搜索词 "${searchTerm}"`);
    await mcpManager.callTool('playwright', 'browser_type', { 
      text: searchTerm,
      element: '搜索框',
      ref: '#kw'
    });
    
    // 步骤3: 点击搜索按钮
    logger.info('步骤3: 点击搜索按钮');
    await mcpManager.callTool('playwright', 'browser_click', { 
      element: '搜索按钮',
      ref: '#su'
    });
    
    // 步骤4: 等待搜索结果加载
    logger.info('步骤4: 等待搜索结果加载');
    await mcpManager.callTool('playwright', 'browser_wait_for', { 
      time: 2
    });
    
    // 步骤5: 截图
    logger.info('步骤5: 截图');
    const screenshotResult = await mcpManager.callTool('playwright', 'browser_take_screenshot', {});
    
    // 返回结果
    res.json({
      success: true,
      message: '百度搜索执行成功',
      searchTerm,
      steps: [
        { step: 1, action: 'browser_navigate', status: 'success' },
        { step: 2, action: 'browser_type', status: 'success' },
        { step: 3, action: 'browser_click', status: 'success' },
        { step: 4, action: 'browser_wait_for', status: 'success' },
        { step: 5, action: 'browser_take_screenshot', status: 'success' }
      ],
      screenshot: screenshotResult
    });
  } catch (error) {
    logger.error('百度搜索执行失败:', error);
    res.status(500).json({ 
      error: '百度搜索执行失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 获取与任务关联的对话
 * GET /api/task/:id/conversation
 */
router.get('/:id/conversation', optionalAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    // 从URL查询参数获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID, please provide userId query parameter or use a valid authentication token'
      });
    }
    
    // 确保用户只能访问自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to access this task'
      });
    }
    
    // 检查任务是否关联到对话
    if (!task.conversationId) {
      return res.json({
        success: true,
        data: {
          taskId,
          conversation: null,
          message: '此任务未关联到任何对话'
        }
      });
    }
    
    // 获取关联的对话
    const conversationService = req.app.get('conversationService') || 
      getConversationService(req.app.get('mcpToolAdapter'), taskExecutorService);
    const conversation = await conversationService.getConversation(task.conversationId);
    
    res.json({
      success: true,
      data: {
        taskId,
        conversation
      }
    });
  } catch (error) {
    logger.error(`获取任务相关对话错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

export default router; 