import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { MCPInfo } from '../models/mcp.js';
import { optionalAuth } from '../middleware/auth.js';
import { mcpInfoService } from '../services/mcpInfoService.js';

const router = Router();

/**
 * 获取所有MCP
 * GET /api/mcp
 */
router.get('/', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const mcps = mcpInfoService.getAllMCPs();
    
    res.json({
      success: true,
      data: mcps
    });
  } catch (error) {
    logger.error(`获取MCP列表失败:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
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
    const mcpsByCategory = mcpInfoService.getMCPsByCategory(category);
    
    res.json({
      success: true,
      data: {
        category,
        mcps: mcpsByCategory
      }
    });
  } catch (error) {
    logger.error(`获取指定类别的MCP列表失败:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取所有可用的MCP类别
 * GET /api/mcp/categories
 */
router.get('/categories', optionalAuth, async (_req: Request, res: Response) => {
  try {
    const categories = mcpInfoService.getAllCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error(`获取MCP类别列表失败:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
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
    const mcp = mcpInfoService.getMCPById(mcpId);
    
    if (!mcp) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `未找到ID为 ${mcpId} 的MCP`
      });
    }
    
    res.json({
      success: true,
      data: mcp
    });
  } catch (error) {
    logger.error(`获取MCP详情失败 [MCP ID: ${req.params.id}]:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

export default router; 