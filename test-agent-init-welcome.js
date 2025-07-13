const axios = require('axios');

// 配置
const baseURL = 'http://localhost:3001';
const testUserId = 'test-user-123';

// 测试用的访问令牌（需要替换为实际的令牌）
const accessToken = 'your-test-access-token';

const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};

async function testAgentInitWelcome() {
  console.log('🧪 测试Agent初始化欢迎语功能');
  console.log('==========================================');
  
  try {
    // 1. 假设我们有一个测试Agent ID
    const testAgentId = 'test-agent-id';
    
    console.log(`\n📋 Step 1: 初始化Agent对话环境 (Agent ID: ${testAgentId})`);
    
    const initResponse = await axios.post(
      `${baseURL}/api/agent/${testAgentId}/init`,
      {},
      { headers }
    );
    
    console.log('✅ 初始化响应状态:', initResponse.status);
    console.log('📝 响应数据:', JSON.stringify(initResponse.data, null, 2));
    
    if (initResponse.data.success) {
      console.log('\n🎉 成功！Agent初始化完成');
      console.log('📞 对话ID:', initResponse.data.data.conversationId);
      console.log('🤖 Agent信息:', initResponse.data.data.agentInfo);
      console.log('👋 欢迎语:');
      console.log('----------------------------------------');
      console.log(initResponse.data.data.welcomeMessage);
      console.log('----------------------------------------');
      console.log('✅ Ready状态:', initResponse.data.data.ready);
      
      // 验证响应结构
      const expectedFields = ['conversationId', 'agentInfo', 'welcomeMessage', 'ready'];
      const actualFields = Object.keys(initResponse.data.data);
      
      console.log('\n🔍 响应字段验证:');
      expectedFields.forEach(field => {
        const hasField = actualFields.includes(field);
        console.log(`  ${hasField ? '✅' : '❌'} ${field}: ${hasField ? '存在' : '缺失'}`);
      });
      
      // 检查是否还有旧的message字段
      const hasOldMessage = actualFields.includes('message');
      console.log(`  ${hasOldMessage ? '⚠️' : '✅'} message字段: ${hasOldMessage ? '仍然存在（应该移除）' : '已移除'}`);
      
    } else {
      console.log('❌ 初始化失败:', initResponse.data);
      
      if (initResponse.data.needsAuth) {
        console.log('🔐 需要MCP认证:', initResponse.data.missingAuth);
        console.log('📝 认证提示:', initResponse.data.message);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 提示: 请确保使用有效的访问令牌');
    } else if (error.response?.status === 404) {
      console.log('💡 提示: 请确保Agent ID存在');
    }
  }
}

// 运行测试
testAgentInitWelcome(); 