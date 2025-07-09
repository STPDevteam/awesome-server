/**
 * 测试从任务创建Agent的完整流程
 * 模拟真实的用户体验：任务完成后创建Agent
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
async function testAgentFromTask() {
  console.log('🧪 测试从任务创建Agent流程...\n');
  
  try {
    // 步骤1: 创建一个模拟的已完成任务
    console.log('📝 步骤1: 创建测试任务...');
    const task = await createCompletedTask();
    console.log(`✅ 测试任务创建成功: ${task.id}`);
    console.log(`   任务标题: ${task.title}`);
    console.log(`   任务状态: ${task.status}`);
    
    // 步骤2: 预览从任务创建Agent的信息
    console.log('\n👀 步骤2: 预览Agent信息...');
    const preview = await previewAgentFromTask(task.id);
    console.log(`✅ 预览信息生成成功:`);
    console.log(`   建议名称: ${preview.suggestedName}`);
    console.log(`   建议描述: ${preview.suggestedDescription}`);
    console.log(`   相关问题: ${preview.relatedQuestions.length}个`);
    preview.relatedQuestions.forEach((q, i) => {
      console.log(`     ${i + 1}. ${q}`);
    });
    
    // 步骤3: 创建私有Agent
    console.log('\n🔒 步骤3: 创建私有Agent...');
    const privateAgent = await createAgentFromTask(task.id, 'private');
    console.log(`✅ 私有Agent创建成功: ${privateAgent.id}`);
    console.log(`   Agent名称: ${privateAgent.name}`);
    console.log(`   Agent状态: ${privateAgent.status}`);
    console.log(`   相关问题数量: ${privateAgent.relatedQuestions?.length || 0}`);
    
    // 步骤4: 验证Agent是否正确关联任务
    console.log('\n🔗 步骤4: 验证Agent与任务关联...');
    const agentDetail = await getAgentDetail(privateAgent.id);
    console.log(`✅ Agent详情获取成功:`);
    console.log(`   关联任务ID: ${agentDetail.taskId}`);
    console.log(`   原始任务标题: ${agentDetail.metadata?.originalTaskTitle}`);
    console.log(`   MCP工作流: ${agentDetail.mcpWorkflow ? '已包含' : '未包含'}`);
    
    // 步骤5: 测试发布Agent为公开
    console.log('\n🌐 步骤5: 发布Agent为公开...');
    const publishedAgent = await publishAgent(privateAgent.id);
    console.log(`✅ Agent发布成功: ${publishedAgent.id}`);
    console.log(`   Agent状态: ${publishedAgent.status}`);
    console.log(`   发布时间: ${publishedAgent.publishedAt}`);
    
    // 步骤6: 在Agent市场中查看
    console.log('\n🏪 步骤6: 在Agent市场中查看...');
    const marketplace = await getAgentMarketplace();
    const foundAgent = marketplace.agents.find(a => a.id === publishedAgent.id);
    console.log(`✅ Agent在市场中${foundAgent ? '找到' : '未找到'}`);
    if (foundAgent) {
      console.log(`   市场显示名称: ${foundAgent.name}`);
      console.log(`   使用次数: ${foundAgent.usageCount}`);
    }
    
    // 步骤7: 测试Agent的使用记录
    console.log('\n📊 步骤7: 模拟Agent使用...');
    const usage = await recordAgentUsage(publishedAgent.id);
    console.log(`✅ Agent使用记录成功: ${usage.id}`);
    
    // 步骤8: 获取Agent统计信息
    console.log('\n📈 步骤8: 获取Agent统计信息...');
    const stats = await getAgentStats();
    console.log(`✅ Agent统计信息:`);
    console.log(`   总Agent数量: ${stats.totalAgents}`);
    console.log(`   公开Agent数量: ${stats.publicAgents}`);
    console.log(`   私有Agent数量: ${stats.privateAgents}`);
    console.log(`   今日使用次数: ${stats.todayUsageCount}`);
    
    console.log('\n🎉 所有测试完成！Agent从任务创建流程正常工作。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

/**
 * 创建一个已完成的测试任务
 */
async function createCompletedTask() {
  const taskData = {
    title: "分析加密货币价格趋势",
    content: "使用CoinGecko API获取Bitcoin和Ethereum的价格数据，并分析其7天的价格趋势，生成可视化报告。",
    status: "completed",
    mcpWorkflow: {
      mcps: [
        {
          name: "coingecko-mcp",
          description: "CoinGecko API集成，获取加密货币价格数据",
          authRequired: false,
          category: "crypto",
          githubUrl: "https://github.com/coingecko/coingecko-mcp"
        },
        {
          name: "chart-generator",
          description: "图表生成工具，创建价格趋势图",
          authRequired: false,
          category: "visualization"
        }
      ],
      workflow: [
        {
          step: 1,
          mcp: "coingecko-mcp",
          action: "get_price_history",
          input: "bitcoin,ethereum"
        },
        {
          step: 2,
          mcp: "chart-generator",
          action: "create_trend_chart",
          input: "price_data"
        }
      ]
    },
    result: {
      success: true,
      deliverables: [
        "比特币7天价格趋势图",
        "以太坊7天价格趋势图",
        "价格趋势分析报告"
      ],
      executionTime: "2024-01-15T10:30:00Z"
    }
  };

  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify(taskData)
  });

  if (!response.ok) {
    throw new Error(`创建任务失败: ${response.status}`);
  }

  return await response.json();
}

/**
 * 预览从任务创建Agent的信息
 */
async function previewAgentFromTask(taskId) {
  const response = await fetch(`${BASE_URL}/api/agent/preview-from-task/${taskId}`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`预览Agent信息失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 从任务创建Agent
 */
async function createAgentFromTask(taskId, status = 'private') {
  const response = await fetch(`${BASE_URL}/api/agent/from-task/${taskId}`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    throw new Error(`创建Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取Agent详情
 */
async function getAgentDetail(agentId) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`获取Agent详情失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 发布Agent为公开
 */
async function publishAgent(agentId) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/publish`, {
    method: 'POST',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`发布Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取Agent市场信息
 */
async function getAgentMarketplace() {
  const response = await fetch(`${BASE_URL}/api/agent/marketplace`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`获取Agent市场失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 记录Agent使用
 */
async function recordAgentUsage(agentId) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/usage`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({
      conversationId: 'test-conversation-id',
      executionResult: { success: true }
    })
  });

  if (!response.ok) {
    throw new Error(`记录Agent使用失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取Agent统计信息
 */
async function getAgentStats() {
  const response = await fetch(`${BASE_URL}/api/agent/stats`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`获取Agent统计失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

// 运行测试
if (require.main === module) {
  testAgentFromTask().catch(console.error);
}

module.exports = { testAgentFromTask }; 