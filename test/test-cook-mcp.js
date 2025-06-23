import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testCookMcp() {
  console.log('🍳 Testing cook-mcp-service connection and tool calling...');

  try {
    // 1. 检查服务器健康状态
    console.log('\n1. Checking server health...');
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      throw new Error(`Server not healthy: ${healthRes.status}`);
    }
    const health = await healthRes.json();
    console.log(`✅ Server is OK (Database: ${health.database})`);

    // 2. 获取已连接的MCP列表，确认cook-mcp-service已连接
    console.log('\n2. Verifying cook-mcp-service connection...');
    const listRes = await fetch(`${API_BASE}/api/mcp/list`);
    if (!listRes.ok) {
        const errorText = await listRes.text();
        throw new Error(`Failed to get MCP list: ${listRes.status} ${errorText}`);
    }
    const mcpList = await listRes.json();
    
    const cookMcp = mcpList.find(mcp => mcp.name === 'cook-mcp-service');
    if (cookMcp && cookMcp.status === 'connected') {
      console.log(`✅ cook-mcp-service is connected with ${cookMcp.toolCount} tools.`);
    } else {
      console.log('Connected MCPs:', mcpList);
      throw new Error('cook-mcp-service is not connected or has an error status.');
    }

    // 3. 获取 cook-mcp-service 的工具列表
    console.log('\n3. Listing tools for cook-mcp-service...');
    const toolsRes = await fetch(`${API_BASE}/api/mcp/cook-mcp-service/tools`);
    if (!toolsRes.ok) {
        const errorText = await toolsRes.text();
        throw new Error(`Failed to get tools: ${toolsRes.status} ${errorText}`);
    }
    const { tools } = await toolsRes.json();
    console.log('🛠️  Available Tools:');
    if (!tools || tools.length === 0) {
        console.log('No tools found.');
        return;
    }
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // 4. 调用一个工具 (假设有一个名为 'search_recipe' 的工具)
    const toolToCall = tools[0]; // Just call the first tool found
    if (!toolToCall) {
        console.log("\nNo tool to call. Skipping tool call test.");
        return;
    }

    // 假设这个工具有一个名为 'query' 的参数
    const toolArgs = { query: 'tomato soup' };
    console.log(`\n4. Calling tool "${toolToCall.name}" with args:`, toolArgs);

    const callToolRes = await fetch(`${API_BASE}/api/mcp/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mcpName: 'cook-mcp-service',
        toolName: toolToCall.name,
        arguments: toolArgs,
      }),
    });

    if (!callToolRes.ok) {
      const errorText = await callToolRes.text();
      throw new Error(`Tool call failed: ${callToolRes.status} ${errorText}`);
    }

    const toolResult = await callToolRes.json();
    console.log('✅ Tool call successful! Result:');
    console.log(JSON.stringify(toolResult, null, 2));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testCookMcp(); 