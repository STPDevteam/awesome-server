#!/usr/bin/env node

/**
 * 测试Agent智能引擎过度规划修复效果
 * 验证简单查询任务是否能够1-2步完成
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// 测试用例
const testCases = [
  {
    name: '简单数据查询1',
    query: 'Use dexscreener to identify 3 top meme coins launched over the past 3 days',
    expectedSteps: 1,
    expectedType: 'simple_query'
  },
  {
    name: '简单数据查询2', 
    query: 'Get current Crypto Fear & Greed Index',
    expectedSteps: 1,
    expectedType: 'simple_query'
  },
  {
    name: '简单数据查询3',
    query: 'Show me the latest Ethereum block information',
    expectedSteps: 1,
    expectedType: 'simple_query'
  },
  {
    name: '中等任务',
    query: 'Compare Ethereum and Bitcoin performance over the past week and analyze trends',
    expectedSteps: 3,
    expectedType: 'medium_task'
  }
];

async function testComplexityAnalysis() {
  console.log('🧪 测试任务复杂度分析...\n');
  
  for (const testCase of testCases) {
    console.log(`📋 测试: ${testCase.name}`);
    console.log(`📝 查询: ${testCase.query}`);
    
    // 这里我们需要直接调用复杂度分析函数
    // 由于这是内部函数，我们通过执行来观察结果
    console.log(`🎯 预期类型: ${testCase.expectedType} (${testCase.expectedSteps}步)`);
    console.log('---');
  }
}

async function testAgentExecution(agentId, taskId) {
  console.log('🤖 测试Agent执行过程...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/agent/${agentId}/task/${taskId}/execute/stream`,
      {
        responseType: 'stream',
        timeout: 60000
      }
    );

    let stepCount = 0;
    let executionComplete = false;
    let taskComplexity = null;
    const executedTools = [];

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // 记录任务复杂度
            if (data.event === 'execution_start' && data.data.taskComplexity) {
              taskComplexity = data.data.taskComplexity;
              console.log(`🎯 任务复杂度: ${taskComplexity} (最大${data.data.maxSteps}步)`);
            }
            
            // 记录步骤执行
            if (data.event === 'step_executing') {
              stepCount++;
              const toolName = data.data.toolDetails?.toolName || data.data.tool;
              executedTools.push(toolName);
              console.log(`⚡ 步骤${stepCount}: ${toolName}`);
            }
            
            // 检查重复工具使用
            if (data.event === 'step_executing' && stepCount > 1) {
              if (executedTools.filter(tool => tool === executedTools[executedTools.length - 1]).length > 1) {
                console.log(`⚠️  重复使用工具: ${executedTools[executedTools.length - 1]}`);
              }
            }
            
            // 任务完成
            if (data.event === 'task_execution_complete') {
              executionComplete = true;
              console.log(`✅ 任务完成 - 总步数: ${stepCount}`);
              
              // 分析结果
              if (taskComplexity === 'simple_query' && stepCount <= 2) {
                console.log('🎉 简单查询优化成功！');
              } else if (taskComplexity === 'simple_query' && stepCount > 2) {
                console.log('⚠️  简单查询仍然过度规划');
              }
              
              // 检查工具重复
              const uniqueTools = [...new Set(executedTools)];
              if (uniqueTools.length < executedTools.length) {
                console.log('⚠️  检测到工具重复使用');
              } else {
                console.log('✅ 无工具重复使用');
              }
            }
            
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => {
      if (!executionComplete) {
        console.log('⚠️  执行未正常完成');
      }
    });

  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Agent智能引擎过度规划修复测试\n');
  console.log('='.repeat(50));
  
  // 测试复杂度分析
  await testComplexityAnalysis();
  
  console.log('\n📝 如果要测试实际执行，请提供 agentId 和 taskId 参数');
  console.log('例如: node test-agent-overplanning-fix.js <agentId> <taskId>');
  
  // 如果提供了参数，执行实际测试
  if (process.argv[2] && process.argv[3]) {
    const agentId = process.argv[2];
    const taskId = process.argv[3];
    
    console.log(`\n🧪 执行Agent测试 (Agent: ${agentId}, Task: ${taskId})`);
    console.log('='.repeat(50));
    
    await testAgentExecution(agentId, taskId);
  }
}

// 运行测试
runTests().catch(console.error); 