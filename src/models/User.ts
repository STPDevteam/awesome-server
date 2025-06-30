export interface User {
  id: string;
  username?: string;
  avatar?: string;
  walletAddress?: string;
  balance?: string;
  email?: string;
  
  // Membership information
  membershipType?: 'plus' | 'pro' | null;
  subscriptionType?: 'monthly' | 'yearly' | null;
  membershipExpiresAt?: Date;
  isActive: boolean;
  
  // Login method identifiers
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
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface CreateUserParams {
  username?: string;
  avatar?: string;
  walletAddress?: string;
  email?: string;
  loginMethod: LoginMethod;
  loginData: any;
}

export interface UserSession {
  userId: string;
  user: User;
  expiresAt: Date;
}

// Payment-related interfaces
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

// Membership pricing configuration
export const MEMBERSHIP_PRICING = {
  plus: {
    monthly: { amount: '20', currency: 'USDT' },
    yearly: { amount: '200', currency: 'USDT' }
  },
  pro: {
    monthly: { amount: '200', currency: 'USDT' },
    yearly: { amount: '2000', currency: 'USDT' }
  }
} as const;

/**
 * Login Methods
 * Supports wallet, Google, GitHub and other methods
 */
export type LoginMethod = 'wallet' | 'google' | 'github' | 'test'; 