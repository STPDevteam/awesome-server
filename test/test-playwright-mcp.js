// 测试Playwright MCP服务
import axios from 'axios';

async function testPlaywrightMCP() {
  try {
    console.log('开始测试Playwright MCP服务...');
    
    // 1. 导航到一个网页
    const navigateResponse = await axios.post('http://localhost:3030/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'browser_navigate',
      params: {
        url: 'https://www.example.com'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    });
    
    console.log('导航响应:', JSON.stringify(navigateResponse.data, null, 2));
    
    // 2. 获取页面快照
    const snapshotResponse = await axios.post('http://localhost:3030/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'browser_snapshot',
      params: {}
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    });
    
    console.log('快照响应:', JSON.stringify(snapshotResponse.data, null, 2));
    
    console.log('测试完成!');
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPlaywrightMCP(); 