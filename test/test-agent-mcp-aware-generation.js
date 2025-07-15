const axios = require('axios');
const fs = require('fs');

// 测试配置
const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-' + Date.now();

// 模拟的MCP工作流配置（包含不同类型的MCP工具）
const TEST_MCP_WORKFLOWS = {
  github_workflow: {
    mcps: [
      {
        name: 'github-mcp-server',
        description: 'GitHub repository management and analysis tools',
        category: 'Development Tools'
      }
    ],
    workflow: [
      { action: 'get_repository_info', mcpName: 'github-mcp-server' },
      { action: 'list_commits', mcpName: 'github-mcp-server' },
      { action: 'analyze_issues', mcpName: 'github-mcp-server' }
    ]
  },
  crypto_workflow: {
    mcps: [
      {
        name: 'coingecko-server',
        description: 'Cryptocurrency price and market data provider',
        category: 'Market Data'
      }
    ],
    workflow: [
      { action: 'get_coin_price', mcpName: 'coingecko-server' },
      { action: 'get_market_trends', mcpName: 'coingecko-server' }
    ]
  },
  social_workflow: {
    mcps: [
      {
        name: 'x-mcp',
        description: 'Twitter/X social media management tools',
        category: 'Social'
      }
    ],
    workflow: [
      { action: 'create_tweet', mcpName: 'x-mcp' },
      { action: 'get_timeline', mcpName: 'x-mcp' }
    ]
  },
  mixed_workflow: {
    mcps: [
      {
        name: 'github-mcp-server',
        description: 'GitHub repository management and analysis tools',
        category: 'Development Tools'
      },
      {
        name: 'coingecko-server',
        description: 'Cryptocurrency price and market data provider',
        category: 'Market Data'
      }
    ],
    workflow: [
      { action: 'get_repository_info', mcpName: 'github-mcp-server' },
      { action: 'get_coin_price', mcpName: 'coingecko-server' }
    ]
  }
};

/**
 * 测试用例定义
 */
const TEST_CASES = [
  {
    name: 'GitHub Repository Analysis Agent',
    taskTitle: 'Analyze GitHub Repository Structure',
    taskContent: 'Analyze the structure, commits, and issues of a GitHub repository to provide insights',
    mcpWorkflow: TEST_MCP_WORKFLOWS.github_workflow,
    expectedNameKeywords: ['github', 'repository', 'analyzer', 'code'],
    expectedDescriptionKeywords: ['repository', 'commit', 'issue', 'analyze'],
    expectedQuestionKeywords: ['repository', 'commit', 'issue', 'analyze']
  },
  {
    name: 'Cryptocurrency Market Monitor',
    taskTitle: 'Monitor Cryptocurrency Prices',
    taskContent: 'Track and analyze cryptocurrency prices and market trends',
    mcpWorkflow: TEST_MCP_WORKFLOWS.crypto_workflow,
    expectedNameKeywords: ['crypto', 'price', 'market', 'monitor'],
    expectedDescriptionKeywords: ['cryptocurrency', 'price', 'market', 'trends'],
    expectedQuestionKeywords: ['price', 'market', 'crypto', 'bitcoin']
  },
  {
    name: 'Social Media Manager',
    taskTitle: 'Manage Twitter Content',
    taskContent: 'Create tweets and manage social media presence on Twitter/X',
    mcpWorkflow: TEST_MCP_WORKFLOWS.social_workflow,
    expectedNameKeywords: ['social', 'twitter', 'tweet', 'media'],
    expectedDescriptionKeywords: ['tweet', 'social', 'content', 'twitter'],
    expectedQuestionKeywords: ['tweet', 'timeline', 'social', 'content']
  },
  {
    name: 'Multi-Purpose Development Agent',
    taskTitle: 'Code Analysis and Market Research',
    taskContent: 'Analyze code repositories and monitor related cryptocurrency markets',
    mcpWorkflow: TEST_MCP_WORKFLOWS.mixed_workflow,
    expectedNameKeywords: ['multi', 'development', 'analysis', 'market'],
    expectedDescriptionKeywords: ['repository', 'cryptocurrency', 'analysis', 'market'],
    expectedQuestionKeywords: ['repository', 'price', 'analysis', 'market']
  }
];

/**
 * 辅助函数：检查生成的内容是否包含期望的关键词
 */
function checkKeywords(content, keywords, label) {
  const contentLower = content.toLowerCase();
  const foundKeywords = keywords.filter(keyword => 
    contentLower.includes(keyword.toLowerCase())
  );
  
  console.log(`  ${label}:`);
  console.log(`    Generated: "${content}"`);
  console.log(`    Expected keywords: [${keywords.join(', ')}]`);
  console.log(`    Found keywords: [${foundKeywords.join(', ')}]`);
  console.log(`    Relevance: ${foundKeywords.length}/${keywords.length} keywords found`);
  
  return foundKeywords.length > 0;
}

/**
 * 测试Agent名称生成
 */
async function testAgentNameGeneration(testCase) {
  try {
    console.log(`\n📝 Testing Agent Name Generation: ${testCase.name}`);
    
    const response = await axios.post(`${BASE_URL}/api/agent/generate-name`, {
      taskTitle: testCase.taskTitle,
      taskContent: testCase.taskContent,
      mcpWorkflow: testCase.mcpWorkflow
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-token-${TEST_USER_ID}`
      }
    });

    if (response.data.success) {
      const generatedName = response.data.data.name;
      const isRelevant = checkKeywords(
        generatedName, 
        testCase.expectedNameKeywords, 
        'Agent Name'
      );
      
      return {
        success: true,
        name: generatedName,
        relevant: isRelevant
      };
    } else {
      console.log(`❌ Failed to generate name: ${response.data.message}`);
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    console.log(`❌ Error generating name: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试Agent描述生成
 */
async function testAgentDescriptionGeneration(testCase, agentName) {
  try {
    console.log(`\n📄 Testing Agent Description Generation: ${testCase.name}`);
    
    const response = await axios.post(`${BASE_URL}/api/agent/generate-description`, {
      name: agentName || 'Test_Agent',
      taskTitle: testCase.taskTitle,
      taskContent: testCase.taskContent,
      mcpWorkflow: testCase.mcpWorkflow
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-token-${TEST_USER_ID}`
      }
    });

    if (response.data.success) {
      const generatedDescription = response.data.data.description;
      const isRelevant = checkKeywords(
        generatedDescription, 
        testCase.expectedDescriptionKeywords, 
        'Agent Description'
      );
      
      return {
        success: true,
        description: generatedDescription,
        relevant: isRelevant
      };
    } else {
      console.log(`❌ Failed to generate description: ${response.data.message}`);
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    console.log(`❌ Error generating description: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试相关问题生成
 */
async function testRelatedQuestionsGeneration(testCase) {
  try {
    console.log(`\n❓ Testing Related Questions Generation: ${testCase.name}`);
    
    const response = await axios.post(`${BASE_URL}/api/agent/generate-questions`, {
      taskTitle: testCase.taskTitle,
      taskContent: testCase.taskContent,
      mcpWorkflow: testCase.mcpWorkflow
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-token-${TEST_USER_ID}`
      }
    });

    if (response.data.success) {
      const relatedQuestions = response.data.data.relatedQuestions;
      console.log(`  Generated ${relatedQuestions.length} questions:`);
      
      let totalRelevance = 0;
      relatedQuestions.forEach((question, index) => {
        const isRelevant = checkKeywords(
          question, 
          testCase.expectedQuestionKeywords, 
          `Question ${index + 1}`
        );
        if (isRelevant) totalRelevance++;
      });
      
      console.log(`  Overall Relevance: ${totalRelevance}/${relatedQuestions.length} questions are relevant`);
      
      return {
        success: true,
        questions: relatedQuestions,
        relevantCount: totalRelevance
      };
    } else {
      console.log(`❌ Failed to generate questions: ${response.data.message}`);
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    console.log(`❌ Error generating questions: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 运行单个测试用例
 */
async function runTestCase(testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Running Test Case: ${testCase.name}`);
  console.log(`${'='.repeat(80)}`);
  
  const results = {
    testCase: testCase.name,
    timestamp: new Date().toISOString()
  };

  // 测试名称生成
  const nameResult = await testAgentNameGeneration(testCase);
  results.nameGeneration = nameResult;

  // 测试描述生成
  const descriptionResult = await testAgentDescriptionGeneration(
    testCase, 
    nameResult.success ? nameResult.name : null
  );
  results.descriptionGeneration = descriptionResult;

  // 测试相关问题生成
  const questionsResult = await testRelatedQuestionsGeneration(testCase);
  results.questionsGeneration = questionsResult;

  // 计算总体评分
  let totalScore = 0;
  let maxScore = 0;

  if (nameResult.success) {
    totalScore += nameResult.relevant ? 1 : 0;
    maxScore += 1;
  }

  if (descriptionResult.success) {
    totalScore += descriptionResult.relevant ? 1 : 0;
    maxScore += 1;
  }

  if (questionsResult.success) {
    const questionScore = questionsResult.relevantCount / questionsResult.questions.length;
    totalScore += questionScore;
    maxScore += 1;
  }

  results.overallScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  console.log(`\n📊 Test Case Summary:`);
  console.log(`  Name Generation: ${nameResult.success ? '✅' : '❌'} ${nameResult.relevant ? '(Relevant)' : '(Not Relevant)'}`);
  console.log(`  Description Generation: ${descriptionResult.success ? '✅' : '❌'} ${descriptionResult.relevant ? '(Relevant)' : '(Not Relevant)'}`);
  console.log(`  Questions Generation: ${questionsResult.success ? '✅' : '❌'} (${questionsResult.relevantCount || 0}/${questionsResult.questions?.length || 0} relevant)`);
  console.log(`  Overall Score: ${results.overallScore.toFixed(1)}%`);

  return results;
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('🚀 Starting MCP-Aware Agent Generation Tests...');
  console.log('🎯 Testing improved name, description, and question generation based on actual MCP tool capabilities');
  
  const allResults = [];

  for (const testCase of TEST_CASES) {
    try {
      const result = await runTestCase(testCase);
      allResults.push(result);
      
      // 短暂延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`❌ Test case failed: ${testCase.name} - ${error.message}`);
      allResults.push({
        testCase: testCase.name,
        error: error.message,
        overallScore: 0
      });
    }
  }

  // 生成测试报告
  console.log(`\n${'='.repeat(80)}`);
  console.log('📋 FINAL TEST REPORT');
  console.log(`${'='.repeat(80)}`);

  let totalScore = 0;
  let successfulTests = 0;

  allResults.forEach(result => {
    console.log(`\n🧪 ${result.testCase}:`);
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
    } else {
      console.log(`  📊 Score: ${result.overallScore.toFixed(1)}%`);
      totalScore += result.overallScore;
      successfulTests++;
    }
  });

  const averageScore = successfulTests > 0 ? totalScore / successfulTests : 0;
  
  console.log(`\n🎯 SUMMARY:`);
  console.log(`  Tests Run: ${TEST_CASES.length}`);
  console.log(`  Successful: ${successfulTests}`);
  console.log(`  Failed: ${TEST_CASES.length - successfulTests}`);
  console.log(`  Average Score: ${averageScore.toFixed(1)}%`);
  
  if (averageScore >= 80) {
    console.log(`  🎉 EXCELLENT! MCP-aware generation is working very well`);
  } else if (averageScore >= 60) {
    console.log(`  ✅ GOOD! MCP-aware generation is working reasonably well`);
  } else if (averageScore >= 40) {
    console.log(`  ⚠️  FAIR! MCP-aware generation needs improvement`);
  } else {
    console.log(`  ❌ POOR! MCP-aware generation needs significant improvement`);
  }

  // 保存详细结果到文件
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      testsRun: TEST_CASES.length,
      successful: successfulTests,
      failed: TEST_CASES.length - successfulTests,
      averageScore: averageScore
    },
    testResults: allResults
  };

  try {
    fs.writeFileSync(
      'test-output/mcp-aware-generation-report.json', 
      JSON.stringify(reportData, null, 2)
    );
    console.log(`\n📄 Detailed report saved to: test-output/mcp-aware-generation-report.json`);
  } catch (error) {
    console.log(`⚠️  Could not save report: ${error.message}`);
  }
}

// 运行测试
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  runTestCase,
  TEST_CASES
}; 