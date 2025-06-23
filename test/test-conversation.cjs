// 测试对话相关功能
require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');

// 服务器URL
const API_URL = 'http://localhost:3001/api';

// 创建测试用户token
function createTestToken() {
  const payload = {
    userId: 'test-user-1750681174696', // 使用刚刚创建的测试用户ID
    walletAddress: '0x1234567890123456789012345678901234567890'
  };
  
  const secret = process.env.JWT_ACCESS_SECRET || 'test_secret';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// API请求工具
async function apiCall(method, endpoint, data = null, params = null) {
  const token = createTestToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios({
      method,
      url: `${API_URL}${endpoint}`,
      data,
      params,
      headers
    });
    return response.data;
  } catch (error) {
    console.error('API请求错误:', error.response?.data || error.message);
    throw error;
  }
}

// 测试流程
async function testConversationFlow() {
  try {
    console.log('开始测试对话流程...');

    // 1. 创建对话
    console.log('\n步骤1: 创建新对话');
    const conversationResult = await apiCall('post', '/conversation', {
      title: '测试对话 ' + new Date().toLocaleString()
    });
    console.log('✓ 对话创建成功:', conversationResult.data.conversation);
    
    const conversationId = conversationResult.data.conversation.id;

    // 2. 向对话发送消息
    console.log('\n步骤2: 发送聊天消息');
    const chatMessageResult = await apiCall('post', `/conversation/${conversationId}/message`, {
      content: '你好，这是一条测试消息!'
    });
    console.log('✓ 聊天消息发送成功:', {
      userMessage: chatMessageResult.data.userMessage,
      assistantResponse: chatMessageResult.data.assistantResponse?.content.substring(0, 50) + '...'
    });

    // 3. 发送任务意图的消息
    console.log('\n步骤3: 发送任务消息');
    const taskMessageResult = await apiCall('post', `/conversation/${conversationId}/message`, {
      content: '帮我执行一个任务：分析下今天的天气怎么样'
    });
    console.log('✓ 任务消息发送成功:', {
      userMessage: taskMessageResult.data.userMessage,
      taskId: taskMessageResult.data.taskId,
      intent: taskMessageResult.data.intent
    });

    // 4. 获取对话详情
    console.log('\n步骤4: 获取对话详情');
    const conversationDetails = await apiCall('get', `/conversation/${conversationId}`);
    console.log('✓ 获取对话详情成功:', {
      conversation: conversationDetails.data.conversation,
      messageCount: conversationDetails.data.messages.length
    });

    console.log('\n✅ 测试完成！对话-任务关系功能工作正常');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testConversationFlow(); 