import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import NodeCache from 'node-cache';
import { db } from '../config/database.js';
import { MEMBERSHIP_PRICING } from '../models/User.js';
import { logger } from '../utils/logger.js';

// AWE代币配置
const AWE_TOKEN_CONFIG = {
  address: '0x1B4617734C43F6159F3a70b7E06d883647512778',
  decimals: 18,
  receiverAddress: '0x1cAb57bDD051613214D761Ce1429f94975dD0116',
  chainId: 8453,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org'
};

// ERC20 ABI (只包含必要的方法)
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// 价格查询结果接口
export interface AwePriceInfo {
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  usdPrice: string;
  aweAmount: string;
  aweAmountInWei: string;
  aweUsdPrice: number;
  tokenAddress: string;
  receiverAddress: string;
  chainId: number;
  chainName: string;
}

// 交易验证参数
export interface VerifyPaymentParams {
  userId: string;
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  transactionHash: string;
}

// AWE支付记录
export interface AwePayment {
  id: string;
  userId: string;
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  amount: string;
  amountInWei: string;
  usdValue: string;
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  transactionHash?: string;
  blockNumber?: number;
  fromAddress?: string;
  expiresAt?: Date;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class AwePaymentService {
  private provider: ethers.Provider;
  private aweToken: ethers.Contract;
  private priceCache: NodeCache;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(AWE_TOKEN_CONFIG.rpcUrl);
    this.aweToken = new ethers.Contract(AWE_TOKEN_CONFIG.address, ERC20_ABI, this.provider);
    this.priceCache = new NodeCache({ stdTTL: 300 }); // 5分钟缓存
  }

  /**
   * 计算AWE支付价格
   */
  async calculatePrice(
    membershipType: 'plus' | 'pro',
    subscriptionType: 'monthly' | 'yearly'
  ): Promise<AwePriceInfo> {
    const cacheKey = `price_${membershipType}_${subscriptionType}`;
    const cached = this.priceCache.get<AwePriceInfo>(cacheKey);
    if (cached) {
      return cached;
    }

    const pricing = MEMBERSHIP_PRICING[membershipType][subscriptionType];
    const aweUsdPrice = await this.getAweUsdPrice();
    const aweAmount = parseFloat(pricing.amount) / aweUsdPrice;
    const aweAmountInWei = ethers.parseUnits(aweAmount.toFixed(6), AWE_TOKEN_CONFIG.decimals);

    const priceInfo: AwePriceInfo = {
      membershipType,
      subscriptionType,
      usdPrice: pricing.amount,
      aweAmount: aweAmount.toFixed(6),
      aweAmountInWei: aweAmountInWei.toString(),
      aweUsdPrice,
      tokenAddress: AWE_TOKEN_CONFIG.address,
      receiverAddress: AWE_TOKEN_CONFIG.receiverAddress,
      chainId: AWE_TOKEN_CONFIG.chainId,
      chainName: 'Base'
    };

    this.priceCache.set(cacheKey, priceInfo);
    return priceInfo;
  }

  /**
   * 验证交易并创建支付记录
   */
  async verifyAndCreatePayment(params: VerifyPaymentParams): Promise<AwePayment> {
    const { userId, membershipType, subscriptionType, transactionHash } = params;

    // 检查交易是否已被使用
    const existingPayment = await this.getPaymentByTransactionHash(transactionHash);
    if (existingPayment) {
      if (existingPayment.userId !== userId) {
        throw new Error('Transaction already used by another user');
      }
      return existingPayment;
    }

    // 获取并验证交易
    const tx = await this.provider.getTransaction(transactionHash);
    if (!tx) {
      throw new Error('Transaction not found');
    }

    const receipt = await this.provider.getTransactionReceipt(transactionHash);
    if (!receipt) {
      throw new Error('Transaction not confirmed');
    }

    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    // 验证确认数
    const currentBlock = await this.provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    if (confirmations < 3) {
      throw new Error('Insufficient confirmations. Please wait for 3 confirmations');
    }

    // 解析Transfer事件
    const transferEvent = await this.parseTransferEvent(receipt);
    if (!transferEvent) {
      throw new Error('Invalid AWE token transfer');
    }

    if (transferEvent.to.toLowerCase() !== AWE_TOKEN_CONFIG.receiverAddress.toLowerCase()) {
      throw new Error('Invalid receiver address');
    }

    // 验证金额
    const priceInfo = await this.calculatePrice(membershipType, subscriptionType);
    const expectedAmount = BigInt(priceInfo.aweAmountInWei);
    const actualAmount = BigInt(transferEvent.value);
    
    if (actualAmount < expectedAmount) {
      throw new Error(
        `Insufficient payment amount. Expected: ${priceInfo.aweAmount} AWE, ` +
        `Received: ${ethers.formatUnits(actualAmount, AWE_TOKEN_CONFIG.decimals)} AWE`
      );
    }

    // 创建支付记录
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24小时后过期（已确认的支付设置较长的过期时间）
    
    const payment: AwePayment = {
      id: uuidv4(),
      userId,
      membershipType,
      subscriptionType,
      amount: ethers.formatUnits(actualAmount, AWE_TOKEN_CONFIG.decimals),
      amountInWei: actualAmount.toString(),
      usdValue: priceInfo.usdPrice,
      status: 'confirmed',
      transactionHash,
      blockNumber: receipt.blockNumber,
      fromAddress: transferEvent.from,
      expiresAt,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now
    };

    await this.savePayment(payment);
    await this.updateUserMembership(userId, membershipType, subscriptionType);

    logger.info(`AWE payment confirmed: ${payment.id} (tx: ${transactionHash})`);
    return payment;
  }

  /**
   * 获取支付记录
   */
  async getPayment(paymentId: string): Promise<AwePayment | null> {
    const query = 'SELECT * FROM awe_payments WHERE id = $1';
    const result = await db.query(query, [paymentId]);
    return result.rows.length > 0 ? this.mapRowToPayment(result.rows[0]) : null;
  }

  /**
   * 获取用户的支付记录
   */
  async getUserPayments(userId: string): Promise<AwePayment[]> {
    const query = 'SELECT * FROM awe_payments WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [userId]);
    return result.rows.map(row => this.mapRowToPayment(row));
  }

  /**
   * 通过交易哈希获取支付记录
   */
  private async getPaymentByTransactionHash(transactionHash: string): Promise<AwePayment | null> {
    const query = 'SELECT * FROM awe_payments WHERE transaction_hash = $1';
    const result = await db.query(query, [transactionHash]);
    return result.rows.length > 0 ? this.mapRowToPayment(result.rows[0]) : null;
  }

  /**
   * 解析Transfer事件
   */
  private async parseTransferEvent(
    receipt: ethers.TransactionReceipt
  ): Promise<{ from: string; to: string; value: string } | null> {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === AWE_TOKEN_CONFIG.address.toLowerCase()) {
        try {
          const parsed = this.aweToken.interface.parseLog({
            topics: log.topics,
            data: log.data
          });

          if (parsed && parsed.name === 'Transfer') {
            const [from, to, value] = parsed.args;
            return { from, to, value: value.toString() };
          }
        } catch (e) {
          // 继续尝试其他日志
        }
      }
    }
    return null;
  }

  /**
   * 保存支付记录
   */
  private async savePayment(payment: AwePayment): Promise<void> {
    const query = `
      INSERT INTO awe_payments (
        id, user_id, membership_type, subscription_type, 
        amount, amount_in_wei, usd_value, status, 
        transaction_hash, block_number, from_address,
        expires_at, confirmed_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `;

    await db.query(query, [
      payment.id,
      payment.userId,
      payment.membershipType,
      payment.subscriptionType,
      payment.amount,
      payment.amountInWei,
      payment.usdValue,
      payment.status,
      payment.transactionHash,
      payment.blockNumber,
      payment.fromAddress,
      payment.expiresAt,
      payment.confirmedAt,
      payment.createdAt,
      payment.updatedAt
    ]);
  }

  /**
   * 更新用户会员信息
   */
  private async updateUserMembership(
    userId: string,
    membershipType: 'plus' | 'pro',
    subscriptionType: 'monthly' | 'yearly'
  ): Promise<void> {
    const expiresAt = new Date();
    if (subscriptionType === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    await db.query(
      `UPDATE users 
       SET membership_type = $1, subscription_type = $2, 
           membership_expires_at = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [membershipType, subscriptionType, expiresAt, userId]
    );
  }

  /**
   * 获取AWE代币USD价格
   */
  private async getAweUsdPrice(): Promise<number> {
    // TODO: 接入价格预言机或API
    return 0.1; // $0.1 per AWE
  }

  /**
   * 映射数据库行到支付对象
   */
  private mapRowToPayment(row: any): AwePayment {
    return {
      id: row.id,
      userId: row.user_id,
      membershipType: row.membership_type,
      subscriptionType: row.subscription_type,
      amount: row.amount,
      amountInWei: row.amount_in_wei,
      usdValue: row.usd_value,
      status: row.status,
      transactionHash: row.transaction_hash,
      blockNumber: row.block_number,
      fromAddress: row.from_address,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 检查支付状态（兼容旧接口）
   * @deprecated 请使用 getPayment
   */
  async checkPaymentStatus(paymentId: string): Promise<AwePayment | null> {
    return this.getPayment(paymentId);
  }

  /**
   * 创建支付订单（兼容旧接口）
   * @deprecated 请使用 calculatePrice + verifyAndCreatePayment
   */
  async createPayment(params: any): Promise<{ payment: AwePayment; paymentInfo: any }> {
    throw new Error('This method is deprecated. Please use calculatePrice() and verifyAndCreatePayment()');
  }
}

export const awePaymentService = new AwePaymentService(); 