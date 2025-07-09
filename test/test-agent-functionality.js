/**
 * Agent功能完整测试
 * 测试Agent的创建、更新、发布、使用等完整流程
 */

const BASE_URL = 'http://localhost:3001';

// 模拟用户认证 (测试环境)
const TEST_USER_ID = 'test-user-id';
const TEST_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer test-token' // 在测试环境中会被忽略
};

// 设置测试环境
process.env.MCP_SKIP_AUTH = 'true';

/**
 * 主测试函数
 */
async function testAgentFunctionality() {
  console.log('🧪 开始Agent功能测试...\n');
  
  try {
    // 步骤1: 创建一个测试任务（作为Agent的来源）
    console.log('📝 步骤1: 创建测试任务...');
    const task = await createTestTask();
    console.log(`✅ 测试任务创建成功: ${task.id}`);
    
    // 步骤2: 生成Agent名称
    console.log('\n🏷️ 步骤2: 生成Agent名称...');
    const agentName = await generateAgentName(task);
    console.log(`✅ 生成的Agent名称: ${agentName}`);
    
    // 步骤3: 生成Agent描述
    console.log('\n📝 步骤3: 生成Agent描述...');
    const agentDescription = await generateAgentDescription(agentName, task);
    console.log(`✅ 生成的Agent描述: ${agentDescription}`);
    
    // 步骤4: 创建私有Agent
    console.log('\n🤖 步骤4: 创建私有Agent...');
    const privateAgent = await createAgent({
      name: agentName,
      description: agentDescription,
      status: 'private',
      taskId: task.id
    });
    console.log(`✅ 私有Agent创建成功: ${privateAgent.id}`);
    
    // 步骤5: 从任务快速创建Agent
    console.log('\n⚡ 步骤5: 从任务快速创建Agent...');
    const quickAgent = await createAgentFromTask(task.id, 'private');
    console.log(`✅ 快速创建Agent成功: ${quickAgent.id}`);
    console.log(`   Agent名称: ${quickAgent.name}`);
    console.log(`   Agent描述: ${quickAgent.description}`);
    
    // 步骤6: 获取Agent列表
    console.log('\n📋 步骤6: 获取用户Agent列表...');
    const agentsList = await getUserAgents();
    console.log(`✅ 获取到 ${agentsList.total} 个Agent`);
    agentsList.agents.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.name} (${agent.status}) - 使用次数: ${agent.usageCount}`);
    });
    
    // 步骤7: 更新Agent
    console.log('\n✏️ 步骤7: 更新Agent...');
    const updatedAgent = await updateAgent(privateAgent.id, {
      description: '这是一个更新后的Agent描述，用于测试更新功能。'
    });
    console.log(`✅ Agent更新成功`);
    console.log(`   新描述: ${updatedAgent.description}`);
    
    // 步骤8: 发布Agent为公开
    console.log('\n🌐 步骤8: 发布Agent为公开...');
    const publishedAgent = await publishAgent(privateAgent.id);
    console.log(`✅ Agent发布成功，状态: ${publishedAgent.status}`);
    console.log(`   发布时间: ${publishedAgent.publishedAt}`);
    
    // 步骤9: 获取Agent市场数据
    console.log('\n🏪 步骤9: 获取Agent市场数据...');
    const marketplaceAgents = await getAgentMarketplace();
    console.log(`✅ 市场中有 ${marketplaceAgents.total} 个公开Agent`);
    
    // 步骤10: 记录Agent使用
    console.log('\n📊 步骤10: 记录Agent使用...');
    const usage = await recordAgentUsage(publishedAgent.id, {
      taskId: task.id,
      executionResult: {
        success: true,
        output: '测试执行结果'
      }
    });
    console.log(`✅ Agent使用记录成功: ${usage.id}`);
    
    // 步骤11: 获取Agent统计信息
    console.log('\n📈 步骤11: 获取Agent统计信息...');
    const stats = await getAgentStats();
    console.log(`✅ Agent统计信息:`);
    console.log(`   总Agent数: ${stats.totalAgents}`);
    console.log(`   私有Agent数: ${stats.privateAgents}`);
    console.log(`   公开Agent数: ${stats.publicAgents}`);
    console.log(`   总使用次数: ${stats.totalUsage}`);
    
    // 步骤12: 将Agent设为私有
    console.log('\n🔒 步骤12: 将Agent设为私有...');
    const privateAgentAgain = await makeAgentPrivate(publishedAgent.id);
    console.log(`✅ Agent设为私有成功，状态: ${privateAgentAgain.status}`);
    
    // 步骤13: 根据任务ID获取Agent
    console.log('\n🔍 步骤13: 根据任务ID获取Agent...');
    const taskAgents = await getAgentsByTaskId(task.id);
    console.log(`✅ 任务关联的Agent数: ${taskAgents.length}`);
    
    // 步骤14: 删除Agent
    console.log('\n🗑️ 步骤14: 删除Agent...');
    await deleteAgent(quickAgent.id);
    console.log(`✅ Agent删除成功: ${quickAgent.id}`);
    
    console.log('\n🎉 所有Agent功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', await error.response.text());
    }
    process.exit(1);
  }
}

/**
 * 创建测试任务
 */
async function createTestTask() {
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({
      title: '测试任务：分析加密货币市场趋势',
      content: '请分析最近一周的比特币和以太坊价格趋势，并提供投资建议。'
    })
  });

  if (!response.ok) {
    throw new Error(`创建任务失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 生成Agent名称
 */
async function generateAgentName(task) {
  const response = await fetch(`${BASE_URL}/api/agent/generate-name`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({
      taskTitle: task.title,
      taskContent: task.content,
      mcpWorkflow: task.mcpWorkflow
    })
  });

  if (!response.ok) {
    throw new Error(`生成Agent名称失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data.name;
}

/**
 * 生成Agent描述
 */
async function generateAgentDescription(name, task) {
  const response = await fetch(`${BASE_URL}/api/agent/generate-description`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({
      name: name,
      taskTitle: task.title,
      taskContent: task.content,
      mcpWorkflow: task.mcpWorkflow
    })
  });

  if (!response.ok) {
    throw new Error(`生成Agent描述失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data.description;
}

/**
 * 创建Agent
 */
async function createAgent(agentData) {
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
 * 从任务创建Agent
 */
async function createAgentFromTask(taskId, status = 'private') {
  const response = await fetch(`${BASE_URL}/api/agent/from-task/${taskId}`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    throw new Error(`从任务创建Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取用户Agent列表
 */
async function getUserAgents() {
  const response = await fetch(`${BASE_URL}/api/agent`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`获取Agent列表失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 更新Agent
 */
async function updateAgent(agentId, updateData) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}`, {
    method: 'PUT',
    headers: TEST_HEADERS,
    body: JSON.stringify(updateData)
  });

  if (!response.ok) {
    throw new Error(`更新Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 发布Agent
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
 * 将Agent设为私有
 */
async function makeAgentPrivate(agentId) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/private`, {
    method: 'POST',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`设为私有失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取Agent市场数据
 */
async function getAgentMarketplace() {
  const response = await fetch(`${BASE_URL}/api/agent/marketplace`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`获取Agent市场数据失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 记录Agent使用
 */
async function recordAgentUsage(agentId, usageData) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}/usage`, {
    method: 'POST',
    headers: TEST_HEADERS,
    body: JSON.stringify(usageData)
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
    throw new Error(`获取Agent统计信息失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 根据任务ID获取Agent
 */
async function getAgentsByTaskId(taskId) {
  const response = await fetch(`${BASE_URL}/api/agent/task/${taskId}`, {
    method: 'GET',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`根据任务ID获取Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 删除Agent
 */
async function deleteAgent(agentId) {
  const response = await fetch(`${BASE_URL}/api/agent/${agentId}`, {
    method: 'DELETE',
    headers: TEST_HEADERS
  });

  if (!response.ok) {
    throw new Error(`删除Agent失败: ${response.status}`);
  }

  const result = await response.json();
  return result;
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testAgentFunctionality()
    .then(() => {
      console.log('\n✅ 所有测试通过！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 测试失败:', error);
      process.exit(1);
    });
} 