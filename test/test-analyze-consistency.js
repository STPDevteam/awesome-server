// 测试任务分析的一致性
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 配置参数
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const USER_ID = 'test_consistency_user';
const OUTPUT_DIR = path.join(__dirname, '..', 'test-output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 测试用例列表
const testCases = [
  {
    name: 'Twitter/X任务',
    content: '使用X平台发送一条推文，内容是"Hello from MCP test"',
    expectedMcp: 'x-mcp'
  },
  {
    name: 'GitHub任务',
    content: '查看我的GitHub仓库列表并创建一个新的issue',
    expectedMcp: 'github-mcp-server'
  },
  {
    name: '加密货币价格任务',
    content: '查询比特币和以太坊的当前价格',
    expectedMcp: 'coingecko-mcp'
  },
  {
    name: 'Playwright自动化任务',
    content: '使用浏览器自动化访问百度并搜索"MCP协议"',
    expectedMcp: 'playwright'
  },
  {
    name: '12306火车票任务',
    content: '查询北京到上海的高铁票信息',
    expectedMcp: '12306-mcp-service'
  }
];

// 创建任务
async function createTask(content, title) {
  const response = await fetch(`${BASE_URL}/api/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content,
      title,
      userId: USER_ID
    })
  });
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(`创建任务失败: ${JSON.stringify(result)}`);
  }
  
  return result.data.task.id;
}

// 分析任务
async function analyzeTask(taskId) {
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
  if (!result.success) {
    throw new Error(`分析任务失败: ${JSON.stringify(result)}`);
  }
  
  return result.data.mcpWorkflow;
}

// 测试单个案例的一致性
async function testCaseConsistency(testCase, iterations = 3) {
  console.log(`\n测试案例: ${testCase.name}`);
  console.log(`内容: ${testCase.content}`);
  console.log(`期望MCP: ${testCase.expectedMcp}`);
  console.log('---');
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      // 创建任务
      const taskId = await createTask(
        testCase.content, 
        `${testCase.name} - 测试 ${i + 1}`
      );
      
      // 分析任务
      const mcpWorkflow = await analyzeTask(taskId);
      
      // 提取选中的MCP
      const selectedMcps = mcpWorkflow?.mcps?.map(m => m.name) || [];
      
      results.push({
        iteration: i + 1,
        taskId,
        selectedMcps,
        containsExpected: selectedMcps.includes(testCase.expectedMcp)
      });
      
      console.log(`迭代 ${i + 1}: ${selectedMcps.join(', ')} - ${
        selectedMcps.includes(testCase.expectedMcp) ? '✅ 包含期望MCP' : '❌ 未包含期望MCP'
      }`);
      
      // 等待一小段时间，避免API限流
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`迭代 ${i + 1} 失败:`, error.message);
      results.push({
        iteration: i + 1,
        error: error.message
      });
    }
  }
  
  // 分析一致性
  const successResults = results.filter(r => !r.error);
  const containsExpectedCount = successResults.filter(r => r.containsExpected).length;
  const consistency = containsExpectedCount / successResults.length * 100;
  
  console.log(`\n一致性分析:`);
  console.log(`- 成功率: ${successResults.length}/${iterations} (${successResults.length/iterations*100}%)`);
  console.log(`- 包含期望MCP的比例: ${containsExpectedCount}/${successResults.length} (${consistency.toFixed(1)}%)`);
  
  // 检查MCP选择的一致性
  if (successResults.length > 1) {
    const firstMcps = JSON.stringify(successResults[0].selectedMcps.sort());
    const isFullyConsistent = successResults.every(r => 
      JSON.stringify(r.selectedMcps.sort()) === firstMcps
    );
    console.log(`- MCP选择完全一致: ${isFullyConsistent ? '✅ 是' : '❌ 否'}`);
  }
  
  return {
    testCase: testCase.name,
    results,
    consistency,
    successRate: successResults.length / iterations * 100
  };
}

// 主测试流程
async function runConsistencyTest() {
  console.log('开始任务分析一致性测试...\n');
  
  const allResults = [];
  
  for (const testCase of testCases) {
    const result = await testCaseConsistency(testCase);
    allResults.push(result);
    
    // 保存单个测试结果
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `consistency-${testCase.name.replace(/\//g, '-')}.json`),
      JSON.stringify(result, null, 2)
    );
  }
  
  // 保存总结果
  const summary = {
    timestamp: new Date().toISOString(),
    testCases: allResults,
    overallConsistency: {
      averageConsistency: allResults.reduce((sum, r) => sum + r.consistency, 0) / allResults.length,
      averageSuccessRate: allResults.reduce((sum, r) => sum + r.successRate, 0) / allResults.length
    }
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'analyze-consistency-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n===== 测试总结 =====');
  console.log(`平均一致性: ${summary.overallConsistency.averageConsistency.toFixed(1)}%`);
  console.log(`平均成功率: ${summary.overallConsistency.averageSuccessRate.toFixed(1)}%`);
  console.log('\n测试完成！结果已保存到 test-output 目录');
}

// 运行测试
runConsistencyTest().catch(console.error); 