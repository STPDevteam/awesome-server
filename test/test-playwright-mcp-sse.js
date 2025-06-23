// 测试Playwright MCP服务的SSE接口
import { EventSource } from 'eventsource';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// 生成一个会话ID
const sessionId = uuidv4();
const sseUrl = `http://localhost:3030/sse?sessionId=${sessionId}`;

console.log('开始测试Playwright MCP服务的SSE接口...');
console.log(`使用会话ID: ${sessionId}`);

// 连接到SSE端点
const eventSource = new EventSource(sseUrl);

// 处理SSE事件
eventSource.onopen = () => {
  console.log('SSE连接已建立');
  
  // 连接成功后发送初始化请求
  setTimeout(async () => {
    try {
      // 初始化浏览器
      await sendRequest('initialize', {
        capabilities: {
          browser: {
            browserName: 'chromium'
          }
        }
      });
      
      // 导航到网页
      await sendRequest('browser_navigate', {
        url: 'https://www.example.com'
      });
      
      // 获取页面快照
      await sendRequest('browser_snapshot', {});
      
    } catch (error) {
      console.error('请求失败:', error.message);
    }
  }, 1000);
};

eventSource.onmessage = (event) => {
  console.log('收到SSE消息:', event.data);
};

eventSource.onerror = (error) => {
  console.error('SSE错误:', error);
  eventSource.close();
};

// 发送请求到SSE连接的会话
async function sendRequest(method, params) {
  const requestId = Math.floor(Math.random() * 10000);
  
  console.log(`发送请求: ${method} (ID: ${requestId})`);
  
  try {
    const response = await axios.post(`http://localhost:3030/sse?sessionId=${sessionId}`, {
      jsonrpc: '2.0',
      id: requestId,
      method: method,
      params: params
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`请求 ${method} 的响应:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`请求 ${method} 失败:`, error.message);
    if (error.response) {
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// 30秒后关闭连接
setTimeout(() => {
  console.log('测试完成，关闭SSE连接');
  eventSource.close();
  process.exit(0);
}, 30000); 