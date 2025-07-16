const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// 测试用的认证token
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzUwMzdiODE0NzQ5YjkwZGNjMDM1YjMiLCJhZGRyZXNzIjoiMHgxMjM0NTY3ODkwYWJjZGVmIiwiaWF0IjoxNzMzMjk5MTI4LCJleHAiOjE3MzU4OTExMjh9.v3xHgGNOjJKOOgRJKmXMEiZOKKRULnFrEQDuNZfNQQo';

async function testFinalResultEvents() {
  console.log('🧪 Testing final_result events optimization...');
  
  const testData = {
    message: "请查找前3个meme币的信息",
    intent: "task",
    agentId: "67503fa114749b90dcc035c1"
  };

  const eventCounts = {
    'final_result': 0,
    'workflow_complete': 0,
    'task_execution_progress': 0
  };

  const results = [];

  try {
    const response = await axios.post(`${BASE_URL}/api/agent/conversation/stream`, testData, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    console.log('📡 Starting to monitor SSE events...');

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // 统计事件类型
            if (data.event) {
              eventCounts[data.event] = (eventCounts[data.event] || 0) + 1;
            }
            
            // 收集final_result相关事件
            if (data.event === 'final_result') {
              results.push({
                type: 'direct_final_result',
                data: data.data,
                timestamp: new Date().toISOString()
              });
            }
            
            if (data.event === 'task_execution_progress') {
              if (data.data.event === 'final_result') {
                results.push({
                  type: 'progress_final_result',
                  data: data.data.data,
                  timestamp: new Date().toISOString()
                });
              }
              
              if (data.data.event === 'workflow_complete') {
                results.push({
                  type: 'workflow_complete',
                  data: data.data.data,
                  timestamp: new Date().toISOString()
                });
              }
            }
            
            if (data.event === 'stream_complete') {
              console.log('\n✅ Stream completed, analyzing results...');
              analyzeResults();
            }
            
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('\n🏁 Stream ended');
      analyzeResults();
    });

    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error);
    });

  } catch (error) {
    console.error('❌ Request failed:', error.response?.data || error.message);
  }

  function analyzeResults() {
    console.log('\n📊 Event Statistics:');
    console.log('====================');
    Object.entries(eventCounts).forEach(([event, count]) => {
      console.log(`${event}: ${count}`);
    });

    console.log('\n📋 Final Result Events Analysis:');
    console.log('=================================');
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.type.toUpperCase()}`);
      console.log(`   Timestamp: ${result.timestamp}`);
      
      if (result.type === 'direct_final_result') {
        console.log(`   Contains finalResult: ${!!result.data.finalResult}`);
        console.log(`   Contains messageIds: ${!!(result.data.userMessageId && result.data.assistantMessageId)}`);
      } else if (result.type === 'progress_final_result') {
        console.log(`   Contains finalResult: ${!!result.data.finalResult}`);
        console.log(`   Message: ${result.data.message}`);
      } else if (result.type === 'workflow_complete') {
        console.log(`   Success: ${result.data.success}`);
        console.log(`   Contains finalResult: ${!!result.data.finalResult}`);
        console.log(`   Message: ${result.data.message}`);
      }
    });

    console.log('\n🎯 Optimization Summary:');
    console.log('========================');
    
    const progressFinalResults = results.filter(r => r.type === 'progress_final_result');
    const workflowCompletes = results.filter(r => r.type === 'workflow_complete');
    const directFinalResults = results.filter(r => r.type === 'direct_final_result');

    console.log(`❌ Removed duplicate progress final_result events: ${progressFinalResults.length}`);
    console.log(`✅ Kept workflow_complete events with finalResult: ${workflowCompletes.length}`);
    console.log(`ℹ️  Direct final_result events (metadata only): ${directFinalResults.length}`);

    if (progressFinalResults.length === 0) {
      console.log('\n🎉 SUCCESS: No duplicate final_result events found!');
    } else {
      console.log('\n⚠️  WARNING: Still found duplicate final_result events');
    }

    // 保存详细结果到文件
    const outputFile = 'test-output/final-result-events-analysis.json';
    fs.writeFileSync(outputFile, JSON.stringify({
      eventCounts,
      results,
      analysis: {
        duplicateEventsRemoved: progressFinalResults.length === 0,
        workflowCompleteEvents: workflowCompletes.length,
        directFinalResultEvents: directFinalResults.length
      }
    }, null, 2));
    
    console.log(`\n📄 Detailed results saved to: ${outputFile}`);
  }
}

// 运行测试
testFinalResultEvents().catch(console.error); 