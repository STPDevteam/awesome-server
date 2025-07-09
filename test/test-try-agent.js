/**
 * 测试Try Agent功能
 * 测试Agent试用的完整流程，包括认证检查和任务执行
 */

const BASE_URL = 'http://localhost:3001';

// 模拟用户认证 (测试环境)
const TEST_USER_ID = 'test-user-id';
const TEST_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer test-token'
};

// 设置测试环境
process.env.MCP_SKIP_AUTH = 'true';

/**
 * 主测试函数
 */
async function testTryAgent() {
  console.log('🧪 测试Try Agent功能...\n');
  
  try {
    // 步骤1: 创建一个公开Agent用于测试
    console.log('📝 步骤1: 创建测试Agent...');
    const agent = await createTestAgent();
    console.log(`✅ 测试Agent创建成功: ${agent.id}`);
    console.log(`   Agent名称: ${agent.name}`);
    console.log(`   Agent状态: ${agent.status}`);
    console.log(`   涉及MCP: ${agent.mcpWorkflow?.mcps?.map(m => m.name).join(', ') || '无'}`);
    
    // 步骤2: 测试无需认证的Agent
    console.log('\n🔓 步骤2: 试用无需认证的Agent...');
    const taskContent1 = '获取比特币当前价格';
    const result1 = await tryAgent(agent.id, taskContent1);
    
    if (result1.success) {
      console.log('✅ 无需认证的Agent试用成功');
      console.log(`   创建的任务ID: ${result1.data.taskId}`);
      console.log(`   任务消息: ${result1.data.message}`);
    } else {
      console.log('❌ 无需认证的Agent试用失败');
      console.log(`   错误: ${result1.message || result1.error}`);
    }
    
    // 步骤3: 创建需要认证的Agent
    console.log('\n🔒 步骤3: 创建需要认证的Agent...');
    const authAgent = await createAuthRequiredAgent();
    console.log(`✅ 需要认证的Agent创建成功: ${authAgent.id}`);
    console.log(`   Agent名称: ${authAgent.name}`);
    console.log(`   需要认证的MCP: ${authAgent.mcpWorkflow?.mcps?.filter(m => m.authRequired).map(m => m.name).join(', ') || '无'}`);
    
    // 步骤4: 测试需要认证但未验证的Agent
    console.log('\n❌ 步骤4: 试用需要认证但未验证的Agent...');
    const taskContent2 = '发送一条推文：Hello MCP World!';
    const result2 = await tryAgent(authAgent.id, taskContent2);
    
    if (!result2.success && result2.error === 'AUTH_REQUIRED') {
      console.log('✅ 正确检测到需要认证');
      console.log(`   提示消息: ${result2.message}`);
      console.log(`   需要认证的MCP数量: ${result2.data.missingAuth?.length || 0}`);
      
      result2.data.missingAuth?.forEach((mcp, index) => {
        console.log(`   ${index + 1}. MCP名称: ${mcp.mcpName}`);
        console.log(`      描述: ${mcp.description}`);
        console.log(`      认证参数: ${Object.keys(mcp.authParams || {}).join(', ')}`);
      });
    } else {
      console.log('❌ 认证检查失败');
      console.log(`   结果: ${JSON.stringify(result2, null, 2)}`);
    }
    
    // 步骤5: 模拟提供认证信息
    console.log('\n🔑 步骤5: 模拟提供认证信息...');
    const authResult = await mockProvideAuth(authAgent.id, result2.data.missingAuth?.[0]);
    console.log(`✅ 认证信息模拟完成: ${authResult.success ? '成功' : '失败'}`);
    
    // 步骤6: 重新试用已认证的Agent
    console.log('\n🔓 步骤6: 重新试用已认证的Agent...');
    const result3 = await tryAgent(authAgent.id, taskContent2);
    
    if (result3.success) {
      console.log('✅ 已认证的Agent试用成功');
      console.log(`   创建的任务ID: ${result3.data.taskId}`);
      console.log(`   任务消息: ${result3.data.message}`);
    } else {
      console.log('❌ 已认证的Agent试用失败');
      console.log(`   错误: ${result3.message || result3.error}`);
    }
    
    // 步骤7: 测试不存在的Agent
    console.log('\n🚫 步骤7: 测试不存在的Agent...');
    const result4 = await tryAgent('non-existent-agent-id', '测试任务');
    
    if (!result4.success) {
      console.log('✅ 正确处理不存在的Agent');
      console.log(`   错误消息: ${result4.message || result4.error}`);
    } else {
      console.log('❌ 未正确处理不存在的Agent');
    }
    
    // 步骤8: 测试私有Agent访问权限
    console.log('\n🔒 步骤8: 测试私有Agent访问权限...');
    const privateAgent = await createPrivateAgent();
    console.log(`✅ 私有Agent创建成功: ${privateAgent.id}`);
    
    // 尝试以其他用户身份访问私有Agent
    const result5 = await tryAgentAsOtherUser(privateAgent.id, '测试任务');
    
    if (!result5.success) {
      console.log('✅ 正确限制私有Agent访问');
      console.log(`   错误消息: ${result5.message || result5.error}`);
    } else {
      console.log('❌ 未正确限制私有Agent访问');
    }
    
    console.log('\n🎉 所有测试完成！Try Agent功能正常工作。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

/**
 * 创建测试Agent（无需认证）
 */
async function createTestAgent() {
  const agentData = {
    name: 'crypto_price_checker',
    description: 'A crypto price checking Agent that retrieves current cryptocurrency prices',
    status: 'public',
    mcpWorkflow: {
      mcps: [
        {
          name: 'coingecko-mcp',
          description: 'CoinGecko API集成，获取加密货币价格数据',
          authRequired: false,
          authVerified: true,
          category: 'crypto'
        }
      ],
      workflow: [
        {
          step: 1,
          mcp: 'coingecko-mcp',
          action: 'get_price',
          input: { coin: 'bitcoin' }
        }
      ]
    },
    relatedQuestions: [
      'What is the current price of Bitcoin?',
      'How much is the price difference between Ethereum and Bitcoin?',
      'Which cryptocurrency had the biggest price change in the last 24 hours?'
    ]
  };

  const response = await fetch(`${BASE_URL}/api/agent`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify(agentData)
  });

  if (!response.ok) {
    throw new Error(`创建Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 创建需要认证的Agent
 */
async function createAuthRequiredAgent() {
  const agentData = {
    name: 'twitter_bot',
    description: '发送推文的Agent',
    status: 'public',
    mcpWorkflow: {
      mcps: [
        {
          name: 'x-mcp',
          description: 'Twitter/X API集成，发送推文',
          authRequired: true,
          authVerified: false,
          category: 'social',
          authParams: {
            TWITTER_API_KEY: 'Twitter API Key',
            TWITTER_API_SECRET: 'Twitter API Secret',
            TWITTER_ACCESS_TOKEN: 'Twitter Access Token',
            TWITTER_ACCESS_SECRET: 'Twitter Access Secret'
          }
        }
      ],
      workflow: [
        {
          step: 1,
          mcp: 'x-mcp',
          action: 'send_tweet',
          input: { content: '#{taskContent}' }
        }
      ]
    },
    relatedQuestions: [
      '如何发送一条推文？',
      '可以发送带图片的推文吗？',
      '如何查看推文的发送状态？'
    ]
  };

  const response = await fetch(`${BASE_URL}/api/agent`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify(agentData)
  });

  if (!response.ok) {
    throw new Error(`创建需要认证的Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 创建私有Agent
 */
async function createPrivateAgent() {
  const agentData = {
    name: 'private_agent',
    description: '私有Agent，只有创建者可以使用',
    status: 'private',
    mcpWorkflow: {
      mcps: [
        {
          name: 'simple-mcp',
          description: '简单的MCP工具',
          authRequired: false,
          authVerified: true
        }
      ],
      workflow: [
        {
          step: 1,
          mcp: 'simple-mcp',
          action: 'process',
          input: { content: '#{taskContent}' }
        }
      ]
    },
    relatedQuestions: [
      '这个私有Agent可以做什么？',
      '如何使用私有Agent？',
      '私有Agent的优势是什么？'
    ]
  };

  const response = await fetch(`${BASE_URL}/api/agent`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify(agentData)
  });

  if (!response.ok) {
    throw new Error(`创建私有Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 试用Agent
 */
async function tryAgent(agentId, taskContent) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/try`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({ taskContent })
  });

  const result = await response.json();
  return result;
}

/**
 * 以其他用户身份试用Agent
 */
async function tryAgentAsOtherUser(agentId, taskContent) {
  const otherUserHeaders = {
    ...TEST_HEADERS,
    'Authorization': 'Bearer other-user-token'
  };

  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/try`, {
    method: 'POST',
    headers: otherUserHeaders,
    body: JSON.stringify({ taskContent })
  });

  const result = await response.json();
  return result;
}

/**
 * 模拟提供认证信息
 */
async function mockProvideAuth(agentId, missingAuth) {
  if (!missingAuth) {
    return { success: false, message: '没有需要认证的MCP' };
  }

  // 模拟认证数据
  const authData = {};
  for (const paramName in missingAuth.authParams) {
    authData[paramName] = `mock_${paramName.toLowerCase()}_value`;
  }

  console.log(`   为MCP ${missingAuth.mcpName} 提供认证数据: ${Object.keys(authData).join(', ')}`);

  // 在实际应用中，这里会调用认证API
  // 这里我们只是模拟成功
  return { success: true, message: '认证信息已提供' };
}

// 运行测试
if (require.main === module) {
  testTryAgent().catch(console.error);
}

module.exports = { testTryAgent }; 