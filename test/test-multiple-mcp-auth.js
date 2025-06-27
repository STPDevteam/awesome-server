// 测试批量MCP认证流程
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-001';

// 测试用的API密钥（请替换为实际的测试密钥）
const TEST_API_KEYS = {
  COINGECKO_API_KEY: 'test-coingecko-key',
  TWITTER_API_KEY: 'test-twitter-key',
  TWITTER_API_SECRET: 'test-twitter-secret',
  TWITTER_ACCESS_TOKEN: 'test-twitter-token',
  TWITTER_ACCESS_SECRET: 'test-twitter-token-secret',
  GITHUB_TOKEN: 'test-github-token'
};

// 清理用户认证状态
async function clearUserAuth() {
  try {
    const { MCPAuthService } = await import('../dist/services/mcpAuthService.js');
    const mcpAuthService = new MCPAuthService();
    
    const deletedCount = await mcpAuthService.deleteAllUserMCPAuths(TEST_USER_ID);
    console.log(`🧹 已清理用户 ${TEST_USER_ID} 的所有认证状态`);
  } catch (error) {
    console.error('清理认证状态失败:', error);
  }
}

// 创建任务
async function createTask(content) {
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content,
      userId: TEST_USER_ID
    })
  });
  
  const result = await response.json();
  return result.data;
}

// 分析任务
async function analyzeTask(taskId) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: TEST_USER_ID
    })
  });
  
  const result = await response.json();
  return result.data;
}

// 批量验证MCP授权
async function verifyMultipleAuth(taskId, mcpAuths) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/verify-multiple-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mcpAuths,
      userId: TEST_USER_ID
    })
  });
  
  const result = await response.json();
  return result;
}

// 执行任务
async function executeTask(taskId) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: TEST_USER_ID
    })
  });
  
  const result = await response.json();
  return result;
}

// 获取任务详情
async function getTask(taskId) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}?userId=${TEST_USER_ID}`);
  const result = await response.json();
  return result.data;
}

// 测试主函数
async function testMultipleMCPAuth() {
  try {
    console.log('🚀 开始测试批量MCP认证流程...\n');
    
    // 步骤0: 清理用户认证状态
    console.log('🧹 步骤0: 清理用户认证状态');
    await clearUserAuth();
    console.log('');
    
    // 步骤1: 创建需要多个认证的任务
    console.log('📝 步骤1: 创建复杂任务');
    const task = await createTask('获取比特币价格信息，然后发布到Twitter上分享给大家');
    console.log(`✅ 任务创建成功，ID: ${task.id}\n`);
    
    // 步骤2: 分析任务
    console.log('🔍 步骤2: 分析任务');
    const analysis = await analyzeTask(task.id);
    console.log('✅ 任务分析完成\n');
    
    // 检查认证需求
    console.log('🔐 步骤3: 检查认证需求');
    console.log(`需要认证: ${analysis.metadata.requiresAuth}`);
    console.log(`需要认证的MCP: ${JSON.stringify(analysis.metadata.mcpsRequiringAuth)}`);
    
    // 找出需要认证的MCP
    const mcpsNeedAuth = analysis.mcpWorkflow.mcps.filter(
      mcp => mcp.authRequired && !mcp.authVerified
    );
    
    console.log('\n需要认证的MCP详情:');
    mcpsNeedAuth.forEach(mcp => {
      console.log(`- ${mcp.name}:`);
      console.log(`  描述: ${mcp.description}`);
    });
    
    // 步骤4: 尝试执行（未认证），应失败
    console.log('\n📄 步骤4: 尝试执行（未认证）');
    const executeResult1 = await executeTask(task.id);
    console.log(`执行结果: ${executeResult1.success ? '成功' : '失败'}`);
    if (!executeResult1.success) {
      console.log(`失败原因: ${executeResult1.error}`);
    }
    
    // 步骤5: 准备多个MCP的认证信息
    console.log('\n🔑 步骤5: 批量提供认证信息');
    const mcpAuths = [];
    
    // 根据需要认证的MCP准备认证数据
    for (const mcp of mcpsNeedAuth) {
      let authData = {};
      
      if (mcp.name === 'coingecko-mcp') {
        authData = {
          COINGECKO_API_KEY: TEST_API_KEYS.COINGECKO_API_KEY
        };
      } else if (mcp.name === 'x-mcp') {
        authData = {
          TWITTER_API_KEY: TEST_API_KEYS.TWITTER_API_KEY,
          TWITTER_API_SECRET: TEST_API_KEYS.TWITTER_API_SECRET,
          TWITTER_ACCESS_TOKEN: TEST_API_KEYS.TWITTER_ACCESS_TOKEN,
          TWITTER_ACCESS_SECRET: TEST_API_KEYS.TWITTER_ACCESS_SECRET
        };
      } else if (mcp.name.includes('github')) {
        authData = {
          GITHUB_TOKEN: TEST_API_KEYS.GITHUB_TOKEN
        };
      }
      
      if (Object.keys(authData).length > 0) {
        mcpAuths.push({
          mcpName: mcp.name,
          authData
        });
      }
    }
    
    console.log(`准备认证 ${mcpAuths.length} 个MCP:`);
    mcpAuths.forEach(auth => {
      console.log(`- ${auth.mcpName}: ${Object.keys(auth.authData).join(', ')}`);
    });
    
    // 步骤6: 批量验证认证
    console.log('\n🔐 步骤6: 批量验证认证');
    const batchAuthResult = await verifyMultipleAuth(task.id, mcpAuths);
    console.log(`批量验证结果: ${batchAuthResult.success ? '成功' : '部分失败'}`);
    console.log(`消息: ${batchAuthResult.message}`);
    
    if (batchAuthResult.data && batchAuthResult.data.summary) {
      const summary = batchAuthResult.data.summary;
      console.log(`统计: ${summary.successful}/${summary.total} 成功, ${summary.failed} 失败`);
    }
    
    if (batchAuthResult.data && batchAuthResult.data.results) {
      console.log('\n详细结果:');
      batchAuthResult.data.results.forEach(result => {
        console.log(`- ${result.mcpName}: ${result.success ? '✅ 成功' : '❌ 失败'} - ${result.message}`);
      });
    }
    
    // 步骤7: 检查任务状态更新
    console.log('\n📊 步骤7: 检查任务状态更新');
    const updatedTask = await getTask(task.id);
    
    if (updatedTask.mcpWorkflow) {
      console.log('MCP认证状态:');
      updatedTask.mcpWorkflow.mcps.forEach(mcp => {
        console.log(`- ${mcp.name}: ${mcp.authVerified ? '✅ 已认证' : '❌ 未认证'}`);
      });
    }
    
    // 步骤8: 认证后重新执行
    console.log('\n🚀 步骤8: 认证后重新执行');
    const executeResult2 = await executeTask(task.id);
    console.log(`执行结果: ${executeResult2.success ? '成功' : '失败'}`);
    
    if (executeResult2.success) {
      console.log('✅ 任务执行成功！');
      if (executeResult2.summary) {
        console.log(`执行摘要: ${executeResult2.summary}`);
      }
    } else {
      console.log(`❌ 执行失败: ${executeResult2.error}`);
    }
    
    console.log('\n🎉 批量MCP认证测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testMultipleMCPAuth(); 