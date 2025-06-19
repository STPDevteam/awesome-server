import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/auth/jwtService.js';
import { userService } from '../services/auth/userService.js';
import { User } from '../models/User.js';

// 扩展Request接口，添加用户信息
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * 认证中间件 - 要求用户必须登录
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '缺少访问令牌'
      });
    }

    const payload = jwtService.verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '无效的访问令牌'
      });
    }

    const user = await userService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '用户不存在或已禁用'
      });
    }

    // 将用户信息添加到请求对象
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
};

/**
 * 可选认证中间件 - 如果有令牌则验证，但不强制要求
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (token) {
      const payload = jwtService.verifyAccessToken(token);
      if (payload) {
        const user = await userService.getUserById(payload.userId);
        if (user && user.isActive) {
          req.user = user;
          req.userId = user.id;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('可选认证中间件错误:', error);
    // 不阻止请求继续，即使认证失败
    next();
  }
};

/**
 * 钱包地址验证中间件 - 确保用户拥有钱包地址
 */
export const requireWallet = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.walletAddress) {
    return res.status(403).json({
      error: 'Forbidden',
      message: '此操作需要连接钱包'
    });
  }
  next();
};

/**
 * 管理员权限中间件（预留，用于后续管理功能）
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  // 这里可以添加管理员权限验证逻辑
  // 目前先简单检查用户是否存在
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: '需要管理员权限'
    });
  }
  next();
};

/**
 * 速率限制中间件配置
 */
import rateLimit from 'express-rate-limit';

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 999999, // 最多5次尝试
  message: {
    error: 'Too Many Requests',
    message: '登录尝试次数过多，请15分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 最多100次请求
  message: {
    error: 'Too Many Requests',
    message: '请求次数过多，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
}); 