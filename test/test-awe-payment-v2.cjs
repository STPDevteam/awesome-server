/**
 * 测试AWE支付功能
 * 
 * 运行方式:
 * node test/test-awe-payment-v2.cjs
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

// 测试用的JWT token - 请替换为实际的token
const AUTH_TOKEN = process.env.TEST_JWT_TOKEN || 'your_test_jwt_token_here';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function calculatePrice() {
  console.log('\n=== 计算AWE价格 ===');
  
  try {
    const response = await api.get('/payment/calculate-awe-price', {
      params: {
        membershipType: 'plus',
        subscriptionType: 'monthly'
      }
    });
    
    console.log('价格信息:', JSON.stringify(response.data, null, 2));
    return response.data.data;
  } catch (error) {
    console.error('计算价格失败:', error.response?.data || error.message);
    throw error;
  }
}

async function confirmPayment(transactionHash) {
  console.log('\n=== 确认AWE支付 ===');
  
  try {
    const response = await api.post('/payment/confirm-awe-payment', {
      membershipType: 'plus',
      subscriptionType: 'monthly',
      transactionHash
    });
    
    console.log('支付确认成功:', JSON.stringify(response.data, null, 2));
    return response.data.data;
  } catch (error) {
    console.error('确认支付失败:', error.response?.data || error.message);
    throw error;
  }
}

async function getPaymentHistory() {
  console.log('\n=== 获取支付历史 ===');
  
  try {
    const response = await api.get('/payment/awe-payments');
    console.log('支付历史:', JSON.stringify(response.data, null, 2));
    return response.data.data;
  } catch (error) {
    console.error('获取支付历史失败:', error.response?.data || error.message);
    throw error;
  }
}

async function runTest() {
  try {
    // 1. 计算价格
    const priceInfo = await calculatePrice();
    console.log(`\n需要支付: ${priceInfo.aweAmount} AWE ($${priceInfo.usdPrice} USD)`);
    console.log(`接收地址: ${priceInfo.receiverAddress}`);
    console.log(`AWE代币地址: ${priceInfo.tokenAddress}`);
    
    // 2. 模拟用户支付（在实际场景中，用户会通过钱包发送交易）
    console.log('\n请通过钱包向以下地址发送AWE代币:');
    console.log(`接收地址: ${priceInfo.receiverAddress}`);
    console.log(`数量: ${priceInfo.aweAmount} AWE`);
    console.log(`链: Base (Chain ID: ${priceInfo.chainId})`);
    
    // 3. 用户支付后，使用交易哈希确认支付
    const testTxHash = process.argv[2];
    if (testTxHash) {
      console.log(`\n使用交易哈希确认支付: ${testTxHash}`);
      await confirmPayment(testTxHash);
    } else {
      console.log('\n提示: 支付后运行 node test/test-awe-payment-v2.cjs <transaction_hash> 来确认支付');
    }
    
    // 4. 查看支付历史
    await getPaymentHistory();
    
  } catch (error) {
    console.error('\n测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
runTest(); 