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
  private readonly accessTokenExpiry: string = '1h';  // 1小时
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
   * 生成访问令牌和刷新令牌
   */
  async generateTokenPair(user: User): Promise<TokenPair> {
    const payload = {
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email
    };

    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId: user.id }, this.refreshTokenSecret, {
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
      console.error('访问令牌验证失败:', error);
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
   * 刷新访问令牌
   */
  async refreshAccessToken(refreshToken: string, user: User): Promise<string | null> {
    const decoded = await this.verifyRefreshToken(refreshToken);
    if (!decoded || decoded.userId !== user.id) {
      return null;
    }

    const payload = {
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);
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
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('撤销刷新令牌失败:', error);
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
      console.error('撤销用户所有令牌失败:', error);
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
      console.error('获取令牌统计失败:', error);
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
      
      if (result.rowCount > 0) {
        console.log(`清理了 ${result.rowCount} 个过期的刷新令牌`);
      }
    } catch (error) {
      console.error('清理过期令牌失败:', error);
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
      
      await db.query(`
        INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
        VALUES ($1, $2, $3)
      `, [tokenHash, userId, expiresAt]);
    } catch (error) {
      console.error('存储刷新令牌失败:', error);
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