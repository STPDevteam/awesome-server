/**
 * Test Agent Final Result Delivery
 * 测试Agent对话中的任务执行是否正确返回finalResult
 */

const axios = require('axios');
const WebSocket = require('ws');
const { EventSource } = require('eventsource');

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

// 测试用户token（需要替换为实际的token）
const TEST_USER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAxOTNhZDQyLTM0ZTYtNzZhMC1iNzIxLTNmZjNkZjdkNzMzYyIsImFkZHJlc3MiOiIweGI2MzJhMzQ5MDRlNzBkODk3YjQxNzQyNDQ0OGFmNDQ1NzE1ZjhlMzQiLCJpYXQiOjE3MzY0MjI4MjJ9.Qo4gZYwJxELFnJLKTZoXUFhGOxkOQYKLNkGWUKcWTkA';

// 测试Agent ID（需要替换为实际的Agent ID）
const TEST_AGENT_ID = '01945c6b-c9e5-7c8a-9b8c-1234567890ab';

async function testAgentFinalResult() {
  console.log('🧪 Testing Agent Final Result Delivery\n');

  try {
    // 1. 初始化Agent会话
    console.log('1️⃣ Initializing Agent conversation...');
    const initResponse = await axios.post(`${API_URL}/agent/${TEST_AGENT_ID}/init`, {}, {
      headers: {
        'Authorization': `Bearer ${TEST_USER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!initResponse.data.success) {
      console.error('❌ Agent initialization failed:', initResponse.data);
      return;
    }

    const conversationId = initResponse.data.data.conversationId;
    console.log(`✅ Agent conversation initialized: ${conversationId}`);

    // 2. 发送任务请求（流式）
    console.log('\n2️⃣ Sending task request via streaming...');
    const taskMessage = 'Help me get the current price of Bitcoin';
    
    const streamResponse = await axios.post(
      `${API_URL}/agent-conversation/${conversationId}/message/stream`,
      { content: taskMessage },
      {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    console.log('📡 Streaming response started...');
    
    // 解析流式响应
    let finalResult = null;
    let taskId = null;
    let messageComplete = false;
    
    streamResponse.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            console.log(`📥 Event: ${data.event}`);
            
            switch (data.event) {
              case 'task_execution_progress':
                console.log(`   Progress: ${data.data.event}`);
                
                // 🔧 优化：只检查workflow_complete事件中的finalResult
                if (data.data.event === 'workflow_complete') {
                  if (data.data.data.finalResult) {
                    finalResult = data.data.data.finalResult;
                    console.log(`🎯 Final Result Found: ${finalResult ? 'YES' : 'NO'}`);
                    if (finalResult) {
                      console.log(`📋 Final Result Content: ${finalResult.substring(0, 100)}...`);
                    }
                  }
                }
                
                // 获取taskId用于后续验证
                if (data.data.event === 'task_complete') {
                  taskId = data.data.data.taskId;
                }
                break;
                
              case 'message_complete':
                messageComplete = true;
                console.log(`✅ Message Complete: ${data.data.messageId}`);
                break;
                
              case 'error':
                console.error(`❌ Error: ${data.data.message}`);
                break;
            }
          } catch (parseError) {
            // 忽略解析错误（可能是非JSON行）
          }
        }
      }
    });

    // 等待流式响应完成
    await new Promise((resolve, reject) => {
      streamResponse.data.on('end', resolve);
      streamResponse.data.on('error', reject);
      
      // 设置超时
      setTimeout(() => {
        reject(new Error('Stream timeout'));
      }, 30000);
    });

    // 3. 验证结果
    console.log('\n3️⃣ Verifying results...');
    console.log(`Task ID: ${taskId}`);
    console.log(`Final Result Available: ${finalResult ? 'YES' : 'NO'}`);
    console.log(`Message Complete: ${messageComplete ? 'YES' : 'NO'}`);
    
    if (finalResult) {
      console.log(`Final Result Preview: ${finalResult.substring(0, 200)}...`);
    }

    // 4. 获取任务详情验证
    if (taskId) {
      console.log('\n4️⃣ Fetching task details for verification...');
      const taskResponse = await axios.get(`${API_URL}/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });

      if (taskResponse.data.success) {
        const task = taskResponse.data.data;
        console.log(`Task Status: ${task.status}`);
        console.log(`Task Result Available: ${task.result ? 'YES' : 'NO'}`);
        
        if (task.result && task.result.finalResult) {
          console.log(`Final Result in DB: ${task.result.finalResult.substring(0, 100)}...`);
        }
      }
    }

    // 5. 总结测试结果
    console.log('\n📊 Test Summary:');
    console.log(`✅ Agent conversation initialized: ${conversationId ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Task execution started: ${taskId ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Final result delivered: ${finalResult ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Message completed: ${messageComplete ? 'PASS' : 'FAIL'}`);
    
    if (finalResult) {
      console.log('\n🎉 SUCCESS: Final result is correctly delivered to frontend!');
    } else {
      console.log('\n❌ FAILURE: Final result is NOT delivered to frontend!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// 运行测试
testAgentFinalResult().catch(console.error); 