const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-github-mcp';

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`
};

// 日志函数
const log = {
  info: (msg) => console.log(colors.blue(`ℹ️  ${msg}`)),
  success: (msg) => console.log(colors.green(`✅ ${msg}`)),
  error: (msg) => console.log(colors.red(`❌ ${msg}`)),
  warning: (msg) => console.log(colors.yellow(`⚠️  ${msg}`)),
  step: (msg) => console.log(colors.cyan(`🔄 ${msg}`)),
  result: (msg) => console.log(colors.magenta(`📊 ${msg}`))
};

// 创建测试用户
async function createTestUser() {
  try {
    log.step('创建测试用户...');
    const response = await axios.post(`${BASE_URL}/api/auth/create-user`, {
      userId: TEST_USER_ID,
      email: `${TEST_USER_ID}@test.com`,
      name: 'GitHub MCP Test User'
    });
    
    if (response.data.success) {
      log.success(`测试用户创建成功: ${TEST_USER_ID}`);
      return response.data.user;
    } else {
      log.warning('用户可能已存在，继续测试...');
      return { userId: TEST_USER_ID };
    }
  } catch (error) {
    if (error.response?.status === 409) {
      log.warning('用户已存在，继续测试...');
      return { userId: TEST_USER_ID };
    }
    log.error(`创建用户失败: ${error.message}`);
    throw error;
  }
}

// 获取所有MCP列表
async function getAllMCPs() {
  try {
    log.step('获取所有MCP列表...');
    const response = await axios.get(`${BASE_URL}/api/mcp/list`);
    
    if (response.data.success) {
      const mcps = response.data.mcps;
      const githubMcp = mcps.find(mcp => mcp.name === 'github-mcp');
      
      log.success(`获取到 ${mcps.length} 个MCP服务`);
      
      if (githubMcp) {
        log.success('找到GitHub MCP配置:');
        console.log(JSON.stringify(githubMcp, null, 2));
        return githubMcp;
      } else {
        log.error('未找到GitHub MCP配置');
        log.info('可用的MCP列表:');
        mcps.forEach(mcp => {
          console.log(`  - ${mcp.name}: ${mcp.description}`);
        });
        return null;
      }
    } else {
      log.error('获取MCP列表失败');
      return null;
    }
  } catch (error) {
    log.error(`获取MCP列表失败: ${error.message}`);
    throw error;
  }
}

// 检查Docker环境
async function checkDockerEnvironment() {
  try {
    log.step('检查Docker环境...');
    const { exec } = require('child_process');
    
    return new Promise((resolve, reject) => {
      exec('docker --version', (error, stdout, stderr) => {
        if (error) {
          log.error('Docker未安装或不可用');
          log.info('请安装Docker: https://docs.docker.com/get-docker/');
          resolve(false);
        } else {
          log.success(`Docker版本: ${stdout.trim()}`);
          
          // 检查Docker是否运行
          exec('docker ps', (error2, stdout2, stderr2) => {
            if (error2) {
              log.error('Docker未运行，请启动Docker');
              resolve(false);
            } else {
              log.success('Docker运行正常');
              resolve(true);
            }
          });
        }
      });
    });
  } catch (error) {
    log.error(`检查Docker环境失败: ${error.message}`);
    return false;
  }
}

// 设置GitHub认证
async function setupGitHubAuth() {
  try {
    log.step('设置GitHub认证信息...');
    
    // 检查环境变量中的GitHub Token
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (!githubToken) {
      log.error('未找到GitHub Personal Access Token');
      log.info('请设置环境变量: GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here');
      log.info('获取Token: https://github.com/settings/tokens');
      return false;
    }
    
    log.success('找到GitHub Personal Access Token');
    
    // 验证Token有效性
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      log.success(`Token验证成功，用户: ${response.data.login}`);
      return true;
    } catch (tokenError) {
      log.error(`Token验证失败: ${tokenError.response?.status} ${tokenError.response?.statusText}`);
      log.info('请检查Token是否有效，是否包含必要权限');
      return false;
    }
  } catch (error) {
    log.error(`设置GitHub认证失败: ${error.message}`);
    return false;
  }
}

// 连接GitHub MCP
async function connectGitHubMCP() {
  try {
    log.step('连接GitHub MCP...');
    
    const response = await axios.post(`${BASE_URL}/api/mcp/connect`, {
      name: 'github-mcp',
      userId: TEST_USER_ID
    });
    
    if (response.data.success) {
      log.success('GitHub MCP连接成功');
      return true;
    } else {
      log.error(`GitHub MCP连接失败: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log.error(`连接GitHub MCP失败: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// 获取GitHub MCP工具列表
async function getGitHubMCPTools() {
  try {
    log.step('获取GitHub MCP工具列表...');
    
    const response = await axios.get(`${BASE_URL}/api/mcp/github-mcp/tools`, {
      params: { userId: TEST_USER_ID }
    });
    
    if (response.data.success) {
      const tools = response.data.tools;
      log.success(`获取到 ${tools.length} 个GitHub工具:`);
      
      // 按类别分组显示工具
      const toolsByCategory = {};
      tools.forEach(tool => {
        const category = tool.description?.includes('repository') ? 'Repository' :
                        tool.description?.includes('issue') ? 'Issues' :
                        tool.description?.includes('pull') ? 'Pull Requests' :
                        tool.description?.includes('user') ? 'Users' :
                        tool.description?.includes('organization') ? 'Organizations' :
                        'Other';
        
        if (!toolsByCategory[category]) {
          toolsByCategory[category] = [];
        }
        toolsByCategory[category].push(tool);
      });
      
      Object.entries(toolsByCategory).forEach(([category, categoryTools]) => {
        console.log(colors.yellow(`\n📂 ${category}:`));
        categoryTools.forEach(tool => {
          console.log(`  🔧 ${tool.name}: ${tool.description || 'No description'}`);
        });
      });
      
      return tools;
    } else {
      log.error(`获取工具列表失败: ${response.data.message}`);
      return [];
    }
  } catch (error) {
    log.error(`获取GitHub MCP工具列表失败: ${error.response?.data?.message || error.message}`);
    return [];
  }
}

// 测试GitHub MCP工具调用
async function testGitHubMCPTools(tools) {
  try {
    log.step('测试GitHub MCP工具调用...');
    
    // 测试用例列表
    const testCases = [
      {
        name: '获取当前用户信息',
        tool: tools.find(t => t.name.includes('get_user') || t.name.includes('user_info')),
        input: {}
      },
      {
        name: '列出用户仓库',
        tool: tools.find(t => t.name.includes('list_repositories') || t.name.includes('repos')),
        input: { affiliation: 'owner', per_page: 5 }
      },
      {
        name: '搜索仓库',
        tool: tools.find(t => t.name.includes('search') && t.name.includes('repo')),
        input: { q: 'language:javascript stars:>1000', per_page: 3 }
      }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
      if (!testCase.tool) {
        log.warning(`跳过测试 "${testCase.name}": 未找到对应工具`);
        continue;
      }
      
      try {
        log.step(`测试: ${testCase.name} (工具: ${testCase.tool.name})`);
        
        const response = await axios.post(`${BASE_URL}/api/mcp/github-mcp/call`, {
          tool: testCase.tool.name,
          input: testCase.input,
          userId: TEST_USER_ID
        });
        
        if (response.data.success) {
          log.success(`✅ ${testCase.name} 测试成功`);
          
          // 解析并显示结果
          const result = response.data.result;
          if (result.content && Array.isArray(result.content)) {
            const content = result.content[0];
            if (content.text) {
              try {
                const parsedData = JSON.parse(content.text);
                log.result(`结果摘要: ${JSON.stringify(parsedData).substring(0, 200)}...`);
              } catch {
                log.result(`结果: ${content.text.substring(0, 200)}...`);
              }
            }
          }
          
          results.push({
            test: testCase.name,
            tool: testCase.tool.name,
            success: true,
            result: response.data.result
          });
        } else {
          log.error(`❌ ${testCase.name} 测试失败: ${response.data.message}`);
          results.push({
            test: testCase.name,
            tool: testCase.tool.name,
            success: false,
            error: response.data.message
          });
        }
      } catch (error) {
        log.error(`❌ ${testCase.name} 测试异常: ${error.response?.data?.message || error.message}`);
        results.push({
          test: testCase.name,
          tool: testCase.tool.name,
          success: false,
          error: error.message
        });
      }
      
      // 等待一秒避免API限制
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  } catch (error) {
    log.error(`测试GitHub MCP工具失败: ${error.message}`);
    return [];
  }
}

// 创建和执行GitHub任务
async function createAndExecuteGitHubTask() {
  try {
    log.step('创建GitHub相关任务...');
    
    // 创建会话
    const conversationResponse = await axios.post(`${BASE_URL}/api/conversation/create`, {
      userId: TEST_USER_ID,
      title: 'GitHub MCP测试会话'
    });
    
    if (!conversationResponse.data.success) {
      throw new Error('创建会话失败');
    }
    
    const conversationId = conversationResponse.data.conversation.id;
    log.success(`创建会话成功: ${conversationId}`);
    
    // 发送消息并创建任务
    const messageResponse = await axios.post(`${BASE_URL}/api/conversation/${conversationId}/message`, {
      content: '帮我查看我的GitHub仓库列表，并获取我的用户信息',
      userId: TEST_USER_ID
    });
    
    if (!messageResponse.data.success) {
      throw new Error('发送消息失败');
    }
    
    const taskId = messageResponse.data.taskId;
    if (!taskId) {
      log.warning('消息未触发任务创建');
      return null;
    }
    
    log.success(`任务创建成功: ${taskId}`);
    
    // 分析任务
    log.step('分析任务...');
    const analysisResponse = await axios.post(`${BASE_URL}/api/task/${taskId}/analyze/stream`);
    
    // 注意：这里应该处理流式响应，但为了简化测试，我们等待一段时间
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 检查任务状态
    const taskResponse = await axios.get(`${BASE_URL}/api/task/${taskId}`);
    if (taskResponse.data.success) {
      const task = taskResponse.data.task;
      log.success(`任务分析完成，状态: ${task.status}`);
      
      if (task.status === 'completed' && task.mcpWorkflow) {
        // 执行任务
        log.step('执行任务...');
        const executionResponse = await axios.post(`${BASE_URL}/api/task/${taskId}/execute/stream`);
        
        // 等待执行完成
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // 检查执行结果
        const finalTaskResponse = await axios.get(`${BASE_URL}/api/task/${taskId}`);
        if (finalTaskResponse.data.success) {
          const finalTask = finalTaskResponse.data.task;
          log.success(`任务执行完成，最终状态: ${finalTask.status}`);
          return finalTask;
        }
      }
    }
    
    return null;
  } catch (error) {
    log.error(`创建和执行GitHub任务失败: ${error.message}`);
    return null;
  }
}

// 生成测试报告
function generateTestReport(results) {
  const reportPath = path.join(__dirname, '../test-output/github-mcp-test-report.json');
  const reportData = {
    timestamp: new Date().toISOString(),
    userId: TEST_USER_ID,
    summary: {
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length
    },
    results: results
  };
  
  // 确保输出目录存在
  const outputDir = path.dirname(reportPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  log.success(`测试报告已保存到: ${reportPath}`);
}

// 主测试函数
async function runGitHubMCPTest() {
  console.log(colors.cyan('🚀 GitHub MCP 综合测试开始\n'));
  
  try {
    // 1. 检查Docker环境
    const dockerOk = await checkDockerEnvironment();
    if (!dockerOk) {
      log.error('Docker环境检查失败，无法继续测试');
      return;
    }
    
    // 2. 检查GitHub认证
    const authOk = await setupGitHubAuth();
    if (!authOk) {
      log.error('GitHub认证设置失败，无法继续测试');
      return;
    }
    
    // 3. 创建测试用户
    await createTestUser();
    
    // 4. 获取MCP列表
    const githubMcp = await getAllMCPs();
    if (!githubMcp) {
      log.error('未找到GitHub MCP配置，无法继续测试');
      return;
    }
    
    // 5. 连接GitHub MCP
    const connected = await connectGitHubMCP();
    if (!connected) {
      log.error('GitHub MCP连接失败，无法继续测试');
      return;
    }
    
    // 6. 获取工具列表
    const tools = await getGitHubMCPTools();
    if (tools.length === 0) {
      log.error('未获取到GitHub MCP工具，无法继续测试');
      return;
    }
    
    // 7. 测试工具调用
    const testResults = await testGitHubMCPTools(tools);
    
    // 8. 创建和执行任务
    const taskResult = await createAndExecuteGitHubTask();
    
    // 9. 生成测试报告
    generateTestReport(testResults);
    
    // 10. 显示总结
    console.log(colors.cyan('\n📊 测试总结:'));
    const successCount = testResults.filter(r => r.success).length;
    const totalCount = testResults.length;
    
    if (successCount === totalCount) {
      log.success(`所有测试通过 (${successCount}/${totalCount})`);
    } else {
      log.warning(`部分测试失败 (${successCount}/${totalCount})`);
    }
    
    if (taskResult) {
      log.success('任务创建和执行测试成功');
    } else {
      log.warning('任务创建和执行测试未完成');
    }
    
  } catch (error) {
    log.error(`测试过程中发生错误: ${error.message}`);
    console.error(error);
  }
  
  console.log(colors.cyan('\n🏁 GitHub MCP 测试完成'));
}

// 如果直接运行此脚本
if (require.main === module) {
  runGitHubMCPTest().catch(console.error);
}

module.exports = {
  runGitHubMCPTest,
  createTestUser,
  getAllMCPs,
  checkDockerEnvironment,
  setupGitHubAuth,
  connectGitHubMCP,
  getGitHubMCPTools,
  testGitHubMCPTools
}; 