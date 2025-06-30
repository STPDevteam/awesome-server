import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/auth/jwtService.js';
import { userService } from '../services/auth/userService.js';
import { User } from '../models/User.js';

// Extend Request interface to add user information
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * Authentication middleware - requires user to be logged in
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // In test environment, can set environment variable to skip authentication
  if (process.env.MCP_SKIP_AUTH === 'true') {
    // Mock a user attached to request for subsequent middleware or route handlers
    req.user = {
      id: 'test-user-id',
      username: 'test-user',
      email: 'test@example.com',
      avatar: 'https://i.pravatar.cc/150?u=test-user-id',
      walletAddress: '0x0000000000000000000000000000000000000000',
      balance: '0',
      loginMethods: {
        wallet: {
          address: '0x0000000000000000000000000000000000000000',
          verified: true
        }
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    } as User;
    req.userId = 'test-user-id';
    return next();
  }

  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing access token'
      });
    }

    const payload = jwtService.verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid access token'
      });
    }

    const user = await userService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User does not exist or is disabled'
      });
    }

    // Add user info to request object
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Internal server error'
    });
  }
};

/**
 * Optional authentication middleware - validates token if present but not required
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
    console.error('Optional authentication middleware error:', error);
    // Don't block request from continuing even if authentication fails
    next();
  }
};

/**
 * Wallet address verification middleware - ensures user has wallet address
 */
export const requireWallet = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.walletAddress) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This operation requires a connected wallet'
    });
  }
  next();
};

/**
 * Admin permission middleware (reserved for future management features)
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  // Admin permission verification logic can be added here
  // For now just check if user exists
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin privileges required'
    });
  }
  next();
};

/**
 * Rate limit middleware configuration
 */
import rateLimit from 'express-rate-limit';

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Max 5 attempts
  message: {
    error: 'Too Many Requests',
    message: 'Too many login attempts, please try again in 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Max 100 requests
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
}); 