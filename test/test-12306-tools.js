// 测试获取12306-mcp的工具列表
import { MCPManager } from '../src/services/mcpManager.js';
import { logger } from '../src/utils/logger.js';

async function test12306Tools() {
  try {
    console.log('开始测试获取12306-mcp的工具列表...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 连接12306-mcp服务
    console.log('连接12306-mcp服务...');
    await mcpManager.connect('12306-mcp', 'npx', ['-y', '12306-mcp']);
    console.log('12306-mcp服务连接成功！');
    
    // 获取工具列表
    console.log('获取12306-mcp工具列表...');
    const tools = await mcpManager.getTools('12306-mcp');
    console.log('工具列表:');
    console.log(JSON.stringify(tools, null, 2));
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
test12306Tools(); 