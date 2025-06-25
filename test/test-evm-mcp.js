// 测试evm-mcp的连接和工具调用
import { MCPManager } from '../src/services/mcpManager.js';
import { logger } from '../src/utils/logger.js';

async function testEvmMcp() {
  try {
    console.log('开始测试evm-mcp服务...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 测试名称映射
    console.log('\n=== 测试MCP名称映射 ===');
    const testNames = [
      'evm-mcp-service',
      'evm-mcp-server',
      'evm-mcp'
    ];
    
    for (const name of testNames) {
      // 使用私有方法需要通过反射调用
      const normalizedName = mcpManager['normalizeMCPName'](name);
      console.log(`${name} => ${normalizedName}`);
    }
    
    // 连接evm-mcp服务
    console.log('\n=== 测试连接evm-mcp服务 ===');
    console.log('连接evm-mcp服务...');
    
    try {
      await mcpManager.connect('evm-mcp', 'npx', ['-y', '@mcpdotdirect/evm-mcp-server']);
      console.log('evm-mcp服务连接成功！');
      
      // 获取工具列表
      console.log('\n=== 获取evm-mcp工具列表 ===');
      const tools = await mcpManager.getTools('evm-mcp');
      console.log('工具列表:', tools);
      
      // 测试工具调用
      console.log('\n=== 测试工具调用 ===');
      const toolName = 'smart-contract-interactions';
      console.log(`调用工具: ${toolName}`);
      
      const result = await mcpManager.callTool('evm-mcp', toolName, {
        network: 'ethereum',
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC合约地址
        method: 'balanceOf',
        params: ['0x6B175474E89094C44Da98b954EedeAC495271d0F'] // DAI合约地址
      });
      
      console.log('结果:', result);
    } catch (error) {
      console.error(`连接或调用evm-mcp失败: ${error.message}`);
    }
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
testEvmMcp(); 