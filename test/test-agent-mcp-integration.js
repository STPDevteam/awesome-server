const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'test-output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 测试用户ID和Agent ID
const TEST_USER_ID = 'test_user_agent_mcp';
const TEST_AGENT_ID = 'test_agent_with_mcp';

// 保存测试结果
function saveTestResult(filename, data) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ Test result saved: ${filename}`);
}

// 测试Agent MCP集成的完整流程
async function testAgentMCPIntegration() {
  console.log('🧪 Testing Agent MCP Integration Flow...\n');

  try {
    // 1. 创建测试用户
    console.log('1️⃣ Creating test user...');
    const userResponse = await axios.post(`${BASE_URL}/api/auth/create-user`, {
      userId: TEST_USER_ID,
      email: 'test-agent-mcp@example.com',
      name: 'Test Agent MCP User'
    });
    console.log('✅ Test user created:', userResponse.data);
    saveTestResult('01-create-user.json', userResponse.data);

    // 2. 创建需要MCP认证的Agent
    console.log('\n2️⃣ Creating Agent with MCP workflow...');
    const agentData = {
      name: 'CoinMarketCap Agent',
      description: 'Agent that can fetch cryptocurrency data using CoinMarketCap API',
      userId: TEST_USER_ID,
      status: 'public',
      mcpWorkflow: {
        mcps: [
          {
            name: 'coinmarketcap-mcp',
            description: 'CoinMarketCap API integration',
            authRequired: true,
            authParams: {
              COINMARKETCAP_API_KEY: {
                type: 'string',
                description: 'CoinMarketCap API Key',
                required: true
              }
            }
          }
        ],
        workflow: [
          {
            step: 1,
            mcp: 'coinmarketcap-mcp',
            action: 'get_cryptocurrency_quotes',
            description: 'Get cryptocurrency price quotes'
          }
        ]
      }
    };

    const agentResponse = await axios.post(`${BASE_URL}/api/agent`, agentData);
    console.log('✅ Agent created:', agentResponse.data);
    saveTestResult('02-create-agent.json', agentResponse.data);

    const agentId = agentResponse.data.agent.id;

    // 3. 尝试试用Agent（应该失败，因为没有MCP认证）
    console.log('\n3️⃣ Trying Agent without MCP authentication (should fail)...');
    try {
      const tryResponse = await axios.post(`${BASE_URL}/api/agent/${agentId}/try`, {
        userId: TEST_USER_ID,
        content: 'Get Bitcoin price'
      });
      console.log('❌ Unexpected success - Agent should require MCP authentication');
      saveTestResult('03-try-agent-no-auth.json', tryResponse.data);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.needsAuth) {
        console.log('✅ Expected failure - Agent requires MCP authentication');
        console.log('Missing auth:', error.response.data.missingAuth);
        saveTestResult('03-try-agent-no-auth-error.json', error.response.data);
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
        saveTestResult('03-try-agent-unexpected-error.json', error.response?.data || { error: error.message });
      }
    }

    // 4. 验证MCP认证
    console.log('\n4️⃣ Verifying MCP authentication...');
    const authData = {
      COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY || 'test_api_key_12345'
    };

    const authResponse = await axios.post(`${BASE_URL}/api/mcp/auth/verify`, {
      userId: TEST_USER_ID,
      mcpName: 'coinmarketcap-mcp',
      authData
    });
    console.log('✅ MCP authentication verified:', authResponse.data);
    saveTestResult('04-verify-mcp-auth.json', authResponse.data);

    // 5. 再次尝试试用Agent（应该成功）
    console.log('\n5️⃣ Trying Agent with MCP authentication (should succeed)...');
    const tryAgentResponse = await axios.post(`${BASE_URL}/api/agent/${agentId}/try`, {
      userId: TEST_USER_ID,
      content: 'Hello, I want to test your capabilities'
    });
    console.log('✅ Agent try successful:', tryAgentResponse.data);
    saveTestResult('05-try-agent-success.json', tryAgentResponse.data);

    const conversationId = tryAgentResponse.data.conversation.id;

    // 6. 发送任务消息给Agent
    console.log('\n6️⃣ Sending task message to Agent...');
    const taskMessage = 'Get the current price of Bitcoin and Ethereum';
    
    const messageResponse = await axios.post(`${BASE_URL}/api/agent-conversation/${conversationId}/message`, {
      userId: TEST_USER_ID,
      content: taskMessage
    });
    console.log('✅ Task message sent:', messageResponse.data);
    saveTestResult('06-send-task-message.json', messageResponse.data);

    // 7. 测试流式消息处理
    console.log('\n7️⃣ Testing streaming message processing...');
    try {
      const streamResponse = await axios.post(`${BASE_URL}/api/agent-conversation/${conversationId}/message/stream`, {
        userId: TEST_USER_ID,
        content: 'Get detailed information about the top 5 cryptocurrencies'
      }, {
        responseType: 'stream'
      });

      console.log('✅ Streaming response initiated');
      
      let streamData = '';
      streamResponse.data.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        streamData += chunkStr;
        console.log('📡 Stream chunk:', chunkStr);
      });

      streamResponse.data.on('end', () => {
        console.log('✅ Stream completed');
        saveTestResult('07-stream-response.txt', streamData);
      });

      // 等待流式响应完成
      await new Promise((resolve) => {
        streamResponse.data.on('end', resolve);
      });

    } catch (error) {
      console.log('❌ Streaming test failed:', error.response?.data || error.message);
      saveTestResult('07-stream-error.json', error.response?.data || { error: error.message });
    }

    // 8. 获取对话历史
    console.log('\n8️⃣ Getting conversation history...');
    const conversationResponse = await axios.get(`${BASE_URL}/api/agent-conversation/${conversationId}`, {
      params: { userId: TEST_USER_ID }
    });
    console.log('✅ Conversation history retrieved');
    saveTestResult('08-conversation-history.json', conversationResponse.data);

    // 9. 测试Agent记忆清理
    console.log('\n9️⃣ Testing Agent memory cleanup...');
    const memoryResponse = await axios.delete(`${BASE_URL}/api/agent-conversation/${conversationId}/memory`, {
      data: { userId: TEST_USER_ID }
    });
    console.log('✅ Agent memory cleared:', memoryResponse.data);
    saveTestResult('09-memory-cleanup.json', memoryResponse.data);

    console.log('\n🎉 All Agent MCP integration tests completed successfully!');
    console.log(`📁 Test results saved in: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data) {
      saveTestResult('test-error.json', error.response.data);
    }
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testAgentMCPIntegration();
}

module.exports = { testAgentMCPIntegration }; 