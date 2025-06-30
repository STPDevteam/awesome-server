const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function testNotionPages() {
  console.log('\n🧪 测试修复后的Notion页面创建功能...\n');
  
  try {
    // 1. 测试智能工作流 - GitHub分析到Notion
    console.log('1️⃣ 测试智能工作流：GitHub分析 → Notion记录...');
    
    const taskData = {
      content: "帮我分析github的eliza项目（https://github.com/elizaOS/eliza）的issue，并在把分析记录在我的notion里",
      mcps: ["github-mcp", "notion-mcp"],
      useIntelligentWorkflow: true
    };
    
    const createResponse = await axios.post(`${API_BASE}/api/task/create`, taskData);
    
    if (!createResponse.data.success) {
      throw new Error(`任务创建失败: ${createResponse.data.error}`);
    }
    
    const taskId = createResponse.data.taskId;
    console.log(`✅ 任务创建成功，ID: ${taskId}`);
    
    // 2. 执行任务并监听流式输出
    console.log('\n2️⃣ 执行智能工作流任务...');
    
    let stepCount = 0;
    let hasGitHubCall = false;
    let hasNotionCall = false;
    let notionCallSuccess = false;
    let githubAnalysis = '';
    
    return new Promise((resolve, reject) => {
      const executeRequest = axios.post(`${API_BASE}/api/task/execute`, 
        { taskId }, 
        { 
          responseType: 'stream',
          timeout: 300000 // 5分钟超时
        }
      );
      
      executeRequest.then(response => {
        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'step') {
                  stepCount++;
                  console.log(`\n📋 步骤 ${stepCount}: ${data.action}`);
                  
                  if (data.mcpName) {
                    console.log(`   🔧 使用MCP: ${data.mcpName}`);
                  }
                  
                  if (data.toolName) {
                    console.log(`   ⚡ 调用工具: ${data.toolName}`);
                    
                    // 检查是否调用了GitHub工具
                    if (data.mcpName === 'github-mcp') {
                      hasGitHubCall = true;
                      console.log(`   ✅ GitHub工具调用检测到`);
                    }
                    
                    // 检查是否调用了Notion工具
                    if (data.mcpName === 'notion-mcp') {
                      hasNotionCall = true;
                      console.log(`   ✅ Notion工具调用检测到`);
                      
                      // 检查参数格式
                      if (data.args) {
                        console.log(`   📋 Notion调用参数:`);
                        console.log(`      ${JSON.stringify(data.args, null, 6)}`);
                        
                        // 检查是否还在使用假UUID
                        const argsStr = JSON.stringify(data.args);
                        if (argsStr.includes('valid-uuid-here')) {
                          console.log(`   ❌ 仍在使用假UUID！`);
                        } else if (data.args.parent && data.args.parent.type === 'workspace') {
                          console.log(`   ✅ 使用workspace作为parent - 正确！`);
                        } else {
                          console.log(`   ⚠️  使用其他parent类型: ${data.args.parent?.type}`);
                        }
                      }
                    }
                  }
                  
                  if (data.result) {
                    const resultStr = JSON.stringify(data.result).substring(0, 200);
                    console.log(`   📊 结果: ${resultStr}${resultStr.length >= 200 ? '...' : ''}`);
                    
                    // 保存GitHub分析结果
                    if (data.mcpName === 'github-mcp') {
                      githubAnalysis = data.result;
                    }
                  }
                }
                
                if (data.type === 'result') {
                  console.log(`\n🎯 任务完成！`);
                  console.log(`📊 最终结果: ${JSON.stringify(data.result).substring(0, 300)}...`);
                  
                  // 检查Notion调用是否成功
                  if (hasNotionCall && data.result && !data.result.error) {
                    notionCallSuccess = true;
                    console.log(`✅ Notion页面创建成功！`);
                  }
                  
                  resolve({
                    success: true,
                    stepCount,
                    hasGitHubCall,
                    hasNotionCall,
                    notionCallSuccess,
                    githubAnalysis,
                    finalResult: data.result
                  });
                }
                
                if (data.type === 'error') {
                  console.log(`❌ 任务执行失败: ${data.error}`);
                  resolve({
                    success: false,
                    error: data.error,
                    stepCount,
                    hasGitHubCall,
                    hasNotionCall,
                    notionCallSuccess: false
                  });
                }
                
              } catch (parseError) {
                // 忽略解析错误，继续处理其他数据
              }
            }
          }
        });
        
        response.data.on('end', () => {
          console.log('\n📡 流式数据传输结束');
          if (stepCount === 0) {
            resolve({
              success: false,
              error: '没有收到任何步骤数据',
              stepCount: 0,
              hasGitHubCall: false,
              hasNotionCall: false,
              notionCallSuccess: false
            });
          }
        });
        
        response.data.on('error', (error) => {
          console.error('❌ 流式数据错误:', error);
          reject(error);
        });
        
      }).catch(error => {
        console.error('❌ 执行请求失败:', error.message);
        reject(error);
      });
      
      // 设置超时
      setTimeout(() => {
        console.log('⏰ 任务执行超时');
        resolve({
          success: false,
          error: '任务执行超时',
          stepCount,
          hasGitHubCall,
          hasNotionCall,
          notionCallSuccess: false
        });
      }, 300000); // 5分钟超时
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
testNotionPages().then(result => {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 测试结果总结:');
  console.log('='.repeat(80));
  console.log(`✅ 任务成功: ${result.success}`);
  console.log(`📊 执行步骤数: ${result.stepCount}`);
  console.log(`🔧 GitHub调用: ${result.hasGitHubCall ? '✅' : '❌'}`);
  console.log(`📝 Notion调用: ${result.hasNotionCall ? '✅' : '❌'}`);
  console.log(`🎯 Notion成功: ${result.notionCallSuccess ? '✅' : '❌'}`);
  
  if (result.error) {
    console.log(`❌ 错误信息: ${result.error}`);
  }
  
  if (result.success && result.hasGitHubCall && result.hasNotionCall && result.notionCallSuccess) {
    console.log('\n🎉 完美！智能工作流完整执行成功！');
    console.log('   ✅ GitHub项目分析完成');
    console.log('   ✅ Notion页面创建成功');
    console.log('   ✅ 分析结果已记录到Notion');
  } else {
    console.log('\n⚠️  部分功能存在问题，需要进一步调试');
  }
  
  console.log('='.repeat(80));
}).catch(error => {
  console.error('❌ 测试执行失败:', error);
}); 