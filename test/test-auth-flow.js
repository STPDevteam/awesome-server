// 测试完整的MCP认证流程
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-001';

// 清理用户认证状态
async function clearUserAuth() {
  try {
    const { MCPAuthService } = await import('../dist/services/mcpAuthService.js');
    const mcpAuthService = new MCPAuthService();
    
    // 获取用户所有认证记录
    const auths = await mcpAuthService.getUserAllMCPAuths(TEST_USER_ID);
    
    // 删除所有认证记录
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
  if (!result.success) {
    throw new Error(`创建任务失败: ${JSON.stringify(result)}`);
  }
  
  return result.data.task;
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
  if (!result.success) {
    throw new Error(`分析任务失败: ${JSON.stringify(result)}`);
  }
  
  return result.data;
}

// 验证MCP授权
async function verifyAuth(taskId, mcpName, authData) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/verify-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mcpName,
      authData,
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

// 测试主函数
async function testAuthFlow() {
  try {
    console.log('🚀 开始测试MCP认证流程...\n');
    
    // 步骤0: 清理用户认证状态
    console.log('🧹 步骤0: 清理用户认证状态');
    await clearUserAuth();
    console.log('');
    
    // 步骤1: 创建需要认证的任务
    console.log('📝 步骤1:查询我最近的一条推文');
    const task = await createTask('查询我最近的一条推文');
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
      console.log(`  需要的认证参数:`);
      Object.entries(mcp.authParams || {}).forEach(([key, value]) => {
        if (!key.endsWith('Description')) {
          console.log(`    ${key}: ${mcp.authParams[key + 'Description'] || value}`);
        }
      });
    });
    
    // 步骤4: 未认证时执行，应失败
    console.log('\n📄 步骤4: 尝试执行（未认证）');
    const executeResult1 = await executeTask(task.id);
    console.log(`  executeResult1: ${JSON.stringify(executeResult1)}`);
    
    // 步骤5: 提供完整认证信息
    console.log('\n🔑 步骤5: 提供认证信息');
    const fullAuthResult = await verifyAuth(task.id, 'x-mcp', {
      'TWITTER_API_KEY': '3vT3SesI6WFGTPd6lSJKwhHMB',
      'TWITTER_API_SECRET': '8LJ3gMaBIYFrDnq5S3zqgVO10UL5iwf2ryhrRCXHPzXxcCnduu',
      'TWITTER_ACCESS_TOKEN': '1188598506077872129-XnIN2Qzn8pBGlHGpC1X4S4qKJS3SSO',
      'TWITTER_ACCESS_SECRET': 'bOOkHd8drIcDXn2vWVZLdvOc9U5jER87xbJHuAolY0kt1'
    });
    console.log(`  > 验证API返回: ${fullAuthResult.success ? '成功' : '失败'}`);
    
    // 步骤6: 认证后重新分析任务以更新工作流
    console.log('\n🔄 步骤6: 认证后重新分析任务');
    if (fullAuthResult.success) {
      console.log('  > 重新分析任务以更新工作流...');
      const reAnalysis = await analyzeTask(task.id);
      console.log('  > 重新分析完成');
      
      // 步骤7: 执行任务
      console.log('\n🐦 步骤7: 执行任务（已认证）- 获取Twitter列表推文');
      const executeResult2 = await executeTask(task.id);
      console.log(`  > 结果: ${executeResult2.success ? '执行成功' : '执行失败'}`);
      console.log(`  > 完整执行结果: ${JSON.stringify(executeResult2, null, 2)}`);
      if (!executeResult2.success) {
        console.log(`  > 错误提示: ${executeResult2.error || executeResult2.message || executeResult2.data?.error || executeResult2.data?.message || '未知错误'}`);
      } else {
        console.log(`  > 执行摘要: ${executeResult2.summary || executeResult2.data?.summary}`);
        
        // 显示获取到的推文内容
        const tweetResult = executeResult2.result || executeResult2.data?.result;
        if (tweetResult) {
          console.log(`  > 🐦 获取到的推文内容:`);
          if (typeof tweetResult === 'string') {
            console.log(`    ${tweetResult}`);
          } else if (Array.isArray(tweetResult) && tweetResult.length > 0) {
            const tweet = tweetResult[0];
            console.log(`    作者: ${tweet.user?.name || tweet.author_name || '未知'}`);
            console.log(`    内容: ${tweet.text || tweet.content || JSON.stringify(tweet)}`);
            if (tweet.created_at) {
              console.log(`    时间: ${tweet.created_at}`);
            }
          } else if (typeof tweetResult === 'object') {
            console.log(`    ${JSON.stringify(tweetResult, null, 4)}`);
          }
        }
        
        if (executeResult2.steps && executeResult2.steps.length > 0) {
          console.log(`  > 执行步骤:`);
          executeResult2.steps.forEach((step, index) => {
            console.log(`    ${index + 1}. ${step.success ? '✅' : '❌'} ${step.success ? '成功' : step.error}`);
          });
        } else if (executeResult2.data?.steps && executeResult2.data.steps.length > 0) {
          console.log(`  > 执行步骤:`);
          executeResult2.data.steps.forEach((step, index) => {
            console.log(`    ${index + 1}. ${step.success ? '✅' : '❌'} ${step.success ? '成功' : step.error}`);
          });
        }
      }
    } else {
      console.log('  > 因步骤5验证失败，跳过执行');
    }
    
    console.log('\n\n✨ 认证流程测试完成!');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testAuthFlow(); 