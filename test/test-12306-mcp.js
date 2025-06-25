// 测试12306-mcp服务
import { MCPManager } from '../dist/services/mcpManager.js';
import { logger } from '../dist/utils/logger.js';

async function test12306MCP() {
  try {
    console.log('开始测试12306-mcp服务...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 连接12306-mcp服务
    console.log('连接12306-mcp服务...');
    try {
      await mcpManager.connect('12306-mcp', 'npx', ['-y', '12306-mcp']);
      console.log('12306-mcp服务连接成功！');
      
      // 获取当前日期
      console.log('调用get-current-date工具...');
      try {
        const result = await mcpManager.callTool('12306-mcp', 'get-current-date', {});
        console.log('获取当前日期成功:', result);
      } catch (error) {
        console.error('获取当前日期失败:', error.message);
      }
      
      // 测试中文工具名称映射
      console.log('\n测试中文工具名称映射...');
      try {
        const result = await mcpManager.callTool('12306-mcp', '获取当前日期', {});
        console.log('使用中文工具名称"获取当前日期"调用成功:', result);
      } catch (error) {
        console.error('使用中文工具名称"获取当前日期"调用失败:', error.message);
      }
    } catch (error) {
      console.error(`连接12306-mcp失败:`, error.message);
    }
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
test12306MCP(); 