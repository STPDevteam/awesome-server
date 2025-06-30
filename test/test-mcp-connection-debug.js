const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function debugMCPConnection() {
  console.log('\n🔍 MCP连接和工具获取调试测试...\n');
  
  try {
    // 1. 测试获取所有预定义MCP
    console.log('1️⃣ 获取所有预定义MCP...');
    const allMCPsResponse = await axios.get(`${API_BASE}/api/task/all-predefined-mcps`);
    const allMCPs = allMCPsResponse.data.data.mcps;
    console.log(`✅ 找到 ${allMCPs.length} 个预定义MCP`);
    
    // 2. 测试几个关键MCP的连接和工具获取
    const testMCPs = ['github-mcp', 'notion-mcp', 'playwright', 'coingecko-mcp'];
    
    for (const mcpName of testMCPs) {
      console.log(`\n2️⃣ 测试MCP: ${mcpName}`);
      
      try {
        // 检查MCP配置是否存在
        const mcpConfig = allMCPs.find(mcp => mcp.name === mcpName);
        if (!mcpConfig) {
          console.log(`❌ 未找到MCP配置: ${mcpName}`);
          continue;
        }
        
        console.log(`✅ 找到MCP配置: ${mcpConfig.name}`);
        console.log(`   描述: ${mcpConfig.description}`);
        console.log(`   需要认证: ${mcpConfig.authRequired}`);
        
        // 尝试连接并获取工具
        const testEndpoint = `/test-${mcpName.replace('-mcp', '').replace('-', '-')}-mcp`;
        console.log(`🔗 尝试连接测试: ${testEndpoint}`);
        
        const testResponse = await axios.post(`${API_BASE}/api/task${testEndpoint}`, {}, {
          timeout: 30000
        });
        
        if (testResponse.data.success) {
          console.log(`✅ ${mcpName} 连接成功`);
          console.log(`📋 可用工具数量: ${testResponse.data.tools.length}`);
          
          // 显示前5个工具
          const toolNames = testResponse.data.tools.slice(0, 5).map(tool => tool.name);
          console.log(`🔧 前5个工具: ${toolNames.join(', ')}`);
        } else {
          console.log(`❌ ${mcpName} 连接失败: ${testResponse.data.error}`);
        }
        
      } catch (mcpError) {
        if (mcpError.response) {
          console.log(`❌ ${mcpName} 测试失败: ${mcpError.response.data.error || mcpError.response.data.details}`);
        } else {
          console.log(`❌ ${mcpName} 测试失败: ${mcpError.message}`);
        }
      }
      
      // 等待一下避免连接冲突
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 3. 测试名称映射
    console.log('\n3️⃣ 测试MCP名称映射...');
    const mappingTestCases = [
      'github-mcp-server',
      'notion-mcp-service', 
      'playwright-mcp-service',
      'coingecko-mcp-service'
    ];
    
    for (const testName of mappingTestCases) {
      const mcpConfig = allMCPs.find(mcp => mcp.name === testName);
      if (mcpConfig) {
        console.log(`✅ 直接匹配: ${testName} -> ${mcpConfig.name}`);
      } else {
        // 查找可能的映射
        const possibleMatches = allMCPs.filter(mcp => 
          mcp.name.includes(testName.replace('-mcp-server', '').replace('-mcp-service', '')) ||
          testName.includes(mcp.name.replace('-mcp', ''))
        );
        
        if (possibleMatches.length > 0) {
          console.log(`🔄 可能的映射: ${testName} -> ${possibleMatches.map(m => m.name).join(', ')}`);
        } else {
          console.log(`❌ 未找到映射: ${testName}`);
        }
      }
    }
    
    console.log('\n✅ MCP连接调试测试完成');
    
  } catch (error) {
    console.error('❌ 调试测试失败:', error.message);
  }
}

// 运行调试测试
debugMCPConnection().catch(console.error); 