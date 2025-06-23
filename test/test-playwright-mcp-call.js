// 测试实际调用Playwright MCP工具
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// 检查Playwright MCP是否在运行
const checkPlaywrightMCP = async () => {
  try {
    const { stdout } = await execPromise('ps aux | grep "mcp-server-playwright" | grep -v grep');
    const lines = stdout.trim().split('\n');
    
    if (lines.length > 0) {
      console.log('✅ Playwright MCP正在运行:');
      console.log(stdout);
      return true;
    } else {
      console.log('❌ Playwright MCP未运行');
      return false;
    }
  } catch (error) {
    console.log('❌ Playwright MCP未运行');
    return false;
  }
};

const callPlaywrightMCP = async () => {
  try {
    console.log('0. 检查Playwright MCP是否在运行...');
    const isRunning = await checkPlaywrightMCP();
    
    console.log('\n1. 测试Playwright MCP连接...');
    
    // 先测试连接
    const connectResponse = await fetch('http://localhost:3001/api/task/test-playwright-mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const connectData = await connectResponse.json();
    console.log('连接测试结果:', JSON.stringify(connectData, null, 2));
    
    if (!connectData.success) {
      throw new Error('Playwright MCP连接测试失败');
    }
    
    console.log('\n2. 现在测试直接启动Playwright...');
    
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
    
    console.log('\n3. 测试完成');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
};

callPlaywrightMCP(); 