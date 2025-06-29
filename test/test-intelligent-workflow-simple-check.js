import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

// 测试用户ID
const TEST_USER_ID = 'test-user-123';

async function testIntelligentWorkflow() {
  console.log('🧪 开始测试智能工作流是否真的在工作...\n');

  try {
    // 1. 创建任务
    console.log('1️⃣ 创建测试任务...');
    const createTaskResponse = await fetch(`${BASE_URL}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: '比较 ElizaOS 和 CrewAI 这两个AI框架的特点和差异',
        userId: TEST_USER_ID
      })
    });

    if (!createTaskResponse.ok) {
      throw new Error(`创建任务失败: ${createTaskResponse.status}`);
    }

    const taskData = await createTaskResponse.json();
    const taskId = taskData.data.task.id;
    console.log(`✅ 任务创建成功，ID: ${taskId}\n`);

    // 2. 分析任务
    console.log('2️⃣ 分析任务...');
    const analyzeResponse = await fetch(`${BASE_URL}/task/${taskId}/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: TEST_USER_ID
      })
    });

    if (!analyzeResponse.ok) {
      throw new Error(`分析任务失败: ${analyzeResponse.status}`);
    }

    // 处理分析流
    console.log('📊 处理分析流...');
    const reader = analyzeResponse.body.getReader();
    let analysisComplete = false;

    while (!analysisComplete) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            analysisComplete = true;
            break;
          }
          
          try {
            const eventData = JSON.parse(data);
            if (eventData.event === 'analysis_complete') {
              console.log('✅ 任务分析完成');
              console.log(`推荐的MCP: ${JSON.stringify(eventData.data.mcps || [])}`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 3. 执行任务 - 这里应该使用智能工作流
    console.log('\n3️⃣ 执行任务（应该使用智能工作流）...');
    const executeResponse = await fetch(`${BASE_URL}/task/${taskId}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: TEST_USER_ID
      })
    });

    if (!executeResponse.ok) {
      throw new Error(`执行任务失败: ${executeResponse.status}`);
    }

    // 处理执行流
    console.log('⚡ 处理执行流...');
    const executeReader = executeResponse.body.getReader();
    let executionComplete = false;
    let useIntelligentWorkflow = false;
    let usedPreselectedMCPs = false;

    while (!executionComplete) {
      const { done, value } = await executeReader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            executionComplete = true;
            break;
          }
          
          try {
            const eventData = JSON.parse(data);
            
            // 检查是否使用了智能工作流
            if (eventData.event === 'execution_start' && eventData.data.usePreselectedMCPs) {
              useIntelligentWorkflow = true;
              usedPreselectedMCPs = eventData.data.usePreselectedMCPs;
              console.log('🧠 检测到使用智能工作流引擎！');
            }
            
            if (eventData.event === 'preselected_mcps') {
              console.log(`📋 预选的MCP工具: ${JSON.stringify(eventData.data.mcps)}`);
            }
            
            if (eventData.event === 'workflow_step') {
              console.log(`🔄 智能工作流步骤: ${eventData.data.workflowEvent}`);
            }
            
            if (eventData.event === 'step_complete') {
              console.log(`✅ 步骤完成: ${eventData.data.tool || '未知工具'}`);
            }
            
            if (eventData.event === 'task_complete') {
              console.log(`🎉 任务执行完成，成功: ${eventData.data.success}`);
            }
            
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 4. 验证结果
    console.log('\n📋 测试结果总结:');
    console.log(`- 是否使用智能工作流引擎: ${useIntelligentWorkflow ? '✅ 是' : '❌ 否'}`);
    console.log(`- 是否使用预选MCP工具: ${usedPreselectedMCPs ? '✅ 是' : '❌ 否'}`);
    
    if (useIntelligentWorkflow) {
      console.log('\n🎯 智能工作流引擎正在正常工作！');
    } else {
      console.log('\n⚠️ 智能工作流引擎可能没有被使用，检查配置...');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testIntelligentWorkflow(); 