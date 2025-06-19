#!/usr/bin/env node

/**
 * Coinbase Commerce 集成测试脚本
 * 用于快速验证支付功能是否正常工作
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// 测试颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`)
};

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.json();
    return { 
      status: response.status, 
      ok: response.ok,
      data 
    };
  } catch (error) {
    return { 
      status: 0, 
      ok: false,
      error: error.message 
    };
  }
}

async function runTests() {
  console.log('\n🧪 开始 Coinbase Commerce 集成测试\n');

  // 1. 测试健康检查
  log.info('测试健康检查...');
  const health = await makeRequest('/health');
  if (health.ok) {
    log.success('服务器运行正常');
  } else {
    log.error('服务器无响应');
    return;
  }

  // 2. 测试定价 API（无需认证）
  log.info('\n测试定价 API...');
  const pricing = await makeRequest('/api/payment/pricing');
  if (pricing.ok && pricing.data.success) {
    log.success('定价 API 正常');
    console.log('  Plus 月付:', pricing.data.data.plus.monthly);
    console.log('  Plus 年付:', pricing.data.data.plus.yearly);
    console.log('  Pro 月付:', pricing.data.data.pro.monthly);
    console.log('  Pro 年付:', pricing.data.data.pro.yearly);
  } else {
    log.error('定价 API 失败');
  }

  // 3. 测试环境变量
  log.info('\n检查环境变量...');
  const hasApiKey = !!process.env.COINBASE_COMMERCE_API_KEY;
  const hasWebhookSecret = !!process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  
  if (hasApiKey) {
    log.success('COINBASE_COMMERCE_API_KEY 已设置');
  } else {
    log.warn('COINBASE_COMMERCE_API_KEY 未设置');
  }
  
  if (hasWebhookSecret) {
    log.success('COINBASE_COMMERCE_WEBHOOK_SECRET 已设置');
  } else {
    log.warn('COINBASE_COMMERCE_WEBHOOK_SECRET 未设置');
  }

  // 4. 测试创建支付（需要认证）
  log.info('\n测试需要认证的端点...');
  const payment = await makeRequest('/api/payment/create-payment', {
    method: 'POST',
    body: JSON.stringify({
      membershipType: 'plus',
      subscriptionType: 'monthly'
    })
  });

  if (payment.status === 401) {
    log.info('未认证请求被正确拒绝（预期行为）');
  } else if (payment.ok) {
    log.warn('未认证请求不应该成功');
  }

  // 5. 测试 Webhook 端点
  log.info('\n测试 Webhook 端点...');
  const webhook = await makeRequest('/api/payment/webhooks/coinbase', {
    method: 'POST',
    headers: {
      'X-CC-Webhook-Signature': 'test-signature'
    },
    body: JSON.stringify({
      id: 'test-event',
      type: 'charge:confirmed',
      data: {}
    })
  });

  if (webhook.status === 400) {
    log.success('Webhook 签名验证正常工作');
  } else {
    log.warn('Webhook 端点可能未正确配置');
  }

  // 总结
  console.log('\n📊 测试总结:');
  if (hasApiKey && hasWebhookSecret) {
    log.success('Coinbase Commerce 集成已就绪');
    console.log('\n下一步:');
    console.log('1. 使用认证 token 测试创建支付');
    console.log('2. 在 Coinbase Commerce 控制台配置 webhook');
    console.log('3. 使用真实支付进行端到端测试');
  } else {
    log.warn('请先配置环境变量');
    console.log('\n需要设置:');
    if (!hasApiKey) console.log('- COINBASE_COMMERCE_API_KEY');
    if (!hasWebhookSecret) console.log('- COINBASE_COMMERCE_WEBHOOK_SECRET');
  }
}

// 运行测试
runTests().catch(console.error); 