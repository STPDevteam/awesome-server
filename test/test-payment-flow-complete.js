#!/usr/bin/env node

/**
 * 完整支付流程测试脚本
 * 包括：登录认证、创建支付、验证状态
 */

import fetch from 'node-fetch';
import readline from 'readline';
import { SiweMessage } from 'siwe';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// 测试配置
const TEST_CONFIG = {
  walletAddress: '0x1234567890123456789012345678901234567890', // 测试钱包地址
  chainId: 1, // Ethereum mainnet
  domain: 'localhost:3001',
  membershipType: 'plus',
  subscriptionType: 'monthly' // 1 USDT 测试
};

// 创建命令行交互
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

// API 请求辅助函数
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  const data = await response.json();
  return { response, data };
}

// 步骤 1: 获取 nonce
async function getNonce(address) {
  console.log('\n📝 步骤 1: 获取 nonce...');
  const { data } = await apiRequest('/api/auth/wallet/nonce', {
    method: 'POST',
    body: JSON.stringify({ address })
  });
  
  if (data.nonce) {
    console.log('✅ Nonce 获取成功:', data.nonce);
    return data.nonce;
  } else {
    throw new Error('获取 nonce 失败');
  }
}

// 步骤 2: 创建签名消息
function createSiweMessage(address, nonce) {
  console.log('\n📝 步骤 2: 创建 SIWE 消息...');
  
  const message = new SiweMessage({
    domain: TEST_CONFIG.domain,
    address: address,
    statement: 'Sign in with Ethereum to the app.',
    uri: `http://${TEST_CONFIG.domain}`,
    version: '1',
    chainId: TEST_CONFIG.chainId,
    nonce: nonce,
    issuedAt: new Date().toISOString()
  });
  
  const messageText = message.prepareMessage();
  console.log('✅ SIWE 消息创建成功');
  console.log('📄 消息内容:\n', messageText);
  
  return messageText;
}

// 步骤 3: 钱包登录
async function walletLogin(message, signature) {
  console.log('\n📝 步骤 3: 钱包登录...');
  
  const { response, data } = await apiRequest('/api/auth/wallet/login', {
    method: 'POST',
    body: JSON.stringify({
      message,
      signature
    })
  });
  
  if (response.ok && data.accessToken) {
    console.log('✅ 登录成功!');
    console.log('🔑 Access Token:', data.accessToken.substring(0, 20) + '...');
    console.log('👤 用户 ID:', data.user.id);
    return data.accessToken;
  } else {
    throw new Error('登录失败: ' + JSON.stringify(data));
  }
}

// 步骤 4: 创建支付订单
async function createPayment(token) {
  console.log('\n📝 步骤 4: 创建支付订单...');
  console.log(`💳 订阅类型: ${TEST_CONFIG.membershipType} ${TEST_CONFIG.subscriptionType}`);
  console.log('💰 金额: 1 USDT (测试价格)');
  
  const { response, data } = await apiRequest('/api/payment/create-payment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      membershipType: TEST_CONFIG.membershipType,
      subscriptionType: TEST_CONFIG.subscriptionType
    })
  });
  
  if (response.ok && data.success) {
    console.log('✅ 支付订单创建成功!');
    console.log('🆔 支付 ID:', data.data.paymentId);
    console.log('🔗 支付链接:', data.data.checkoutUrl);
    console.log('⏰ 过期时间:', data.data.expiresAt);
    return data.data;
  } else {
    throw new Error('创建支付失败: ' + JSON.stringify(data));
  }
}

// 步骤 5: 检查支付状态
async function checkPaymentStatus(token, paymentId) {
  console.log('\n📝 步骤 5: 检查支付状态...');
  
  const { data } = await apiRequest(`/api/payment/payment/${paymentId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (data.success) {
    console.log('✅ 支付状态:', data.data.status);
    console.log('📅 创建时间:', data.data.createdAt);
    return data.data;
  } else {
    throw new Error('获取支付状态失败');
  }
}

// 步骤 6: 检查会员状态
async function checkMembershipStatus(token) {
  console.log('\n📝 步骤 6: 检查会员状态...');
  
  const { data } = await apiRequest('/api/payment/membership-status', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (data.success) {
    console.log('✅ 会员状态:');
    console.log('  - 是否激活:', data.data.isActive);
    console.log('  - 会员类型:', data.data.membershipType || '无');
    console.log('  - 订阅方式:', data.data.subscriptionType || '无');
    console.log('  - 到期时间:', data.data.expiresAt || '无');
    return data.data;
  } else {
    throw new Error('获取会员状态失败');
  }
}

// 模拟 webhook 回调
async function simulateWebhook(paymentId, userId) {
  console.log('\n📝 模拟 Webhook 回调（仅用于测试）...');
  
  const webhookData = {
    id: 'test-event-' + Date.now(),
    type: 'charge:confirmed',
    api_version: '2018-03-22',
    created_at: new Date().toISOString(),
    data: {
      id: 'test-charge-id',
      code: 'TEST123',
      name: 'PLUS monthly 会员',
      description: 'PLUS 会员 - 月付',
      hosted_url: 'https://commerce.coinbase.com/checkout/test',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      confirmed_at: new Date().toISOString(),
      pricing_type: 'fixed_price',
      metadata: {
        paymentId: paymentId,
        userId: userId,
        membershipType: TEST_CONFIG.membershipType,
        subscriptionType: TEST_CONFIG.subscriptionType
      }
    }
  };
  
  const { response, data } = await apiRequest('/api/payment/webhooks/coinbase', {
    method: 'POST',
    headers: {
      'X-CC-Webhook-Signature': 'test-signature'
    },
    body: JSON.stringify(webhookData)
  });
  
  console.log('⚠️  注意: 在生产环境中，webhook 由 Coinbase Commerce 自动调用');
  console.log('📊 Webhook 响应状态:', response.status);
  
  return { response, data };
}

// 主测试流程
async function runFullTest() {
  console.log('🚀 开始完整支付流程测试');
  console.log('================================\n');
  
  try {
    // 步骤 1: 获取 nonce
    const nonce = await getNonce(TEST_CONFIG.walletAddress);
    
    // 步骤 2: 创建 SIWE 消息
    const message = createSiweMessage(TEST_CONFIG.walletAddress, nonce);
    
    // 步骤 3: 模拟签名（实际应用中需要真实钱包签名）
    console.log('\n⚠️  注意: 在实际应用中，需要使用钱包（如 MetaMask）签名');
    console.log('📝 这里使用模拟签名进行测试\n');
    
    const mockSignature = '0x' + '1'.repeat(130); // 模拟签名
    
    // 钱包登录
    const token = await walletLogin(message, mockSignature);
    
    // 步骤 4: 创建支付订单
    const payment = await createPayment(token);
    
    // 显示支付信息
    console.log('\n' + '='.repeat(60));
    console.log('💳 请访问以下链接完成支付:');
    console.log(`🔗 ${payment.checkoutUrl}`);
    console.log('='.repeat(60) + '\n');
    
    // 等待用户确认
    await question('按 Enter 键继续检查支付状态...');
    
    // 步骤 5: 检查支付状态
    const paymentStatus = await checkPaymentStatus(token, payment.paymentId);
    
    // 步骤 6: 检查会员状态（支付前）
    console.log('\n--- 支付前的会员状态 ---');
    await checkMembershipStatus(token);
    
    // 询问是否模拟 webhook
    const simulateAnswer = await question('\n是否模拟 webhook 回调？(y/n): ');
    
    if (simulateAnswer.toLowerCase() === 'y') {
      // 模拟 webhook 回调
      await simulateWebhook(payment.paymentId, paymentStatus.userId);
      
      // 等待处理
      console.log('\n⏳ 等待 2 秒让系统处理 webhook...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 再次检查会员状态
      console.log('\n--- 支付后的会员状态 ---');
      await checkMembershipStatus(token);
    }
    
    console.log('\n✅ 测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
  } finally {
    rl.close();
  }
}

// 显示使用说明
console.log('📖 支付流程测试说明');
console.log('===================');
console.log('1. 此脚本将模拟完整的支付流程');
console.log('2. Plus 月付已设置为 1 USDT 方便测试');
console.log('3. 实际支付需要在 Coinbase Commerce 页面完成');
console.log('4. Webhook 回调在生产环境由 Coinbase 自动触发');
console.log('5. 请确保服务器正在运行: http://localhost:3001');
console.log('');

// 询问是否开始
question('准备好开始测试了吗？(y/n): ').then(answer => {
  if (answer.toLowerCase() === 'y') {
    runFullTest();
  } else {
    console.log('测试已取消');
    rl.close();
  }
}); 