#!/usr/bin/env node

import axios from 'axios';

// 配置
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_TOKEN = process.env.TEST_TOKEN || '';

async function testClearMembership() {
  console.log('🧪 测试清除用户会员状态接口...\n');

  if (!TEST_USER_TOKEN) {
    console.log('❌ 请设置 TEST_TOKEN 环境变量');
    console.log('使用方法: TEST_TOKEN=your_token node test-clear-membership.js');
    process.exit(1);
  }

  try {
    // 1. 首先查看当前会员状态
    console.log('1️⃣ 查看当前会员状态...');
    const currentStatusResponse = await axios.get(
      `${API_URL}/api/payment/membership-status`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      }
    );

    console.log('✅ 当前会员状态:');
    console.log(JSON.stringify(currentStatusResponse.data, null, 2));

    // 2. 清除会员状态
    console.log('\n2️⃣ 清除会员状态...');
    const clearResponse = await axios.delete(
      `${API_URL}/api/payment/membership`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      }
    );

    console.log('✅ 清除会员状态成功:');
    console.log(JSON.stringify(clearResponse.data, null, 2));

    // 3. 再次查看会员状态确认已清除
    console.log('\n3️⃣ 确认会员状态已清除...');
    const afterClearResponse = await axios.get(
      `${API_URL}/api/payment/membership-status`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      }
    );

    console.log('✅ 清除后的会员状态:');
    console.log(JSON.stringify(afterClearResponse.data, null, 2));

    console.log('\n🎉 测试完成！');
    
    // 检查状态是否确实被清除
    const membershipData = afterClearResponse.data.data;
    if (!membershipData.isActive && 
        !membershipData.membershipType && 
        !membershipData.subscriptionType) {
      console.log('✅ 会员状态已成功清除');
    } else {
      console.log('⚠️  会员状态似乎没有完全清除');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('错误详情:', error.response.data.error);
    }
    if (error.response?.status === 401) {
      console.error('💡 提示: 请检查 TEST_TOKEN 是否有效');
    }
  }
}

// 运行测试
testClearMembership(); 