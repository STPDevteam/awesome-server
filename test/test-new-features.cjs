const axios = require('axios');

// 配置
const BASE_URL = 'https://api-test.awenetwork.ai';
const TEST_USER_ID = 'c4fe65c8-c0e8-4b5f-9a3b-3e5d8a7b4c2e'; // 使用测试用户
const TEST_CONVERSATION_ID = '678400ea-0aef-43fe-8a91-a5bf50f50f75'; // 你提到的对话ID

// 通用请求函数
async function makeRequest(method, url, data = null, headers = {}) {
  try {
    console.log(`\n🔄 ${method.toUpperCase()} ${url}`);
    if (data) {
      console.log('📤 Request data:', JSON.stringify(data, null, 2));
    }
    
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    console.log(`✅ Status: ${response.status}`);
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error(`❌ Error: ${error.response?.status || 'Unknown'}`);
    console.error('❌ Error details:', error.response?.data || error.message);
    throw error;
  }
}

// 测试1: 获取Agent Task历史记录
async function testAgentTaskHistory() {
  console.log('\n🧪 ===== 测试1: Agent Task历史记录 =====');
  
  try {
    // 首先获取一个Agent ID
    const agentsResponse = await makeRequest('GET', `/api/agent?queryType=public&limit=1&userId=${TEST_USER_ID}`);
    
    if (!agentsResponse.success || !agentsResponse.data.agents || agentsResponse.data.agents.length === 0) {
      console.log('⚠️ 没有找到可用的Agent，跳过Agent Task历史测试');
      return;
    }
    
    const testAgentId = agentsResponse.data.agents[0].id;
    console.log(`🤖 使用测试Agent: ${testAgentId} (${agentsResponse.data.agents[0].name})`);
    
    // 测试获取Agent Task历史记录
    const taskHistoryResponse = await makeRequest('GET', `/api/agent/${testAgentId}/tasks?userId=${TEST_USER_ID}&limit=5`);
    
    if (taskHistoryResponse.success) {
      console.log('✅ Agent Task历史记录API测试成功');
      console.log(`📊 找到 ${taskHistoryResponse.data.total} 个任务记录`);
      
      if (taskHistoryResponse.data.tasks && taskHistoryResponse.data.tasks.length > 0) {
        const latestTask = taskHistoryResponse.data.tasks[0];
        console.log('📋 最新任务信息:');
        console.log(`   - 任务ID: ${latestTask.id}`);
        console.log(`   - 标题: ${latestTask.title}`);
        console.log(`   - 状态: ${latestTask.status}`);
        console.log(`   - Agent: ${latestTask.agent.name}`);
        console.log(`   - 创建时间: ${latestTask.created_at}`);
      }
    } else {
      console.log('❌ Agent Task历史记录API测试失败');
    }
    
  } catch (error) {
    console.error('❌ Agent Task历史记录测试出错:', error.message);
  }
}

// 测试2: 获取对话中的最后使用MCP信息
async function testLastUsedMcpInfo() {
  console.log('\n🧪 ===== 测试2: 对话最后使用MCP信息 =====');
  
  try {
    // 测试指定的对话ID
    const conversationResponse = await makeRequest('GET', `/api/conversation/${TEST_CONVERSATION_ID}?userId=${TEST_USER_ID}`);
    
    if (conversationResponse.success) {
      console.log('✅ 对话详情API测试成功');
      console.log(`💬 对话标题: ${conversationResponse.data.conversation.title}`);
      console.log(`📊 消息数量: ${conversationResponse.data.messages.length}`);
      
      // 检查是否有最后使用的MCP信息
      if (conversationResponse.data.lastUsedMcp) {
        console.log('🎯 最后使用的MCP信息:');
        const mcp = conversationResponse.data.lastUsedMcp;
        console.log(`   - MCP名称: ${mcp.name}`);
        console.log(`   - 描述: ${mcp.description}`);
        console.log(`   - 类别: ${mcp.category}`);
        console.log(`   - 执行动作: ${mcp.action}`);
        console.log(`   - 步骤编号: ${mcp.stepNumber}`);
        console.log(`   - 任务ID: ${mcp.taskId}`);
        console.log(`   - 使用时间: ${mcp.usedAt}`);
        console.log(`   - 需要认证: ${mcp.authRequired}`);
        console.log(`   - 已认证: ${mcp.authVerified}`);
      } else {
        console.log('📝 该对话中没有使用过MCP工具');
      }
      
      // 检查消息中是否有任务相关的metadata
      const taskMessages = conversationResponse.data.messages.filter(msg => msg.taskId);
      console.log(`🔗 找到 ${taskMessages.length} 个任务相关消息`);
      
      if (taskMessages.length > 0) {
        console.log('📋 任务消息示例:');
        const latestTaskMessage = taskMessages[taskMessages.length - 1];
        console.log(`   - 消息ID: ${latestTaskMessage.id}`);
        console.log(`   - 任务ID: ${latestTaskMessage.taskId}`);
        console.log(`   - 意图: ${latestTaskMessage.intent}`);
        console.log(`   - 元数据: ${JSON.stringify(latestTaskMessage.metadata, null, 4)}`);
      }
      
    } else {
      console.log('❌ 对话详情API测试失败');
    }
    
  } catch (error) {
    console.error('❌ 对话最后使用MCP信息测试出错:', error.message);
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始测试新功能...');
  console.log(`🔗 API地址: ${BASE_URL}`);
  console.log(`👤 测试用户: ${TEST_USER_ID}`);
  console.log(`💬 测试对话: ${TEST_CONVERSATION_ID}`);
  
  await testAgentTaskHistory();
  await testLastUsedMcpInfo();
  
  console.log('\n🎉 所有测试完成！');
}

// 运行测试
runTests().catch(console.error); 