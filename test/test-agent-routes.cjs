const https = require('https');
const { URL } = require('url');

const BASE_URL = 'https://api.awenetwork.ai';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzE3NTEyODYxOTU1NjJfcXczd29sNnp2Iiwid2FsbGV0QWRkcmVzcyI6IjB4OTUxMTdmZkFlNDIzNDljYjZCNTNkODVGYzE3MzNkNjE2Njg0NTE4RSIsImVtYWlsIjpudWxsLCJpYXQiOjE3NTIzMjAxMDAsImV4cCI6MTc1MjM1NjEwMH0.ddoxBRveC8vPkjmQ-1As1sCIGw9pGuwK5auCwlporCc';
const TASK_ID = 'ff3b0d02-cb32-41ac-89d4-1a8c05a7612d';

async function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Node.js Test Client'
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          };
          
          // 尝试解析JSON
          try {
            response.data = JSON.parse(body);
          } catch (e) {
            response.data = body;
          }
          
          resolve(response);
        } catch (error) {
          reject(error);
        }
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

async function testAgentRoutes() {
  console.log('🧪 Testing Agent Routes');
  console.log('======================\n');

  // Test 1: Check if agent routes exist at all
  console.log('1. 📋 Testing GET /api/agent (agent list)');
  try {
    const response = await makeRequest('GET', '/api/agent');
    console.log(`   Status: ${response.statusCode}`);
    if (response.statusCode === 200) {
      console.log('   ✅ Agent list endpoint is working');
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else if (response.statusCode === 404) {
      console.log('   ❌ Agent routes not found - server may not have latest code');
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.statusCode}`);
      console.log(`   📄 Response: ${response.data}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log();

  // Test 2: Test generate-info endpoint
  console.log('2. 🔧 Testing POST /api/agent/generate-info/:taskId');
  try {
    const response = await makeRequest('POST', `/api/agent/generate-info/${TASK_ID}`, {});
    console.log(`   Status: ${response.statusCode}`);
    if (response.statusCode === 200) {
      console.log('   ✅ Generate info endpoint is working');
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else if (response.statusCode === 404) {
      console.log('   ❌ Generate info endpoint not found');
      console.log(`   📄 Response: ${response.data}`);
    } else if (response.statusCode === 400) {
      console.log('   ⚠️  Task validation error (expected if task doesn\'t exist)');
      console.log(`   📄 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else {
      console.log(`   ⚠️  Status: ${response.statusCode}`);
      console.log(`   📄 Response: ${JSON.stringify(response.data, null, 2)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log();

  // Test 3: Test create endpoint
  console.log('3. 🏗️  Testing POST /api/agent/create/:taskId');
  try {
    const response = await makeRequest('POST', `/api/agent/create/${TASK_ID}`, {
      status: 'private',
      name: 'Test Agent',
      description: 'Test agent description'
    });
    console.log(`   Status: ${response.statusCode}`);
    if (response.statusCode === 200) {
      console.log('   ✅ Create endpoint is working');
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else if (response.statusCode === 404) {
      console.log('   ❌ Create endpoint not found');
      console.log(`   📄 Response: ${response.data}`);
    } else if (response.statusCode === 400) {
      console.log('   ⚠️  Task validation error (expected if task doesn\'t exist)');
      console.log(`   📄 Response: ${JSON.stringify(response.data, null, 2)}`);
    } else {
      console.log(`   ⚠️  Status: ${response.statusCode}`);
      console.log(`   📄 Response: ${JSON.stringify(response.data, null, 2)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log();

  // Test 4: Test authentication by trying an endpoint without auth
  console.log('4. 🔐 Testing authentication (without token)');
  try {
    const response = await makeRequest('GET', '/api/agent');
    // Remove auth header for this test
    const optionsNoAuth = {
      hostname: 'api.awenetwork.ai',
      port: 443,
      path: '/api/agent',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(optionsNoAuth, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`   Status without auth: ${res.statusCode}`);
        if (res.statusCode === 401) {
          console.log('   ✅ Authentication is working (401 without token)');
        } else {
          console.log(`   ⚠️  Unexpected status: ${res.statusCode}`);
          console.log(`   📄 Response: ${body}`);
        }
      });
    });
    req.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log();

  // Test 5: Check server info
  console.log('5. ℹ️  Testing server status');
  try {
    const response = await makeRequest('GET', '/api/task/list');
    console.log(`   Task endpoint status: ${response.statusCode}`);
    if (response.statusCode === 200 || response.statusCode === 404) {
      console.log('   ✅ Server is responding');
    } else {
      console.log(`   ⚠️  Server status: ${response.statusCode}`);
    }
  } catch (error) {
    console.log(`   ❌ Server connection error: ${error.message}`);
  }

  console.log('\n📋 Test Summary:');
  console.log('- If you see 404 errors for agent routes, the server needs to be updated with latest code');
  console.log('- If you see 401 errors, authentication is working');
  console.log('- If you see 400 errors, the routes exist but the task ID might be invalid');
  console.log('- If you see 200 responses, everything is working correctly');
}

// Run the tests
testAgentRoutes().catch(console.error); 