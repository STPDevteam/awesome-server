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
router.get('/category/:category', optionalAuth, async (req: Request, res: Response) => {
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
router.get('/categories', optionalAuth, async (_req: Request, res: Response) => {
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

export default router; 