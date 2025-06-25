// 测试MCP名称映射和工具调用
import { MCPManager } from '../src/services/mcpManager.js';
import { logger } from '../src/utils/logger.js';

async function testMCPNameMapping() {
  try {
    console.log('开始测试MCP名称映射和工具调用...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 测试名称映射
    console.log('\n=== 测试MCP名称映射 ===');
    const testNames = [
      '12306-mcp-service',
      'coingecko-server',
      'x-mcp-server',
      'playwright-mcp-service'
    ];
    
    for (const name of testNames) {
      // 使用私有方法需要通过反射调用
      const normalizedName = mcpManager['normalizeMCPName'](name);
      console.log(`${name} => ${normalizedName}`);
    }
    
    // 连接12306-mcp服务
    console.log('\n=== 测试连接12306-mcp服务 ===');
    console.log('连接12306-mcp服务...');
    await mcpManager.connect('12306-mcp', 'npx', ['-y', '12306-mcp']);
    console.log('12306-mcp服务连接成功！');
    
    // 获取工具列表
    console.log('\n=== 获取12306-mcp工具列表 ===');
    const tools = await mcpManager.getTools('12306-mcp');
    console.log('工具列表:', tools);
    
    // 测试中文工具名称映射
    console.log('\n=== 测试中文工具名称调用 ===');
    const chineseToolName = '获取当前日期';
    console.log(`调用工具: ${chineseToolName}`);
    
    try {
      const result1 = await mcpManager.callTool('12306-mcp', chineseToolName, {});
      console.log('结果:', result1);
    } catch (error) {
      console.error(`调用工具失败: ${error.message}`);
    }
    
    // 测试英文工具名称
    console.log('\n=== 测试英文工具名称调用 ===');
    const englishToolName = 'get_current_date';
    console.log(`调用工具: ${englishToolName}`);
    
    try {
      const result2 = await mcpManager.callTool('12306-mcp', englishToolName, {});
      console.log('结果:', result2);
    } catch (error) {
      console.error(`调用工具失败: ${error.message}`);
    }
    
    // 测试12306-mcp-service名称映射
    console.log('\n=== 测试12306-mcp-service名称映射 ===');
    console.log('调用工具: 获取当前日期，使用MCP名称: 12306-mcp-service');
    
    try {
      const result3 = await mcpManager.callTool('12306-mcp-service', '获取当前日期', {});
      console.log('结果:', result3);
    } catch (error) {
      console.error(`调用工具失败: ${error.message}`);
    }
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
testMCPNameMapping(); 