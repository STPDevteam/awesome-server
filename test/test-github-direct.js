import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

config();

const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'test-user-github-mcp';

// 生成访问令牌
function generateTestToken() {
  const payload = {
    userId: TEST_USER_ID,
    walletAddress: '0x1234567890123456789012345678901234567890'
  };
  
  const secret = process.env.JWT_ACCESS_SECRET || 'default-secret';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// 创建测试用户
async function createTestUser() {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/create-test-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        username: 'GitHub MCP Test User'
      })
    });
    
    const result = await response.json();
    console.log('✅ 测试用户创建/确认成功');
    return result;
  } catch (error) {
    console.log('⚠️  用户创建失败，继续测试...');
    return null;
  }
}

// 直接连接GitHub MCP
async function connectGitHubMCP(token) {
  try {
    console.log('\n🔗 步骤1: 直接连接GitHub MCP');
    
    // 使用正确的Docker命令格式
    const response = await fetch(`${BASE_URL}/api/mcp/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'github-mcp',
        command: 'docker',
        args: [
          'run',
          '-i',
          '--rm',
          '-e',
          'GITHUB_PERSONAL_ACCESS_TOKEN',
          '-e',
          'GITHUB_TOOLSETS',
          '-e',
          'GITHUB_READ_ONLY',
          'ghcr.io/github/github-mcp-server'
        ],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
          GITHUB_TOOLSETS: 'repos,issues,pull_requests',
          GITHUB_READ_ONLY: '0'
        }
      })
    });
    
    const result = await response.json();
    console.log('连接响应:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ GitHub MCP连接成功');
      return true;
    } else {
      console.log('❌ GitHub MCP连接失败:', result.error || result.message);
      return false;
    }
  } catch (error) {
    console.log('❌ 连接过程异常:', error.message);
    return false;
  }
}

// 获取GitHub MCP工具列表
async function getGitHubTools(token) {
  try {
    console.log('\n📋 步骤2: 获取GitHub MCP工具列表');
    
    const response = await fetch(`${BASE_URL}/api/mcp/github-mcp/tools`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    console.log('工具列表响应:', JSON.stringify(result, null, 2));
    
    if (result.tools) {
      console.log(`✅ 获取到 ${result.tools.length} 个GitHub工具`);
      result.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
      });
      return result.tools;
    } else {
      console.log('❌ 获取工具列表失败');
      return [];
    }
  } catch (error) {
    console.log('❌ 获取工具列表异常:', error.message);
    return [];
  }
}

// 调用GitHub工具
async function callGitHubTool(token, toolName, args = {}) {
  try {
    console.log(`\n🔧 调用GitHub工具: ${toolName}`);
    console.log('参数:', JSON.stringify(args, null, 2));
    
    const response = await fetch(`${BASE_URL}/api/mcp/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        mcpName: 'github-mcp',
        toolName: toolName,
        arguments: args
      })
    });
    
    const result = await response.json();
    console.log('工具调用响应:', JSON.stringify(result, null, 2));
    
    if (result.result) {
      console.log('✅ 工具调用成功');
      return result.result;
    } else {
      console.log('❌ 工具调用失败:', result.error);
      return null;
    }
  } catch (error) {
    console.log('❌ 工具调用异常:', error.message);
    return null;
  }
}

// 主测试函数
async function testGitHubMCPDirect() {
  console.log('🚀 GitHub MCP 直接测试开始');
  console.log('=====================================');
  
  // 检查GitHub token
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.log('❌ 未设置 GITHUB_PERSONAL_ACCESS_TOKEN 环境变量');
    console.log('请设置: export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here');
    return;
  }
  
  console.log('✅ 找到GitHub Personal Access Token');
  
  // 创建用户和生成token
  await createTestUser();
  const accessToken = generateTestToken();
  console.log('✅ 访问令牌生成成功');
  
  // 直接连接GitHub MCP
  const connected = await connectGitHubMCP(accessToken);
  if (!connected) {
    console.log('❌ GitHub MCP连接失败，测试终止');
    return;
  }
  
  // 获取工具列表
  const tools = await getGitHubTools(accessToken);
  if (tools.length === 0) {
    console.log('❌ 无可用工具，测试终止');
    return;
  }
  
  // 测试获取用户信息
  console.log('\n🧪 测试1: 搜索GitHub仓库');
  await callGitHubTool(accessToken, 'search_repositories', {
    query: 'mcp-server language:typescript',
    perPage: 3
  });
  
  // 测试列出仓库
  console.log('\n🧪 测试2: 获取文件内容');
  await callGitHubTool(accessToken, 'get_file_contents', {
    owner: 'github',
    repo: 'github-mcp-server',
    path: 'README.md'
  });
  
  console.log('\n🎉 GitHub MCP 直接测试完成！');
}

// 运行测试
testGitHubMCPDirect().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
}); 