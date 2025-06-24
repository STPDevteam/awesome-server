// 测试会话API返回格式的一致性
require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');

// 服务器URL
const API_URL = 'http://localhost:3001/api';

// 创建测试用户token
function createTestToken() {
  const payload = {
    userId: 'test-user-1750681174696', // 使用已创建的测试用户ID
    walletAddress: '0x1234567890123456789012345678901234567890'
  };
  
  const secret = process.env.JWT_ACCESS_SECRET || 'test_secret';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// API请求工具
async function apiCall(method, endpoint, data = null) {
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
      headers
    });
    return response.data;
  } catch (error) {
    console.error('API请求错误:', error.response?.data || error.message);
    throw error;
  }
}

// 测试会话API返回格式
async function testConversationResponses() {
  try {
    console.log('开始测试会话API返回格式的一致性...');
    
    // 1. 创建新会话
    console.log('\n1. 创建新会话...');
    const conversation = await apiCall('POST', '/conversation', { title: '测试会话API返回格式' });
    console.log('会话创建成功:', conversation.data.id);
    
    const conversationId = conversation.data.id;
    
    // 2. 发送聊天类型消息
    console.log('\n2. 发送聊天类型消息...');
    const chatResponse = await apiCall('POST', `/conversation/${conversationId}/message`, {
      content: '你好，今天天气真不错！'
    });
    
    console.log('聊天消息响应:');
    console.log('- 意图类型:', chatResponse.data.intent);
    console.log('- 是否包含taskId字段:', chatResponse.data.hasOwnProperty('taskId'));
    console.log('- taskId值:', chatResponse.data.taskId);
    
    // 3. 发送任务类型消息
    console.log('\n3. 发送任务类型消息...');
    const taskResponse = await apiCall('POST', `/conversation/${conversationId}/message`, {
      content: '请帮我搜索关于TypeScript的最新信息'
    });
    
    console.log('任务消息响应:');
    console.log('- 意图类型:', taskResponse.data.intent);
    console.log('- 是否包含taskId字段:', taskResponse.data.hasOwnProperty('taskId'));
    console.log('- taskId值:', taskResponse.data.taskId);
    
    // 4. 验证格式一致性
    console.log('\n4. 验证返回格式一致性:');
    const chatKeys = Object.keys(chatResponse.data).sort();
    const taskKeys = Object.keys(taskResponse.data).sort();
    
    console.log('- 聊天响应字段:', chatKeys.join(', '));
    console.log('- 任务响应字段:', taskKeys.join(', '));
    console.log('- 字段结构一致:', JSON.stringify(chatKeys) === JSON.stringify(taskKeys) ? '✅ 是' : '❌ 否');
    
    console.log('\n测试完成!');
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 运行测试
testConversationResponses(); 