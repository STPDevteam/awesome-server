// 简单的Playwright MCP测试脚本
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testPlaywrightMCP() {
  console.log('开始测试Playwright MCP...');
  
  try {
    // 创建传输层
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: process.env
    });

    // 创建客户端
    const client = new Client(
      {
        name: 'playwright-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      }
    );

    // 连接
    console.log('连接到Playwright MCP...');
    await client.connect(transport);
    console.log('连接成功！');

    // 获取工具列表
    console.log('获取工具列表...');
    const toolsResponse = await client.listTools();
    console.log('工具列表:', JSON.stringify(toolsResponse, null, 2));

    // 关闭连接
    await client.close();
    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
testPlaywrightMCP(); 