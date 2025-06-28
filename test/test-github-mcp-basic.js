import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

config();

const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-github-mcp';

// 全局变量存储访问令牌
let accessToken = null;

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`
};

// 日志函数
const log = {
  info: (msg) => console.log(colors.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(colors.green(`✅ ${msg}`)),
  error: (msg) => console.log(colors.red(`❌ ${msg}`)),
  warning: (msg) => console.log(colors.yellow(`⚠️  ${msg}`)),
  step: (msg) => console.log(colors.cyan(`🔄 ${msg}`)),
  result: (msg) => console.log(colors.magenta(`📊 ${msg}`))
};

// 为现有用户生成访问令牌
function generateTestToken() {
  try {
    const payload = {
      userId: TEST_USER_ID,
      walletAddress: '0x1234567890123456789012345678901234567890'
    };
    
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET not found in environment variables');
    }
    
    accessToken = jwt.sign(payload, secret, { expiresIn: '1h' });
    log.success(`为用户 ${TEST_USER_ID} 生成访问令牌`);
    log.info(`访问令牌: ${accessToken.substring(0, 20)}...`);
    
    return accessToken;
  } catch (error) {
    log.error(`生成访问令牌失败: ${error.message}`);
    throw error;
  }
}

// 创建测试用户
async function createTestUser() {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/create-test-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        username: 'GitHub MCP Test User'
      })
    });
    
    const result = await response.json();
    if (result.success) {
      log.success(`测试用户创建成功: ${TEST_USER_ID}`);
      return result.user;
    } else {
      log.warning('用户可能已存在，继续测试...');
      return { userId: TEST_USER_ID };
    }
  } catch (error) {
    log.warning(`创建用户失败: ${error.message}，继续测试...`);
    return { userId: TEST_USER_ID };
  }
}

// 清理用户认证状态
async function clearUserAuth() {
  try {
    const { MCPAuthService } = await import('../dist/services/mcpAuthService.js');
    const mcpAuthService = new MCPAuthService();
    
    // 删除所有认证记录
    const deletedCount = await mcpAuthService.deleteAllUserMCPAuths(TEST_USER_ID);
    
    log.success(`已清理用户 ${TEST_USER_ID} 的所有认证状态`);
  } catch (error) {
    log.warning(`清理认证状态失败: ${error.message}`);
  }
}

// 检查服务器状态
async function checkServerStatus() {
  try {
    log.step('检查服务器状态...');
    const response = await fetch(`${BASE_URL}/health`);
    const result = await response.json();
    log.success('服务器运行正常');
    return true;
  } catch (error) {
    log.error(`服务器未运行或无法访问: ${error.message}`);
    return false;
  }
}

// 创建任务
async function createTask(content) {
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      content
    })
  });
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(`创建任务失败: ${JSON.stringify(result)}`);
  }
  
  return result.data.task;
}

// 分析任务（流式）
async function analyzeTask(taskId) {
  return new Promise((resolve, reject) => {
    fetch(`${BASE_URL}/api/task/${taskId}/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    }).then(async (res) => {
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      let buffer = '';
      let finalResult = { success: false, mcpWorkflow: null, metadata: null };
      let hasAnalysisComplete = false;
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
              hasAnalysisComplete = true;
              continue;
            }
            
            try {
              const data = JSON.parse(dataStr);
              console.log(`    📡 流式分析数据: ${JSON.stringify(data)}`);
              
              // 处理不同的事件类型
              switch (data.event) {
                case 'analysis_start':
                  console.log(`    🚀 开始分析任务: ${data.data.taskId}`);
                  break;
                  
                case 'status_update':
                  console.log(`    📊 状态更新: ${data.data.status}`);
                  break;
                  
                case 'step_start':
                  console.log(`    📝 开始步骤 ${data.data.stepNumber}/${data.data.totalSteps}: ${data.data.stepName}`);
                  break;
                  
                case 'step_complete':
                  console.log(`    ✅ 步骤完成 - ${data.data.stepType}`);
                  if (data.data.mcps && data.data.mcps.length > 0) {
                    console.log(`      推荐的MCP工具: ${data.data.mcps.map(mcp => mcp.name).join(', ')}`);
                  }
                  break;
                  
                case 'analysis_complete':
                  console.log(`    🎉 分析完成`);
                  finalResult.success = true;
                  finalResult.mcpWorkflow = data.data.mcpWorkflow;
                  finalResult.metadata = data.data.metadata;
                  hasAnalysisComplete = true;
                  break;
                  
                case 'error':
                  console.log(`    ❌ 分析错误: ${data.data.message}`);
                  finalResult.error = data.data.message;
                  finalResult.details = data.data.details;
                  hasError = true;
                  break;
                  
                default:
                  console.log(`    📡 其他事件: ${data.event}`);
                  break;
              }
            } catch (parseError) {
              console.log(`    📡 原始数据: ${dataStr}`);
              // 如果解析失败，可能是简单的文本消息
              if (dataStr.includes('error') || dataStr.includes('Error')) {
                finalResult.error = dataStr;
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
        if (!hasAnalysisComplete && !hasError) {
          finalResult = { success: false, error: 'No analysis result received from stream' };
        }

        resolve(finalResult);
      });

      res.body.on('error', (error) => {
        reject(error);
      });

    }).catch(reject);
  });
}

// 验证MCP授权
async function verifyAuth(taskId, mcpName, authData) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/verify-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      mcpName,
      authData
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
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
async function testGitHubMCP() {
  try {
    console.log('🚀 开始测试GitHub MCP流程...\n');
    
    // 步骤0: 检查服务器状态
    console.log('🔍 步骤0: 检查服务器状态');
    const serverOk = await checkServerStatus();
    if (!serverOk) {
      log.error('服务器未运行，测试终止');
      return;
    }
    console.log('');
    
         // 步骤1: 创建测试用户
     console.log('👤 步骤1: 创建测试用户');
     await createTestUser();
     console.log('');
     
     // 步骤2: 为现有用户生成访问令牌
     console.log('🔑 步骤2: 为现有用户生成访问令牌');
     generateTestToken();
     console.log('');
     
     // 步骤3: 清理用户认证状态
     console.log('🧹 步骤3: 清理用户认证状态');
     await clearUserAuth();
     console.log('');
    
         // 步骤4: 创建GitHub相关任务
     console.log('📝 步骤4: 创建GitHub任务');
    const task = await createTask('帮我查看我的GitHub仓库列表，并获取我的用户信息');
    log.success(`任务创建成功，ID: ${task.id}`);
    console.log('');

         // 步骤5: 分析任务（无认证）
     console.log('🔍 步骤5: 分析任务（无认证）');
    console.log('  > 分析任务以生成工作流...');
    const analysisResult = await analyzeTask(task.id);
    console.log('  > 分析完成');
    console.log('  > 分析结果:', JSON.stringify(analysisResult, null, 2));
    
         // 步骤6: GitHub认证
     console.log('\n🔐 步骤6: GitHub认证');
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (!githubToken) {
      log.warning('未找到GitHub Personal Access Token环境变量');
      log.info('请设置: export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here');
      log.info('跳过认证和执行步骤');
    } else {
      log.info('找到GitHub Personal Access Token，开始认证...');
      
      const authResult = await verifyAuth(task.id, 'github-mcp', {
        'GITHUB_PERSONAL_ACCESS_TOKEN': githubToken,
        'GITHUB_TOOLSETS': 'context,repos,issues,pull_requests,actions,code_security,users',
        'GITHUB_READ_ONLY': '0'
      });
      log.info(`验证API返回: ${authResult.success ? '成功' : '失败'}`);
      
      if (authResult.success) {
                 // 步骤7: 认证后重新分析任务
         console.log('\n🔄 步骤7: 认证后重新分析任务');
        console.log('  > 重新分析任务以更新工作流...');
        const reAnalysis = await analyzeTask(task.id);
        console.log('  > 重新分析完成');
        console.log('  > 重新分析结果:', JSON.stringify(reAnalysis, null, 2));
        
                 // 步骤8: 执行任务
         console.log('\n📊 步骤8: 执行GitHub任务');
        const executeResult = await executeTask(task.id);
        log.info(`结果: ${executeResult.success ? '执行成功' : '执行失败'}`);
        console.log(`  > 完整执行结果: ${JSON.stringify(executeResult, null, 2)}`);
        
        if (!executeResult.success) {
          log.error(`错误提示: ${executeResult.error || executeResult.message || '未知错误'}`);
        } else {
          log.success(`执行摘要: ${executeResult.summary || '任务执行完成'}`);
          
          // 显示执行结果
          const result = executeResult.result || executeResult.data?.result;
          if (result) {
            log.result('📈 执行结果:');
            if (typeof result === 'string') {
              console.log(`    ${result}`);
            } else if (Array.isArray(result)) {
              result.forEach((step, index) => {
                console.log(`    步骤${index + 1}: ${JSON.stringify(step, null, 2)}`);
              });
            } else if (typeof result === 'object') {
              // 显示GitHub用户信息
              if (result.userInfo) {
                console.log(`    👤 GitHub用户: ${JSON.stringify(result.userInfo, null, 2)}`);
              }
              // 显示仓库列表
              if (result.repositories) {
                console.log(`    📚 仓库列表: ${JSON.stringify(result.repositories, null, 2)}`);
              }
              // 如果没有这些特定字段，显示完整结果
              if (!result.userInfo && !result.repositories) {
                console.log(`    ${JSON.stringify(result, null, 4)}`);
              }
            }
          }
          
          if (executeResult.steps && executeResult.steps.length > 0) {
            log.result('执行步骤:');
            executeResult.steps.forEach((step, index) => {
              console.log(`    ${index + 1}. ${step.success ? '✅' : '❌'} ${step.success ? '成功' : step.error}`);
            });
          }
        }
      } else {
        log.warning('GitHub认证失败，跳过执行步骤');
        log.info(`认证失败原因: ${authResult.message || authResult.error || '未知错误'}`);
      }
    }
    
    console.log('\n\n✨ GitHub MCP测试完成!');
    
  } catch (error) {
    log.error(`测试失败: ${error.message}`);
    console.error(error);
  }
}

// 运行测试
testGitHubMCP(); 