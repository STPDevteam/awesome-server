const express = require('express');
const app = express();

// 模拟基本的中间件和服务
app.use(express.json());

// 模拟 TaskExecutorService
const mockTaskExecutorService = {
  // 添加必要的方法
};

app.set('taskExecutorService', mockTaskExecutorService);

// 尝试导入 Agent 路由
try {
  console.log('🔍 Attempting to import Agent routes...');
  const agentRoutes = require('./dist/routes/agent.js');
  console.log('✅ Agent routes imported successfully');
  
  // 注册路由
  app.use('/api/agent', agentRoutes.default);
  console.log('✅ Agent routes registered successfully');
  
  // 启动测试服务器
  const server = app.listen(3002, () => {
    console.log('🚀 Test server running on port 3002');
    
    // 测试路由
    const http = require('http');
    
    const testRoute = (path, method = 'GET') => {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 3002,
          path: path,
          method: method
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        if (method === 'POST') {
          req.write('{}');
        }
        req.end();
      });
    };
    
    // 测试几个路由
    Promise.all([
      testRoute('/api/agent/categories'),
      testRoute('/api/agent/stats'),
      testRoute('/api/agent/generate-info/test-id', 'POST')
    ]).then(results => {
      console.log('\n📊 Route Test Results:');
      results.forEach((result, index) => {
        const routes = ['/api/agent/categories', '/api/agent/stats', '/api/agent/generate-info/test-id'];
        console.log(`${routes[index]}: ${result.statusCode} ${result.statusCode === 404 ? '❌ NOT FOUND' : '✅ FOUND'}`);
      });
      
      server.close();
      process.exit(0);
    }).catch(err => {
      console.error('❌ Test failed:', err);
      server.close();
      process.exit(1);
    });
  });
  
} catch (error) {
  console.error('❌ Failed to import Agent routes:', error);
  console.error('Error details:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
} 