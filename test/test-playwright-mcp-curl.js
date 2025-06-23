// 测试Playwright MCP连接
import { request } from 'http';

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/task/test-playwright-mcp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('响应数据:');
    try {
      const parsedData = JSON.parse(data);
      console.log(JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.log('无法解析响应为JSON:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('请求错误:', error);
});

// 写入请求体
req.write(JSON.stringify({}));
req.end();

console.log('请求已发送，等待响应...'); 