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
    const mcpsByCategory = mcpInfoService.getMCPsByCategory(category);
    
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
    const categories = mcpInfoService.getAllCategories();
    
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