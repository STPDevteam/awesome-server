import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { coinbaseCommerceService } from './coinbaseCommerceService.js';

// User tier daily conversation creation limits
const DAILY_CONVERSATION_LIMITS = {
  free: 3,    // Free users: 3 conversations per day
  plus: 10,   // Plus users: 10 conversations per day
  pro: -1     // Pro users: unlimited
} as const;

export interface ConversationLimitInfo {
  membershipType: 'free' | 'plus' | 'pro';
  dailyLimit: number;
  todayCreated: number;
  remainingCount: number;
  canCreate: boolean;
}

/**
 * Conversation limit service
 */
export class ConversationLimitService {
  
  /**
   * Check if user can create new conversation
   */
  async checkConversationLimit(userId: string): Promise<ConversationLimitInfo> {
    try {
      // 1. Get user membership status
      const membershipStatus = await coinbaseCommerceService.checkMembershipStatus(userId);
      
      // Determine user membership type
      let membershipType: 'free' | 'plus' | 'pro' = 'free';
      if (membershipStatus.isActive) {
        membershipType = membershipStatus.membershipType as 'plus' | 'pro';
      }
      
      // 2. Get corresponding daily limit
      const dailyLimit = DAILY_CONVERSATION_LIMITS[membershipType];
      
      // 3. If Pro user (unlimited), return directly
      if (dailyLimit === -1) {
        return {
          membershipType,
          dailyLimit: -1,
          todayCreated: 0,
          remainingCount: -1,
          canCreate: true
        };
      }
      
      // 4. Get user's today created conversation count
      const todayCreated = await this.getTodayConversationCount(userId);
      
      // 5. Calculate remaining count
      const remainingCount = Math.max(0, dailyLimit - todayCreated);
      const canCreate = remainingCount > 0;
      
      return {
        membershipType,
        dailyLimit,
        todayCreated,
        remainingCount,
        canCreate
      };
    } catch (error) {
      logger.error(`Failed to check conversation creation limit [User ID: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Get user's today created conversation count
   */
  private async getTodayConversationCount(userId: string): Promise<number> {
    try {
      // Get today's start time (00:00:00)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get tomorrow's start time (00:00:00)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const result = await db.query(
        `
        SELECT COUNT(*) as count
        FROM conversations
        WHERE user_id = $1 
          AND is_deleted = FALSE
          AND created_at >= $2 
          AND created_at < $3
        `,
        [userId, today, tomorrow]
      );
      
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error(`Failed to get today's conversation creation count [User ID: ${userId}]:`, error);
      throw error;
    }
  }
  
  /**
   * Get user conversation limit info (doesn't check if can create, just returns info)
   */
  async getConversationLimitInfo(userId: string): Promise<ConversationLimitInfo> {
    return this.checkConversationLimit(userId);
  }
}

// Export service instance
export const conversationLimitService = new ConversationLimitService(); 