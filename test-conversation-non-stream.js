const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-user-123';

// 测试数据
const testCases = [
  {
    name: '聊天意图 - 非流式创建会话',
    firstMessage: '你好，今天天气怎么样？',
    expectedIntent: 'chat'
  },
  {
    name: '任务意图 - 非流式创建会话',
    firstMessage: '帮我搜索一下关于人工智能的最新新闻',
    expectedIntent: 'task'
  },
  {
    name: '自定义标题 - 非流式创建会话',
    firstMessage: '这是一个测试消息',
    title: '我的自定义标题',
    expectedIntent: 'chat'
  }
];

async function testNonStreamConversationCreation() {
  console.log('🧪 开始测试非流式创建会话功能...\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`📝 测试 ${i + 1}: ${testCase.name}`);
    
    try {
      // 1. 创建会话并处理第一条消息
      console.log('   - 创建会话并发送第一条消息...');
      const createResponse = await axios.post(`${BASE_URL}/api/conversation`, {
        userId: TEST_USER_ID,
        firstMessage: testCase.firstMessage,
        title: testCase.title
      });

      if (!createResponse.data.success) {
        throw new Error(`创建会话失败: ${createResponse.data.message}`);
      }

      const conversationData = createResponse.data.data;
      console.log(`   ✅ 会话创建成功`);
      console.log(`   - 会话ID: ${conversationData.conversation.id}`);
      console.log(`   - 标题: ${conversationData.conversation.title}`);
      console.log(`   - 意图识别: ${conversationData.intent}`);
      console.log(`   - 用户消息ID: ${conversationData.userMessage.id}`);
      console.log(`   - 助手回复ID: ${conversationData.assistantResponse.id}`);
      
      if (conversationData.taskId) {
        console.log(`   - 关联任务ID: ${conversationData.taskId}`);
      }

      // 2. 验证消息存储
      console.log('   - 验证消息存储...');
      const messagesResponse = await axios.get(`${BASE_URL}/api/conversation/${conversationData.conversation.id}?userId=${TEST_USER_ID}`);
      
      if (!messagesResponse.data.success) {
        throw new Error(`获取消息失败: ${messagesResponse.data.message}`);
      }

      const messages = messagesResponse.data.data.messages;
      console.log(`   ✅ 消息存储验证成功，共 ${messages.length} 条消息`);
      
      // 验证消息内容
      const userMessage = messages.find(m => m.type === 'user');
      const assistantMessage = messages.find(m => m.type === 'assistant');
      
      if (!userMessage || userMessage.content !== testCase.firstMessage) {
        throw new Error('用户消息存储不正确');
      }
      
      if (!assistantMessage) {
        throw new Error('助手回复消息缺失');
      }
      
      console.log(`   - 用户消息: ${userMessage.content}`);
      console.log(`   - 助手回复: ${assistantMessage.content.substring(0, 50)}...`);
      console.log(`   - 消息意图: ${userMessage.intent}`);

      // 3. 验证标题生成
      if (testCase.title) {
        if (conversationData.conversation.title !== testCase.title) {
          throw new Error(`自定义标题不匹配: 期望 "${testCase.title}", 实际 "${conversationData.conversation.title}"`);
        }
        console.log(`   ✅ 自定义标题验证成功`);
      } else {
        if (conversationData.conversation.title === testCase.firstMessage) {
          console.log(`   ⚠️  标题与消息内容相同，可能标题生成失败（使用了降级方案）`);
        } else {
          console.log(`   ✅ 标题自动生成成功`);
        }
      }

      // 4. 如果是任务意图，验证任务创建
      if (testCase.expectedIntent === 'task' && conversationData.taskId) {
        console.log('   - 验证任务创建...');
        const taskResponse = await axios.get(`${BASE_URL}/api/task/${conversationData.taskId}?userId=${TEST_USER_ID}`);
        
        if (taskResponse.data.success) {
          console.log(`   ✅ 任务创建验证成功: ${taskResponse.data.data.task.title}`);
        } else {
          console.log(`   ⚠️  任务验证失败: ${taskResponse.data.message}`);
        }
      }

      console.log(`   ✅ 测试 ${i + 1} 完成\n`);

    } catch (error) {
      console.error(`   ❌ 测试 ${i + 1} 失败:`, error.message);
      if (error.response) {
        console.error('   错误详情:', error.response.data);
      }
      console.log('');
    }
  }

  // 5. 测试获取会话列表
  console.log('📋 测试获取会话列表...');
  try {
    const listResponse = await axios.get(`${BASE_URL}/api/conversation?userId=${TEST_USER_ID}`);
    
    if (listResponse.data.success) {
      const conversations = listResponse.data.data.conversations;
      console.log(`✅ 会话列表获取成功，共 ${conversations.length} 个会话`);
      
      conversations.forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.title} (${conv.messageCount} 条消息, ${conv.taskCount} 个任务)`);
      });
    } else {
      console.error('❌ 获取会话列表失败:', listResponse.data.message);
    }
  } catch (error) {
    console.error('❌ 获取会话列表异常:', error.message);
  }

  console.log('\n🎉 非流式创建会话功能测试完成！');
}

// 运行测试
testNonStreamConversationCreation().catch(console.error); 