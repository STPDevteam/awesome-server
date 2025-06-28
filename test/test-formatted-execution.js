import fetch from 'node-fetch';
import { config } from 'dotenv';

config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3456';

async function testFormattedExecution() {
  console.log('🚀 测试格式化执行结果功能...\n');

  try {
    // 1. 创建测试用户
    console.log('1️⃣ 创建测试用户...');
    const userResponse = await fetch(`${API_BASE_URL}/api/auth/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: `test-formatted-${Date.now()}`,
        publicKey: '0x1234567890abcdef'
      })
    });
    const userData = await userResponse.json();
    console.log('✅ 用户创建成功:', userData.data.user.id);

    // 2. 创建测试任务
    console.log('\n2️⃣ 创建测试任务...');
    const taskResponse = await fetch(`${API_BASE_URL}/api/task`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.data.token}`
      },
      body: JSON.stringify({
        content: '获取比特币当前价格和市场数据',
        title: '比特币市场分析'
      })
    });
    const taskData = await taskResponse.json();
    const taskId = taskData.data.task.id;
    console.log('✅ 任务创建成功:', taskId);

    // 3. 分析任务
    console.log('\n3️⃣ 分析任务...');
    const analyzeResponse = await fetch(`${API_BASE_URL}/api/task/${taskId}/analyze/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.data.token}`
      }
    });

    // 处理SSE流
    const reader = analyzeResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.event === 'analysis_complete') {
              console.log('✅ 任务分析完成');
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 4. 执行任务并查看格式化结果
    console.log('\n4️⃣ 执行任务（查看格式化输出）...');
    const executeResponse = await fetch(`${API_BASE_URL}/api/task/${taskId}/execute/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.data.token}`
      }
    });

    // 处理执行结果的SSE流
    const execReader = executeResponse.body.getReader();
    let execBuffer = '';
    let formattedResults = [];

    console.log('\n📋 执行步骤结果：\n');

    while (true) {
      const { done, value } = await execReader.read();
      if (done) break;
      
      execBuffer += decoder.decode(value, { stream: true });
      const lines = execBuffer.split('\n');
      execBuffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            
            // 显示步骤开始
            if (parsed.event === 'step_start') {
              console.log(`\n🔄 步骤 ${parsed.data.step}: ${parsed.data.mcpName} - ${parsed.data.actionName}`);
            }
            
            // 显示格式化后的结果
            if (parsed.event === 'step_complete' && parsed.data.result) {
              console.log(`\n✅ 步骤 ${parsed.data.step} 完成，格式化结果：`);
              console.log('─'.repeat(50));
              console.log(parsed.data.result);
              console.log('─'.repeat(50));
              
              // 保存格式化结果
              formattedResults.push({
                step: parsed.data.step,
                result: parsed.data.result
              });
              
              // 如果有原始结果，也显示对比
              if (parsed.data.rawResult) {
                console.log('\n原始结果预览（前200字符）：');
                console.log(JSON.stringify(parsed.data.rawResult).substring(0, 200) + '...');
              }
            }
            
            // 显示摘要
            if (parsed.event === 'summary_chunk') {
              process.stdout.write(parsed.data.content);
            }
            
            // 任务完成
            if (parsed.event === 'task_complete') {
              console.log('\n\n✅ 任务执行完成！');
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 5. 显示所有格式化结果的总结
    if (formattedResults.length > 0) {
      console.log('\n\n📊 所有步骤的格式化结果总结：');
      console.log('═'.repeat(60));
      formattedResults.forEach(({ step, result }) => {
        console.log(`\n### 步骤 ${step}`);
        console.log(result);
        console.log('\n' + '─'.repeat(60));
      });
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testFormattedExecution(); 