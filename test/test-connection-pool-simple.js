import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:3001';
const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMDAxIiwid2FsbGV0QWRkcmVzcyI6IjB4MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MCIsImlhdCI6MTc1MTI2OTY4MSwiZXhwIjoxNzUxMjczMjgxfQ.tPv36NFxfzUIVltENn-OpiaTNSYvSiFy1-18TMYMkkw';

/**
 * 测试连接池状态查询
 */
async function testPoolStatus() {
  console.log('\n=== 测试连接池状态查询 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/mcp/pool-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ 连接池状态查询成功');
    console.log('连接池状态:', JSON.stringify(result.data, null, 2));
    
    return result.data;
  } catch (error) {
    console.error('❌ 获取连接池状态失败:', error);
    throw error;
  }
}

/**
 * 测试手动清理连接
 */
async function testManualCleanup() {
  console.log('\n=== 测试手动清理连接 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/mcp/cleanup-connections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ 手动清理连接成功');
    console.log('清理结果:', JSON.stringify(result.data, null, 2));
    
    return result.data;
  } catch (error) {
    console.error('❌ 手动清理连接失败:', error);
    throw error;
  }
}

/**
 * 测试MCP列表API
 */
async function testMCPList() {
  console.log('\n=== 测试MCP列表查询 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ MCP列表查询成功');
    console.log(`可用MCP数量: ${result.data.length}`);
    
    // 显示前几个MCP的名称
    const mcpNames = result.data.slice(0, 5).map(mcp => mcp.name).join(', ');
    console.log(`前5个MCP: ${mcpNames}`);
    
    return result.data;
  } catch (error) {
    console.error('❌ 获取MCP列表失败:', error);
    throw error;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始连接池功能测试（简化版）...');
  console.log(`API地址: ${BASE_URL}`);
  console.log(`Token: ${API_TOKEN ? '已配置' : '未配置'}`);
  
  if (!API_TOKEN) {
    console.error('❌ 错误: 请设置有效的JWT Token');
    process.exit(1);
  }
  
  try {
    // 执行核心测试
    await testPoolStatus();
    await testManualCleanup();
    await testMCPList();
    
    console.log('\n✅ 所有基础测试完成！');
    console.log('\n📊 测试总结:');
    console.log('- 连接池状态查询：成功');
    console.log('- 手动清理连接：成功');
    console.log('- MCP列表查询：成功');
    console.log('\n🎉 连接池API功能正常工作！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
main(); 