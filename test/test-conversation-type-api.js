const axios = require('axios');

// 测试配置
const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-user-123';

async function testConversationTypeAPI() {
  console.log('🧪 Testing Conversation Type API...\n');
  
  try {
    // 1. 测试获取对话列表接口
    console.log('1. Testing GET /api/conversation');
    const response = await axios.get(`${BASE_URL}/api/conversation`, {
      params: {
        userId: TEST_USER_ID,
        limit: 5
      }
    });
    
    console.log('✅ API Response Status:', response.status);
    console.log('📊 Response Data Structure:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // 检查是否有对话数据
    if (response.data.success && response.data.data.conversations.length > 0) {
      console.log('\n🔍 Analyzing conversation data:');
      
      response.data.data.conversations.forEach((conv, index) => {
        console.log(`\nConversation ${index + 1}:`);
        console.log(`  ID: ${conv.id}`);
        console.log(`  Title: ${conv.title}`);
        console.log(`  Type: ${conv.type || 'undefined'}`);
        console.log(`  Agent ID: ${conv.agentId || 'undefined'}`);
        console.log(`  Task Count: ${conv.taskCount}`);
        console.log(`  Message Count: ${conv.messageCount}`);
        console.log(`  Created At: ${conv.createdAt}`);
        
        // 检查type字段
        if (conv.type) {
          console.log(`  ✅ Type field is present: ${conv.type}`);
        } else {
          console.log(`  ❌ Type field is missing or undefined`);
        }
      });
    } else {
      console.log('ℹ️  No conversations found for this user');
    }
    
    // 2. 测试按类型过滤
    console.log('\n2. Testing type filtering');
    
    // 测试获取normal类型的对话
    console.log('\n2.1 Testing type=normal filter');
    const normalResponse = await axios.get(`${BASE_URL}/api/conversation`, {
      params: {
        userId: TEST_USER_ID,
        type: 'normal',
        limit: 5
      }
    });
    
    console.log('Normal conversations count:', normalResponse.data.data?.conversations?.length || 0);
    
    // 测试获取agent类型的对话
    console.log('\n2.2 Testing type=agent filter');
    const agentResponse = await axios.get(`${BASE_URL}/api/conversation`, {
      params: {
        userId: TEST_USER_ID,
        type: 'agent',
        limit: 5
      }
    });
    
    console.log('Agent conversations count:', agentResponse.data.data?.conversations?.length || 0);
    
    console.log('\n✅ Conversation Type API test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// 运行测试
testConversationTypeAPI(); 