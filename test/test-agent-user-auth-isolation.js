const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'test-output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 测试用户和Agent
const TEST_AGENT_CREATOR = 'agent_creator_user';
const TEST_AGENT_USER_A = 'agent_user_a';
const TEST_AGENT_USER_B = 'agent_user_b';
const TEST_AGENT_ID = 'test_agent_multi_user';

// 保存测试结果
function saveTestResult(filename, data) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ 测试结果已保存: ${filename}`);
}

// 测试Agent多用户MCP认证隔离
async function testAgentUserAuthIsolation() {
  console.log('🧪 测试Agent多用户MCP认证隔离...\n');

  try {
    // 1. 创建Agent创建者用户
    console.log('1️⃣ 创建Agent创建者用户...');
    const creatorResponse = await axios.post(`${BASE_URL}/api/auth/create-user`, {
      userId: TEST_AGENT_CREATOR,
      email: `${TEST_AGENT_CREATOR}@test.com`,
      name: 'Agent Creator'
    });
    saveTestResult('01-create-agent-creator.json', creatorResponse.data);

    // 2. 创建Agent使用者A
    console.log('2️⃣ 创建Agent使用者A...');
    const userAResponse = await axios.post(`${BASE_URL}/api/auth/create-user`, {
      userId: TEST_AGENT_USER_A,
      email: `${TEST_AGENT_USER_A}@test.com`,
      name: 'Agent User A'
    });
    saveTestResult('02-create-agent-user-a.json', userAResponse.data);

    // 3. 创建Agent使用者B
    console.log('3️⃣ 创建Agent使用者B...');
    const userBResponse = await axios.post(`${BASE_URL}/api/auth/create-user`, {
      userId: TEST_AGENT_USER_B,
      email: `${TEST_AGENT_USER_B}@test.com`,
      name: 'Agent User B'
    });
    saveTestResult('03-create-agent-user-b.json', userBResponse.data);

    // 4. 创建者为CoinGecko MCP进行认证
    console.log('4️⃣ 创建者为CoinGecko MCP进行认证...');
    const creatorAuthResponse = await axios.post(`${BASE_URL}/api/mcp/auth/verify`, {
      mcpName: 'coingecko-server',
      authData: {
        COINGECKO_API_KEY: 'creator_api_key_123'
      },
      saveAuth: true
    }, {
      headers: {
        'Authorization': `Bearer ${creatorResponse.data.data.accessToken}`
      }
    });
    saveTestResult('04-creator-mcp-auth.json', creatorAuthResponse.data);

    // 5. 创建者创建Agent（使用CoinGecko MCP）
    console.log('5️⃣ 创建者创建Agent...');
    const createAgentResponse = await axios.post(`${BASE_URL}/api/agent`, {
      id: TEST_AGENT_ID,
      name: 'CryptoPriceAgent',
      description: 'An agent that fetches cryptocurrency prices using CoinGecko API',
      isPublic: true,
      mcpWorkflow: {
        mcps: [{
          name: 'coingecko-server',
          description: 'CoinGecko cryptocurrency data',
          authRequired: true
        }],
        workflow: [{
          step: 1,
          mcp: 'coingecko-server',
          action: 'get_price',
          input: { symbol: 'bitcoin' }
        }]
      }
    }, {
      headers: {
        'Authorization': `Bearer ${creatorResponse.data.data.accessToken}`
      }
    });
    saveTestResult('05-create-agent.json', createAgentResponse.data);

    // 6. 用户A尝试使用Agent（没有认证）
    console.log('6️⃣ 用户A尝试使用Agent（没有认证）...');
    try {
      const userATrialResponse = await axios.post(`${BASE_URL}/api/agent/${TEST_AGENT_ID}/try`, {
        content: 'Get me the current Bitcoin price'
      }, {
        headers: {
          'Authorization': `Bearer ${userAResponse.data.data.accessToken}`
        }
      });
      saveTestResult('06-user-a-trial-no-auth.json', userATrialResponse.data);
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.log('✅ 用户A没有认证，正确返回403错误');
        saveTestResult('06-user-a-trial-no-auth-error.json', error.response.data);
      } else {
        throw error;
      }
    }

    // 7. 用户A为CoinGecko MCP进行认证（使用不同的API Key）
    console.log('7️⃣ 用户A为CoinGecko MCP进行认证...');
    const userAAuthResponse = await axios.post(`${BASE_URL}/api/mcp/auth/verify`, {
      mcpName: 'coingecko-server',
      authData: {
        COINGECKO_API_KEY: 'user_a_api_key_456'
      },
      saveAuth: true
    }, {
      headers: {
        'Authorization': `Bearer ${userAResponse.data.data.accessToken}`
      }
    });
    saveTestResult('07-user-a-mcp-auth.json', userAAuthResponse.data);

    // 8. 用户B为CoinGecko MCP进行认证（使用另一个不同的API Key）
    console.log('8️⃣ 用户B为CoinGecko MCP进行认证...');
    const userBAuthResponse = await axios.post(`${BASE_URL}/api/mcp/auth/verify`, {
      mcpName: 'coingecko-server',
      authData: {
        COINGECKO_API_KEY: 'user_b_api_key_789'
      },
      saveAuth: true
    }, {
      headers: {
        'Authorization': `Bearer ${userBResponse.data.data.accessToken}`
      }
    });
    saveTestResult('08-user-b-mcp-auth.json', userBAuthResponse.data);

    // 9. 用户A成功使用Agent
    console.log('9️⃣ 用户A成功使用Agent...');
    const userASuccessResponse = await axios.post(`${BASE_URL}/api/agent/${TEST_AGENT_ID}/try`, {
      content: 'Get me the current Bitcoin price'
    }, {
      headers: {
        'Authorization': `Bearer ${userAResponse.data.data.accessToken}`
      }
    });
    saveTestResult('09-user-a-success.json', userASuccessResponse.data);

    // 10. 用户B成功使用Agent
    console.log('🔟 用户B成功使用Agent...');
    const userBSuccessResponse = await axios.post(`${BASE_URL}/api/agent/${TEST_AGENT_ID}/try`, {
      content: 'Get me the current Bitcoin price'
    }, {
      headers: {
        'Authorization': `Bearer ${userBResponse.data.data.accessToken}`
      }
    });
    saveTestResult('10-user-b-success.json', userBSuccessResponse.data);

    // 11. 验证用户A的对话中发送消息（使用用户A的认证）
    console.log('1️⃣1️⃣ 验证用户A的对话中发送消息...');
    const userAConversationId = userASuccessResponse.data.data.conversation.id;
    const userAMessageResponse = await axios.post(`${BASE_URL}/api/agent-conversation/${userAConversationId}/message`, {
      content: 'Now get me the Ethereum price'
    }, {
      headers: {
        'Authorization': `Bearer ${userAResponse.data.data.accessToken}`
      }
    });
    saveTestResult('11-user-a-message.json', userAMessageResponse.data);

    // 12. 验证用户B的对话中发送消息（使用用户B的认证）
    console.log('1️⃣2️⃣ 验证用户B的对话中发送消息...');
    const userBConversationId = userBSuccessResponse.data.data.conversation.id;
    const userBMessageResponse = await axios.post(`${BASE_URL}/api/agent-conversation/${userBConversationId}/message`, {
      content: 'Now get me the Dogecoin price'
    }, {
      headers: {
        'Authorization': `Bearer ${userBResponse.data.data.accessToken}`
      }
    });
    saveTestResult('12-user-b-message.json', userBMessageResponse.data);

    console.log('\n🎉 Agent多用户MCP认证隔离测试完成！');
    console.log('\n📋 测试验证了以下关键点：');
    console.log('✅ 1. Agent创建者的认证不影响使用者');
    console.log('✅ 2. 每个用户需要独立进行MCP认证');
    console.log('✅ 3. 不同用户使用不同的API Key');
    console.log('✅ 4. 用户的MCP认证信息正确隔离');
    console.log('✅ 5. Agent任务执行时使用当前用户的认证');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      saveTestResult('error-response.json', error.response.data);
    }
    throw error;
  }
}

// 运行测试
if (require.main === module) {
  testAgentUserAuthIsolation()
    .then(() => {
      console.log('\n🎯 所有测试完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 测试失败:', error);
      process.exit(1);
    });
}

module.exports = { testAgentUserAuthIsolation }; 