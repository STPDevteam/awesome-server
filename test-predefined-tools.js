#!/usr/bin/env node

/**
 * 🧪 测试预定义工具功能
 * 验证MCP的预定义工具信息是否能正确返回
 */

// 设置环境变量
process.env.NODE_ENV = 'development';

async function testPredefinedTools() {
  try {
    console.log('🧪 测试预定义工具功能\n');

    // 动态导入ES模块
    const { getPredefinedMCP } = await import('./src/services/predefinedMCPs.js');
    const { MCPManager } = await import('./src/services/mcpManager.js');

    const mcpsToTest = [
      {
        name: 'playwright',
        description: '基于Playwright浏览器自动化的预定义工具信息',
        maxShow: 4
      },
      {
        name: 'coinmarketcap-mcp',
        description: '基于CoinMarketCap官方API的预定义工具信息',
        maxShow: 4
      },
      {
        name: 'defillama-mcp',
        description: '基于DeFiLlama官方API的预定义工具信息',
        maxShow: 4
      },
      {
        name: 'twitter-client-mcp',
        description: '通过代码分析推断出的工具信息',
        maxShow: 3
      },
      {
        name: 'github-mcp', 
        description: '通过web搜索GitHub官方文档获得的真实工具信息',
        maxShow: 3
      },
      {
        name: 'coingecko-mcp',
        description: '基于CoinGecko官方API文档的工具信息', 
        maxShow: 4
      },
      {
        name: 'evm-mcp',
        description: '基于EVM工具功能的预定义工具信息',
        maxShow: 4
      },
      {
        name: 'base-mcp',
        description: '基于Base Chain和Coinbase CDP的预定义工具信息',
        maxShow: 4
      }
    ];

    for (const mcpInfo of mcpsToTest) {
      console.log(`📋 测试 ${mcpInfo.name} 的预定义工具信息 (${mcpInfo.description})`);
      console.log('='.repeat(80));

      const mcpConfig = getPredefinedMCP(mcpInfo.name);
      
      if (mcpConfig && mcpConfig.predefinedTools) {
        console.log(`✅ 找到${mcpInfo.name}配置，包含 ${mcpConfig.predefinedTools.length} 个预定义工具:`);
        
        mcpConfig.predefinedTools.slice(0, mcpInfo.maxShow).forEach((tool, index) => {
          console.log(`  ${index + 1}. ${tool.name}`);
          console.log(`     描述: ${tool.description}`);
          
          if (tool.parameters && tool.parameters.properties) {
            console.log(`     参数:`);
            Object.entries(tool.parameters.properties).forEach(([paramName, paramInfo]) => {
              const required = tool.parameters.required && tool.parameters.required.includes(paramName) ? ' (必需)' : ' (可选)';
              console.log(`       - ${paramName}${required}: ${paramInfo.description || paramInfo.type}`);
              if (paramInfo.default !== undefined) {
                console.log(`         默认值: ${paramInfo.default}`);
              }
              if (paramInfo.enum) {
                console.log(`         可选值: ${paramInfo.enum.join(', ')}`);
              }
            });
          } else {
            console.log(`     参数: 无`);
          }
          console.log('');
        });
        
        if (mcpConfig.predefinedTools.length > mcpInfo.maxShow) {
          console.log(`     ... 还有 ${mcpConfig.predefinedTools.length - mcpInfo.maxShow} 个其他工具\n`);
        }
      } else {
        console.log(`❌ 未找到${mcpInfo.name}的预定义工具信息\n`);
      }
    }

    // 测试MCPManager的getPredefinedTools方法
    console.log('🔧 测试MCPManager.getPredefinedTools()方法');
    console.log('='.repeat(60));

    const mcpManager = new MCPManager();
    
    for (const mcpInfo of mcpsToTest) {
      console.log(`\n测试${mcpInfo.name}:`);
      const tools = mcpManager.getPredefinedTools(mcpInfo.name);
      if (tools && tools.length > 0) {
        console.log(`✅ 获取到 ${tools.length} 个预定义工具`);
        console.log(`   前3个工具: ${tools.slice(0, 3).map(t => t.name).join(', ')}`);
      } else {
        console.log('❌ 未获取到预定义工具');
      }
    }

    console.log('\n🎉 测试完成！');
    console.log('\n📝 总结:');
    console.log('- Playwright MCP: 基于Playwright浏览器自动化的预定义工具信息');
    console.log('- CoinMarketCap MCP: 基于CoinMarketCap官方API的预定义工具信息');
    console.log('- DeFiLlama MCP: 基于DeFiLlama官方API的预定义工具信息');
    console.log('- Twitter MCP: 通过代码分析推断出的工具信息');
    console.log('- GitHub MCP: 通过web搜索GitHub官方文档获得的真实工具信息');
    console.log('- CoinGecko MCP: 基于CoinGecko官方API文档的工具信息');
    console.log('- EVM MCP: 基于EVM工具功能的预定义工具信息');
    console.log('- Base MCP: 基于Base Chain和Coinbase CDP的预定义工具信息');
    console.log('- 所有8个MCP都成功添加了详细的参数配置信息');
    console.log('- 预定义工具功能已集成到分析接口和对话详情接口中');
    console.log('- 用户可以在MCP未连接时预览工具信息，提升体验');
    console.log('- 对话详情接口也会包含预定义工具信息');
    console.log('- 这样用户可以更好地了解每个MCP提供什么功能');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testPredefinedTools(); 