// 测试智能工作流引擎
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import http from 'http';

config();

const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-user-workflow-001';

// 全局变量存储访问令牌
let accessToken = null;

// 创建测试用户
async function createTestUser() {
  try {
    console.log(`📋 Creating test user: ${TEST_USER_ID}`);
    
    const { userService } = await import('../dist/services/auth/userService.js');
    
    // 检查用户是否已存在
    const existingUser = await userService.getUserById(TEST_USER_ID);
    if (existingUser) {
      console.log(`✅ Test user ${TEST_USER_ID} already exists`);
      return existingUser;
    }
    
    // 创建新用户 - 使用 wallet 登录方法
    const newUser = await userService.createUser({
      id: TEST_USER_ID,
      username: TEST_USER_ID,
      walletAddress: '0x1234567890123456789012345678901234567890',
      loginMethod: 'wallet',
      loginData: {}
    });
    
    console.log(`✅ Test user created: ${TEST_USER_ID}`);
    return newUser;
  } catch (error) {
    console.error('Failed to create test user:', error);
    throw error;
  }
}

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
    console.log(`✅ Generated access token for user ${TEST_USER_ID}`);
    console.log(`🔑 Access token: ${accessToken.substring(0, 20)}...`);
    
    return accessToken;
  } catch (error) {
    console.error('Failed to generate access token:', error);
    throw error;
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
    throw new Error(`Failed to create task: ${JSON.stringify(result)}`);
  }
  
  return result.data.task;
}

// 分析任务
async function analyzeTask(taskId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/task/${taskId}/analyze`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(result);
          } else {
            reject(new Error(`Task analysis failed: ${result.error || data}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse analysis response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 执行智能工作流（流式）
async function executeIntelligentWorkflow(taskId) {
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
      let finalResult = { 
        success: false, 
        steps: [], 
        errors: [], 
        iterations: 0, 
        parseErrors: 0,
        plannerErrors: 0,
        executorErrors: 0,
        observerErrors: 0
      };
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
              
              // 根据事件类型简化输出
              switch (data.event) {
                case 'workflow_start':
                  console.log(`    🚀 Workflow started for task: ${data.data.taskId}`);
                  break;
                  
                case 'node_complete':
                  const nodeName = data.data.node;
                  const iteration = data.data.iteration;
                  console.log(`    🔄 [${iteration}] ${nodeName} completed`);
                  finalResult.iterations = Math.max(finalResult.iterations, iteration || 0);
                  
                  // 统计不同节点的错误
                  if (data.data.result && data.data.result.errors) {
                    if (nodeName === 'planner') finalResult.plannerErrors++;
                    else if (nodeName === 'executor') finalResult.executorErrors++;
                    else if (nodeName === 'observer') finalResult.observerErrors++;
                  }
                  break;
                  
                case 'step_complete':
                  console.log(`    ✅ Step ${data.data.step}: ${data.data.plan?.tool || 'unknown'} - ${data.data.success ? 'Success' : 'Failed'}`);
                  finalResult.steps.push({
                    step: data.data.step,
                    success: data.data.success,
                    plan: data.data.plan,
                    result: data.data.result,
                    error: data.data.error
                  });
                  break;
                  
                case 'workflow_complete':
                  console.log(`    🎉 Workflow completed successfully`);
                  finalResult.success = data.data.success;
                  finalResult.finalState = data.data.finalState;
                  hasWorkflowComplete = true;
                  break;
                  
                case 'workflow_error':
                  console.log(`    ❌ Workflow error: ${data.data.error}`);
                  finalResult.error = data.data.error;
                  finalResult.errors.push(data.data.error);
                  hasError = true;
                  break;
                  
                default:
                  // 只显示关键信息，避免日志过多
                  if (data.event.includes('error')) {
                    console.log(`    ⚠️ ${data.event}: ${data.data?.error || data.data?.message || 'Unknown error'}`);
                  }
                  break;
              }
            } catch (parseError) {
              finalResult.parseErrors++;
              console.log(`    ⚠️ JSON Parse Error #${finalResult.parseErrors}: ${parseError.message}`);
              console.log(`    📡 Raw data: ${dataStr.substring(0, 100)}${dataStr.length > 100 ? '...' : ''}`);
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
          try {
            const data = JSON.parse(buffer.trim());
            console.log(`    📡 Final data: ${data.event || 'unknown'}`);
          } catch (e) {
            console.log(`    📡 Remaining text: ${buffer.trim().substring(0, 100)}...`);
          }
        }

        // 构建最终结果
        if (!hasWorkflowComplete && !hasError && finalResult.steps.length === 0) {
          finalResult = { ...finalResult, success: false, error: 'No result received from intelligent workflow stream' };
        }

        resolve(finalResult);
      });

      res.body.on('error', (error) => {
        reject(error);
      });

    }).catch(reject);
  });
}

// 测试场景
const testScenarios = [
  {
    name: "Simple Analysis",
    task: "analyze the current crypto market trends",
    description: "Test basic LLM analysis capability and JSON parsing"
  },
  {
    name: "JSON Parsing Stress Test", 
    task: "analyze the following data: {\"test\": \"value\", \"array\": [1, 2, 3]} and provide insights",
    description: "Test JSON parsing capabilities with embedded JSON"
  }
];

// 测试主函数
async function testIntelligentWorkflowEngine() {
  try {
    console.log('🚀 Starting Intelligent Workflow Engine Test...\n');
    
    // 步骤0: 创建测试用户
    console.log('👤 Step 0: Create test user');
    await createTestUser();
    console.log('');
    
    // 步骤1: 为现有用户生成访问令牌
    console.log('🔑 Step 1: Generate access token for existing user');
    generateTestToken();
    console.log('');
    
    // 运行测试场景
    for (let i = 0; i < testScenarios.length; i++) {
      const scenario = testScenarios[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🧪 Test Scenario ${i + 1}: ${scenario.name}`);
      console.log(`📋 Description: ${scenario.description}`);
      console.log(`📝 Task: "${scenario.task}"`);
      console.log(`${'='.repeat(60)}\n`);
      
      try {
        // 创建任务
        console.log('📝 Step A: Create task');
        const task = await createTask(scenario.task);
        console.log(`✅ Task created successfully, ID: ${task.id}\n`);
        
        // 分析任务（设置mcpWorkflow）
        console.log('🔍 Step B: Analyze task');
        await analyzeTask(task.id);
        console.log(`✅ Task analyzed successfully\n`);
        
        // 执行智能工作流
        console.log('🤖 Step C: Execute intelligent workflow');
        const workflowResult = await executeIntelligentWorkflow(task.id);
        
        // 详细的结果分析
        console.log(`\n  > 📊 Workflow Analysis:`);
        console.log(`    - Final Result: ${workflowResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`    - Total Iterations: ${workflowResult.iterations}`);
        console.log(`    - Steps Executed: ${workflowResult.steps.length}`);
        console.log(`    - JSON Parse Errors: ${workflowResult.parseErrors || 0}`);
        console.log(`    - Runtime Errors: ${workflowResult.errors.length}`);
        console.log(`    - Planner Errors: ${workflowResult.plannerErrors || 0}`);
        console.log(`    - Executor Errors: ${workflowResult.executorErrors || 0}`);
        console.log(`    - Observer Errors: ${workflowResult.observerErrors || 0}`);
        
        // 错误分析
        if (workflowResult.errors.length > 0) {
          console.log(`\n  > ❌ Error Details:`);
          workflowResult.errors.forEach((error, idx) => {
            console.log(`    ${idx + 1}. ${error}`);
          });
        }
        
        // 步骤执行分析
        if (workflowResult.steps.length > 0) {
          console.log(`\n  > 📋 Step Execution Summary:`);
          const successCount = workflowResult.steps.filter(s => s.success).length;
          console.log(`    - Successful steps: ${successCount}/${workflowResult.steps.length}`);
          
          workflowResult.steps.forEach((step, idx) => {
            const status = step.success ? '✅' : '❌';
            const tool = step.plan?.tool || 'unknown';
            const error = step.error ? ` (${step.error})` : '';
            console.log(`    ${idx + 1}. ${status} ${tool}${error}`);
          });
        }
        
        // 最终状态分析
        if (workflowResult.finalState) {
          console.log(`\n  > 🏁 Final State Analysis:`);
          console.log(`    - Workflow Complete: ${workflowResult.finalState.isComplete}`);
          console.log(`    - Total Iterations: ${workflowResult.finalState.currentIteration}`);
          console.log(`    - State Errors: ${workflowResult.finalState.errors?.length || 0}`);
          console.log(`    - Execution History: ${workflowResult.finalState.executionHistory?.length || 0} steps`);
          
          // 检查是否有循环问题
          if (workflowResult.finalState.currentIteration > 10) {
            console.log(`    ⚠️ HIGH ITERATION COUNT - Possible loop detected`);
          }
        }
        
        // JSON 解析测试评估
        console.log(`\n  > 🔍 JSON Parsing Assessment:`);
        if (workflowResult.parseErrors === 0) {
          console.log(`    🎉 EXCELLENT: No JSON parsing errors detected`);
        } else if (workflowResult.parseErrors <= 2) {
          console.log(`    ⚠️ MODERATE: ${workflowResult.parseErrors} parse errors (acceptable)`);
        } else {
          console.log(`    ❌ POOR: ${workflowResult.parseErrors} parse errors (needs improvement)`);
        }
        
        // 循环检测评估
        console.log(`\n  > 🔄 Loop Detection Assessment:`);
        if (workflowResult.iterations <= 5) {
          console.log(`    🎉 EXCELLENT: Low iteration count (${workflowResult.iterations})`);
        } else if (workflowResult.iterations <= 15) {
          console.log(`    ⚠️ MODERATE: Medium iteration count (${workflowResult.iterations})`);
        } else {
          console.log(`    ❌ POOR: High iteration count (${workflowResult.iterations}) - possible infinite loop`);
        }
        
        console.log(`\n✅ Test scenario "${scenario.name}" completed`);
        
      } catch (error) {
        console.log(`\n❌ Test scenario "${scenario.name}" failed:`, error.message);
        if (error.message.includes('JSON') || error.message.includes('parse')) {
          console.log('  > 🔍 This appears to be a JSON parsing related error');
        }
        if (error.message.includes('timeout') || error.message.includes('loop')) {
          console.log('  > 🔄 This appears to be a loop detection related error');
        }
      }
      
      // 等待一下再进行下一个测试
      console.log('\n⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('\n\n✨ Intelligent Workflow Engine Test Completed!');
    console.log('\n📊 Test Summary:');
    console.log(`   - Total scenarios tested: ${testScenarios.length}`);
    console.log('   - Focus areas: JSON parsing robustness, loop detection, workflow execution');
    console.log('   - Key improvements: Enhanced JSON parsing, loop detection, fallback strategies');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// 运行测试
testIntelligentWorkflowEngine();
