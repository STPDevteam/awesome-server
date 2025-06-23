// 测试任务执行和结果总结
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 配置参数
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const USER_ID = 'test_user_123';
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 保存结果到文件
function saveToFile(fileName, data) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`结果已保存到 ${filePath}`);
}

// 创建测试任务
async function createTask() {
  console.log('创建测试任务...');
  
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: '使用Playwright访问百度并搜索"AI任务执行总结"',
      title: '测试AI总结功能',
      userId: USER_ID
    })
  });
  
  const result = await response.json();
  saveToFile('create-summary-test-task.json', result);
  
  if (!result.success) {
    throw new Error(`创建任务失败: ${JSON.stringify(result)}`);
  }
  
  console.log(`任务创建成功，ID: ${result.data.task.id}`);
  return result.data.task.id;
}

// 分析任务
async function analyzeTask(taskId) {
  console.log(`分析任务 (ID: ${taskId})...`);
  
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: USER_ID
    })
  });
  
  const result = await response.json();
  saveToFile('analyze-summary-test-task.json', result);
  
  if (!result.success) {
    throw new Error(`分析任务失败: ${JSON.stringify(result)}`);
  }
  
  console.log('任务分析成功');
  return result;
}

// 执行任务并获取详细结果
async function executeTask(taskId) {
  console.log(`执行任务 (ID: ${taskId})...`);
  
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: USER_ID
    })
  });
  
  const result = await response.json();
  saveToFile('execute-summary-test-task.json', result);
  
  if (!result.success) {
    throw new Error(`执行任务失败: ${JSON.stringify(result)}`);
  }
  
  console.log('任务执行成功');
  
  // 显示AI生成的执行总结
  console.log('\n===== AI执行总结 =====\n');
  console.log(result.data.summary);
  console.log('\n=======================\n');
  
  return result;
}

// 获取任务详情
async function getTaskDetails(taskId) {
  console.log(`获取任务详情 (ID: ${taskId})...`);
  
  const response = await fetch(`${BASE_URL}/api/task/${taskId}?userId=${USER_ID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  saveToFile('get-summary-test-task.json', result);
  
  if (!result.success) {
    throw new Error(`获取任务详情失败: ${JSON.stringify(result)}`);
  }
  
  console.log('获取任务详情成功');
  return result;
}

// 主测试流程
async function runTest() {
  try {
    // 1. 创建任务
    const taskId = await createTask();
    
    // 2. 分析任务
    await analyzeTask(taskId);
    
    // 3. 执行任务
    await executeTask(taskId);
    
    // 4. 获取最终任务详情
    await getTaskDetails(taskId);
    
    console.log('测试完成！');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
runTest(); 