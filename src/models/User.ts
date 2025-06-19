export interface User {
  id: string;
  username?: string;
  avatar?: string;
  walletAddress?: string;
  balance?: string;
  email?: string;
  
  // 会员信息
  membershipType?: 'plus' | 'pro' | null;
  subscriptionType?: 'monthly' | 'yearly' | null;
  membershipExpiresAt?: Date;
  isActive: boolean;
  
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

// 新增支付相关接口
export interface Payment {
  id: string;
  userId: string;
  chargeId: string; // Coinbase Commerce charge ID
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  amount: string;
  currency: 'USDT' | 'USDC';
  status: 'pending' | 'confirmed' | 'failed' | 'expired' | 'resolved';
  expiresAt?: Date;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentParams {
  userId: string;
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  amount: string;
  currency: 'USDT' | 'USDC';
}

// 会员定价配置
export const MEMBERSHIP_PRICING = {
  plus: {
    monthly: { amount: '1', currency: 'USDT' },
    yearly: { amount: '200', currency: 'USDT' }
  },
  pro: {
    monthly: { amount: '200', currency: 'USDT' },
    yearly: { amount: '2000', currency: 'USDT' }
  }
} as const; 