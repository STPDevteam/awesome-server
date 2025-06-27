const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-user-123';

async function testMessageDuplication() {
  try {
    console.log('🧪 Testing message duplication fix...\n');

    // 步骤1: 创建会话
    console.log('📝 Step 1: Creating conversation...');
    const createConversationResponse = await axios.post(`${BASE_URL}/api/conversation`, {
      userId: TEST_USER_ID,
      firstMessage: '帮我查询一下比特币的行情'
    });

    if (!createConversationResponse.data.success) {
      throw new Error('Failed to create conversation');
    }

    const conversationId = createConversationResponse.data.data.conversation.id;
    console.log(`✅ Conversation created: ${conversationId}`);
    console.log(`✅ Generated title: ${createConversationResponse.data.data.generatedTitle}\n`);

    // 步骤2: 发送第一条消息
    console.log('💬 Step 2: Sending first message...');
    const sendMessageResponse = await axios.post(`${BASE_URL}/api/conversation/${conversationId}/message`, {
      userId: TEST_USER_ID,
      content: '帮我查询一下比特币的行情'
    });

    if (!sendMessageResponse.data.success) {
      throw new Error('Failed to send message');
    }

    console.log('✅ Message sent successfully');
    console.log(`📥 User message: ${sendMessageResponse.data.data.userMessage.content}`);
    console.log(`🤖 Assistant response: ${sendMessageResponse.data.data.assistantResponse.content}`);
    console.log(`🎯 Intent: ${sendMessageResponse.data.data.intent}`);
    console.log(`📋 Task ID: ${sendMessageResponse.data.data.taskId || 'None'}\n`);

    // 步骤3: 获取对话消息列表，检查是否有重复
    console.log('📋 Step 3: Checking conversation messages...');
    const getMessagesResponse = await axios.get(`${BASE_URL}/api/conversation/${conversationId}`, {
      params: { userId: TEST_USER_ID }
    });

    if (!getMessagesResponse.data.success) {
      throw new Error('Failed to get conversation messages');
    }

    const messages = getMessagesResponse.data.data.messages;
    console.log(`📊 Total messages in conversation: ${messages.length}`);
    
    // 分析消息内容
    console.log('\n📝 Message analysis:');
    messages.forEach((msg, index) => {
      console.log(`${index + 1}. [${msg.type.toUpperCase()}] ${msg.content}`);
      if (msg.intent) console.log(`   Intent: ${msg.intent}`);
      if (msg.taskId) console.log(`   Task ID: ${msg.taskId}`);
    });

    // 检查是否有重复的任务创建消息
    const taskCreationMessages = messages.filter(msg => 
      msg.content.includes('Task created:') || msg.content.includes('任务创建')
    );

    console.log(`\n🔍 Task creation messages found: ${taskCreationMessages.length}`);
    
    if (taskCreationMessages.length > 1) {
      console.log('❌ ISSUE: Found duplicate task creation messages!');
      taskCreationMessages.forEach((msg, index) => {
        console.log(`   ${index + 1}. [${msg.type}] ${msg.content}`);
      });
    } else if (taskCreationMessages.length === 1) {
      console.log('✅ SUCCESS: Only one task creation message found');
      console.log(`   Content: ${taskCreationMessages[0].content}`);
      
      // 检查是否包含Task ID
      if (taskCreationMessages[0].content.includes('Task ID:')) {
        console.log('❌ ISSUE: Task creation message still contains Task ID!');
      } else {
        console.log('✅ SUCCESS: Task creation message does not contain Task ID');
      }
    } else {
      console.log('⚠️  WARNING: No task creation message found');
    }

    // 检查用户消息是否重复
    const userMessages = messages.filter(msg => msg.type === 'user');
    const uniqueUserMessages = [...new Set(userMessages.map(msg => msg.content))];
    
    if (userMessages.length !== uniqueUserMessages.length) {
      console.log('❌ ISSUE: Found duplicate user messages!');
    } else {
      console.log('✅ SUCCESS: No duplicate user messages found');
    }

    console.log('\n🎉 Message duplication test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// 运行测试
testMessageDuplication(); 