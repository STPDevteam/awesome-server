import fetch from 'node-fetch';

async function testToolCalling() {
  console.log('🧪 Testing MCP Tool Calling...\n');
  
  try {
    // 1. 检查服务器健康状态
    console.log('1. Checking server health...');
    const healthRes = await fetch('http://localhost:3001/health');
    if (!healthRes.ok) {
      throw new Error('Server not running');
    }
    console.log('✅ Server is running\n');
    
    // 2. 获取已连接的MCP列表
    console.log('2. Getting connected MCPs...');
    const mcpListRes = await fetch('http://localhost:3001/api/mcp/list');
    const mcpList = await mcpListRes.json();
    console.log('📋 Connected MCPs:', mcpList.length);
    mcpList.forEach(mcp => {
      console.log(`   - ${mcp.name}: ${mcp.toolCount} tools (${mcp.status})`);
    });
    console.log();
    
    // 3. 测试工具调用请求
    console.log('3. Testing tool calling with Twitter query...');
    
    const chatPayload = {
      messages: [
        {
          role: 'user',
          content: '帮我查看最新的推文'
        }
      ]
    };
    
    console.log('📤 Sending chat request...');
    console.log('Request payload:', JSON.stringify(chatPayload, null, 2));
    
    const chatRes = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chatPayload)
    });
    
    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      throw new Error(`Chat request failed: ${chatRes.status} ${errorText}`);
    }
    
    const chatResult = await chatRes.json();
    console.log('📥 Chat response received:');
    console.log('Response:', JSON.stringify(chatResult, null, 2));
    
    // 检查响应是否包含内容
    if (chatResult.choices && chatResult.choices[0] && chatResult.choices[0].message.content) {
      console.log('\n✅ Tool calling appears to be working!');
      console.log('Response content length:', chatResult.choices[0].message.content.length);
    } else {
      console.log('\n❌ No response content received');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// 添加延迟以确保服务器启动
setTimeout(() => {
  testToolCalling();
}, 2000); 