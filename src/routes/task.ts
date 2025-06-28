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
const taskAnalysisService = new TaskAnalysisService();
const mcpAlternativeService = new MCPAlternativeService();

// 获取mcpManager实例，将在应用启动时通过app.set设置x
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

// MCP验证Schema (单个)
const verifyMCPAuthSchema = z.object({
  mcpName: z.string().min(1, 'MCP name cannot be empty'),
  authData: z.record(z.string()),
  saveForLater: z.boolean().optional(),
  userId: z.string().optional()
});

// 批量MCP验证Schema (多个)
const verifyMultipleMCPAuthSchema = z.object({
  mcpAuths: z.array(z.object({
    mcpName: z.string().min(1, 'MCP name cannot be empty'),
    authData: z.record(z.string())
  })).min(1, 'At least one MCP authentication is required'),
  saveForLater: z.boolean().optional(),
  userId: z.string().optional()
});

// 替换MCP Schema
const replaceMCPSchema = z.object({
  originalMcpName: z.string().min(1, 'Original MCP name cannot be empty'),
  newMcpName: z.string().min(1, 'New MCP name cannot be empty')
});

// 批量替换MCP Schema
const batchReplaceMCPSchema = z.object({
  replacements: z.array(z.object({
    originalMcpName: z.string().min(1, 'Original MCP name cannot be empty'),
    newMcpName: z.string().min(1, 'New MCP name cannot be empty')
  })).min(1, 'At least one replacement is required'),
  userId: z.string().optional()
});

// 确认替换MCP Schema
const confirmReplacementSchema = z.object({
  replacements: z.array(z.object({
    originalMcpName: z.string().min(1, 'Original MCP name cannot be empty'),
    newMcpName: z.string().min(1, 'New MCP name cannot be empty')
  })).min(1, 'At least one replacement is required'),
  userId: z.string().optional()
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

// 添加12306 MCP测试路由
router.post('/test-12306-mcp', async (req, res) => {
  try {
    // 获取服务实例
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 检查12306 MCP是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const trainConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === '12306-mcp');
    
    // 如果未连接，尝试连接
    if (!trainConnected) {
      logger.info('12306 MCP未连接，尝试连接...');
      const trainMCP = getPredefinedMCP('12306-mcp');
      if (!trainMCP) {
        return res.status(500).json({ error: '12306 MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(trainMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to 12306 MCP' });
      }
      logger.info('12306 MCP连接成功');
    }
    
    // 获取12306 MCP的工具列表
    logger.info('获取12306 MCP工具列表...');
    const tools = await mcpManager.getTools('12306-mcp');
    
    // 返回结果
    res.json({
      success: true,
      message: '12306 MCP test successful',
      tools: tools
    });
  } catch (error) {
    logger.error('12306 MCP test failed:', error);
    res.status(500).json({ 
      error: '12306 MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加GitHub MCP测试路由
router.post('/test-github-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const githubConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'github-mcp-server');
    
    if (!githubConnected) {
      logger.info('GitHub MCP未连接，尝试连接...');
      const githubMCP = getPredefinedMCP('github-mcp-server');
      if (!githubMCP) {
        return res.status(500).json({ error: 'GitHub MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(githubMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to GitHub MCP' });
      }
      logger.info('GitHub MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('github-mcp-server');
    
    res.json({
      success: true,
      message: 'GitHub MCP test successful',
      tools: tools
    });
  } catch (error) {
    logger.error('GitHub MCP test failed:', error);
    res.status(500).json({ 
      error: 'GitHub MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加EVM MCP测试路由
router.post('/test-evm-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const evmConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'evm-mcp');
    
    if (!evmConnected) {
      logger.info('EVM MCP未连接，尝试连接...');
      const evmMCP = getPredefinedMCP('evm-mcp');
      if (!evmMCP) {
        return res.status(500).json({ error: 'EVM MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(evmMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to EVM MCP' });
      }
      logger.info('EVM MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('evm-mcp');
    
    res.json({
      success: true,
      message: 'EVM MCP test successful',
      tools: tools,
      supportedNetworks: [
        'ethereum', 'optimism', 'arbitrum', 'base', 'polygon', 'avalanche', 'bsc',
        'zksync-era', 'linea', 'celo', 'gnosis', 'fantom', 'filecoin'
      ]
    });
  } catch (error) {
    logger.error('EVM MCP test failed:', error);
    res.status(500).json({ 
      error: 'EVM MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加DexScreener MCP测试路由
router.post('/test-dexscreener-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const dexscreenerConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'dexscreener-mcp-server');
    
    if (!dexscreenerConnected) {
      logger.info('DexScreener MCP未连接，尝试连接...');
      const dexscreenerMCP = getPredefinedMCP('dexscreener-mcp-server');
      if (!dexscreenerMCP) {
        return res.status(500).json({ error: 'DexScreener MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(dexscreenerMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to DexScreener MCP' });
      }
      logger.info('DexScreener MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('dexscreener-mcp-server');
    
    res.json({
      success: true,
      message: 'DexScreener MCP test successful',
      tools: tools,
      features: [
        'Real-time DEX pair data',
        'Token profiles and boosted tokens',
        'Multi-chain support',
        'Rate-limited API access',
        'Market statistics and analytics'
      ],
      availableTools: [
        'get_latest_token_profiles',
        'get_latest_boosted_tokens', 
        'get_top_boosted_tokens',
        'get_token_orders',
        'get_pairs_by_chain_and_address',
        'get_pairs_by_token_addresses',
        'search_pairs'
      ]
    });
  } catch (error) {
    logger.error('DexScreener MCP test failed:', error);
    res.status(500).json({ 
      error: 'DexScreener MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加X MCP测试路由
router.post('/test-x-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const xConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'x-mcp');
    
    if (!xConnected) {
      logger.info('X MCP未连接，尝试连接...');
      const xMCP = getPredefinedMCP('x-mcp');
      if (!xMCP) {
        return res.status(500).json({ error: 'X MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(xMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to X MCP' });
      }
      logger.info('X MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('x-mcp');
    
    res.json({
      success: true,
      message: 'X MCP test successful',
      tools: tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description
      })),
      toolCount: tools.length
    });
  } catch (error) {
    logger.error('X MCP测试失败:', error);
    res.status(500).json({ error: 'Failed to connect to X MCP' });
  }
});

// 添加CoinGecko MCP测试路由
router.post('/test-coingecko-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const coingeckoConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'coingecko-mcp');
    
    if (!coingeckoConnected) {
      logger.info('CoinGecko MCP未连接，尝试连接...');
      const coingeckoMCP = getPredefinedMCP('coingecko-mcp');
      if (!coingeckoMCP) {
        return res.status(500).json({ error: 'CoinGecko MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(coingeckoMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to CoinGecko MCP' });
      }
      logger.info('CoinGecko MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('coingecko-mcp');
    
    res.json({
      success: true,
      message: 'CoinGecko MCP test successful',
      tools: tools
    });
  } catch (error) {
    logger.error('CoinGecko MCP test failed:', error);
    res.status(500).json({ 
      error: 'CoinGecko MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加Notion MCP测试路由
router.post('/test-notion-mcp', async (req, res) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const notionConnected = connectedMCPs.some((mcp: MCPService) => mcp.name === 'notion-mcp-server');
    
    if (!notionConnected) {
      logger.info('Notion MCP未连接，尝试连接...');
      const notionMCP = getPredefinedMCP('notion-mcp-server');
      if (!notionMCP) {
        return res.status(500).json({ error: 'Notion MCP configuration not found' });
      }
      
      const connected = await mcpManager.connectPredefined(notionMCP);
      if (!connected) {
        return res.status(500).json({ error: 'Failed to connect to Notion MCP' });
      }
      logger.info('Notion MCP连接成功');
    }
    
    const tools = await mcpManager.getTools('notion-mcp-server');
    
    res.json({
      success: true,
      message: 'Notion MCP test successful',
      tools: tools
    });
  } catch (error) {
    logger.error('Notion MCP test failed:', error);
    res.status(500).json({ 
      error: 'Notion MCP test failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加获取所有MCP类别的路由
router.get('/mcp-categories', async (req, res) => {
  try {
    const { getAllMCPCategories } = await import('../services/predefinedMCPs.js');
    const categories = getAllMCPCategories();
    
    res.json({
      success: true,
      data: {
        categories,
        count: categories.length
      }
    });
  } catch (error) {
    logger.error('获取MCP类别失败:', error);
    res.status(500).json({ 
      error: '获取MCP类别失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加根据类别获取MCP的路由
router.get('/mcp-by-category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const { getMCPsByCategory } = await import('../services/predefinedMCPs.js');
    const mcps = getMCPsByCategory(category);
    
    res.json({
      success: true,
      data: {
        category,
        mcps,
        count: mcps.length
      }
    });
  } catch (error) {
    logger.error(`获取类别 ${req.params.category} 的MCP失败:`, error);
    res.status(500).json({ 
      error: '获取MCP失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 添加获取所有预定义MCP的路由
router.get('/all-predefined-mcps', async (req, res) => {
  try {
    const { getAllPredefinedMCPs } = await import('../services/predefinedMCPs.js');
    const mcps = getAllPredefinedMCPs();
    
    res.json({
      success: true,
      data: {
        mcps,
        count: mcps.length,
        categories: [...new Set(mcps.map(mcp => mcp.category))]
      }
    });
  } catch (error) {
    logger.error('获取所有预定义MCP失败:', error);
    res.status(500).json({ 
      error: '获取所有预定义MCP失败', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 创建或更新任务
 * POST /api/task[/:id]
 */
router.post(['/', '/:id'], requireAuth, async (req: Request, res: Response) => {
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
router.get('/', requireAuth, async (req: Request, res: Response) => {
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
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
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
 * 验证MCP授权
 * POST /api/task/:id/verify-auth
 */
router.post('/:id/verify-auth', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const validationResult = verifyMCPAuthSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters'
      });
    }
    
    const { mcpName, authData, userId: bodyUserId } = validationResult.data;
    const task = await taskService.getTaskById(taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    const userId = req.user?.id || bodyUserId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID is required'
      });
    }
    
    // 确保用户只能为自己的任务验证授权
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to verify authorization for this task'
      });
    }
    
    // 验证授权
    const verificationResult = await mcpAuthService.verifyAuth(
      userId,
      mcpName,
      authData
    );
    
    // 只有在验证成功时，才更新任务的工作流
    if (verificationResult.success) {
      await mcpAuthService.updateTaskMCPAuthStatus(
        taskId,
        userId,
        mcpName,
        true // 明确设置为 true
      );
    }
    
    if (verificationResult.success) {
      // 成功时返回带data的格式
      res.json({
        success: true,
        message: verificationResult.message,
        data: {
          verified: true,
          details: verificationResult.details,
          mcpName
        }
      });
    } else {
      // 失败时返回统一的error格式
      res.json({
        success: false,
        error: 'Verification Failed',
        message: verificationResult.message
      });
    }
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
 * 验证MCP替换的合理性
 * POST /api/task/:id/validate-mcp-replacement
 */
router.post('/:id/validate-mcp-replacement', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const { originalMcpName, newMcpName } = req.body;
    
    if (!originalMcpName || !newMcpName) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '缺少必要参数：originalMcpName 和 newMcpName'
      });
    }
    
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    const userId = req.user?.id || req.body.userId;
    if (userId && task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to validate replacement for this task'
      });
    }
    
    // 验证MCP替换的合理性
    const validationResult = await mcpAlternativeService.validateMCPReplacement(
      originalMcpName,
      newMcpName,
      task.content
    );
    
    res.json({
      success: true,
      data: {
        validation: validationResult,
        originalMcp: originalMcpName,
        newMcp: newMcpName,
        taskId
      }
    });
  } catch (error) {
    logger.error(`验证MCP替换错误 [任务ID: ${req.params.id}]:`, error);
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
router.post('/:id/analyze/stream', requireAuth, async (req: Request, res: Response) => {
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
router.post('/:id/execute/stream', requireAuth, async (req: Request, res: Response) => {
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
router.get('/:id/conversation', requireAuth, async (req: Request, res: Response) => {
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

/**
 * 批量替换MCP并重新分析任务（流式版本）
 * POST /api/task/:id/batch-replace-mcp/stream
 */
router.post('/:id/batch-replace-mcp/stream', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const validationResult = batchReplaceMCPSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }
    
    const { replacements } = validationResult.data;
    
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID'
      });
    }
    
    // 确保用户只能替换自己的任务中的MCP
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to replace MCP for this task'
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
    
    // 发送批量替换开始信息
    streamHandler({ 
      event: 'batch_replacement_start', 
      data: { 
        taskId, 
        replacements,
        totalReplacements: replacements.length,
        timestamp: new Date().toISOString() 
      } 
    });
    
    // 执行批量替换和重新分析（流式版本）
    const batchReplacementStarted = mcpAlternativeService.batchReplaceAndReanalyzeTaskStream(
      taskId,
      replacements,
      streamHandler
    );
    
    // 替换结束后发送完成标记
    batchReplacementStarted
      .then((success: boolean) => {
        if (!success) {
          res.write(`data: ${JSON.stringify({ 
            event: 'error', 
            data: { message: 'Batch MCP replacement and reanalysis failed' } 
          })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式批量替换MCP错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: 'Error occurred during batch MCP replacement and reanalysis',
            details: error instanceof Error ? error.message : String(error)
          } 
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`流式批量替换MCP错误 [任务ID: ${req.params.id}]:`, error);
    
    // 对于初始设置错误，使用标准JSON响应
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 确认替换MCP并重新分析任务（流式版本）
 * POST /api/task/:id/confirm-replacement/stream
 */
router.post('/:id/confirm-replacement/stream', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const validationResult = confirmReplacementSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request parameters',
        details: validationResult.error.errors
      });
    }
    
    const { replacements } = validationResult.data;
    
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found'
      });
    }
    
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing user ID'
      });
    }
    
    // 确保用户只能确认替换自己的任务中的MCP
    if (task.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'No permission to confirm replacement for this task'
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
    
    // 发送确认替换开始信息
    streamHandler({ 
      event: 'confirmation_start', 
      data: { 
        taskId, 
        replacements,
        totalReplacements: replacements.length,
        timestamp: new Date().toISOString() 
      } 
    });
    
    logger.info(`🔄 用户确认流式替换MCP [任务: ${taskId}, 替换数量: ${replacements.length}]`);
    
    // 执行确认的替换操作（流式版本）
    const confirmStarted = mcpAlternativeService.batchReplaceAndReanalyzeTaskStream(
      taskId,
      replacements,
      streamHandler
    );
    
    // 替换结束后发送完成标记
    confirmStarted
      .then((success: boolean) => {
        if (!success) {
          res.write(`data: ${JSON.stringify({ 
            event: 'error', 
            data: { message: 'MCP replacement confirmation failed' } 
          })}\n\n`);
        } else {
          // 发送确认完成事件
          res.write(`data: ${JSON.stringify({ 
            event: 'confirmation_complete', 
            data: { 
              taskId,
              message: 'MCP replacement confirmed and task reanalysis completed',
              confirmed: true
            } 
          })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      })
      .catch((error: Error) => {
        logger.error(`流式确认替换MCP错误 [任务ID: ${taskId}]:`, error);
        res.write(`data: ${JSON.stringify({ 
          event: 'error', 
          data: { 
            message: 'Error occurred during MCP replacement confirmation',
            details: error instanceof Error ? error.message : String(error)
          } 
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
  } catch (error) {
    logger.error(`流式确认替换MCP错误 [任务ID: ${req.params.id}]:`, error);
    
    // 对于初始设置错误，使用标准JSON响应
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

export default router; 