const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

// 测试用的认证token
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzUwMzdiODE0NzQ5YjkwZGNjMDM1YjMiLCJhZGRyZXNzIjoiMHgxMjM0NTY3ODkwYWJjZGVmIiwiaWF0IjoxNzMzMjk5MTI4LCJleHAiOjE3MzU4OTExMjh9.v3xHgGNOjJKOOgRJKmXMEiZOKKRULnFrEQDuNZfNQQo';

async function testStreamingFinalResult() {
  console.log('🧪 Testing streaming final_result functionality...');
  
  const testData = {
    message: "请查找前3个meme币的信息",
    intent: "task",
    agentId: "67503fa114749b90dcc035c1"
  };

  const eventCounts = {
    'final_result_chunk': 0,
    'workflow_complete': 0,
    'step_complete': 0
  };

  const streamingData = {
    chunks: [],
    finalResult: '',
    workflowResult: null,
    startTime: null,
    endTime: null
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/agent/conversation/stream`, testData, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    console.log('📡 Starting to monitor streaming final_result...');
    streamingData.startTime = new Date();

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
            
            // 收集流式final_result块
            if (data.event === 'final_result_chunk') {
              const chunk = data.data.chunk;
              streamingData.chunks.push({
                content: chunk,
                timestamp: new Date().toISOString(),
                length: chunk.length
              });
              
              // 实时显示流式内容
              process.stdout.write(chunk);
            }
            
            // 收集workflow_complete事件
            if (data.event === 'task_execution_progress' && data.data.event === 'workflow_complete') {
              streamingData.workflowResult = data.data.data;
              streamingData.endTime = new Date();
              streamingData.finalResult = data.data.data.finalResult;
            }
            
            if (data.event === 'stream_complete') {
              console.log('\n\n✅ Stream completed, analyzing results...');
              analyzeStreamingResults();
            }
            
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => {
      console.log('\n🏁 Stream ended');
      if (!streamingData.endTime) {
        streamingData.endTime = new Date();
      }
      analyzeStreamingResults();
    });

    response.data.on('error', (error) => {
      console.error('❌ Stream error:', error);
    });

  } catch (error) {
    console.error('❌ Request failed:', error.response?.data || error.message);
  }

  function analyzeStreamingResults() {
    console.log('\n📊 Streaming Analysis:');
    console.log('======================');
    
    const duration = streamingData.endTime - streamingData.startTime;
    console.log(`⏱️  Total Duration: ${duration}ms`);
    console.log(`📦 Final Result Chunks: ${streamingData.chunks.length}`);
    console.log(`📏 Total Streamed Length: ${streamingData.chunks.reduce((sum, chunk) => sum + chunk.length, 0)} characters`);
    
    if (streamingData.finalResult) {
      console.log(`📋 Final Result Length: ${streamingData.finalResult.length} characters`);
      
      // 验证流式内容是否与最终结果匹配
      const streamedContent = streamingData.chunks.map(c => c.content).join('');
      const isMatching = streamedContent === streamingData.finalResult;
      
      console.log(`✅ Streaming Content Matches Final Result: ${isMatching}`);
      
      if (!isMatching) {
        console.log(`⚠️  Streamed: ${streamedContent.length} chars`);
        console.log(`⚠️  Final: ${streamingData.finalResult.length} chars`);
      }
    }
    
    console.log('\n📈 Event Statistics:');
    Object.entries(eventCounts).forEach(([event, count]) => {
      console.log(`${event}: ${count}`);
    });
    
    console.log('\n🎯 Streaming Performance:');
    console.log('========================');
    
    if (streamingData.chunks.length > 0) {
      const avgChunkSize = streamingData.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / streamingData.chunks.length;
      console.log(`📊 Average Chunk Size: ${avgChunkSize.toFixed(2)} characters`);
      
      const firstChunk = streamingData.chunks[0];
      const lastChunk = streamingData.chunks[streamingData.chunks.length - 1];
      const streamingDuration = new Date(lastChunk.timestamp) - new Date(firstChunk.timestamp);
      
      console.log(`⚡ Streaming Duration: ${streamingDuration}ms`);
      console.log(`🚀 Streaming Speed: ${(streamingData.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / streamingDuration * 1000).toFixed(2)} chars/second`);
    }
    
    console.log('\n🔍 Sample Chunks:');
    console.log('=================');
    streamingData.chunks.slice(0, 3).forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}: "${chunk.content.substring(0, 50)}${chunk.content.length > 50 ? '...' : ''}"`);
    });
    
    // 保存详细结果到文件
    const outputFile = 'test-output/streaming-final-result-analysis.json';
    fs.writeFileSync(outputFile, JSON.stringify({
      eventCounts,
      streamingData,
      performance: {
        duration,
        chunksCount: streamingData.chunks.length,
        totalLength: streamingData.chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        avgChunkSize: streamingData.chunks.length > 0 ? streamingData.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / streamingData.chunks.length : 0
      }
    }, null, 2));
    
    console.log(`\n📄 Detailed results saved to: ${outputFile}`);
    
    // 功能验证
    console.log('\n🎉 Feature Validation:');
    console.log('======================');
    
    if (streamingData.chunks.length > 0) {
      console.log('✅ SUCCESS: final_result can now be streamed!');
      console.log('✅ Users will see content appearing in real-time');
      console.log('✅ Better user experience with progressive loading');
    } else {
      console.log('❌ FAILED: No streaming chunks received');
    }
    
    if (streamingData.workflowResult && streamingData.workflowResult.success) {
      console.log('✅ Workflow completed successfully');
    } else {
      console.log('❌ Workflow failed or incomplete');
    }
  }
}

// 运行测试
testStreamingFinalResult().catch(console.error); 