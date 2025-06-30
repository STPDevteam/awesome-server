import { logger } from '../dist/utils/logger.js';

// 配置测试环境
const API_BASE = 'http://localhost:3001';

/**
 * 测试对话创建限制功能
 */
async function testConversationLimits() {
  console.log('🧪 开始测试对话创建限制功能...\n');
  
  try {
    // 1. 测试获取限制信息接口
    await testGetLimitInfo();
    
    // 2. 测试普通用户创建对话（超出限制）
    await testCreateConversationWithLimits();
    
    // 3. 测试流式创建对话（超出限制）
    await testStreamCreateConversationWithLimits();
    
    console.log('\n✅ 所有测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

/**
 * 测试获取限制信息接口
 */
async function testGetLimitInfo() {
  console.log('📊 测试获取对话限制信息...');
  
  try {
    // 使用测试用户ID
    const testUserId = 'test-user-123';
    
    const response = await fetch(`${API_BASE}/api/conversation/limit?userId=${testUserId}`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ 获取限制信息成功:');
      console.log(`   - 会员类型: ${data.data.membershipType}`);
      console.log(`   - 每日限制: ${data.data.dailyLimit === -1 ? '无限制' : data.data.dailyLimit}`);
      console.log(`   - 今日已创建: ${data.data.todayCreated}`);
      console.log(`   - 剩余数量: ${data.data.remainingCount === -1 ? '无限制' : data.data.remainingCount}`);
      console.log(`   - 可以创建: ${data.data.canCreate ? '是' : '否'}`);
    } else {
      console.log('⚠️ 获取限制信息返回错误:', data.message);
    }
  } catch (error) {
    console.error('❌ 获取限制信息测试失败:', error.message);
  }
  
  console.log('');
}

/**
 * 测试创建对话接口的限制
 */
async function testCreateConversationWithLimits() {
  console.log('🚀 测试创建对话限制...');
  
  try {
    // 使用测试用户ID（普通用户）
    const testUserId = 'test-user-001';
    
    // 尝试创建对话
    const response = await fetch(`${API_BASE}/api/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: testUserId,
        title: '测试对话',
        firstMessage: '这是一个测试消息'
      })
    });
    
    const data = await response.json();
    
    if (response.status === 429) {
      console.log('✅ 限制检查正常工作，返回429状态码:');
      console.log(`   - 错误类型: ${data.error}`);
      console.log(`   - 错误消息: ${data.message}`);
      console.log(`   - 会员类型: ${data.data.membershipType}`);
      console.log(`   - 每日限制: ${data.data.dailyLimit}`);
      console.log(`   - 今日已创建: ${data.data.todayCreated}`);
    } else if (data.success) {
      console.log('✅ 创建对话成功（未超出限制）:');
      console.log(`   - 对话ID: ${data.data.conversation.id}`);
      console.log(`   - 标题: ${data.data.conversation.title}`);
    } else {
      console.log('⚠️ 创建对话返回其他错误:', data.message);
    }
  } catch (error) {
    console.error('❌ 创建对话限制测试失败:', error.message);
  }
  
  console.log('');
}

/**
 * 测试流式创建对话接口的限制
 */
async function testStreamCreateConversationWithLimits() {
  console.log('📡 测试流式创建对话限制...');
  
  try {
    // 使用测试用户ID（普通用户）
    const testUserId = 'test-user-123';
    
    // 尝试流式创建对话
    const response = await fetch(`${API_BASE}/api/conversation/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: testUserId,
        title: '测试流式对话',
        firstMessage: '这是一个流式测试消息'
      })
    });
    
    if (response.status === 429) {
      const data = await response.json();
      console.log('✅ 流式接口限制检查正常工作，返回429状态码:');
      console.log(`   - 错误类型: ${data.error}`);
      console.log(`   - 错误消息: ${data.message}`);
      console.log(`   - 会员类型: ${data.data.membershipType}`);
    } else if (response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('✅ 流式创建对话成功（未超出限制）');
      console.log('   - 返回了事件流响应');
    } else {
      const data = await response.json();
      console.log('⚠️ 流式创建对话返回其他错误:', data.message || '未知错误');
    }
  } catch (error) {
    console.error('❌ 流式创建对话限制测试失败:', error.message);
  }
  
  console.log('');
}

/**
 * 测试不同会员等级的限制
 */
async function testDifferentMembershipLimits() {
  console.log('👥 测试不同会员等级的限制...');
  
  const testCases = [
    { userId: 'free-user-123', expectedType: 'free', expectedLimit: 3 },
    { userId: 'plus-user-123', expectedType: 'plus', expectedLimit: 10 },
    { userId: 'pro-user-123', expectedType: 'pro', expectedLimit: -1 }
  ];
  
  for (const testCase of testCases) {
    try {
      const response = await fetch(`${API_BASE}/api/conversation/limit?userId=${testCase.userId}`);
      const data = await response.json();
      
      if (data.success) {
        const isCorrect = data.data.membershipType === testCase.expectedType && 
                         data.data.dailyLimit === testCase.expectedLimit;
        
        console.log(`${isCorrect ? '✅' : '❌'} ${testCase.expectedType.toUpperCase()}用户测试:`);
        console.log(`   - 期望: ${testCase.expectedType}, 限制: ${testCase.expectedLimit}`);
        console.log(`   - 实际: ${data.data.membershipType}, 限制: ${data.data.dailyLimit}`);
      } else {
        console.log(`❌ ${testCase.expectedType.toUpperCase()}用户测试失败:`, data.message);
      }
    } catch (error) {
      console.error(`❌ ${testCase.expectedType.toUpperCase()}用户测试异常:`, error.message);
    }
  }
  
  console.log('');
}

// 运行测试
if (import.meta.main === module) {
  testConversationLimits().catch(console.error);
}

module.exports = {
  testConversationLimits,
  testGetLimitInfo,
  testCreateConversationWithLimits,
  testStreamCreateConversationWithLimits,
  testDifferentMembershipLimits
}; 