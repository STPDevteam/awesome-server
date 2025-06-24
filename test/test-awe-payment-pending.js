#!/usr/bin/env node

import axios from 'axios';
import { ethers } from 'ethers';

// 配置
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_TOKEN = process.env.TEST_TOKEN || '';

// 测试配置
const TEST_CONFIG = {
  // 模拟一个交易哈希（实际测试时需要替换为真实的交易哈希）
  transactionHash: '0x' + '1'.repeat(64),
  membershipType: 'plus',
  subscriptionType: 'monthly'
};

async function testPendingPayment() {
  console.log('🧪 测试AWE支付Pending状态处理...\n');

  try {
    // 1. 首次调用confirm-awe-payment（假设确认数不足）
    console.log('1️⃣ 第一次调用 /confirm-awe-payment 接口...');
    const firstResponse = await axios.post(
      `${API_URL}/api/payment/confirm-awe-payment`,
      {
        membershipType: TEST_CONFIG.membershipType,
        subscriptionType: TEST_CONFIG.subscriptionType,
        transactionHash: TEST_CONFIG.transactionHash
      },
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ 第一次调用成功:');
    console.log(JSON.stringify(firstResponse.data, null, 2));

    const paymentId = firstResponse.data.data.paymentId;
    const status = firstResponse.data.data.status;

    console.log(`\n📊 支付状态: ${status}`);
    console.log(`💳 支付ID: ${paymentId}`);

    // 2. 查询支付状态
    console.log('\n2️⃣ 查询支付状态...');
    const statusResponse = await axios.get(
      `${API_URL}/api/payment/awe-payment/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      }
    );

    console.log('✅ 状态查询成功:');
    console.log(JSON.stringify(statusResponse.data, null, 2));

    // 3. 等待一段时间后再次调用（模拟确认数增加）
    console.log('\n3️⃣ 等待10秒后再次调用接口（模拟区块确认）...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const secondResponse = await axios.post(
      `${API_URL}/api/payment/confirm-awe-payment`,
      {
        membershipType: TEST_CONFIG.membershipType,
        subscriptionType: TEST_CONFIG.subscriptionType,
        transactionHash: TEST_CONFIG.transactionHash
      },
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ 第二次调用成功:');
    console.log(JSON.stringify(secondResponse.data, null, 2));

    // 4. 最终状态检查
    console.log('\n4️⃣ 最终状态检查...');
    const finalStatusResponse = await axios.get(
      `${API_URL}/api/payment/awe-payment/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      }
    );

    console.log('✅ 最终状态:');
    console.log(JSON.stringify(finalStatusResponse.data, null, 2));

    console.log('\n🎉 测试完成！');
    console.log('\n💡 注意事项:');
    console.log('1. 实际测试时需要使用真实的交易哈希');
    console.log('2. 需要等待实际的区块确认（约1-2分钟）');
    console.log('3. 定时任务会每30秒自动检查pending状态的支付');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('错误详情:', error.response.data.error);
    }
  }
}

// 运行测试
if (!TEST_USER_TOKEN) {
  console.log('使用方法:');
  console.log('  TEST_TOKEN=your_token node test-awe-payment-pending.js');
  console.log('\n或者使用真实的交易哈希:');
  console.log('  TEST_TOKEN=your_token REAL_TX_HASH=0x... node test-awe-payment-pending.js');
  process.exit(1);
}

// 如果提供了真实的交易哈希，使用它
if (process.env.REAL_TX_HASH) {
  TEST_CONFIG.transactionHash = process.env.REAL_TX_HASH;
  console.log(`📝 使用真实交易哈希: ${TEST_CONFIG.transactionHash}`);
}

testPendingPayment(); 