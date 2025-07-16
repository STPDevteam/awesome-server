const axios = require('axios');

// 测试DefiLlama MCP的LLM智能错误处理
async function testDefillamaLLMFix() {
  const API_BASE = 'http://localhost:3001';
  
  console.log('🧪 Testing DefiLlama MCP with LLM error handling...');
  
  try {
    // 模拟Agent执行任务，触发DefiLlama调用
    const response = await axios.post(`${API_BASE}/api/agent-conversation/test_conversation_id/message`, {
      content: "Get TVL data for Uniswap protocol using DefiLlama",
      agent: {
        id: "test-agent",
        name: "DefiLlama_Test_Agent",
        mcpWorkflow: {
          mcps: [{
            name: "defillama-mcp",
            description: "DeFi protocol data"
          }],
          workflow: [{
            step: 1,
            mcp: "defillama-mcp",
            action: "get TVL data for protocol",
            input: { protocol: "uniswap" }
          }]
        }
      }
    }, {
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ DefiLlama test successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ DefiLlama test failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

// 测试直接MCP工具调用
async function testDirectMCPCall() {
  const API_BASE = 'http://localhost:3001';
  
  console.log('🔧 Testing direct MCP tool call...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/mcp/tool`, {
      mcpName: "defillama-mcp",
      toolName: "defillama_get_protocol_tvl",
      arguments: { protocol: "uniswap" }
    }, {
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Direct MCP call successful!');
    console.log('Result:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ Direct MCP call failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

// 运行测试
async function runTests() {
  console.log('🚀 Starting DefiLlama LLM Fix Tests...\n');
  
  await testDirectMCPCall();
  console.log('\n' + '='.repeat(50) + '\n');
  await testDefillamaLLMFix();
  
  console.log('\n✨ Tests completed!');
}

runTests().catch(console.error); 