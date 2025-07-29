import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { MCPInfo } from '../models/mcp.js';
import { optionalAuth } from '../middleware/auth.js';
import { getAllPredefinedMCPs, getMCPsByCategory, getAllMCPCategories, getPredefinedMCP } from '../services/predefinedMCPs.js';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = Router();

/**
 * 获取所有MCP
 * GET /api/mcp
 */
router.get('/', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const mcps = getAllPredefinedMCPs();
    
    res.json({
      success: true,
      data: mcps
    });
  } catch (error) {
    logger.error(`Error getting MCP list:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 按类别获取MCP
 * GET /api/mcp/category/:category
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const category = req.params.category;
    const mcpsByCategory = getMCPsByCategory(category);
    
    res.json({
      success: true,
      data: {
        category,
        mcps: mcpsByCategory
      }
    });
  } catch (error) {
    logger.error(`Error getting MCP list by category:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取所有可用的MCP类别
 * GET /api/mcp/categories
 */
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = getAllMCPCategories().map(category => ({ name: category, count: getMCPsByCategory(category).length }));
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error(`Error getting MCP category list:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 获取连接池状态
 * GET /api/mcp/pool-status
 */
router.get('/pool-status', requireAuth, async (req: Request & { user?: User }, res: Response) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 获取连接池状态
    const poolStatus = mcpManager.getPoolStatus();
    
    // 如果是普通用户，只返回自己的连接信息
    const userId = req.user?.id;
    if (userId) {
      const userConnections = poolStatus.connectionDetails.filter((conn: any) => conn.userId === userId);
      return res.json({
        success: true,
        data: {
          userConnectionCount: poolStatus.userConnectionCounts[userId] || 0,
          maxConnectionsPerUser: parseInt(process.env.MAX_CONNECTIONS_PER_USER || '10'),
          connections: userConnections
        }
      });
    }
    
    // 返回所有连接信息（可以根据需要添加权限控制）
    res.json({
      success: true,
      data: {
        ...poolStatus,
        config: {
          maxConnectionsPerUser: parseInt(process.env.MAX_CONNECTIONS_PER_USER || '10'),
          maxTotalConnections: parseInt(process.env.MAX_TOTAL_CONNECTIONS || '100'),
          connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '1800000'),
          cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000')
        }
      }
    });
  } catch (error) {
    logger.error('获取连接池状态失败:', error);
    res.status(500).json({ 
      error: 'Failed to get pool status', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 手动清理超时连接
 * POST /api/mcp/cleanup-connections
 */
router.post('/cleanup-connections', requireAuth, async (req: Request & { user?: User }, res: Response) => {
  try {
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({ error: 'MCPManager not available' });
    }
    
    // 手动触发清理
    const beforeStatus = mcpManager.getPoolStatus();
    await mcpManager.cleanupTimeoutConnections();
    const afterStatus = mcpManager.getPoolStatus();
    
    res.json({
      success: true,
      data: {
        message: 'Cleanup completed',
        before: {
          totalConnections: beforeStatus.totalConnections,
          userConnectionCounts: beforeStatus.userConnectionCounts
        },
        after: {
          totalConnections: afterStatus.totalConnections,
          userConnectionCounts: afterStatus.userConnectionCounts
        },
        cleanedConnections: beforeStatus.totalConnections - afterStatus.totalConnections
      }
    });
  } catch (error) {
    logger.error('手动清理连接失败:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup connections', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 根据ID获取MCP详情
 * GET /api/mcp/:id
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const mcpId = req.params.id;
    const mcp = getPredefinedMCP(mcpId);
    
    if (!mcp) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `MCP with ID ${mcpId} not found`
      });
    }
    
    res.json({
      success: true,
      data: mcp
    });
  } catch (error) {
    logger.error(`Error getting MCP details [MCP ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
});

/**
 * 测试MCP连接并返回详细错误信息
 * POST /api/mcp/test-connection
 */
router.post('/test-connection', requireAuth, async (req: Request & { user?: User }, res: Response) => {
  try {
    const { mcpName, authData } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    if (!mcpName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing required field: mcpName'
      });
    }

    logger.info(`🔧 Testing MCP connection [User: ${userId}, MCP: ${mcpName}]`);

    // 获取MCP配置
    const mcpConfig = getPredefinedMCP(mcpName);
         if (!mcpConfig) {
       return res.status(404).json({
         success: false,
         error: {
           type: 'MCP_NOT_FOUND',
           title: 'MCP Not Found',
           message: 'The specified MCP service does not exist',
           suggestions: ['Check if the MCP name is correct', 'View the list of available MCPs'],
           isRetryable: false,
           requiresUserAction: true,
           mcpName
         }
       });
     }

    // 如果提供了认证数据，注入到环境变量中
    let testEnv = { ...mcpConfig.env };
    if (authData && typeof authData === 'object') {
      Object.entries(authData).forEach(([key, value]) => {
        if (testEnv.hasOwnProperty(key)) {
          testEnv[key] = value as string;
        }
      });
    }

    // 获取MCP管理器实例
    const mcpManager = req.app.get('mcpManager');
    if (!mcpManager) {
      return res.status(500).json({
        success: false,
        error: {
          type: 'INTERNAL_ERROR',
          title: '服务内部错误',
          message: 'MCP管理器不可用',
          suggestions: ['稍后重试', '联系技术支持'],
          isRetryable: true,
          requiresUserAction: false
        }
      });
    }

    // 生成测试连接键，避免与正常连接冲突
    const testConnectionName = `${mcpName}_test_${Date.now()}`;
    
    try {
      // 尝试连接
      await mcpManager.connect(testConnectionName, mcpConfig.command, mcpConfig.args, testEnv, userId);
      
      // 测试获取工具列表
      const tools = await mcpManager.getTools(testConnectionName, userId);
      
      // 连接成功，立即断开测试连接
      await mcpManager.disconnect(testConnectionName, userId);
      
      res.json({
        success: true,
        data: {
          message: 'MCP连接测试成功',
          mcpName,
          toolCount: tools.length,
          connectionTest: {
            status: 'success',
            testTime: new Date().toISOString()
          }
        }
      });

    } catch (testError) {
      // 确保测试连接被清理
      try {
        await mcpManager.disconnect(testConnectionName, userId);
      } catch (cleanupError) {
        logger.warn(`清理测试连接失败 [${testConnectionName}]:`, cleanupError);
      }

      // Analyze error and return detailed information
      const { MCPErrorHandler } = await import('../services/mcpErrorHandler.js');
      const errorToAnalyze = testError instanceof Error ? testError : new Error(String(testError));
      const errorDetails = await MCPErrorHandler.analyzeError(errorToAnalyze, mcpName);
      const formattedError = MCPErrorHandler.formatErrorForFrontend(errorDetails);

      logger.error(`MCP connection test failed [User: ${userId}, MCP: ${mcpName}]:`, testError);

      res.status(errorDetails.httpStatus || 500).json({
        success: false,
        ...formattedError
      });
    }

  } catch (error) {
    logger.error('MCP connection test exception:', error);
    
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

export default router; 