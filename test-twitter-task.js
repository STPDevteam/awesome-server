const axios = require('axios');

async function testTwitterTask() {
  try {
    console.log('🧪 测试推特热点新闻任务的MCP选择...');
    
    const response = await axios.post('http://localhost:3001/api/conversations', {
      user_id: 'test_user_twitter',
      message: '推特的热点新闻有什么'
    });
    
    console.log('✅ 对话创建成功');
    console.log('📋 对话ID:', response.data.conversation_id);
    
    // 等待一段时间让任务分析完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 获取任务详情
    const taskResponse = await axios.get(`http://localhost:3001/api/conversations/${response.data.conversation_id}`);
    console.log('📊 任务详情:', JSON.stringify(taskResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

testTwitterTask(); 