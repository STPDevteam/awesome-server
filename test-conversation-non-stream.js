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
  console.log('🧪 开始测试非流式创建会话功能（新版本：分离消息处理）...\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`📝 测试 ${i + 1}: ${testCase.name}`);
    
    try {
      // 1. 创建会话并生成标题（不处理消息）
      console.log('   - 创建会话并生成标题...');
      const createResponse = await axios.post(`${BASE_URL}/api/conversation`, {
        userId: TEST_USER_ID,
        firstMessage: testCase.firstMessage,
        title: testCase.title
      });

      if (!createResponse.data.success) {
        throw new Error(`创建会话失败: ${createResponse.data.message}`);
      }

      const { conversation, generatedTitle } = createResponse.data.data;
      console.log(`   ✅ 会话创建成功`);
      console.log(`   - 会话ID: ${conversation.id}`);
      console.log(`   - 生成的标题: ${generatedTitle}`);
      console.log(`   - 消息数量: ${conversation.messageCount} (应该为0)`);
      console.log(`   - 任务数量: ${conversation.taskCount} (应该为0)`);

      // 验证会话状态
      if (conversation.messageCount !== 0) {
        console.log(`   ⚠️  警告: 消息数量不为0，可能存在问题`);
      }
      if (conversation.taskCount !== 0) {
        console.log(`   ⚠️  警告: 任务数量不为0，可能存在问题`);
      }

      // 2. 验证标题生成
      if (testCase.title) {
        if (conversation.title !== testCase.title) {
          throw new Error(`自定义标题不匹配: 期望 "${testCase.title}", 实际 "${conversation.title}"`);
        }
        console.log(`   ✅ 自定义标题验证成功`);
      } else {
        if (conversation.title === testCase.firstMessage) {
          console.log(`   ⚠️  标题与消息内容相同，可能标题生成失败（使用了降级方案）`);
        } else {
          console.log(`   ✅ 标题自动生成成功`);
        }
      }

      // 3. 发送第一条消息
      console.log('   - 发送第一条消息...');
      const messageResponse = await axios.post(`${BASE_URL}/api/conversation/${conversation.id}/message`, {
        userId: TEST_USER_ID,
        content: testCase.firstMessage
      });

      if (!messageResponse.data.success) {
        throw new Error(`发送消息失败: ${messageResponse.data.message}`);
      }

      const { userMessage, assistantResponse, intent, taskId } = messageResponse.data.data;
      console.log(`   ✅ 消息发送成功`);
      console.log(`   - 意图识别: ${intent}`);
      console.log(`   - 用户消息ID: ${userMessage.id}`);
      console.log(`   - 助手回复ID: ${assistantResponse.id}`);
      
      if (taskId) {
        console.log(`   - 关联任务ID: ${taskId}`);
      }

      // 4. 验证消息存储
      console.log('   - 验证消息存储...');
      const messagesResponse = await axios.get(`${BASE_URL}/api/conversation/${conversation.id}?userId=${TEST_USER_ID}`);
      
      if (!messagesResponse.data.success) {
        throw new Error(`获取消息失败: ${messagesResponse.data.message}`);
      }

      const messages = messagesResponse.data.data.messages;
      console.log(`   ✅ 消息存储验证成功，共 ${messages.length} 条消息`);
      
      // 验证消息内容
      const storedUserMessage = messages.find(m => m.type === 'user');
      const storedAssistantMessage = messages.find(m => m.type === 'assistant');
      
      if (!storedUserMessage || storedUserMessage.content !== testCase.firstMessage) {
        throw new Error('用户消息存储不正确');
      }
      
      if (!storedAssistantMessage) {
        throw new Error('助手回复消息缺失');
      }
      
      console.log(`   - 用户消息: ${storedUserMessage.content}`);
      console.log(`   - 助手回复: ${storedAssistantMessage.content.substring(0, 50)}...`);
      console.log(`   - 消息意图: ${storedUserMessage.intent}`);

      // 5. 验证意图识别
      if (intent !== testCase.expectedIntent) {
        console.log(`   ⚠️  意图识别不符合预期: 期望 "${testCase.expectedIntent}", 实际 "${intent}"`);
      } else {
        console.log(`   ✅ 意图识别正确`);
      }

      // 6. 如果是任务意图，验证任务创建
      if (testCase.expectedIntent === 'task' && taskId) {
        console.log('   - 验证任务创建...');
        const taskResponse = await axios.get(`${BASE_URL}/api/tasks/${taskId}?userId=${TEST_USER_ID}`);
        
        if (taskResponse.data.success) {
          console.log(`   ✅ 任务创建验证成功: ${taskResponse.data.data.task.title}`);
        } else {
          console.log(`   ⚠️  任务验证失败: ${taskResponse.data.message}`);
        }
      }

      // 7. 验证会话状态更新
      const updatedConvResponse = await axios.get(`${BASE_URL}/api/conversation/${conversation.id}?userId=${TEST_USER_ID}`);
      if (updatedConvResponse.data.success) {
        const updatedConv = updatedConvResponse.data.data.conversation;
        console.log(`   - 更新后的消息数量: ${updatedConv.messageCount}`);
        console.log(`   - 更新后的任务数量: ${updatedConv.taskCount}`);
        
        if (updatedConv.messageCount >= 2) {
          console.log(`   ✅ 会话消息计数更新正确`);
        } else {
          console.log(`   ⚠️  会话消息计数可能有问题`);
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

  // 8. 测试仅创建会话（不提供firstMessage）
  console.log('📋 测试仅创建会话（不提供firstMessage）...');
  try {
    const simpleCreateResponse = await axios.post(`${BASE_URL}/api/conversation`, {
      userId: TEST_USER_ID,
      title: '测试会话（无首条消息）'
    });
    
    if (simpleCreateResponse.data.success) {
      const simpleConv = simpleCreateResponse.data.data.conversation;
      console.log(`✅ 仅创建会话成功: ${simpleConv.title}`);
      console.log(`   - 会话ID: ${simpleConv.id}`);
      console.log(`   - 消息数量: ${simpleConv.messageCount}`);
      console.log(`   - 任务数量: ${simpleConv.taskCount}`);
    } else {
      console.error('❌ 仅创建会话失败:', simpleCreateResponse.data.message);
    }
  } catch (error) {
    console.error('❌ 仅创建会话异常:', error.message);
  }

  // 9. 测试获取会话列表
  console.log('\n📋 测试获取会话列表...');
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
  console.log('📝 总结：');
  console.log('   - 创建会话时只生成标题，不处理消息内容');
  console.log('   - 消息处理通过单独的发送消息接口完成');
  console.log('   - 避免了消息重复存储的问题');
}

// 运行测试
testNonStreamConversationCreation().catch(console.error); 