// 测试Playwright MCP工具调用
import fetch from 'node-fetch';

const testPlaywrightMCPTool = async () => {
  try {
    console.log('1. 首先测试Playwright MCP连接...');
    
    // 先测试连接
    const connectResponse = await fetch('http://localhost:3001/api/task/test-playwright-mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const connectData = await connectResponse.json();
    console.log('连接测试结果:', JSON.stringify(connectData.success, null, 2));
    
    if (!connectData.success) {
      throw new Error('Playwright MCP连接测试失败');
    }
    
    console.log('\n2. 现在测试直接启动Playwright并打开百度...');
    
    // 测试直接启动
    const directResponse = await fetch('http://localhost:3001/api/task/test-playwright-direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: 'https://www.baidu.com' })
    });
    
    const directData = await directResponse.json();
    console.log('直接测试结果:', JSON.stringify(directData, null, 2));
    
    console.log('\n3. 测试完成！');
  } catch (error) {
    console.error('测试失败:', error);
  }
};

testPlaywrightMCPTool();
