import express from 'express';
import { getS3AvatarService } from '../services/s3AvatarService.js';
import { userService } from '../services/auth/userService.js';
import { walletAuthService } from '../services/auth/walletAuthService.js';
import { jwtService } from '../services/auth/jwtService.js';
import { requireAuth, loginRateLimit } from '../middleware/auth.js';

const router = express.Router();

// 初始化 S3 头像服务
const s3AvatarService = getS3AvatarService();

/**
 * 获取钱包登录nonce
 * POST /api/auth/wallet/nonce
 */
router.post('/wallet/nonce', loginRateLimit, async (req: express.Request, res: express.Response) => {
  try {
    const { address, origin } = req.body;

    if (!address) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '钱包地址不能为空'
      });
    }

    if (!walletAuthService.isValidEthereumAddress(address)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '无效的以太坊地址'
      });
    }

    // 优先使用前端传递的 origin，否则使用后端域名作为默认值
    const frontendOrigin = origin || `https://${req.headers.host || 'localhost:3001'}`;
    
    // 从 origin 解析出 domain
    const originUrl = new URL(frontendOrigin);
    const domain = originUrl.host;
    const uri = frontendOrigin;
    
    console.log("使用的 origin:", frontendOrigin);
    console.log("解析的 domain:", domain);
    console.log("uri:", uri);

    const nonce = walletAuthService.generateLoginNonce(address);

    const message = walletAuthService.createSiweMessage({
      address,
      domain,
      uri,
      nonce,
      chainId: 1, // 主网，可以根据需要调整
      statement: 'Sign in to MCP LangChain Service'
    });

    res.json({
      success: true,
      data: {
        nonce,
        message,
        domain,
        uri
      }
    });
  } catch (error) {
    console.error('生成nonce错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 钱包登录
 * POST /api/auth/wallet/login
 */
router.post('/wallet/login', loginRateLimit, async (req: express.Request, res: express.Response) => {
  try {
    const { message, signature, username, avatar } = req.body;

    if (!message || !signature) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '消息和签名不能为空'
      });
    }

    // 验证钱包签名
    const verificationResult = await walletAuthService.verifyWalletSignature({
      message,
      signature
    });

    if (!verificationResult.isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: verificationResult.error || '签名验证失败'
      });
    }

    const walletAddress = verificationResult.address!;

    // 查找或创建用户
    let user = await userService.getUserByWallet(walletAddress);
    
    if (!user) {
      // 获取钱包余额
      const balance = await walletAuthService.getWalletBalance(walletAddress);
      
      // 如果没有提供头像，从S3随机选择一个
      let userAvatar = avatar;
      if (!userAvatar) {
        const randomAvatar = await s3AvatarService.getRandomAvatar();
        if (randomAvatar) {
          userAvatar = randomAvatar;
        }
      }
      
      // 创建新用户
      user = await userService.createUser({
        username: username || `User${walletAddress.slice(0, 6)}`,
        avatar: userAvatar,
        walletAddress: walletAddress,
        loginMethod: 'wallet',
        loginData: { address: walletAddress }
      });

      // 设置余额
      if (balance !== '0.0') {
        await userService.updateWalletBalance(user.id, balance);
      }
    } else {
      // 更新现有用户信息
      const updates: any = {};
      if (username && username !== user.username) {
        updates.username = username;
      }
      if (avatar && avatar !== user.avatar) {
        updates.avatar = avatar;
      }
      
      if (Object.keys(updates).length > 0) {
        user = await userService.updateUser(user.id, updates) || user;
      }
    }

    // 更新最后登录时间
    await userService.updateUserLastLogin(user.id);

    // 生成JWT令牌（内置重试机制）
    const tokenPair = await jwtService.generateTokenPair(user);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          walletAddress: user.walletAddress,
          balance: user.balance,
          email: user.email,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        },
        tokens: tokenPair
      }
    });
  } catch (error) {
    console.error('钱包登录错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 刷新令牌
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: express.Request, res: express.Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '刷新令牌不能为空'
      });
    }

    const decoded = await jwtService.verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '无效的刷新令牌'
      });
    }

    const user = await userService.getUserById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '用户不存在或已禁用'
      });
    }

    // 撤销旧的refresh token
    await jwtService.revokeRefreshToken(refreshToken);

    // 生成新的token pair（access token + refresh token）
    const tokenPair = await jwtService.generateTokenPair(user);

    res.json({
      success: true,
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn
      }
    });
  } catch (error) {
    console.error('刷新令牌错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 登出
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await jwtService.revokeRefreshToken(refreshToken);
    }

    res.json({
      success: true,
      message: '已成功登出'
    });
  } catch (error) {
    console.error('登出错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取用户信息
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const user = req.user!;
    
    // 如果用户有钱包地址，更新余额
    if (user.walletAddress) {
      const balance = await walletAuthService.getWalletBalance(user.walletAddress);
      if (balance !== user.balance) {
        await userService.updateWalletBalance(user.id, balance);
        user.balance = balance;
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          walletAddress: user.walletAddress,
          balance: user.balance,
          email: user.email,
          loginMethods: user.loginMethods,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        }
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 更新用户信息
 * PUT /api/auth/me
 */
router.put('/me', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { username, avatar } = req.body;
    const userId = req.userId!;

    const updates: any = {};
    if (username !== undefined) {
      updates.username = username;
    }
    if (avatar !== undefined) {
      updates.avatar = avatar;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '没有要更新的字段'
      });
    }

    const updatedUser = await userService.updateUser(userId, updates);
    if (!updatedUser) {
      return res.status(404).json({
        error: 'Not Found',
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          avatar: updatedUser.avatar,
          walletAddress: updatedUser.walletAddress,
          balance: updatedUser.balance,
          email: updatedUser.email,
          updatedAt: updatedUser.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * 撤销所有令牌（强制登出所有设备）
 * POST /api/auth/revoke-all
 */
router.post('/revoke-all', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.userId!;
    await jwtService.revokeAllUserTokens(userId);

    res.json({
      success: true,
      message: '已撤销所有令牌'
    });
  } catch (error) {
    console.error('撤销令牌错误:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: '服务器内部错误'
    });
  }
});

/**
 * [测试专用] 创建测试用户
 * POST /api/auth/create-test-user
 */
router.post('/create-test-user', async (req, res) => {
  try {
    const { userId, username } = req.body;
    if (!userId || !username) {
      return res.status(400).json({ error: 'userId and username are required' });
    }

    const existingUser = await userService.getUserById(userId);
    if (existingUser) {
      return res.status(200).json({ success: true, message: 'Test user already exists', user: existingUser });
    }

    const newUser = await userService.createUser({
      id: userId,
      username: username,
      loginMethod: 'wallet', // A dummy method
      walletAddress: `0x${userId.replace(/[^a-fA-F0-9]/g, '').padStart(40, '0')}`,
      loginData: {}, // Add empty loginData to satisfy the type
    });

    res.status(201).json({ success: true, message: 'Test user created', user: newUser });
  } catch (error) {
    console.error('Error creating test user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router; 