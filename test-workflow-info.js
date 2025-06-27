#!/usr/bin/env node

/**
 * 测试多MCP链式调用的工作流
 * 
 * 场景：获取比特币价格，然后进行分析，最后发布到Twitter
 */

const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-001';

// 步骤1：创建任务
async function createTask() {
  console.log('\n📝 步骤1：创建任务...');
  
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: '获取比特币当前价格，分析价格走势，然后发布一条关于比特币价格的推文',
      userId: TEST_USER_ID
    })
  });
  
  const result = await response.json();
  console.log('创建任务响应:', result);
  
  if (!result.success) {
    throw new Error('创建任务失败');
  }
  
  return result.data.taskId;
}

// 步骤2：分析任务（生成链式工作流）
async function analyzeTask(taskId) {
  console.log(`\n🔍 步骤2：分析任务 ${taskId}...`);
  
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/analyze/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: TEST_USER_ID
    })
  });
  
  // 处理SSE流
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const event = JSON.parse(data);
          console.log(`  📌 ${event.event}:`, event.data);
          
          if (event.event === 'analysis_complete') {
            console.log('\n📊 生成的工作流:');
            console.log(JSON.stringify(event.data.mcpWorkflow, null, 2));
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
}

// 步骤3：执行链式工作流
async function executeWorkflow(taskId) {
  console.log(`\n⚡ 步骤3：执行链式工作流 ${taskId}...`);
  
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/execute/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: TEST_USER_ID
    })
  });
  
  // 处理SSE流
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let summary = '';
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const event = JSON.parse(data);
          
          switch (event.event) {
            case 'step_start':
              console.log(`\n🚀 开始执行步骤 ${event.data.step}: ${event.data.mcpName} - ${event.data.actionName}`);
              console.log(`   输入: ${event.data.input}`);
              break;
              
            case 'step_complete':
              console.log(`✅ 步骤 ${event.data.step} 完成`);
              console.log(`   结果: ${JSON.stringify(event.data.result).substring(0, 200)}...`);
              break;
              
            case 'step_error':
              console.log(`❌ 步骤 ${event.data.step} 失败: ${event.data.error}`);
              break;
              
            case 'summary_chunk':
              summary += event.data.content;
              process.stdout.write('.');
              break;
              
            case 'workflow_complete':
              console.log(`\n\n🎉 工作流执行完成: ${event.data.message}`);
              break;
              
            case 'error':
              console.error(`\n❌ 错误: ${event.data.message}`);
              break;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
  
  if (summary) {
    console.log('\n\n📄 执行摘要:');
    console.log(summary);
  }
}

// 主函数
async function main() {
  try {
    console.log('🌟 开始测试多MCP链式调用工作流...\n');
    
    // 创建任务
    const taskId = await createTask();
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 分析任务
    await analyzeTask(taskId);
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 执行工作流
    await executeWorkflow(taskId);
    
    console.log('\n\n✨ 测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
main(); 