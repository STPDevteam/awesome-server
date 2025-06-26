/**
 * 测试脚本：验证 analyze 接口的 workflow 保存修复
 * 
 * 使用方法：
 * node test/test-analyze-workflow-fix.js
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';
const TEST_USER_ID = 'test-user-001';
const TEST_AUTH_TOKEN = 'test-auth-token-001';

// 测试配置
const config = {
  headers: {
    'Authorization': `Bearer ${TEST_AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 主测试函数
async function runTest() {
  console.log('🔧 测试 analyze 接口 workflow 保存修复...\n');
  
  try {
    // 步骤 1: 创建测试任务
    console.log('📝 步骤 1: 创建测试任务');
    const createTaskResponse = await axios.post(`${API_BASE_URL}/task`, {
      userId: TEST_USER_ID,
      title: 'Test Task for Workflow Fix',
      content: 'Post a tweet saying "Hello MCP World!"'
    }, config);
    
    const taskId = createTaskResponse.data.data.task.id;
    console.log(`✅ 任务创建成功，ID: ${taskId}\n`);
    
    // 步骤 2: 分析任务
    console.log('🔍 步骤 2: 分析任务');
    const analyzeResponse = await axios.post(`${API_BASE_URL}/task/${taskId}/analyze`, {}, config);
    
    if (analyzeResponse.data.success) {
      console.log('✅ 任务分析成功');
      console.log(`   - MCP工作流: ${JSON.stringify(analyzeResponse.data.data.mcpWorkflow, null, 2)}\n`);
    } else {
      throw new Error('任务分析失败');
    }
    
    // 等待一下确保数据已保存
    await delay(2000);
    
    // 步骤 3: 验证任务详情中的 workflow
    console.log('🔎 步骤 3: 验证任务详情中的 workflow');
    const taskDetailResponse = await axios.get(`${API_BASE_URL}/task/${taskId}?userId=${TEST_USER_ID}`, config);
    
    const task = taskDetailResponse.data.data.task;
    if (task.mcpWorkflow && task.mcpWorkflow.mcps && task.mcpWorkflow.workflow) {
      console.log('✅ Workflow 已正确保存到数据库');
      console.log(`   - MCPs数量: ${task.mcpWorkflow.mcps.length}`);
      console.log(`   - 工作流步骤数: ${task.mcpWorkflow.workflow.length}\n`);
    } else {
      console.error('❌ Workflow 未正确保存');
      console.error(`   - 任务数据: ${JSON.stringify(task, null, 2)}`);
      throw new Error('Workflow 未正确保存到数据库');
    }
    
    // 步骤 4: 尝试执行任务（不验证授权）
    console.log('🚀 步骤 4: 尝试执行任务');
    try {
      const executeResponse = await axios.post(`${API_BASE_URL}/task/${taskId}/execute`, {
        skipAuthCheck: true
      }, config);
      
      if (executeResponse.data.success) {
        console.log('✅ 任务执行成功（跳过授权检查）');
        console.log(`   - 状态: ${executeResponse.data.data.status}`);
        console.log(`   - 摘要: ${executeResponse.data.data.summary}\n`);
      } else {
        console.log('⚠️  任务执行失败，但这可能是预期的（如果需要实际的MCP连接）');
        console.log(`   - 错误: ${executeResponse.data.data.error}\n`);
      }
    } catch (execError) {
      if (execError.response && execError.response.status === 500) {
        console.log('⚠️  任务执行返回500错误，检查服务器日志以了解详情');
        console.log(`   - 错误信息: ${JSON.stringify(execError.response.data, null, 2)}\n`);
      } else {
        throw execError;
      }
    }
    
    // 步骤 5: 再次验证任务详情，确保 workflow 仍然存在
    console.log('🔎 步骤 5: 再次验证任务详情');
    const finalTaskResponse = await axios.get(`${API_BASE_URL}/task/${taskId}?userId=${TEST_USER_ID}`, config);
    
    const finalTask = finalTaskResponse.data.data.task;
    if (finalTask.mcpWorkflow && finalTask.mcpWorkflow.mcps && finalTask.mcpWorkflow.workflow) {
      console.log('✅ Workflow 在执行后仍然存在');
      console.log(`   - 任务状态: ${finalTask.status}`);
      if (finalTask.result) {
        console.log(`   - 执行结果: ${JSON.stringify(finalTask.result, null, 2)}`);
      }
    } else {
      console.error('❌ Workflow 在执行后丢失');
      throw new Error('Workflow 在执行后丢失');
    }
    
    console.log('\n✅ 所有测试完成！analyze 接口的 workflow 保存功能正常工作。');
    
  } catch (error) {
    console.error('\n❌ 测试失败:');
    if (error.response) {
      console.error(`   - 状态码: ${error.response.status}`);
      console.error(`   - 响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   - 错误: ${error.message}`);
    }
    process.exit(1);
  }
}

// 运行测试
runTest().catch(console.error); 