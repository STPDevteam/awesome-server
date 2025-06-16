export interface User {
  id: string;
  username?: string;
  avatar?: string;
  walletAddress?: string;
  balance?: string;
  email?: string;
  
  // 登录方式标识
  loginMethods: {
    wallet?: {
      address: string;
      verified: boolean;
      lastSignedAt?: Date;
    };
    google?: {
      googleId: string;
      email: string;
      verified: boolean;
    };
    github?: {
      githubId: string;
      username: string;
      verified: boolean;
    };
  };
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;
}

export interface CreateUserParams {
  username?: string;
  avatar?: string;
  walletAddress?: string;
  email?: string;
  loginMethod: 'wallet' | 'google' | 'github';
  loginData: any;
}

export interface UserSession {
  userId: string;
  user: User;
  expiresAt: Date;
} 