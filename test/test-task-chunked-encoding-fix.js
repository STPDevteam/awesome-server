#!/usr/bin/env node

/**
 * 测试Task智能引擎的chunked encoding修复
 * 模拟前端调用以太坊区块查询任务
 */

const fetch = require('node-fetch');

const API_BASE = 'https://api-test.awenetwork.ai';
const TASK_ID = 'a5ec0fec-93f5-47f9-80eb-101b13ab3ead'; // 用户提供的TaskID

async function testTaskStreamingFix() {
    console.log('🧪 Testing Task Engine Chunked Encoding Fix...\n');
    
    try {
        console.log('📡 Calling Task streaming endpoint...');
        const response = await fetch(`${API_BASE}/api/task/${TASK_ID}/execute/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/plain'  // SSE format
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('✅ Connection established successfully');
        console.log('📊 Response headers:', Object.fromEntries(response.headers));
        
        // 监听SSE事件
        let eventCount = 0;
        let stepRawResultReceived = false;
        let completionReceived = false;
        const startTime = Date.now();
        
        response.body.on('data', (chunk) => {
            const data = chunk.toString();
            const lines = data.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    eventCount++;
                    const eventData = line.substring(6);
                    
                    try {
                        const event = JSON.parse(eventData);
                        console.log(`📨 Event #${eventCount}: ${event.event}`, {
                            step: event.data?.step,
                            tool: event.data?.tool || event.data?.toolName,
                            success: event.data?.success,
                            agentName: event.data?.agentName
                        });
                        
                        // 检查关键事件
                        if (event.event === 'step_raw_result') {
                            stepRawResultReceived = true;
                            console.log('✅ step_raw_result received successfully!');
                            
                            // 检查数据大小
                            const resultSize = JSON.stringify(event.data.result).length;
                            console.log(`📏 Raw result size: ${resultSize} bytes`);
                            
                            if (resultSize > 100000) {
                                console.log('🔍 Large data handled successfully!');
                            }
                        }
                        
                        if (event.event === 'task_execution_complete') {
                            completionReceived = true;
                            const duration = Date.now() - startTime;
                            console.log(`🎉 Task completed in ${duration}ms`);
                        }
                        
                    } catch (parseError) {
                        console.log(`📝 Non-JSON event data: ${eventData.substring(0, 100)}...`);
                    }
                }
            }
        });

        response.body.on('end', () => {
            const duration = Date.now() - startTime;
            console.log('\n📊 Test Results:');
            console.log(`⏱️  Total duration: ${duration}ms`);
            console.log(`📨 Total events: ${eventCount}`);
            console.log(`✅ step_raw_result received: ${stepRawResultReceived}`);
            console.log(`🎯 Task completed: ${completionReceived}`);
            
            if (stepRawResultReceived && !completionReceived) {
                console.log('⚠️  Task may still be running...');
            } else if (stepRawResultReceived && completionReceived) {
                console.log('🎉 CHUNKED ENCODING FIX SUCCESSFUL!');
            } else {
                console.log('❌ Issue still exists - step_raw_result not received');
            }
        });

        response.body.on('error', (error) => {
            console.error('❌ Stream error:', error.message);
            
            if (error.message.includes('INCOMPLETE_CHUNKED_ENCODING')) {
                console.log('💡 This is the exact error we\'re trying to fix!');
            }
        });

        // 设置超时
        setTimeout(() => {
            response.body.destroy();
            console.log('\n⏰ Test timeout after 60 seconds');
            process.exit(0);
        }, 60000);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        if (error.message.includes('INCOMPLETE_CHUNKED_ENCODING')) {
            console.log('\n🔍 Analysis: This error indicates the fix is not yet working');
            console.log('📋 Possible causes:');
            console.log('  1. executionResult.success or executionResult.result is false/undefined');
            console.log('  2. inferActualToolName is taking too long or failing');
            console.log('  3. Data serialization is still blocking the stream');
            console.log('  4. Database save operation is still synchronous');
        }
        
        process.exit(1);
    }
}

// 运行测试
console.log('🔧 Task Engine Chunked Encoding Fix Test');
console.log('=' .repeat(50));
testTaskStreamingFix(); 