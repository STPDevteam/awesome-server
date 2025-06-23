import express from 'express';
import { coinbaseCommerceService } from '../services/coinbaseCommerceService.js';
import { awePaymentService } from '../services/awePaymentService.js';
import { requireAuth } from '../middleware/auth.js';
import { MEMBERSHIP_PRICING } from '../models/User.js';

const router = express.Router();

/**
 * 获取会员定价信息
 */
router.get('/pricing', (req, res) => {
  res.json({
    success: true,
    data: MEMBERSHIP_PRICING
  });
});

/**
 * 创建支付订单
 */
router.post('/create-payment', requireAuth, async (req, res) => {
  try {
    const { membershipType, subscriptionType } = req.body;
    const userId = req.userId!;

    // 验证输入
    if (!membershipType || !subscriptionType) {
      return res.status(400).json({
        success: false,
        error: 'membershipType and subscriptionType are required'
      });
    }

    if (!['plus', 'pro'].includes(membershipType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid membershipType. Must be "plus" or "pro"'
      });
    }

    if (!['monthly', 'yearly'].includes(subscriptionType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscriptionType. Must be "monthly" or "yearly"'
      });
    }

    // 检查用户是否已有有效会员
    const membershipStatus = await coinbaseCommerceService.checkMembershipStatus(userId);
    if (membershipStatus.isActive) {
      return res.status(400).json({
        success: false,
        error: 'User already has active membership',
        data: membershipStatus
      });
    }

    // 获取定价
    const pricing = MEMBERSHIP_PRICING[membershipType as 'plus' | 'pro'][subscriptionType as 'monthly' | 'yearly'];

    // 创建支付
    const result = await coinbaseCommerceService.createPayment({
      userId,
      membershipType,
      subscriptionType,
      amount: pricing.amount,
      currency: 'USDT'
    });

    res.json({
      success: true,
      data: {
        paymentId: result.payment.id,
        checkoutUrl: result.checkoutUrl,
        amount: result.payment.amount,
        currency: result.payment.currency,
        membershipType: result.payment.membershipType,
        subscriptionType: result.payment.subscriptionType,
        expiresAt: result.payment.expiresAt
      }
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment'
    });
  }
});

/**
 * 获取支付状态
 */
router.get('/payment/:paymentId', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.userId!;

    const payment = await coinbaseCommerceService.getPayment(paymentId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // 确保用户只能查看自己的支付记录
    if (payment.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment'
    });
  }
});

/**
 * 获取用户支付历史
 */
router.get('/payments', requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const payments = await coinbaseCommerceService.getUserPayments(userId);

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payments'
    });
  }
});

/**
 * 获取用户会员状态
 */
router.get('/membership-status', requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const membershipStatus = await coinbaseCommerceService.checkMembershipStatus(userId);

    res.json({
      success: true,
      data: membershipStatus
    });
  } catch (error) {
    console.error('Get membership status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get membership status'
    });
  }
});

/**
 * Coinbase Commerce Webhook 处理器
 */
router.post('/webhooks/coinbase', async (req, res) => {
  try {
    const signature = req.get('X-CC-Webhook-Signature') as string;
    
    // 确保 rawBody 是字符串格式
    let rawBody: string;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    console.log('Webhook received:', {
      signature: signature ? signature.substring(0, 20) + '...' : 'missing',
      bodyType: typeof req.body,
      bodyLength: rawBody.length,
      isBuffer: Buffer.isBuffer(req.body)
    });

    if (!signature) {
      console.error('Missing webhook signature');
      return res.status(400).json({
        success: false,
        error: 'Missing webhook signature'
      });
    }

    // 处理 webhook 事件
    await coinbaseCommerceService.handleWebhook(rawBody, signature);

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * 计算AWE支付价格
 */
router.get('/calculate-awe-price', requireAuth, async (req, res) => {
  try {
    // 获取完整价格信息
    const priceInfo = await awePaymentService.getFullPriceInfo();

    res.json({
      success: true,
      data: priceInfo
    });
  } catch (error) {
    console.error('Calculate AWE price error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate AWE price'
    });
  }
});

/**
 * 确认AWE支付
 */
router.post('/confirm-awe-payment', requireAuth, async (req, res) => {
  try {
    const { membershipType, subscriptionType, transactionHash } = req.body;
    const userId = req.userId!;

    // 验证输入
    if (!membershipType || !subscriptionType || !transactionHash) {
      return res.status(400).json({
        success: false,
        error: 'membershipType, subscriptionType and transactionHash are required'
      });
    }

    if (!['plus', 'pro'].includes(membershipType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid membershipType. Must be "plus" or "pro"'
      });
    }

    if (!['monthly', 'yearly'].includes(subscriptionType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscriptionType. Must be "monthly" or "yearly"'
      });
    }

    // 检查用户是否已有有效会员
    const membershipStatus = await coinbaseCommerceService.checkMembershipStatus(userId);
    if (membershipStatus.isActive) {
      return res.status(400).json({
        success: false,
        error: 'User already has active membership',
        data: membershipStatus
      });
    }

    // 验证交易并创建支付记录
    const payment = await awePaymentService.verifyAndCreatePayment({
      userId,
      membershipType,
      subscriptionType,
      transactionHash
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        transactionHash: payment.transactionHash,
        confirmedAt: payment.confirmedAt,
        membershipType: payment.membershipType,
        subscriptionType: payment.subscriptionType
      }
    });
  } catch (error: any) {
    console.error('Confirm AWE payment error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to confirm AWE payment'
    });
  }
});

/**
 * 获取AWE支付状态
 */
router.get('/awe-payment/:paymentId', requireAuth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.userId!;

    const payment = await awePaymentService.getPayment(paymentId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // 确保用户只能查看自己的支付记录
    if (payment.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get AWE payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AWE payment'
    });
  }
});

/**
 * 获取用户的AWE支付历史
 */
router.get('/awe-payments', requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const payments = await awePaymentService.getUserPayments(userId);

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get AWE payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AWE payments'
    });
  }
});

export default router; 