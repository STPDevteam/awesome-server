const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// 测试用的认证token
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzUwMzdiODE0NzQ5YjkwZGNjMDM1YjMiLCJhZGRyZXNzIjoiMHgxMjM0NTY3ODkwYWJjZGVmIiwiaWF0IjoxNzMzMjk5MTI4LCJleHAiOjE3MzU4OTExMjh9.v3xHgGNOjJKOOgRJKmXMEiZOKKRULnFrEQDuNZfNQQo';

async function testAgentTaskTitleGeneration() {
  console.log('🧪 Testing Agent task title generation...');
  
  const testCases = [
    {
      message: "请帮我查找前3个meme币的信息，包括价格、市值和最新动态",
      expectedKeywords: ['meme', '币', '查找', '信息'],
      description: "长消息测试 - 应该生成简洁的标题"
    },
    {
      message: "分析比特币价格趋势",
      expectedKeywords: ['比特币', '价格', '趋势', '分析'],
      description: "短消息测试 - 应该保持原意"
    },
    {
      message: "Help me create a comprehensive market analysis report for the top 10 cryptocurrencies including their price movements, market cap changes, and recent news updates",
      expectedKeywords: ['market', 'analysis', 'crypto'],
      description: "英文长消息测试 - 应该截取关键信息"
    },
    {
      message: "搜索GitHub上最受欢迎的AI项目",
      expectedKeywords: ['GitHub', 'AI', '项目', '搜索'],
      description: "GitHub相关任务测试"
    }
  ];

  const agentId = "67503fa114749b90dcc035c1"; // 测试Agent ID
  
  const results = [];

  try {
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n📝 Test Case ${i + 1}: ${testCase.description}`);
      console.log(`📤 Input: "${testCase.message}"`);
      
      // 首先初始化Agent对话
      console.log('🔧 Initializing Agent conversation...');
      const initResponse = await axios.post(`${BASE_URL}/api/agent/${agentId}/init`, {}, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!initResponse.data.success) {
        console.log(`❌ Failed to initialize Agent: ${initResponse.data.message}`);
        continue;
      }

      const conversationId = initResponse.data.data.conversationId;
      console.log(`✅ Agent conversation initialized: ${conversationId}`);

      // 发送消息并监控任务创建
      console.log('📡 Sending message and monitoring task creation...');
      
      const messageResponse = await axios.post(`${BASE_URL}/api/agent/conversation/stream`, {
        conversationId,
        content: testCase.message,
        agentId
      }, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      });

      let taskTitle = null;
      let taskId = null;
      let originalMessage = testCase.message;

      // 监听流式响应
      await new Promise((resolve, reject) => {
        let isResolved = false;
        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        }, 15000); // 15秒超时

        messageResponse.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // 捕获任务创建事件
                if (data.event === 'task_created') {
                  taskId = data.data.taskId;
                  taskTitle = data.data.title;
                  console.log(`📋 Task created - ID: ${taskId}, Title: "${taskTitle}"`);
                }
                
                // 检测到流完成
                if (data.event === 'stream_complete') {
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    resolve();
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        messageResponse.data.on('end', () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });

        messageResponse.data.on('error', (error) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            reject(error);
          }
        });
      });

      // 分析结果
      const result = {
        testCase: i + 1,
        description: testCase.description,
        originalMessage,
        originalLength: originalMessage.length,
        generatedTitle: taskTitle,
        titleLength: taskTitle ? taskTitle.length : 0,
        taskId,
        analysis: {
          titleGenerated: !!taskTitle,
          lengthAppropriate: taskTitle ? taskTitle.length <= 60 : false,
          containsKeywords: taskTitle ? testCase.expectedKeywords.some(keyword => 
            taskTitle.toLowerCase().includes(keyword.toLowerCase())
          ) : false,
          isNotTruncated: taskTitle ? !taskTitle.includes('...') || taskTitle.length < originalMessage.length : false
        }
      };

      results.push(result);

      console.log(`📊 Analysis:`);
      console.log(`   ✅ Title Generated: ${result.analysis.titleGenerated}`);
      console.log(`   ✅ Length Appropriate (≤60): ${result.analysis.lengthAppropriate}`);
      console.log(`   ✅ Contains Keywords: ${result.analysis.containsKeywords}`);
      console.log(`   ✅ Not Simple Truncation: ${result.analysis.isNotTruncated}`);
      
      // 等待一下再进行下一个测试
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 生成综合报告
    console.log('\n📊 Task Title Generation Test Report');
    console.log('=====================================');
    
    const successfulTests = results.filter(r => 
      r.analysis.titleGenerated && 
      r.analysis.lengthAppropriate && 
      r.analysis.containsKeywords
    );
    
    console.log(`✅ Successful Tests: ${successfulTests.length}/${results.length}`);
    console.log(`📏 Average Title Length: ${results.reduce((sum, r) => sum + r.titleLength, 0) / results.length}`);
    
    console.log('\n📋 Detailed Results:');
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.description}`);
      console.log(`   Original: "${result.originalMessage.substring(0, 50)}${result.originalMessage.length > 50 ? '...' : ''}"`);
      console.log(`   Generated: "${result.generatedTitle || 'N/A'}"`);
      console.log(`   Quality Score: ${Object.values(result.analysis).filter(Boolean).length}/4`);
    });

    // 保存详细结果
    const outputFile = 'test-output/agent-task-title-generation-results.json';
    fs.writeFileSync(outputFile, JSON.stringify({
      summary: {
        totalTests: results.length,
        successfulTests: successfulTests.length,
        successRate: `${Math.round((successfulTests.length / results.length) * 100)}%`,
        averageTitleLength: Math.round(results.reduce((sum, r) => sum + r.titleLength, 0) / results.length)
      },
      results,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n📄 Detailed results saved to: ${outputFile}`);
    
    // 结论
    if (successfulTests.length === results.length) {
      console.log('\n🎉 SUCCESS: All task titles were generated appropriately!');
      console.log('✅ Task titles are now descriptive and user-friendly');
      console.log('✅ Sidebar will show meaningful task names');
    } else {
      console.log(`\n⚠️  PARTIAL SUCCESS: ${successfulTests.length}/${results.length} tests passed`);
      console.log('🔧 Some improvements may be needed in title generation logic');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// 运行测试
testAgentTaskTitleGeneration().catch(console.error); 