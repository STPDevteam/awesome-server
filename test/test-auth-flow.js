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

// 执行任务（流式）
async function executeTask(taskId) {
  return new Promise((resolve, reject) => {
    fetch(`${BASE_URL}/api/task/${taskId}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: TEST_USER_ID
      })
    }).then(async (res) => {
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      let buffer = '';
      let finalResult = { success: false, steps: [], errors: [] };
      let hasWorkflowComplete = false;
      let hasError = false;

      // Node.js环境下处理流式响应
      res.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            
            // 检查是否是结束标记
            if (dataStr.trim() === '[DONE]') {
              hasWorkflowComplete = true;
              continue;
            }
            
            try {
              const data = JSON.parse(dataStr);
              console.log(`    📡 流式数据: ${JSON.stringify(data)}`);
              
              // 处理不同的事件类型
              switch (data.event) {
                case 'execution_start':
                  console.log(`    🚀 开始执行任务: ${data.data.taskId}`);
                  break;
                  
                case 'step_start':
                  console.log(`    📝 开始执行步骤 ${data.data.step}: ${data.data.mcpName} - ${data.data.actionName}`);
                  break;
                  
                case 'step_complete':
                  console.log(`    ✅ 步骤 ${data.data.step} 执行成功`);
                  finalResult.steps.push({
                    step: data.data.step,
                    success: true,
                    result: data.data.result
                  });
                  break;
                  
                case 'step_error':
                  console.log(`    ❌ 步骤 ${data.data.step} 执行失败: ${data.data.error}`);
                  finalResult.steps.push({
                    step: data.data.step,
                    success: false,
                    error: data.data.error
                  });
                  finalResult.errors.push(data.data.error);
                  hasError = true;
                  break;
                  
                case 'workflow_complete':
                  console.log(`    🎉 工作流执行完成`);
                  finalResult.success = data.data.success;
                  hasWorkflowComplete = true;
                  break;
                  
                case 'error':
                  console.log(`    ❌ 执行错误: ${data.data.message}`);
                  finalResult.error = data.data.message;
                  finalResult.errors.push(data.data.message);
                  hasError = true;
                  break;
                  
                case 'summary_chunk':
                  if (!finalResult.summary) finalResult.summary = '';
                  finalResult.summary += data.data.content;
                  break;
                  
                default:
                  // 处理其他类型的数据（可能是旧格式）
                  if (data.type === 'final' || data.type === 'complete') {
                    finalResult = { ...finalResult, ...data.data };
                  } else if (data.type === 'error') {
                    finalResult.error = data.message || data.error;
                    finalResult.errors.push(data.message || data.error);
                    hasError = true;
                  }
                  break;
              }
            } catch (parseError) {
              console.log(`    📡 原始数据: ${dataStr}`);
              // 如果解析失败，可能是简单的文本消息
              if (dataStr.includes('error') || dataStr.includes('Error')) {
                finalResult.errors.push(dataStr);
                hasError = true;
              }
            }
          }
        }
      });

      res.body.on('end', () => {
        // 处理剩余的buffer数据
        if (buffer.trim()) {
          console.log(`    📡 剩余数据: ${buffer.trim()}`);
        }

        // 构建最终结果
        if (!hasWorkflowComplete && !hasError && finalResult.steps.length === 0) {
          finalResult = { success: false, error: 'No result received from stream' };
        } else {
          // 如果有步骤执行，判断整体成功状态
          if (finalResult.steps.length > 0) {
            const successfulSteps = finalResult.steps.filter(step => step.success).length;
            const totalSteps = finalResult.steps.length;
            
            // 如果没有明确设置success状态，根据步骤结果推断
            if (finalResult.success === undefined) {
              finalResult.success = successfulSteps > 0 && finalResult.errors.length === 0;
            }
            
            // 添加执行统计
            finalResult.stepStats = {
              successful: successfulSteps,
              total: totalSteps,
              hasErrors: finalResult.errors.length > 0
            };
          }
          
          // 如果有错误但没有明确的错误消息，使用第一个错误
          if (!finalResult.error && finalResult.errors.length > 0) {
            finalResult.error = finalResult.errors[0];
          }
        }

        resolve(finalResult);
      });

      res.body.on('error', (error) => {
        reject(error);
      });

    }).catch(reject);
  });
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