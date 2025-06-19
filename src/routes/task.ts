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
import { MCPManager } from '../services/mcpManager.js';
import { AVAILABLE_MCPS } from '../services/llmTasks/taskAnalysisService.js';

const router = Router();

// 创建服务实例
const taskService = getTaskService();
const mcpManager = new MCPManager();
const mcpAuthService = new MCPAuthService(mcpManager);
const taskAnalysisService = new TaskAnalysisService(mcpManager);
const mcpAlternativeService = new MCPAlternativeService(AVAILABLE_MCPS);
const taskExecutorService = new TaskExecutorService(mcpManager, mcpAuthService);

// 验证请求内容的Schema
const generateTitleSchema = z.object({
  content: z.string().min(1, '任务内容至少需要1个字符')
});

// 创建任务的Schema
const createTaskSchema = z.object({
  // todo 最大要限制多少
  content: z.string().min(1, '任务内容至少需要1个字符'),
  title: z.string().optional() // 标题可选，如果未提供将使用LLM生成
});

// MCP验证Schema
const verifyMCPAuthSchema = z.object({
  mcpName: z.string().min(1, 'MCP名称不能为空'),
  authData: z.record(z.string(), z.string()),
  saveForLater: z.boolean().optional()
});

// 替换MCP Schema
const replaceMCPSchema = z.object({
  originalMcpName: z.string().min(1, '原MCP名称不能为空'),
  newMcpName: z.string().min(1, '新MCP名称不能为空')
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
router.post('/', optionalAuth, async (req: Request, res: Response) => {
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

    // 创建任务 - 如果req.user不存在，则使用请求体中的userId
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId参数或使用有效的认证令牌'
      });
    }

    const task = await taskService.createTask({
      userId,
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
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { status, limit, offset, sortBy, sortDir } = req.query;
    
    // 从URL查询参数获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId查询参数或使用有效的认证令牌'
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
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
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
    
    // 从URL查询参数获取userId或使用req.user.id
    const userId = req.user?.id || req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId查询参数或使用有效的认证令牌'
      });
    }
    
    // 确保用户只能访问自己的任务
    if (task.userId !== userId) {
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

/**
 * 分析任务
 * POST /api/task/:id/analyze
 */
router.post('/:id/analyze', optionalAuth, async (req: Request, res: Response) => {
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
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId参数或使用有效的认证令牌'
      });
    }
    
    // 确保用户只能分析自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权分析该任务'
      });
    }
    
    // 执行任务分析（异步处理）
    const analysisStarted = await taskAnalysisService.analyzeTask(taskId);
    
    if (!analysisStarted) {
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: '任务分析启动失败'
      });
    }
    
    res.json({
      success: true,
      data: {
        message: '任务分析已启动',
        taskId
      }
    });
  } catch (error) {
    logger.error(`分析任务错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
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
        message: '无效的请求参数',
        details: validationResult.error.errors
      });
    }
    
    const { mcpName, authData, saveForLater } = validationResult.data;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: '任务不存在'
      });
    }
    
    // 确保用户只能为自己的任务验证授权
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权为该任务验证授权'
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
    logger.error(`验证MCP授权错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取MCP替代选项
 * GET /api/task/:id/mcp-alternatives/:mcpName
 */
router.get('/:id/mcp-alternatives/:mcpName',  async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const mcpName = req.params.mcpName;
    
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: '任务不存在'
      });
    }
    
    // 确保用户只能为自己的任务获取替代选项
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权为该任务获取替代选项'
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
        message: '任务不存在'
      });
    }
    
    // 确保用户只能为自己的任务替换MCP
    if (task.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权为该任务替换MCP'
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
 * 提交执行任务
 * POST /api/task/:id/execute
 */
router.post('/:id/execute', optionalAuth, async (req: Request, res: Response) => {
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
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId参数或使用有效的认证令牌'
      });
    }
    
    // 确保用户只能执行自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权执行该任务'
      });
    }
    
    // 检查是否所有需要授权的MCP都已验证
    const allVerified = await mcpAuthService.checkAllMCPsVerified(taskId);
    
    if (!allVerified) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '请先验证所有必要的MCP授权'
      });
    }
    
    // 开始执行任务（异步处理）
    const executionStarted = await taskExecutorService.executeTask(taskId);
    
    if (!executionStarted) {
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: '任务执行启动失败'
      });
    }
    
    res.json({
      success: true,
      data: {
        message: '任务执行已启动',
        taskId
      }
    });
  } catch (error) {
    logger.error(`执行任务错误 [任务ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
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
        message: '任务不存在'
      });
    }
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId参数或使用有效的认证令牌'
      });
    }
    
    // 确保用户只能分析自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权分析该任务'
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
          res.write(`data: ${JSON.stringify({ event: 'error', data: { message: '任务分析失败' } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式分析任务错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: '任务分析过程中发生错误',
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
      message: '服务器内部错误'
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
        message: '任务不存在'
      });
    }
    
    // 从请求体获取userId或使用req.user.id
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少用户ID，请提供userId参数或使用有效的认证令牌'
      });
    }
    
    // 确保用户只能执行自己的任务
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '无权执行该任务'
      });
    }
    
    // 检查是否所有需要授权的MCP都已验证
    const allVerified = await mcpAuthService.checkAllMCPsVerified(taskId);
    
    if (!allVerified) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '请先验证所有必要的MCP授权'
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
          res.write(`data: ${JSON.stringify({ event: 'error', data: { message: '任务执行失败' } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式执行任务错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: '任务执行过程中发生错误',
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
      message: '服务器内部错误'
    });
  }
});

export default router; 