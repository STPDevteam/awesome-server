import coinbase from 'coinbase-commerce-node';
import { CreatePaymentParams, Payment, MEMBERSHIP_PRICING } from '../models/User.js';
import { db } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// 安全地获取 coinbase 模块
let Client: any;
let resources: any; 
let Webhook: any;
let clientInstance: any = null;

try {
  const coinbaseModule = coinbase;
  Client = coinbaseModule.Client;
  resources = coinbaseModule.resources;
  Webhook = coinbaseModule.Webhook;
  
  // 初始化 Coinbase Commerce 客户端
  const API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
  
  if (API_KEY) {
    clientInstance = Client.init(API_KEY);
    console.log('✅ Coinbase Commerce client initialized');
  } else {
    console.warn('⚠️  COINBASE_COMMERCE_API_KEY not set, payment features will be disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize Coinbase Commerce:', error);
  console.warn('⚠️  Payment features will be disabled');
}

export class CoinbaseCommerceService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET!;
  }

  /**
   * 创建支付订单
   */
  async createPayment(params: CreatePaymentParams): Promise<{ payment: Payment; checkoutUrl: string }> {
    const { userId, membershipType, subscriptionType } = params;

    // 检查 API 密钥是否配置
    if (!clientInstance) {
      throw new Error('Coinbase Commerce API key not configured');
    }

    // 检查 resources 是否正确初始化
    if (!resources || !resources.Charge) {
      throw new Error('Coinbase Commerce resources not properly initialized');
    }

    // 获取定价信息
    const pricing = MEMBERSHIP_PRICING[membershipType][subscriptionType];
    
    // 生成支付ID
    const paymentId = uuidv4();

    try {
      // 创建 Coinbase Commerce charge
      const chargeData = {
        name: `${membershipType.toUpperCase()} ${subscriptionType} 会员`,
        description: `${membershipType.toUpperCase()} 会员 - ${subscriptionType === 'monthly' ? '月付' : '年付'}`,
        local_price: {
          amount: pricing.amount.toString(), // 确保是字符串
          currency: 'USD'
        },
        pricing_type: 'fixed_price' as const,
        requested_info: ['email'],
        metadata: {
          paymentId,
          userId,
          membershipType,
          subscriptionType
        }
      };

      console.log('Creating Coinbase charge with data:', JSON.stringify(chargeData, null, 2));

      // Create charge using callback pattern as shown in the README
      const charge: any = await new Promise((resolve, reject) => {
        resources.Charge.create(chargeData, (error: any, response: any) => {
          if (error) {
            console.error('Coinbase API error:', error);
            console.error('Error details:', {
              message: error.message,
              type: error.type,
              response: error.response?.data
            });
            
            // Handle specific error cases
            if (error.message?.includes('merchant has no settlement or home address set')) {
              reject(new Error(
                'Coinbase Commerce account not configured. Please log into your Coinbase Commerce dashboard and set up your business address and settlement preferences.'
              ));
            } else {
              reject(error);
            }
          } else {
            console.log('Coinbase API response:', response);
            
            // The callback might succeed but still return undefined in some cases
            if (!response) {
              reject(new Error('Charge creation succeeded but no response data was returned'));
            } else {
              resolve(response);
            }
          }
        });
      });

      // 检查 charge 是否正确返回
      if (!charge) {
        throw new Error('Charge creation returned null or undefined');
      }

      if (!charge.id) {
        console.error('Invalid charge response:', JSON.stringify(charge, null, 2));
        throw new Error('Charge creation returned invalid response: missing id');
      }

      console.log('Charge created successfully:', {
        id: charge.id,
        hosted_url: charge.hosted_url,
        expires_at: charge.expires_at
      });

      // 保存支付记录到数据库
      const payment: Payment = {
        id: paymentId,
        userId,
        chargeId: charge.id,
        membershipType,
        subscriptionType,
        amount: pricing.amount,
        currency: 'USDT', // 默认使用 USDT
        status: 'pending',
        expiresAt: new Date(charge.expires_at),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.savePayment(payment);

      return {
        payment,
        checkoutUrl: charge.hosted_url
      };
    } catch (error: any) {
      console.error('Create payment error - Full details:', error);
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      // 如果是 API 响应错误，尝试获取更多信息
      if (error?.response) {
        console.error('API Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      // 重新抛出更详细的错误信息
      if (error?.message) {
        throw new Error(`Failed to create payment: ${error.message}`);
      } else {
        throw new Error('Failed to create payment: Unknown error');
      }
    }
  }

  /**
   * 保存支付记录到数据库
   */
  private async savePayment(payment: Payment): Promise<void> {
    const query = `
      INSERT INTO payments (
        id, user_id, charge_id, membership_type, subscription_type, 
        amount, currency, status, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const values = [
      payment.id,
      payment.userId,
      payment.chargeId,
      payment.membershipType,
      payment.subscriptionType,
      payment.amount,
      payment.currency,
      payment.status,
      payment.expiresAt,
      payment.createdAt,
      payment.updatedAt
    ];

    await db.query(query, values);
  }

  /**
   * 获取支付记录
   */
  async getPayment(paymentId: string): Promise<Payment | null> {
    const query = 'SELECT * FROM payments WHERE id = $1';
    const result = await db.query(query, [paymentId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      chargeId: row.charge_id,
      membershipType: row.membership_type,
      subscriptionType: row.subscription_type,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 获取用户的支付记录
   */
  async getUserPayments(userId: string): Promise<Payment[]> {
    const query = `
      SELECT * FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [userId]);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      chargeId: row.charge_id,
      membershipType: row.membership_type,
      subscriptionType: row.subscription_type,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * 处理 webhook 事件
   */
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    try {
      console.log('Processing webhook:', {
        bodyLength: rawBody.length,
        signatureLength: signature.length,
        hasWebhookSecret: !!this.webhookSecret
      });

      // 检查 webhook secret 是否配置
      if (!this.webhookSecret) {
        console.warn('Webhook secret not configured, skipping signature verification');
        // 解析 JSON 数据而不验证签名（仅用于测试）
        const webhookData = JSON.parse(rawBody);
        const event = webhookData.event || webhookData;
        console.log('Webhook event received (unverified):', event.type, event.id);
        console.log('Webhook full structure (unverified):', JSON.stringify(webhookData, null, 2));
        
        if (event.type === 'charge:confirmed') {
          await this.handlePaymentConfirmed(event.data);
        } else if (event.type === 'charge:failed') {
          await this.handlePaymentFailed(event.data);
        } else if (event.type === 'charge:resolved') {
          await this.handlePaymentResolved(event.data);
        } else if (event.type === 'charge:pending') {
          console.log('Payment is pending for charge (unverified):', event.data.id);
        } else if (event.type === 'charge:created') {
          console.log('Charge created (unverified):', event.data.id);
        } else {
          console.log('Unhandled webhook event type (unverified):', event.type);
          console.log('Event data (unverified):', JSON.stringify(event, null, 2));
        }
        return;
      }

      // 检查必要的依赖
      if (!Webhook || !Webhook.verifyEventBody) {
        console.error('Webhook verification not available');
        throw new Error('Webhook verification not available');
      }

      console.log('Attempting webhook signature verification...');
      
      // 验证 webhook 签名并获取事件数据
      const event = Webhook.verifyEventBody(rawBody, signature, this.webhookSecret);

      console.log('Webhook signature verified successfully');
      console.log('Webhook event received:', event.type, event.id);
      console.log('Event data:', JSON.stringify(event.data, null, 2));

      // 处理不同类型的事件
      switch (event.type) {
        case 'charge:confirmed':
          await this.handlePaymentConfirmed(event.data);
          break;
        case 'charge:failed':
          await this.handlePaymentFailed(event.data);
          break;
        case 'charge:resolved':
          await this.handlePaymentResolved(event.data);
          break;
        case 'charge:pending':
          console.log('Payment is pending for charge:', event.data.id);
          break;
        case 'charge:created':
          console.log('Charge created:', event.data.id);
          break;
        default:
          console.log('Unhandled webhook event type:', event.type);
          console.log('Event data:', JSON.stringify(event, null, 2));
      }
    } catch (error: any) {
      console.error('Webhook processing error:', {
        message: error.message,
        type: error.constructor.name,
        stack: error.stack
      });
      
      // 如果是签名验证错误，提供更详细的信息
      if (error.message?.includes('signature') || error.name === 'SignatureVerificationError') {
        console.error('Signature verification failed:', {
          providedSignature: signature.substring(0, 20) + '...',
          bodyPreview: rawBody.substring(0, 100) + '...',
          secretConfigured: !!this.webhookSecret
        });
      }
      
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * 处理支付确认
   */
  private async handlePaymentConfirmed(chargeData: any): Promise<void> {
    const { id: chargeId, metadata } = chargeData;
    const { paymentId, userId, membershipType, subscriptionType } = metadata;

    try {
      // 更新支付状态
      await this.updatePaymentStatus(paymentId, 'confirmed', new Date());

      // 更新用户会员信息
      await this.updateUserMembership(userId, membershipType, subscriptionType);

      console.log(`Payment confirmed for user ${userId}: ${membershipType} ${subscriptionType}`);
    } catch (error) {
      console.error('Handle payment confirmed error:', error);
    }
  }

  /**
   * 处理支付失败
   */
  private async handlePaymentFailed(chargeData: any): Promise<void> {
    const { metadata } = chargeData;
    const { paymentId } = metadata;

    try {
      await this.updatePaymentStatus(paymentId, 'failed');
      console.log(`Payment failed for payment ${paymentId}`);
    } catch (error) {
      console.error('Handle payment failed error:', error);
    }
  }

  /**
   * 处理支付解决（最终状态）
   */
  private async handlePaymentResolved(chargeData: any): Promise<void> {
    const { metadata } = chargeData;
    const { paymentId } = metadata;

    try {
      await this.updatePaymentStatus(paymentId, 'resolved');
      console.log(`Payment resolved for payment ${paymentId}`);
    } catch (error) {
      console.error('Handle payment resolved error:', error);
    }
  }

  /**
   * 更新支付状态
   */
  private async updatePaymentStatus(
    paymentId: string, 
    status: Payment['status'], 
    confirmedAt?: Date
  ): Promise<void> {
    const query = `
      UPDATE payments 
      SET status = $1, confirmed_at = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3
    `;
    await db.query(query, [status, confirmedAt, paymentId]);
  }

  /**
   * 更新用户会员信息
   */
  private async updateUserMembership(
    userId: string,
    membershipType: 'plus' | 'pro',
    subscriptionType: 'monthly' | 'yearly'
  ): Promise<void> {
    // 计算到期时间
    const now = new Date();
    const expiresAt = new Date(now);
    
    if (subscriptionType === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    const query = `
      UPDATE users 
      SET 
        membership_type = $1,
        subscription_type = $2,
        membership_expires_at = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `;

    await db.query(query, [membershipType, subscriptionType, expiresAt, userId]);
  }

  /**
   * 检查用户会员状态
   */
  async checkMembershipStatus(userId: string): Promise<{
    isActive: boolean;
    membershipType?: 'plus' | 'pro';
    subscriptionType?: 'monthly' | 'yearly';
    expiresAt?: Date;
  }> {
    const query = `
      SELECT membership_type, subscription_type, membership_expires_at 
      FROM users 
      WHERE id = $1
    `;
    const result = await db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return { isActive: false };
    }

    const row = result.rows[0];
    const expiresAt = row.membership_expires_at;
    const isActive = expiresAt && new Date() < new Date(expiresAt);

    return {
      isActive: !!isActive,
      membershipType: row.membership_type,
      subscriptionType: row.subscription_type,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    };
  }
}

export const coinbaseCommerceService = new CoinbaseCommerceService(); 