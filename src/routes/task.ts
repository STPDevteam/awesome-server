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
import { SimpleMCPAdapter } from '../services/simpleMcpAdapter.js';
import { AVAILABLE_MCPS } from '../services/llmTasks/taskAnalysisService.js';

const router = Router();

// 创建服务实例
const taskService = getTaskService();
const mcpManager = new MCPManager();

// 根据环境选择适当的MCP适配器
const adapterType = process.env.MCP_ADAPTER_TYPE || 'simple';
let mcpAdapter;

if (adapterType === 'simple') {
  // 使用SimpleMCPAdapter，它会根据环境自动选择stdio或HTTP模式
  mcpAdapter = new SimpleMCPAdapter();
  logger.info('Task路由使用SimpleMCPAdapter，自动选择适当模式');
} else {
  // 使用传统的MCPManager
  mcpAdapter = null;
  logger.info('Task路由使用传统的MCPManager');
}

const mcpAuthService = new MCPAuthService(mcpManager);
const taskAnalysisService = new TaskAnalysisService(mcpManager);
const mcpAlternativeService = new MCPAlternativeService(AVAILABLE_MCPS);
const taskExecutorService = new TaskExecutorService(mcpManager, mcpAuthService);

// 如果使用SimpleMCPAdapter，预先连接常用MCP
if (mcpAdapter instanceof SimpleMCPAdapter) {
  // 在应用启动时连接常用MCP
  (async () => {
    try {
      // 使用Node.js内置模块作为MCP工具的命令
      // 这些命令在大多数系统上都存在，可以作为模拟MCP使用
      await mcpAdapter.connectMCP('GitHubTool', 'node', ['-e', 'console.log(JSON.stringify({name:"GitHubTool"}))']);
      await mcpAdapter.connectMCP('GoogleSearchTool', 'node', ['-e', 'console.log(JSON.stringify({name:"GoogleSearchTool"}))']);
      await mcpAdapter.connectMCP('FileSystemTool', 'node', ['-e', 'console.log(JSON.stringify({name:"FileSystemTool"}))']);
      await mcpAdapter.connectMCP('WebBrowserTool', 'node', ['-e', 'console.log(JSON.stringify({name:"WebBrowserTool"}))']);
      
      logger.info('预连接常用MCP成功');
    } catch (error) {
      logger.error('预连接MCP失败:', error);
    }
  })();
}

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
          message: '任务不存在'
        });
      }
      
      // 从URL查询参数获取userId或使用req.user.id
      const userId = req.user?.id || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: '缺少用户ID，请提供userId查询参数或使用有效的认证令牌'
        });
      }
      
      // 确保用户只能更新自己的任务
      if (existingTask.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: '无权更新该任务'
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

      return res.json({
      success: true,
      data: {
        task
      }
    });
    }
  } catch (error) {
    logger.error('创建或更新任务错误:', error);
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
    
    // 更新任务状态为处理中
    await taskService.updateTask(taskId, { status: 'in_progress' });
    
    // 执行任务分析（同步处理）
    const startTime = Date.now();
    
    // 步骤1: 分析任务需求
    const requirementsResult = await taskAnalysisService.analyzeRequirements(task.content);
    
    // 记录步骤1结果
    await taskService.createTaskStep({
      taskId,
      stepType: 'analysis',
      title: '分析任务需求',
      content: requirementsResult.content,
      reasoning: requirementsResult.reasoning,
      reasoningTime: Date.now() - startTime,
      orderIndex: 1
    });
    
    // 步骤2: 识别最相关的MCP
    const mcpStartTime = Date.now();
    const mcpResult = await taskAnalysisService.identifyRelevantMCPs(
      task.content, 
      requirementsResult.content
    );
    
    // 记录步骤2结果
    await taskService.createTaskStep({
      taskId,
      stepType: 'mcp_selection',
      title: '识别最相关的MCP工具',
      content: mcpResult.content,
      reasoning: mcpResult.reasoning,
      reasoningTime: Date.now() - mcpStartTime,
      orderIndex: 2
    });
    
    // 步骤3: 确认可交付内容
    const deliverablesStartTime = Date.now();
    const deliverablesResult = await taskAnalysisService.confirmDeliverables(
      task.content,
      requirementsResult.content,
      mcpResult.recommendedMCPs
    );
    
    // 记录步骤3结果
    await taskService.createTaskStep({
      taskId,
      stepType: 'deliverables',
      title: '确认可交付内容',
      content: deliverablesResult.content,
      reasoning: deliverablesResult.reasoning,
      reasoningTime: Date.now() - deliverablesStartTime,
      orderIndex: 3
    });
    
    // 步骤4: 构建MCP工作流
    const workflowStartTime = Date.now();
    const workflowResult = await taskAnalysisService.buildMCPWorkflow(
      task.content,
      requirementsResult.content,
      mcpResult.recommendedMCPs,
      deliverablesResult.canBeFulfilled,
      deliverablesResult.deliverables
    );
    
    // 记录步骤4结果
    await taskService.createTaskStep({
      taskId,
      stepType: 'workflow',
      title: '构建MCP工作流',
      content: workflowResult.content,
      reasoning: workflowResult.reasoning,
      reasoningTime: Date.now() - workflowStartTime,
      orderIndex: 4
    });
    
    // 创建MCP工作流信息
    const mcpWorkflow = {
      mcps: mcpResult.recommendedMCPs.map(mcp => ({
        name: mcp.name,
        description: mcp.description,
        authRequired: mcp.authRequired,
        authFields: mcp.authFields || [], // 确保返回认证字段
        capabilities: mcp.capabilities || [] // 返回工具能力
      })),
      workflow: workflowResult.workflow
    };
    
    // 更新任务的MCP工作流信息
    await taskService.updateTask(taskId, { mcpWorkflow });
    
    // 返回分析结果
    res.json({
      success: true,
      data: {
        message: '任务分析完成',
        taskId,
        analysis: {
          requirements: requirementsResult,
          mcps: mcpResult.recommendedMCPs.map(mcp => ({
            name: mcp.name,
            description: mcp.description,
            authRequired: mcp.authRequired,
            authFields: mcp.authFields || [],
            capabilities: mcp.capabilities || []
          })),
          deliverables: {
            canBeFulfilled: deliverablesResult.canBeFulfilled,
            items: deliverablesResult.deliverables
          },
          workflow: workflowResult.workflow
        },
        mcpWorkflow
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
    
    // 检查是否所有需要授权的MCP都已验证，除非skipAuthCheck参数为true（测试用途）
    const skipAuthCheck = req.body.skipAuthCheck === true;
    if (!skipAuthCheck) {
    const allVerified = await mcpAuthService.checkAllMCPsVerified(taskId);
    
    if (!allVerified) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '请先验证所有必要的MCP授权'
      });
      }
    } else {
      logger.info(`跳过MCP授权检查 [任务ID: ${taskId}, 测试模式]`);
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