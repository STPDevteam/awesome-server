const https = require('https');

const BASE_URL = 'https://api.awenetwork.ai';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzE3NTEyODYxOTU1NjJfcXczd29sNnp2Iiwid2FsbGV0QWRkcmVzcyI6IjB4OTUxMTdmZkFlNDIzNDljYjZCNTNkODVGYzE3MzNkNjE2Njg0NTE4RSIsImVtYWlsIjpudWxsLCJpYXQiOjE3NTIzMjAxMDAsImV4cCI6MTc1MjM1NjEwMH0.ddoxBRveC8vPkjmQ-1As1sCIGw9pGuwK5auCwlporCc';

async function testRoute(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.awenetwork.ai',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Route Test Client'
      }
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

async function testServerRoutes() {
  console.log('🔍 Testing Server Routes');
  console.log('========================\n');

  const testCases = [
    // 基础路由测试
    { method: 'GET', path: '/api/task/list', name: 'Task List (Known Working)' },
    { method: 'GET', path: '/api/auth/me', name: 'Auth Me (Known Working)' },
    
    // Agent路由测试
    { method: 'GET', path: '/api/agent', name: 'Agent List' },
    { method: 'POST', path: '/api/agent/generate-info/test-id', name: 'Generate Info', data: {} },
    { method: 'POST', path: '/api/agent/create/test-id', name: 'Create Agent', data: { status: 'private' } },
    { method: 'GET', path: '/api/agent/stats', name: 'Agent Stats' },
    { method: 'GET', path: '/api/agent/categories', name: 'Agent Categories' },
    { method: 'POST', path: '/api/agent/generate-name', name: 'Generate Name', data: { taskTitle: 'test', taskContent: 'test' } },
    
    // 特殊路由测试
    { method: 'GET', path: '/api/agent/preview/test-id', name: 'Preview Agent' },
    { method: 'GET', path: '/api/agent/task/test-id', name: 'Agent by Task' },
    { method: 'POST', path: '/api/agent/mcp/verify-auth', name: 'MCP Verify Auth', data: { mcpName: 'test', authData: {} } },
    { method: 'GET', path: '/api/agent/mcp/auth-status?mcpNames=test', name: 'MCP Auth Status' },
    
    // 通配符路由测试
    { method: 'GET', path: '/api/agent/some-random-id', name: 'Agent Details (/:id)' },
    { method: 'PUT', path: '/api/agent/some-random-id', name: 'Update Agent (/:id)', data: { name: 'test' } },
    { method: 'DELETE', path: '/api/agent/some-random-id', name: 'Delete Agent (/:id)' },
  ];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`  ${testCase.method} ${testCase.path}`);
    
    try {
      const response = await testRoute(testCase.method, testCase.path, testCase.data);
      
      if (response.statusCode === 404) {
        console.log(`  ❌ 404 - Route not found`);
      } else if (response.statusCode === 401) {
        console.log(`  🔒 401 - Authentication required (route exists)`);
      } else if (response.statusCode === 400) {
        console.log(`  ⚠️  400 - Bad request (route exists, validation failed)`);
      } else if (response.statusCode === 403) {
        console.log(`  🚫 403 - Forbidden (route exists, access denied)`);
      } else if (response.statusCode === 500) {
        console.log(`  💥 500 - Internal server error (route exists, server error)`);
      } else if (response.statusCode === 200) {
        console.log(`  ✅ 200 - Success`);
      } else {
        console.log(`  ❓ ${response.statusCode} - Unexpected status`);
      }
      
      // 如果是404，显示错误页面内容
      if (response.statusCode === 404 && response.body.includes('Cannot')) {
        const match = response.body.match(/Cannot (\w+) ([^<]+)/);
        if (match) {
          console.log(`    Error: ${match[0]}`);
        }
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log();
  }

  console.log('📋 Analysis:');
  console.log('- 404 with "Cannot GET/POST" = Route not registered');
  console.log('- 401 = Route exists but needs authentication');
  console.log('- 400 = Route exists but validation failed');
  console.log('- 403 = Route exists but access denied');
  console.log('- 500 = Route exists but server error');
  console.log('- 200 = Route working correctly');
}

// Run the test
testServerRoutes().catch(console.error); 