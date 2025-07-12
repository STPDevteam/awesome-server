const axios = require('axios');

const baseURL = 'http://localhost:3000';
const userId = 'test-user-001';

// 模拟测试用的Agent ID（需要先创建一个Agent）
const agentId = 'test-agent-001';

async function testAgentMemory() {
  console.log('🧠 测试Agent多轮对话记忆功能');
  
  try {
    // 1. 开始Agent试用
    console.log('\n📝 1. 开始Agent试用会话');
    const tryResponse = await axios.post(`${baseURL}/api/agent/try/${agentId}`, {
      content: "Hello, I'm testing your memory. My name is Alice.",
      userId: userId
    });
    
    console.log('✅ Agent试用开始成功');
    console.log('会话ID:', tryResponse.data.data.conversation.id);
    
    const conversationId = tryResponse.data.data.conversation.id;
    
    // 2. 第一轮对话 - 告诉Agent一些信息
    console.log('\n💬 2. 第一轮对话 - 分享信息');
    const firstMessage = await axios.post(`${baseURL}/api/conversation/${conversationId}/message`, {
      content: "I work as a software engineer and I love JavaScript programming.",
      userId: userId
    });
    
    console.log('用户:', "I work as a software engineer and I love JavaScript programming.");
    console.log('Agent:', firstMessage.data.data.assistantResponse.content);
    
    // 3. 第二轮对话 - 询问Agent是否记住
    console.log('\n🔍 3. 第二轮对话 - 测试记忆');
    const secondMessage = await axios.post(`${baseURL}/api/conversation/${conversationId}/message`, {
      content: "What's my name and what do I do for work?",
      userId: userId
    });
    
    console.log('用户:', "What's my name and what do I do for work?");
    console.log('Agent:', secondMessage.data.data.assistantResponse.content);
    
    // 4. 第三轮对话 - 继续测试记忆
    console.log('\n📚 4. 第三轮对话 - 深入测试记忆');
    const thirdMessage = await axios.post(`${baseURL}/api/conversation/${conversationId}/message`, {
      content: "Can you help me with a JavaScript problem?",
      userId: userId
    });
    
    console.log('用户:', "Can you help me with a JavaScript problem?");
    console.log('Agent:', thirdMessage.data.data.assistantResponse.content);
    
    // 5. 验证记忆效果
    console.log('\n🎯 5. 记忆效果验证');
    const agentResponse = secondMessage.data.data.assistantResponse.content.toLowerCase();
    
    if (agentResponse.includes('alice') || agentResponse.includes('name')) {
      console.log('✅ 记忆测试通过：Agent记住了用户名字');
    } else {
      console.log('❌ 记忆测试失败：Agent没有记住用户名字');
    }
    
    if (agentResponse.includes('software') || agentResponse.includes('engineer') || agentResponse.includes('javascript')) {
      console.log('✅ 记忆测试通过：Agent记住了用户职业');
    } else {
      console.log('❌ 记忆测试失败：Agent没有记住用户职业');
    }
    
    console.log('\n🎉 Agent多轮对话记忆测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

// 运行测试
testAgentMemory(); 