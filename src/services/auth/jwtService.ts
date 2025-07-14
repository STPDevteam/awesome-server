import jwt from 'jsonwebtoken';
import { User } from '../../models/User.js';
import { db } from '../../config/database.js';
import crypto from 'crypto';

export interface JWTPayload {
  userId: string;
  walletAddress?: string;
  email?: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string = '10h';  // 1小时
  private readonly refreshTokenExpiry: string = '7d'; // 7天

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    
    if (this.accessTokenSecret === 'your-access-secret-key' || 
        this.refreshTokenSecret === 'your-refresh-secret-key') {
      console.warn('警告: 正在使用默认的JWT密钥，请在生产环境中设置JWT_ACCESS_SECRET和JWT_REFRESH_SECRET环境变量');
    }
  }

  /**
   * 生成访问令牌和刷新令牌（带重试机制）
   */
  async generateTokenPair(user: User, revokeOldTokens: boolean = false): Promise<TokenPair> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
      try {
        return await this.generateTokenPairInternal(user, revokeOldTokens);
      } catch (error) {
        lastError = error as Error;
        if (error instanceof Error && error.message === 'TOKEN_COLLISION' && retryCount < maxRetries - 1) {
          console.warn(`令牌生成冲突，重试第 ${retryCount + 1} 次`);
          // 短暂延迟后重试
          await new Promise(resolve => setTimeout(resolve, 50 + retryCount * 25));
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('令牌生成失败');
  }

  /**
   * 内部生成访问令牌和刷新令牌的方法
   */
  private async generateTokenPairInternal(user: User, revokeOldTokens: boolean = false): Promise<TokenPair> {
    // 如果需要，先撤销用户的所有旧令牌
    if (revokeOldTokens) {
      await this.revokeAllUserTokens(user.id);
    }
    const payload = {
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email
    };

    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    // 为刷新令牌添加随机性，避免重复
    const refreshTokenPayload = {
      userId: user.id,
      jti: crypto.randomUUID(), // 添加唯一标识符
      nonce: crypto.randomBytes(16).toString('hex') // 添加随机数
    };

    const refreshToken = jwt.sign(refreshTokenPayload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry
    } as jwt.SignOptions);

    // 存储刷新令牌到数据库
    await this.storeRefreshToken(refreshToken, user.id);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600 // 1小时（秒）
    };
  }

  /**
   * 验证访问令牌
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 访问令牌验证失败:`, error);
      return null;
    }
  }

  /**
   * 验证刷新令牌
   */
  async verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
    try {
      // 首先验证JWT签名和过期时间
      const decoded = jwt.verify(token, this.refreshTokenSecret) as { userId: string };
      
      // 检查令牌是否在数据库中存在且未被撤销
      const tokenHash = this.hashToken(token);
      const result = await db.query(`
        SELECT user_id, expires_at, is_revoked 
        FROM refresh_tokens 
        WHERE token_hash = $1 AND is_revoked = false
      `, [tokenHash]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const tokenRow = result.rows[0];
      
      // 检查是否过期
      if (new Date() > new Date(tokenRow.expires_at)) {
        await this.revokeRefreshToken(token);
        return null;
      }
      
      return { userId: tokenRow.user_id };
    } catch (error) {
      console.error('刷新令牌验证失败:', error);
      return null;
    }
  }

  /**
   * 撤销刷新令牌
   */
  async revokeRefreshToken(token: string): Promise<boolean> {
    try {
      const tokenHash = this.hashToken(token);
      const result = await db.query(`
        UPDATE refresh_tokens 
        SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
        WHERE token_hash = $1
      `, [tokenHash]);
      
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 撤销刷新令牌失败:`, error);
      return false;
    }
  }

  /**
   * 撤销用户的所有刷新令牌
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      await db.query(`
        UPDATE refresh_tokens 
        SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
        WHERE user_id = $1 AND is_revoked = false
      `, [userId]);
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 撤销用户所有令牌失败:`, error);
    }
  }

  /**
   * 从Authorization头部提取令牌
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  /**
   * 获取令牌统计信息
   */
  async getTokenStats(): Promise<{ activeRefreshTokens: number }> {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count 
        FROM refresh_tokens 
        WHERE is_revoked = false AND expires_at > CURRENT_TIMESTAMP
      `);
      
      return {
        activeRefreshTokens: parseInt(result.rows[0].count)
      };
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 获取令牌统计失败:`, error);
      return {
        activeRefreshTokens: 0
      };
    }
  }

  /**
   * 清理过期的刷新令牌（定期调用）
   */
  async cleanExpiredTokens(): Promise<void> {
    try {
      const result = await db.query(`
        UPDATE refresh_tokens 
        SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP 
        WHERE expires_at <= CURRENT_TIMESTAMP AND is_revoked = false
      `);
      
      if (result.rowCount !== null && result.rowCount > 0) {
        console.log(`清理了 ${result.rowCount} 个过期的刷新令牌`);
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] 清理过期令牌失败:`, error);
    }
  }

  /**
   * 存储刷新令牌到数据库
   */
  private async storeRefreshToken(token: string, userId: string): Promise<void> {
    try {
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7天后过期
      
      // 使用 ON CONFLICT DO NOTHING 避免重复键错误
      // 如果token hash已存在，则忽略插入操作
      await db.query(`
        INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (token_hash) DO NOTHING
      `, [tokenHash, userId, expiresAt]);
      
      // 如果令牌已存在但属于不同用户，这可能是一个问题
      // 检查是否成功插入或已存在
      const checkResult = await db.query(`
        SELECT user_id FROM refresh_tokens WHERE token_hash = $1
      `, [tokenHash]);
      
      if (checkResult.rows.length > 0 && checkResult.rows[0].user_id !== userId) {
        // 令牌冲突 - 重新生成
        console.warn('令牌哈希冲突，重新生成令牌');
        throw new Error('TOKEN_COLLISION');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'TOKEN_COLLISION') {
        // 如果是令牌冲突，让调用者重试
        throw error;
      }
      console.error(`[${new Date().toLocaleString()}] 存储刷新令牌失败:`, error);
      throw error;
    }
  }

  /**
   * 对令牌进行哈希处理（用于安全存储）
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const jwtService = new JWTService();

// 定期清理过期令牌（每小时一次）
setInterval(async () => {
  await jwtService.cleanExpiredTokens();
}, 60 * 60 * 1000); 