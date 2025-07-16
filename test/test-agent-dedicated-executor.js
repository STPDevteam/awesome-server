const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// 测试配置
const TEST_CONFIG = {
  // 使用现有的测试用户
  userId: 'test-user-123',
  
  // 测试Agent配置
  agentId: 'agent-test-dedicated-executor',
  agentName: 'Test Agent Dedicated Executor',
  
  // 测试任务内容
  taskContent: 'Help me analyze the latest cryptocurrency market trends and create a summary report'
};

/**
 * 创建测试Agent
 */
async function createTestAgent() {
  try {
    console.log('🔧 Creating test Agent with dedicated executor...');
    
    const agentData = {
      name: TEST_CONFIG.agentName,
      description: 'Test Agent for dedicated executor validation',
      status: 'public',
      mcpWorkflow: {
        mcps: [
          {
            name: 'coingecko-mcp',
            description: 'CoinGecko cryptocurrency data',
            authRequired: false
          }
        ],
        workflow: [
          {
            step: 1,
            mcp: 'coingecko-mcp',
            action: 'get_trending_coins',
            input: {}
          },
          {
            step: 2,
            mcp: 'coingecko-mcp', 
            action: 'get_market_data',
            input: {}
          }
        ]
      }
    };

    const response = await axios.post(`${BASE_URL}/api/agent`, agentData, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': TEST_CONFIG.userId
      }
    });

    if (response.data.success) {
      console.log('✅ Test Agent created successfully');
      console.log(`📋 Agent ID: ${response.data.agent.id}`);
      TEST_CONFIG.agentId = response.data.agent.id;
      return response.data.agent;
    } else {
      throw new Error(`Failed to create test Agent: ${response.data.message}`);
    }
  } catch (error) {
    console.error('❌ Error creating test Agent:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 启动Agent会话
 */
async function startAgentTrial() {
  try {
    console.log('🚀 Starting Agent trial with dedicated executor...');
    
    const response = await axios.post(`${BASE_URL}/api/agent/try`, {
      agentId: TEST_CONFIG.agentId,
      userId: TEST_CONFIG.userId,
      content: TEST_CONFIG.taskContent
    });

    if (response.data.success) {
      console.log('✅ Agent trial started successfully');
      console.log(`📋 Conversation ID: ${response.data.conversationId}`);
      return response.data.conversationId;
    } else {
      throw new Error(`Failed to start Agent trial: ${response.data.message}`);
    }
  } catch (error) {
    console.error('❌ Error starting Agent trial:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 测试Agent专用执行器的流式处理
 */
async function testAgentDedicatedExecutor(conversationId) {
  return new Promise((resolve, reject) => {
    console.log('🔄 Testing Agent dedicated executor with streaming...');
    
    // 记录执行事件
    const executionLog = [];
    let taskId = null;
    let finalResult = null;
    
    const eventSource = new (require('eventsource'))(`${BASE_URL}/api/conversation/${conversationId}/message/stream`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': TEST_CONFIG.userId
      }
    });

    // 发送消息到Agent
    setTimeout(() => {
      axios.post(`${BASE_URL}/api/conversation/${conversationId}/message`, {
        content: 'Execute a detailed cryptocurrency market analysis using your specialized tools'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': TEST_CONFIG.userId
        }
      }).catch(error => {
        console.error('❌ Error sending message:', error.response?.data || error.message);
      });
    }, 1000);

    eventSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        
        // 记录重要事件
        if (data.event) {
          executionLog.push({
            timestamp: new Date().toISOString(),
            event: data.event,
            data: data.data
          });
          
          console.log(`📡 [${data.event}] ${data.data?.message || JSON.stringify(data.data)}`);
          
          // 检查Agent专用事件
          if (data.event === 'task_created' && data.data?.agentName) {
            console.log(`🤖 Agent task created: ${data.data.agentName}`);
            taskId = data.data.taskId;
          }
          
          if (data.event === 'workflow_applied' && data.data?.agentName) {
            console.log(`🔧 Agent workflow applied: ${data.data.agentName}`);
          }
          
          if (data.event === 'task_execution_start' && data.data?.agentName) {
            console.log(`⚡ Agent execution started: ${data.data.agentName}`);
          }
          
          if (data.event === 'step_start' && data.data?.agentName) {
            console.log(`📍 Agent step ${data.data.step}: ${data.data.actionName} (${data.data.agentName})`);
          }
          
          if (data.event === 'step_result_chunk' && data.data?.agentName) {
            console.log(`📝 Agent step ${data.data.step} result chunk: ${data.data.agentName}`);
          }
          
          if (data.event === 'step_complete' && data.data?.agentName) {
            console.log(`✅ Agent step ${data.data.step} completed: ${data.data.agentName}`);
          }
          
          if (data.event === 'final_result_chunk' && data.data?.agentName) {
            console.log(`📄 Agent final result chunk: ${data.data.agentName}`);
          }
          
          if (data.event === 'workflow_complete' && data.data?.agentName) {
            console.log(`🎯 Agent workflow completed: ${data.data.agentName} (Success: ${data.data.success})`);
            finalResult = data.data.finalResult;
          }
          
          if (data.event === 'task_complete' && data.data?.agentName) {
            console.log(`✅ Agent task completed: ${data.data.agentName}`);
            
            // 测试完成，保存结果
            setTimeout(() => {
              eventSource.close();
              resolve({
                success: true,
                taskId,
                finalResult,
                executionLog,
                agentName: data.data.agentName
              });
            }, 2000);
          }
          
          if (data.event === 'error') {
            console.error(`❌ Agent execution error: ${data.data.message}`);
            eventSource.close();
            reject(new Error(data.data.message));
          }
        }
      } catch (parseError) {
        console.error('❌ Error parsing event data:', parseError);
      }
    };

    eventSource.onerror = function(error) {
      console.error('❌ EventSource error:', error);
      eventSource.close();
      reject(error);
    };

    // 超时保护
    setTimeout(() => {
      if (eventSource.readyState !== eventSource.CLOSED) {
        console.log('⏰ Test timeout, closing connection...');
        eventSource.close();
        resolve({
          success: false,
          message: 'Test timeout',
          executionLog,
          taskId,
          finalResult
        });
      }
    }, 60000); // 60秒超时
  });
}

/**
 * 验证Agent专用执行器结果
 */
async function validateAgentExecutorResults(testResult) {
  console.log('🔍 Validating Agent dedicated executor results...');
  
  const validationResults = {
    hasAgentEvents: false,
    hasTaskExecution: false,
    hasStreamingResults: false,
    hasWorkflowCompletion: false,
    agentSpecificFeatures: false
  };

  // 检查Agent专用事件
  const agentEvents = testResult.executionLog.filter(log => 
    log.data?.agentName === TEST_CONFIG.agentName
  );
  
  if (agentEvents.length > 0) {
    validationResults.hasAgentEvents = true;
    console.log(`✅ Found ${agentEvents.length} Agent-specific events`);
  }

  // 检查任务执行流程
  const taskEvents = testResult.executionLog.filter(log => 
    ['task_created', 'workflow_applied', 'task_execution_start', 'task_execution_complete'].includes(log.event)
  );
  
  if (taskEvents.length >= 3) {
    validationResults.hasTaskExecution = true;
    console.log('✅ Agent task execution flow validated');
  }

  // 检查流式结果（包括新的step_result_chunk事件）
  const streamingEvents = testResult.executionLog.filter(log => 
    ['step_start', 'step_result_chunk', 'step_complete', 'final_result_chunk'].includes(log.event)
  );
  
  // 特别检查step_result_chunk事件
  const stepResultChunks = testResult.executionLog.filter(log => 
    log.event === 'step_result_chunk' && log.data?.agentName
  );
  
  if (streamingEvents.length > 0) {
    validationResults.hasStreamingResults = true;
    console.log(`✅ Agent streaming results validated (${streamingEvents.length} events)`);
    
    if (stepResultChunks.length > 0) {
      console.log(`✅ Found ${stepResultChunks.length} step_result_chunk events - streaming for all steps working!`);
    }
  }

  // 检查工作流完成
  const workflowComplete = testResult.executionLog.find(log => 
    log.event === 'workflow_complete' && log.data?.agentName
  );
  
  if (workflowComplete) {
    validationResults.hasWorkflowCompletion = true;
    console.log('✅ Agent workflow completion validated');
  }

  // 检查Agent专用特性
  const agentSpecificEvents = testResult.executionLog.filter(log => 
    log.data?.agentName && log.event.includes('agent') || 
    log.data?.message?.includes('Agent')
  );
  
  if (agentSpecificEvents.length > 0) {
    validationResults.agentSpecificFeatures = true;
    console.log('✅ Agent-specific features validated');
  }

  return validationResults;
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up test data...');
    
    // 删除测试Agent
    await axios.delete(`${BASE_URL}/api/agent/${TEST_CONFIG.agentId}`, {
      headers: {
        'X-User-ID': TEST_CONFIG.userId
      }
    });
    
    console.log('✅ Test cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error.response?.data || error.message);
  }
}

/**
 * 主测试函数
 */
async function runAgentDedicatedExecutorTest() {
  console.log('🚀 Starting Agent Dedicated Executor Test...');
  console.log('=' .repeat(60));
  
  let testResults = {
    agentCreated: false,
    trialStarted: false,
    executorTested: false,
    validationPassed: false,
    executionLog: []
  };

  try {
    // 1. 创建测试Agent
    const agent = await createTestAgent();
    testResults.agentCreated = true;
    
    // 2. 启动Agent试用
    const conversationId = await startAgentTrial();
    testResults.trialStarted = true;
    
    // 3. 测试Agent专用执行器
    const executorResult = await testAgentDedicatedExecutor(conversationId);
    testResults.executorTested = true;
    testResults.executionLog = executorResult.executionLog;
    
    // 4. 验证结果
    const validationResults = await validateAgentExecutorResults(executorResult);
    testResults.validationPassed = Object.values(validationResults).every(v => v === true);
    
    // 5. 输出测试结果
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Agent Dedicated Executor Test Results:');
    console.log('=' .repeat(60));
    
    console.log(`🤖 Agent Created: ${testResults.agentCreated ? '✅' : '❌'}`);
    console.log(`🚀 Trial Started: ${testResults.trialStarted ? '✅' : '❌'}`);
    console.log(`⚡ Executor Tested: ${testResults.executorTested ? '✅' : '❌'}`);
    console.log(`🔍 Validation Passed: ${testResults.validationPassed ? '✅' : '❌'}`);
    
    console.log('\n📋 Validation Details:');
    Object.entries(validationResults).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? '✅' : '❌'}`);
    });
    
    console.log(`\n📄 Execution Events: ${testResults.executionLog.length}`);
    console.log(`🎯 Final Result: ${executorResult.finalResult ? '✅' : '❌'}`);
    
    // 保存详细日志
    const logPath = path.join(__dirname, 'test-output', 'agent-dedicated-executor-test.json');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      testResults,
      executorResult,
      validationResults
    }, null, 2));
    
    console.log(`\n📝 Detailed log saved to: ${logPath}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    testResults.error = error.message;
  } finally {
    // 清理测试数据
    await cleanupTestData();
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🏁 Agent Dedicated Executor Test Completed');
  console.log('=' .repeat(60));
  
  return testResults;
}

// 运行测试
if (require.main === module) {
  runAgentDedicatedExecutorTest()
    .then(results => {
      process.exit(results.validationPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runAgentDedicatedExecutorTest,
  TEST_CONFIG
}; 