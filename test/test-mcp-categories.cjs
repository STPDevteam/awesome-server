// 测试MCP分类接口
const axios = require('axios');

// 服务器URL
const API_URL = 'http://localhost:3001/api';

// 测试MCP分类接口
async function testMcpCategories() {
  try {
    console.log('测试 /api/mcp/categories 接口...');
    
    // 发起请求
    const response = await axios.get(`${API_URL}/mcp/categories`);
    
    // 打印响应
    console.log('响应状态码:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 验证响应格式
    if (response.data.success && Array.isArray(response.data.data)) {
      console.log('✅ 接口返回成功');
      
      // 验证每个分类是否包含name和count字段
      const categories = response.data.data;
      const valid = categories.every(cat => 
        typeof cat.name === 'string' && 
        typeof cat.count === 'number'
      );
      
      if (valid) {
        console.log('✅ 数据格式正确，包含分类名和数量');
      } else {
        console.error('❌ 数据格式错误，缺少分类名或数量');
      }
      
      // 打印分类统计
      console.log('\n分类统计:');
      categories.forEach(cat => {
        console.log(`- ${cat.name}: ${cat.count}个MCP`);
      });
    } else {
      console.error('❌ 接口返回失败或格式错误');
    }
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('错误状态码:', error.response.status);
      console.error('错误数据:', error.response.data);
    }
  }
}

// 执行测试
testMcpCategories(); 