// 测试获取12306-mcp的工具列表
const { MCPManager } = require('../dist/services/mcpManager.js');
const { logger } = require('../dist/utils/logger.js');

async function test12306Tools() {
  try {
    console.log('开始测试获取12306-mcp的工具列表...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 连接12306-mcp服务
    console.log('连接12306-mcp服务...');
    try {
      await mcpManager.connect('12306-mcp', 'npx', ['-y', '12306-mcp']);
      console.log('12306-mcp服务连接成功！');
      
      // 获取工具列表
      console.log('获取12306-mcp工具列表...');
      const tools = await mcpManager.getTools('12306-mcp');
      console.log('工具列表:');
      console.log(JSON.stringify(tools, null, 2));
      
      // 尝试调用每个工具，看看哪个能成功
      if (tools && tools.length > 0) {
        console.log('\n尝试调用每个工具:');
        for (const tool of tools) {
          console.log(`尝试调用工具: ${tool.name}`);
          try {
            const result = await mcpManager.callTool('12306-mcp', tool.name, {});
            console.log(`工具 ${tool.name} 调用成功，结果:`, result);
          } catch (error) {
            console.error(`工具 ${tool.name} 调用失败:`, error.message);
          }
        }
      }
      
      // 尝试不同格式的"获取当前日期"工具
      console.log('\n尝试不同格式的"获取当前日期"工具:');
      const toolNameFormats = [
        'getCurrentDate',        // 驼峰格式
        'get_current_date',      // 下划线格式
        'getcurrentdate',        // 无下划线、无驼峰
        'getDate',               // 简短驼峰
        'get_date',              // 简短下划线
        'getdate',               // 简短无格式
        'currentDate',           // 无get驼峰
        'current_date',          // 无get下划线
        'currentdate',           // 无get无格式
        'date',                  // 最简单
        '获取当前日期'             // 原始中文
      ];
      
      for (const toolName of toolNameFormats) {
        console.log(`尝试调用工具: ${toolName}`);
        try {
          const result = await mcpManager.callTool('12306-mcp', toolName, {});
          console.log(`✅ 工具 ${toolName} 调用成功，结果:`, result);
        } catch (error) {
          console.error(`❌ 工具 ${toolName} 调用失败:`, error.message);
        }
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
test12306Tools(); 