const https = require('https');

const BASE_URL = 'https://api.awenetwork.ai';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzE3NTEyODYxOTU1NjJfcXczd29sNnp2Iiwid2FsbGV0QWRkcmVzcyI6IjB4OTUxMTdmZkFlNDIzNDljYjZCNTNkODVGYzE3MzNkNjE2Njg0NTE4RSIsImVtYWlsIjpudWxsLCJpYXQiOjE3NTIzMjAxMDAsImV4cCI6MTc1MjM1NjEwMH0.ddoxBRveC8vPkjmQ-1As1sCIGw9pGuwK5auCwlporCc';
const TASK_ID = 'ff3b0d02-cb32-41ac-89d4-1a8c05a7612d';

async function testRoute(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Agent Route Test Client',
      ...headers
    };

    const options = {
      hostname: 'api.awenetwork.ai',
      port: 443,
      path: path,
      method: method,
      headers: defaultHeaders
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

function interpretStatus(statusCode, body) {
  if (statusCode === 404) {
    if (body.includes('Cannot')) {
      return '❌ Route not found (not registered)';
    }
    return '❌ 404 - Resource not found';
  } else if (statusCode === 401) {
    return '🔒 401 - Authentication required (route exists)';
  } else if (statusCode === 400) {
    return '⚠️  400 - Bad request (route exists, validation failed)';
  } else if (statusCode === 403) {
    return '🚫 403 - Forbidden (route exists, access denied)';
  } else if (statusCode === 500) {
    return '💥 500 - Internal server error (route exists, server error)';
  } else if (statusCode === 200) {
    return '✅ 200 - Success';
  } else {
    return `❓ ${statusCode} - Unexpected status`;
  }
}

async function testAllAgentRoutes() {
  console.log('🧪 Comprehensive Agent Routes Test');
  console.log('==================================\n');

  // 从你的代码中提取的所有agent路由
  const testCases = [
    // 基础CRUD路由
    { method: 'POST', path: '/api/agent', name: 'Create Agent', data: { name: 'test', description: 'test', status: 'private' } },
    { method: 'GET', path: '/api/agent', name: 'Get Agent List' },
    { method: 'GET', path: '/api/agent?queryType=public', name: 'Get Public Agents' },
    { method: 'GET', path: '/api/agent?queryType=my-private', name: 'Get My Private Agents' },
    
    // 任务相关路由
    { method: 'POST', path: `/api/agent/generate-info/${TASK_ID}`, name: 'Generate Agent Info', data: {} },
    { method: 'GET', path: `/api/agent/preview/${TASK_ID}`, name: 'Preview Agent from Task' },
    { method: 'POST', path: `/api/agent/create/${TASK_ID}`, name: 'Create Agent from Task', data: { status: 'private' } },
    
    // Agent详情和管理
    { method: 'GET', path: '/api/agent/test-agent-id', name: 'Get Agent Details' },
    { method: 'PUT', path: '/api/agent/test-agent-id', name: 'Update Agent', data: { name: 'updated' } },
    { method: 'DELETE', path: '/api/agent/test-agent-id', name: 'Delete Agent' },
    
    // 生成功能
    { method: 'POST', path: '/api/agent/generate-name', name: 'Generate Agent Name', data: { taskTitle: 'test', taskContent: 'test' } },
    { method: 'POST', path: '/api/agent/generate-description', name: 'Generate Agent Description', data: { name: 'test', taskTitle: 'test', taskContent: 'test' } },
    { method: 'POST', path: '/api/agent/generate-questions', name: 'Generate Agent Questions', data: { taskTitle: 'test', taskContent: 'test' } },
    
    // 状态管理
    { method: 'POST', path: '/api/agent/test-agent-id/publish', name: 'Publish Agent', data: {} },
    { method: 'POST', path: '/api/agent/test-agent-id/private', name: 'Make Agent Private', data: {} },
    
    // 统计和分类
    { method: 'GET', path: '/api/agent/stats', name: 'Get Agent Statistics' },
    { method: 'GET', path: '/api/agent/categories', name: 'Get Agent Categories' },
    { method: 'GET', path: '/api/agent/category/test-category', name: 'Get Agents by Category' },
    
    // 使用记录
    { method: 'POST', path: '/api/agent/test-agent-id/usage', name: 'Record Agent Usage', data: {} },
    
    // 任务关联
    { method: 'GET', path: `/api/agent/task/${TASK_ID}`, name: 'Get Agent by Task ID' },
    
    // 试用功能
    { method: 'POST', path: '/api/agent/test-agent-id/try', name: 'Try Agent', data: { content: 'test' } },
    
    // 收藏功能
    { method: 'POST', path: '/api/agent/test-agent-id/favorite', name: 'Favorite Agent', data: {} },
    { method: 'DELETE', path: '/api/agent/test-agent-id/favorite', name: 'Unfavorite Agent' },
    { method: 'GET', path: '/api/agent/test-agent-id/favorite/status', name: 'Check Favorite Status' },
    
    // MCP认证
    { method: 'POST', path: '/api/agent/mcp/verify-auth', name: 'Verify MCP Auth', data: { mcpName: 'test', authData: { key: 'value' } } },
    { method: 'GET', path: '/api/agent/mcp/auth-status?mcpNames=test', name: 'Get MCP Auth Status' },
  ];

  console.log(`Testing ${testCases.length} agent routes...\n`);

  let foundRoutes = 0;
  let notFoundRoutes = 0;

  for (const testCase of testCases) {
    console.log(`${testCase.method} ${testCase.path}`);
    console.log(`  Testing: ${testCase.name}`);
    
    try {
      const response = await testRoute(testCase.method, testCase.path, testCase.data);
      const interpretation = interpretStatus(response.statusCode, response.body);
      console.log(`  ${interpretation}`);
      
      if (response.statusCode === 404 && response.body.includes('Cannot')) {
        notFoundRoutes++;
        // 显示具体的错误信息
        const match = response.body.match(/Cannot (\w+) ([^<]+)/);
        if (match) {
          console.log(`    Server says: ${match[0]}`);
        }
      } else {
        foundRoutes++;
        // 如果不是404，显示一些响应信息
        if (response.statusCode !== 404) {
          try {
            const jsonResponse = JSON.parse(response.body);
            if (jsonResponse.success !== undefined) {
              console.log(`    Success: ${jsonResponse.success}`);
            }
            if (jsonResponse.error) {
              console.log(`    Error: ${jsonResponse.error}`);
            }
          } catch (e) {
            // 不是JSON响应，跳过
          }
        }
      }
      
    } catch (error) {
      console.log(`  ❌ Request Error: ${error.message}`);
    }
    
    console.log(); // 空行分隔
  }

  console.log('📊 Summary:');
  console.log(`  Routes found (not 404): ${foundRoutes}`);
  console.log(`  Routes not found (404): ${notFoundRoutes}`);
  console.log(`  Total tested: ${testCases.length}`);
  
  if (notFoundRoutes === testCases.length) {
    console.log('\n🚨 CRITICAL: All agent routes return 404!');
    console.log('   This means the agent routes are not registered on the server.');
    console.log('   Possible causes:');
    console.log('   1. Server is not running the latest code');
    console.log('   2. Agent routes import/registration failed');
    console.log('   3. Server needs to be restarted');
    console.log('   4. Build process failed');
  } else if (notFoundRoutes > 0) {
    console.log('\n⚠️  Some agent routes are missing');
    console.log('   Check server logs for import/registration errors');
  } else {
    console.log('\n✅ All agent routes are registered and responding');
  }

  // 测试一个已知工作的路由作为对比
  console.log('\n🔍 Testing known working route for comparison:');
  try {
    const response = await testRoute('GET', '/api/auth/me');
    const interpretation = interpretStatus(response.statusCode, response.body);
    console.log(`GET /api/auth/me: ${interpretation}`);
  } catch (error) {
    console.log(`GET /api/auth/me: ❌ ${error.message}`);
  }
}

// 运行测试
testAllAgentRoutes().catch(console.error); 