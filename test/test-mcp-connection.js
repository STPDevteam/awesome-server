// 测试 MCP 连接管理功能
const API_BASE = 'http://localhost:3001';

async function testMCPConnection() {
  console.log('=== 测试 MCP 连接管理 ===\n');
  
  // 1. 获取当前连接列表
  console.log('1. 获取当前连接的 MCP 列表...');
  let response = await fetch(`${API_BASE}/api/mcp/list`);
  let mcpList = await response.json();
  console.log('当前连接的 MCP:', mcpList);
  console.log('\n');
  
  // 2. 连接 x-mcp-server（第一次）
  console.log('2. 连接 x-mcp-server...');
  response = await fetch(`${API_BASE}/api/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'x-mcp-server',
      command: 'npx',
      args: ['-y', '@mcp/x-mcp']
    })
  });
  let result = await response.json();
  console.log('连接结果:', result);
  console.log('\n');
  
  // 3. 再次连接 x-mcp-server（测试幂等性）
  console.log('3. 再次连接 x-mcp-server（测试幂等性）...');
  response = await fetch(`${API_BASE}/api/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'x-mcp-server',
      command: 'npx',
      args: ['-y', '@mcp/x-mcp']
    })
  });
  result = await response.json();
  console.log('连接结果:', result);
  console.log('注意 alreadyConnected 应该为 true');
  console.log('\n');
  
  // 4. 获取更新后的连接列表
  console.log('4. 获取更新后的连接列表...');
  response = await fetch(`${API_BASE}/api/mcp/list`);
  mcpList = await response.json();
  console.log('连接的 MCP 列表:', mcpList);
  console.log('\n');
  
  // 5. 获取 x-mcp-server 的工具
  console.log('5. 获取 x-mcp-server 的工具...');
  response = await fetch(`${API_BASE}/api/mcp/x-mcp-server/tools`);
  const tools = await response.json();
  console.log(`x-mcp-server 有 ${tools.tools.length} 个工具:`);
  tools.tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
  console.log('\n');
  
  // 6. 断开连接
  console.log('6. 断开 x-mcp-server 连接...');
  response = await fetch(`${API_BASE}/api/mcp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'x-mcp-server'
    })
  });
  result = await response.json();
  console.log('断开结果:', result);
  console.log('\n');
  
  // 7. 再次断开（测试幂等性）
  console.log('7. 再次断开 x-mcp-server（测试幂等性）...');
  response = await fetch(`${API_BASE}/api/mcp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'x-mcp-server'
    })
  });
  result = await response.json();
  console.log('断开结果:', result);
  console.log('注意 wasConnected 应该为 false');
  console.log('\n');
  
  // 8. 最终连接列表
  console.log('8. 最终连接列表...');
  response = await fetch(`${API_BASE}/api/mcp/list`);
  mcpList = await response.json();
  console.log('连接的 MCP 列表:', mcpList);
  
  console.log('\n=== 测试完成 ===');
}

// 运行测试
testMCPConnection().catch(console.error); 