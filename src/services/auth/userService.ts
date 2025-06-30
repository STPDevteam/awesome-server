import { User, CreateUserParams } from '../../models/User.js';
import { db } from '../../config/database.js';

interface UserRow {
  id: string;
  username?: string;
  avatar?: string;
  wallet_address?: string;
  balance?: string;
  email?: string;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  is_active: boolean;
}

// 允许在创建时传入可选的ID
interface InternalCreateUserParams extends CreateUserParams {
  id?: string;
}

interface LoginMethodRow {
  id: number;
  user_id: string;
  method_type: 'wallet' | 'google' | 'github' | 'test';
  method_data: any;
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}

class UserService {
  
  async createUser(params: InternalCreateUserParams): Promise<User> {
    const userId = params.id || this.generateUserId();
    const now = new Date();
    
    try {
      // 开始事务
      const queries = [];
      
      // 插入用户基本信息
      queries.push({
        text: `
          INSERT INTO users (id, username, avatar, wallet_address, email, created_at, updated_at, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        params: [
          userId,
          params.username,
          params.avatar,
          params.walletAddress,
          params.email,
          now,
          now,
          true
        ]
      });
      
      // 插入登录方法
      let methodData: any = {};
      switch (params.loginMethod) {
        case 'wallet':
          if (!params.walletAddress) {
            throw new Error('钱包地址不能为空');
          }
          methodData = {
            address: params.walletAddress,
            lastSignedAt: now.toISOString()
          };
          break;
        
        case 'google':
          const { googleId, email: googleEmail } = params.loginData;
          if (!googleId) {
            throw new Error('Google ID不能为空');
          }
          methodData = {
            googleId,
            email: googleEmail
          };
          break;
        
        case 'github':
          const { githubId, username: githubUsername } = params.loginData;
          if (!githubId) {
            throw new Error('GitHub ID不能为空');
          }
          methodData = {
            githubId,
            username: githubUsername
          };
          break;

        case 'test':
          // For test users, no specific data is needed
          methodData = {
            testId: params.id || userId
          };
          break;
      }
      
      queries.push({
        text: `
          INSERT INTO user_login_methods (user_id, method_type, method_data, verified, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        params: [userId, params.loginMethod, JSON.stringify(methodData), true, now, now]
      });
      
      await db.transaction(queries);
      
      // 返回创建的用户
      return await this.getUserById(userId) as User;
      
    } catch (error) {
      console.error('创建用户失败:', error);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) return null;
      
      const userRow = userResult.rows[0] as unknown as UserRow;
      
      // 获取登录方法
      const loginMethodsResult = await db.query(
        'SELECT * FROM user_login_methods WHERE user_id = $1',
        [userId]
      );
      
      return this.mapRowToUser(userRow, loginMethodsResult.rows as unknown as LoginMethodRow[]);
    } catch (error) {
      console.error('获取用户失败:', error);
      return null;
    }
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    try {
      // 使用校验和格式和小写格式都查询，确保兼容性
      const checksumAddress = walletAddress; // 保持原格式
      const lowerAddress = walletAddress.toLowerCase();
      
      const result = await db.query(`
        SELECT u.*, ulm.method_data, ulm.verified, ulm.created_at as method_created_at, ulm.updated_at as method_updated_at
        FROM users u
        JOIN user_login_methods ulm ON u.id = ulm.user_id
        WHERE ulm.method_type = 'wallet' 
        AND (ulm.method_data->>'address' = $1 OR ulm.method_data->>'address' = $2)
      `, [checksumAddress, lowerAddress]);
      
      if (result.rows.length === 0) return null;
      
      const userRow = result.rows[0] as unknown as UserRow;
      
      // 获取所有登录方法
      const loginMethodsResult = await db.query(
        'SELECT * FROM user_login_methods WHERE user_id = $1',
        [userRow.id]
      );
      
      return this.mapRowToUser(userRow, loginMethodsResult.rows as unknown as LoginMethodRow[]);
    } catch (error) {
      console.error('通过钱包地址获取用户失败:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      if (result.rows.length === 0) return null;
      
      const userRow = result.rows[0] as unknown as UserRow;
      
      // 获取登录方法
      const loginMethodsResult = await db.query(
        'SELECT * FROM user_login_methods WHERE user_id = $1',
        [userRow.id]
      );
      
      return this.mapRowToUser(userRow, loginMethodsResult.rows as unknown as LoginMethodRow[]);
    } catch (error) {
      console.error('通过邮箱获取用户失败:', error);
      return null;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    try {
      const result = await db.query(`
        SELECT u.*, ulm.method_data, ulm.verified, ulm.created_at as method_created_at, ulm.updated_at as method_updated_at
        FROM users u
        JOIN user_login_methods ulm ON u.id = ulm.user_id
        WHERE ulm.method_type = 'google' 
        AND ulm.method_data->>'googleId' = $1
      `, [googleId]);
      
      if (result.rows.length === 0) return null;
      
      const userRow = result.rows[0] as unknown as UserRow;
      
      // 获取所有登录方法
      const loginMethodsResult = await db.query(
        'SELECT * FROM user_login_methods WHERE user_id = $1',
        [userRow.id]
      );
      
      return this.mapRowToUser(userRow, loginMethodsResult.rows as unknown as LoginMethodRow[]);
    } catch (error) {
      console.error('通过Google ID获取用户失败:', error);
      return null;
    }
  }

  async getUserByGithubId(githubId: string): Promise<User | null> {
    try {
      const result = await db.query(`
        SELECT u.*, ulm.method_data, ulm.verified, ulm.created_at as method_created_at, ulm.updated_at as method_updated_at
        FROM users u
        JOIN user_login_methods ulm ON u.id = ulm.user_id
        WHERE ulm.method_type = 'github' 
        AND ulm.method_data->>'githubId' = $1
      `, [githubId]);
      
      if (result.rows.length === 0) return null;
      
      const userRow = result.rows[0] as unknown as UserRow;
      
      // 获取所有登录方法
      const loginMethodsResult = await db.query(
        'SELECT * FROM user_login_methods WHERE user_id = $1',
        [userRow.id]
      );
      
      return this.mapRowToUser(userRow, loginMethodsResult.rows as unknown as LoginMethodRow[]);
    } catch (error) {
      console.error('通过GitHub ID获取用户失败:', error);
      return null;
    }
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (updates.username !== undefined) {
        updateFields.push(`username = $${paramIndex++}`);
        updateValues.push(updates.username);
      }
      if (updates.avatar !== undefined) {
        updateFields.push(`avatar = $${paramIndex++}`);
        updateValues.push(updates.avatar);
      }
      if (updates.walletAddress !== undefined) {
        updateFields.push(`wallet_address = $${paramIndex++}`);
        updateValues.push(updates.walletAddress);
      }
      if (updates.balance !== undefined) {
        updateFields.push(`balance = $${paramIndex++}`);
        updateValues.push(updates.balance);
      }
      if (updates.email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        updateValues.push(updates.email);
      }
      if (updates.isActive !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        updateValues.push(updates.isActive);
      }
      
      if (updateFields.length === 0) {
        return await this.getUserById(userId);
      }
      
      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(new Date());
      updateValues.push(userId);
      
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
      `;
      
      await db.query(query, updateValues);
      
      return await this.getUserById(userId);
    } catch (error) {
      console.error('更新用户失败:', error);
      return null;
    }
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    try {
      await db.query(
        'UPDATE users SET last_login_at = $1, updated_at = $2 WHERE id = $3',
        [new Date(), new Date(), userId]
      );
    } catch (error) {
      console.error('更新用户最后登录时间失败:', error);
    }
  }

  async updateWalletBalance(userId: string, balance: string): Promise<User | null> {
    try {
      await db.query(
        'UPDATE users SET balance = $1, updated_at = $2 WHERE id = $3',
        [balance, new Date(), userId]
      );
      
      return await this.getUserById(userId);
    } catch (error) {
      console.error('更新钱包余额失败:', error);
      return null;
    }
  }

  async addLoginMethod(userId: string, method: 'google' | 'github', data: any): Promise<User | null> {
    try {
      const now = new Date();
      
      await db.query(`
        INSERT INTO user_login_methods (user_id, method_type, method_data, verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, method_type) 
        DO UPDATE SET 
          method_data = EXCLUDED.method_data,
          verified = EXCLUDED.verified,
          updated_at = EXCLUDED.updated_at
      `, [userId, method, JSON.stringify(data), true, now, now]);
      
      return await this.getUserById(userId);
    } catch (error) {
      console.error('添加登录方法失败:', error);
      return null;
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      const result = await db.query('DELETE FROM users WHERE id = $1', [userId]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('删除用户失败:', error);
      return false;
    }
  }

  async getUserStats() {
    try {
      const totalUsersResult = await db.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
      const walletUsersResult = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM user_login_methods 
        WHERE method_type = 'wallet'
      `);
      const googleUsersResult = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM user_login_methods 
        WHERE method_type = 'google'
      `);
      const githubUsersResult = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM user_login_methods 
        WHERE method_type = 'github'
      `);
      
      return {
        totalUsers: parseInt(totalUsersResult.rows[0].count),
        walletUsers: parseInt(walletUsersResult.rows[0].count),
        googleUsers: parseInt(googleUsersResult.rows[0].count),
        githubUsers: parseInt(githubUsersResult.rows[0].count)
      };
    } catch (error) {
      console.error('获取用户统计失败:', error);
      return {
        totalUsers: 0,
        walletUsers: 0,
        googleUsers: 0,
        githubUsers: 0
      };
    }
  }

  private mapRowToUser(userRow: UserRow, loginMethodRows: LoginMethodRow[]): User {
    const user: User = {
      id: userRow.id,
      username: userRow.username,
      avatar: userRow.avatar,
      walletAddress: userRow.wallet_address,
      balance: userRow.balance,
      email: userRow.email,
      loginMethods: {},
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
      lastLoginAt: userRow.last_login_at,
      isActive: userRow.is_active
    };

    // 映射登录方法
    for (const loginMethod of loginMethodRows) {
      switch (loginMethod.method_type) {
        case 'wallet':
          user.loginMethods.wallet = {
            address: loginMethod.method_data.address,
            verified: loginMethod.verified,
            lastSignedAt: loginMethod.method_data.lastSignedAt ? new Date(loginMethod.method_data.lastSignedAt) : undefined
          };
          break;
        
        case 'google':
          user.loginMethods.google = {
            googleId: loginMethod.method_data.googleId,
            email: loginMethod.method_data.email,
            verified: loginMethod.verified
          };
          break;
        
        case 'github':
          user.loginMethods.github = {
            githubId: loginMethod.method_data.githubId,
            username: loginMethod.method_data.username,
            verified: loginMethod.verified
          };
          break;
      }
    }

    return user;
  }

  private generateUserId(): string {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async findOrCreateUserById(userId: string): Promise<User> {
    const existingUser = await this.getUserById(userId);
    if (existingUser) {
      return existingUser;
    }

    // If user does not exist, create one.
    const newUser = await this.createUser({
      id: userId,
      username: userId,
      loginMethod: 'test',
      loginData: {} // Not needed for test
    });
    return newUser;
  }
}

export const userService = new UserService(); 