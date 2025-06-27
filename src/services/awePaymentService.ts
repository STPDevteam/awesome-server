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

// CoinMarketCap配置
const CMC_CONFIG = {
  apiKey: process.env.CMC_SERVER_API_KEY || '',
  baseUrl: 'https://pro-api.coinmarketcap.com/v1',
  aweTokenId: '4006'
};

// CoinMarketCap API响应类型
interface CoinMarketCapResponse {
  data: {
    [tokenId: string]: {
      quote: {
        USD: {
          price: number;
        };
      };
    };
  };
}

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

// 完整价格信息接口
export interface FullPriceInfo {
  success: boolean;
  data: {
    usdPrice: string;
    aweUsdPrice: string;
    aweAmountForPlusMonthly: number;
    aweAmountForPlusYearly: number;
    aweAmountForProMonthly: number;
    aweAmountForProYearly: number;
    tokenAddress: string;
    receiverAddress: string;
    chainId: number;
    chainName: string;
    priceLockId?: string; // 价格锁定ID
  };
}

// 交易验证参数
export interface VerifyPaymentParams {
  userId: string;
  membershipType: 'plus' | 'pro';
  subscriptionType: 'monthly' | 'yearly';
  transactionHash: string;
  priceLockId?: string;
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
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(AWE_TOKEN_CONFIG.rpcUrl);
    this.aweToken = new ethers.Contract(AWE_TOKEN_CONFIG.address, ERC20_ABI, this.provider);
    this.priceCache = new NodeCache({ stdTTL: 45 }); // 45秒缓存
    
    // 启动定时检查任务（每30秒检查一次）
    this.startPendingPaymentChecker();
    
    // 启动清理过期价格锁定的任务（每5分钟执行一次）
    this.startPriceLockCleaner();
  }

  /**
   * 启动清理过期价格锁定的定时任务
   */
  private startPriceLockCleaner(): void {
    setInterval(async () => {
      try {
        await db.query(`
          DELETE FROM awe_price_locks 
          WHERE expires_at < NOW() OR used = true
        `);
      } catch (error) {
        logger.error('Error cleaning expired price locks:', error);
      }
    }, 5 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 启动待确认支付的定时检查任务
   */
  private startPendingPaymentChecker(): void {
    // 先清理可能存在的旧任务
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 每30秒检查一次
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkPendingPayments();
      } catch (error) {
        logger.error('Error in pending payment checker:', error);
      }
    }, 30000);

    // 立即执行一次
    this.checkPendingPayments().catch(error => {
      logger.error('Error in initial pending payment check:', error);
    });
  }

  /**
   * 检查所有待确认的支付
   */
  private async checkPendingPayments(): Promise<void> {
    const query = `
      SELECT * FROM awe_payments 
      WHERE status = 'pending' 
      AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
    `;
    
    const result = await db.query(query);
    const pendingPayments = result.rows.map(row => this.mapRowToPayment(row));

    if (pendingPayments.length > 0) {
      logger.info(`Checking ${pendingPayments.length} pending AWE payments...`);
    }

    for (const payment of pendingPayments) {
      await this.updatePaymentStatus(payment);
    }
  }

  /**
   * 创建价格锁定
   */
  private async createPriceLock(
    userId: string,
    membershipType: 'plus' | 'pro',
    subscriptionType: 'monthly' | 'yearly',
    aweAmount: string,
    aweAmountInWei: string,
    usdPrice: string,
    aweUsdPrice: number
  ): Promise<string> {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15分钟后过期

    await db.query(`
      INSERT INTO awe_price_locks (
        id, user_id, membership_type, subscription_type,
        awe_amount, awe_amount_in_wei, usd_price, awe_usd_price,
        expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      id, userId, membershipType, subscriptionType,
      aweAmount, aweAmountInWei, usdPrice, aweUsdPrice,
      expiresAt, new Date(), new Date()
    ]);

    return id;
  }

  /**
   * 获取价格锁定
   */
  private async getPriceLock(priceLockId: string): Promise<any | null> {
    const result = await db.query(`
      SELECT * FROM awe_price_locks 
      WHERE id = $1 
      AND expires_at > NOW() 
      AND used = false
    `, [priceLockId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 标记价格锁定为已使用
   */
  private async markPriceLockAsUsed(priceLockId: string): Promise<void> {
    await db.query(`
      UPDATE awe_price_locks 
      SET used = true, updated_at = NOW() 
      WHERE id = $1
    `, [priceLockId]);
  }

  /**
   * 获取完整的价格信息
   */
  async getFullPriceInfo(userId?: string): Promise<FullPriceInfo> {
    try {
      const aweUsdPrice = await this.getAweUsdPrice();
      
      // 计算各种会员类型的AWE金额（保留2位小数）
      const aweAmountForPlusMonthly = Math.round((parseFloat(MEMBERSHIP_PRICING.plus.monthly.amount) / aweUsdPrice * 0.8) * 100) / 100;
      const aweAmountForPlusYearly = Math.round((parseFloat(MEMBERSHIP_PRICING.plus.yearly.amount) / aweUsdPrice * 0.8) * 100) / 100;
      const aweAmountForProMonthly = Math.round((parseFloat(MEMBERSHIP_PRICING.pro.monthly.amount) / aweUsdPrice * 0.8) * 100) / 100;
      const aweAmountForProYearly = Math.round((parseFloat(MEMBERSHIP_PRICING.pro.yearly.amount) / aweUsdPrice * 0.8) * 100) / 100;

      // 计算Wei单位的金额（基于2位小数的AWE数量）
      const aweAmountForPlusMonthlyInWei = ethers.parseUnits(aweAmountForPlusMonthly.toFixed(2), AWE_TOKEN_CONFIG.decimals).toString();
      const aweAmountForPlusYearlyInWei = ethers.parseUnits(aweAmountForPlusYearly.toFixed(2), AWE_TOKEN_CONFIG.decimals).toString();
      const aweAmountForProMonthlyInWei = ethers.parseUnits(aweAmountForProMonthly.toFixed(2), AWE_TOKEN_CONFIG.decimals).toString();
      const aweAmountForProYearlyInWei = ethers.parseUnits(aweAmountForProYearly.toFixed(2), AWE_TOKEN_CONFIG.decimals).toString();

      // 如果提供了userId，创建价格锁定
      let priceLockId: string | undefined;
      if (userId) {
        // 为简化起见，创建一个通用的价格锁定，包含所有价格信息
        priceLockId = await this.createPriceLock(
          userId,
          'plus', // 默认值，实际使用时会根据用户选择覆盖
          'monthly', // 默认值，实际使用时会根据用户选择覆盖
          aweAmountForPlusMonthly.toFixed(2),
          aweAmountForPlusMonthlyInWei,
          MEMBERSHIP_PRICING.plus.monthly.amount,
          aweUsdPrice
        );
      }

      const priceInfo: FullPriceInfo = {
        success: true,
        data: {
          usdPrice: "4.99", // 这里可以根据需要调整为实际的USD价格
          aweUsdPrice: aweUsdPrice.toString(),
          aweAmountForPlusMonthly,
          aweAmountForPlusYearly,
          aweAmountForProMonthly,
          aweAmountForProYearly,
          tokenAddress: AWE_TOKEN_CONFIG.address,
          receiverAddress: AWE_TOKEN_CONFIG.receiverAddress,
          chainId: AWE_TOKEN_CONFIG.chainId,
          chainName: 'Base',
          priceLockId
        }
      };

      return priceInfo;
    } catch (error) {
      logger.error('Error getting full price info:', error);
      return {
        success: false,
        data: {
          usdPrice: "4.99",
          aweUsdPrice: "0.1",
          aweAmountForPlusMonthly: 0.1,
          aweAmountForPlusYearly: 0.1,
          aweAmountForProMonthly: 0.1,
          aweAmountForProYearly: 0.1,
          tokenAddress: AWE_TOKEN_CONFIG.address,
          receiverAddress: AWE_TOKEN_CONFIG.receiverAddress,
          chainId: AWE_TOKEN_CONFIG.chainId,
          chainName: 'Base'
        }
      };
    }
  }

  /**
   * 创建特定的价格锁定
   */
  async createSpecificPriceLock(
    userId: string,
    membershipType: 'plus' | 'pro',
    subscriptionType: 'monthly' | 'yearly'
  ): Promise<string> {
    const pricing = MEMBERSHIP_PRICING[membershipType][subscriptionType];
    const aweUsdPrice = await this.getAweUsdPrice();
    const aweAmount = Math.round((parseFloat(pricing.amount) / aweUsdPrice) * 100) / 100;
    const aweAmountInWei = ethers.parseUnits(aweAmount.toFixed(2), AWE_TOKEN_CONFIG.decimals);

    return this.createPriceLock(
      userId,
      membershipType,
      subscriptionType,
      aweAmount.toFixed(2),
      aweAmountInWei.toString(),
      pricing.amount,
      aweUsdPrice
    );
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
    const aweAmount = Math.round((parseFloat(pricing.amount) / aweUsdPrice) * 100) / 100;
    const aweAmountInWei = ethers.parseUnits(aweAmount.toFixed(2), AWE_TOKEN_CONFIG.decimals);

    const priceInfo: AwePriceInfo = {
      membershipType,
      subscriptionType,
      usdPrice: pricing.amount,
      aweAmount: aweAmount.toFixed(2),
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
    const { userId, membershipType, subscriptionType, transactionHash, priceLockId } = params;

    // 检查交易是否已被使用
    const existingPayment = await this.getPaymentByTransactionHash(transactionHash);
    if (existingPayment) {
      if (existingPayment.userId !== userId) {
        throw new Error('Transaction already used by another user');
      }
      // 如果是pending状态，检查是否可以更新为confirmed
      if (existingPayment.status === 'pending') {
        return await this.updatePaymentStatus(existingPayment);
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

    // 解析Transfer事件
    const transferEvent = await this.parseTransferEvent(receipt);
    if (!transferEvent) {
      throw new Error('Invalid AWE token transfer');
    }

    if (transferEvent.to.toLowerCase() !== AWE_TOKEN_CONFIG.receiverAddress.toLowerCase()) {
      throw new Error('Invalid receiver address');
    }

    // 获取期望的金额
    let expectedAmount: bigint;
    let usdPrice: string;
    let aweUsdPrice: number;

    if (priceLockId) {
      // 使用价格锁定
      const priceLock = await this.getPriceLock(priceLockId);
      if (!priceLock) {
        throw new Error('Price lock not found or expired');
      }
      
      if (priceLock.user_id !== userId) {
        throw new Error('Price lock belongs to another user');
      }

      if (priceLock.membership_type !== membershipType || priceLock.subscription_type !== subscriptionType) {
        throw new Error('Price lock does not match the requested membership');
      }

      expectedAmount = BigInt(priceLock.awe_amount_in_wei);
      usdPrice = priceLock.usd_price;
      aweUsdPrice = parseFloat(priceLock.awe_usd_price);
    } else {
      // 重新计算价格（保留旧逻辑以向后兼容）
      const priceInfo = await this.calculatePrice(membershipType, subscriptionType);
      expectedAmount = BigInt(priceInfo.aweAmountInWei);
      usdPrice = priceInfo.usdPrice;
      aweUsdPrice = priceInfo.aweUsdPrice;
    }

    const actualAmount = BigInt(transferEvent.value);
    
    if (actualAmount < expectedAmount) {
      const expectedAwe = parseFloat(ethers.formatUnits(expectedAmount, AWE_TOKEN_CONFIG.decimals)).toFixed(2);
      const receivedAwe = parseFloat(ethers.formatUnits(actualAmount, AWE_TOKEN_CONFIG.decimals)).toFixed(2);
      
      throw new Error(
        `Insufficient payment amount. Expected: ${expectedAwe} AWE, ` +
        `Received: ${receivedAwe} AWE`
      );
    }

    // 检查确认数
    const currentBlock = await this.provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    const isConfirmed = confirmations >= 3;

    // 创建支付记录
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (isConfirmed ? 365 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)); // confirmed: 1年，pending: 24小时
    
    const payment: AwePayment = {
      id: uuidv4(),
      userId,
      membershipType,
      subscriptionType,
      amount: ethers.formatUnits(actualAmount, AWE_TOKEN_CONFIG.decimals),
      amountInWei: actualAmount.toString(),
      usdValue: usdPrice,
      status: isConfirmed ? 'confirmed' : 'pending',
      transactionHash,
      blockNumber: receipt.blockNumber,
      fromAddress: transferEvent.from,
      expiresAt,
      confirmedAt: isConfirmed ? now : undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.savePayment(payment);
    
    // 如果使用了价格锁定，标记为已使用
    if (priceLockId) {
      await this.markPriceLockAsUsed(priceLockId);
    }
    
    // 只有在确认后才更新用户会员信息
    if (isConfirmed) {
      await this.updateUserMembership(userId, membershipType, subscriptionType);
    }

    logger.info(`AWE payment ${isConfirmed ? 'confirmed' : 'pending'}: ${payment.id} (tx: ${transactionHash}, confirmations: ${confirmations})`);
    return payment;
  }

  /**
   * 更新支付状态（检查pending支付是否已确认）
   */
  async updatePaymentStatus(payment: AwePayment): Promise<AwePayment> {
    if (payment.status !== 'pending' || !payment.transactionHash || !payment.blockNumber) {
      return payment;
    }

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - payment.blockNumber;
      
      if (confirmations >= 3) {
        // 更新为已确认状态
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年
        
        await db.query(
          `UPDATE awe_payments 
           SET status = 'confirmed', confirmed_at = $1, expires_at = $2, updated_at = $3 
           WHERE id = $4`,
          [now, expiresAt, now, payment.id]
        );

        // 更新用户会员信息
        await this.updateUserMembership(
          payment.userId, 
          payment.membershipType, 
          payment.subscriptionType
        );

        // 返回更新后的支付记录
        payment.status = 'confirmed';
        payment.confirmedAt = now;
        payment.expiresAt = expiresAt;
        payment.updatedAt = now;

        logger.info(`AWE payment confirmed after recheck: ${payment.id} (confirmations: ${confirmations})`);
      }
    } catch (error) {
      logger.error(`Error updating payment status for ${payment.id}:`, error);
    }

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
    const cacheKey = 'awe_usd_price';
    const cached = this.priceCache.get<number>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      if (!CMC_CONFIG.apiKey) {
        throw new Error('CMC_API_KEY environment variable is not set');
      }

      const url = `${CMC_CONFIG.baseUrl}/cryptocurrency/quotes/latest?id=${CMC_CONFIG.aweTokenId}`;
      const response = await fetch(url, {
        headers: {
          'X-CMC_PRO_API_KEY': CMC_CONFIG.apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`CoinMarketCap API error: ${response.status}`);
      }

      const data = await response.json() as CoinMarketCapResponse;
      
      if (!data.data || !data.data[CMC_CONFIG.aweTokenId]) {
        throw new Error('Invalid CoinMarketCap API response');
      }

      const price = data.data[CMC_CONFIG.aweTokenId].quote.USD.price;
      
      if (typeof price !== 'number' || price <= 0) {
        throw new Error('Invalid price from CoinMarketCap');
      }

      this.priceCache.set(cacheKey, price);
      logger.info(`AWE token price updated: $${price}`);
      
      return price;
    } catch (error) {
      logger.error('Error fetching AWE price from CoinMarketCap:', error);
      // 返回默认价格作为备用
      return 0.1;
    }
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