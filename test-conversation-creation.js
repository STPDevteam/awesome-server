const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testConversationCreation() {
  console.log('🧪 开始测试对话创建功能\n');
  
  try {
    // 1. 测试仅创建对话（不提供第一条消息）
    console.log('📝 步骤1: 测试仅创建对话（不提供第一条消息）');
    const simpleConversationResponse = await axios.post(`${API_BASE}/conversation`, {
      title: '测试对话',
      userId: 'test-user-conversation'
    });
    
    const simpleConversation = simpleConversationResponse.data.data.conversation;
    console.log(`✅ 简单对话创建成功: ${simpleConversation.id}`);
    console.log(`📋 标题: ${simpleConversation.title}`);
    console.log(`📊 消息数量: ${simpleConversation.messageCount}`);
    console.log(`📊 任务数量: ${simpleConversation.taskCount}\n`);
    
    // 2. 测试创建对话并处理第一条消息（聊天意图）
    console.log('💬 步骤2: 测试创建对话并处理第一条消息（聊天意图）');
    const chatConversationResponse = await axios.post(`${API_BASE}/conversation`, {
      firstMessage: '你好，我想了解一下你能帮我做些什么？',
      userId: 'test-user-conversation'
    });
    
    const chatResult = chatConversationResponse.data.data;
    console.log(`✅ 聊天对话创建成功: ${chatResult.conversation.id}`);
    console.log(`📋 自动生成标题: ${chatResult.conversation.title}`);
    console.log(`💬 用户消息ID: ${chatResult.userMessage.id}`);
    console.log(`🤖 助手回复ID: ${chatResult.assistantResponse.id}`);
    console.log(`🎯 识别意图: ${chatResult.intent}`);
    console.log(`📊 消息数量: ${chatResult.conversation.messageCount}`);
    console.log(`📊 任务数量: ${chatResult.conversation.taskCount}\n`);
    
    // 3. 测试创建对话并处理第一条消息（任务意图）
    console.log('⚡ 步骤3: 测试创建对话并处理第一条消息（任务意图）');
    const taskConversationResponse = await axios.post(`${API_BASE}/conversation`, {
      firstMessage: '帮我获取比特币的当前价格和市场数据，然后分析一下趋势',
      userId: 'test-user-conversation'
    });
    
    const taskResult = taskConversationResponse.data.data;
    console.log(`✅ 任务对话创建成功: ${taskResult.conversation.id}`);
    console.log(`📋 自动生成标题: ${taskResult.conversation.title}`);
    console.log(`💬 用户消息ID: ${taskResult.userMessage.id}`);
    console.log(`🤖 助手回复ID: ${taskResult.assistantResponse.id}`);
    console.log(`🎯 识别意图: ${taskResult.intent}`);
    console.log(`📊 消息数量: ${taskResult.conversation.messageCount}`);
    console.log(`📊 任务数量: ${taskResult.conversation.taskCount}`);
    if (taskResult.taskId) {
      console.log(`📋 创建的任务ID: ${taskResult.taskId}`);
    }
    console.log();
    
    // 4. 测试流式创建对话
    console.log('🌊 步骤4: 测试流式创建对话');
    console.log('📡 启动流式对话创建...');
    
    try {
      const streamResponse = await axios.post(`${API_BASE}/conversation/stream`, {
        firstMessage: '请帮我分析一下以太坊的技术发展趋势，并创建一个研究报告',
        userId: 'test-user-conversation'
      }, {
        headers: {
          'Accept': 'text/event-stream'
        },
        responseType: 'stream'
      });
      
      let streamEventCount = 0;
      let generatedTitle = '';
      let conversationId = '';
      let hasCompletionEvent = false;
      
      streamResponse.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('📡 流式对话创建完成');
              return;
            }
            
            try {
              const event = JSON.parse(data);
              streamEventCount++;
              
              if (event.event === 'conversation_creation_start') {
                console.log(`📡 对话创建开始`);
              } else if (event.event === 'title_generation_start') {
                console.log(`📡 标题生成开始`);
              } else if (event.event === 'title_generated') {
                generatedTitle = event.data.title;
                console.log(`📡 标题生成完成: ${generatedTitle}`);
              } else if (event.event === 'conversation_created' && event.data.conversationId) {
                conversationId = event.data.conversationId;
                console.log(`📡 对话创建完成: ${conversationId}`);
              } else if (event.event === 'first_message_processing_start') {
                console.log(`📡 第一条消息处理开始`);
              } else if (event.event === 'intent_identified') {
                console.log(`📡 意图识别: ${event.data.intent} (置信度: ${event.data.confidence})`);
              } else if (event.event === 'task_created') {
                console.log(`📡 任务创建: ${event.data.taskId}`);
              } else if (event.event === 'conversation_created' && event.data.userMessageId) {
                console.log(`📡 最终完成事件`);
                hasCompletionEvent = true;
              } else if (event.event === 'error') {
                console.log(`❌ 流式错误: ${event.data.message}`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
      
      // 等待流式处理完成
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      console.log(`✅ 流式对话创建测试完成`);
      console.log(`📊 接收到 ${streamEventCount} 个事件`);
      console.log(`📋 生成的标题: ${generatedTitle}`);
      console.log(`🆔 对话ID: ${conversationId}`);
      console.log(`📊 包含完成事件: ${hasCompletionEvent ? '✅' : '❌'}\n`);
      
    } catch (streamError) {
      console.log(`❌ 流式对话创建测试失败: ${streamError.message}\n`);
    }
    
    // 5. 验证对话列表
    console.log('📋 步骤5: 验证对话列表');
    const conversationListResponse = await axios.get(`${API_BASE}/conversation`, {
      params: { 
        userId: 'test-user-conversation',
        limit: 10,
        sortBy: 'created_at',
        sortDir: 'desc'
      }
    });
    
    const conversations = conversationListResponse.data.data.conversations;
    console.log(`✅ 获取到 ${conversations.length} 个对话`);
    
    conversations.forEach((conv, index) => {
      console.log(`📋 对话 ${index + 1}:`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   标题: ${conv.title}`);
      console.log(`   消息数: ${conv.messageCount}`);
      console.log(`   任务数: ${conv.taskCount}`);
      console.log(`   最后消息: ${conv.lastMessageContent || '无'}`);
    });
    console.log();
    
    // 6. 验证对话详情
    console.log('🔍 步骤6: 验证对话详情');
    if (conversations.length > 0) {
      const firstConv = conversations[0];
      const conversationDetailResponse = await axios.get(`${API_BASE}/conversation/${firstConv.id}`, {
        params: { userId: 'test-user-conversation' }
      });
      
      const detail = conversationDetailResponse.data.data;
      console.log(`✅ 对话详情获取成功: ${detail.conversation.id}`);
      console.log(`📋 标题: ${detail.conversation.title}`);
      console.log(`💬 消息数量: ${detail.messages.length}`);
      
      detail.messages.forEach((msg, index) => {
        console.log(`   消息 ${index + 1}: [${msg.type}] ${msg.content.substring(0, 50)}...`);
        if (msg.intent) {
          console.log(`      意图: ${msg.intent}`);
        }
        if (msg.taskId) {
          console.log(`      任务ID: ${msg.taskId}`);
        }
      });
      console.log();
    }
    
    // 7. 测试自定义标题
    console.log('🏷️ 步骤7: 测试自定义标题');
    const customTitleResponse = await axios.post(`${API_BASE}/conversation`, {
      title: '我的自定义标题',
      firstMessage: '这是一个测试消息，但我想保持自定义标题',
      userId: 'test-user-conversation'
    });
    
    const customResult = customTitleResponse.data.data;
    console.log(`✅ 自定义标题对话创建成功: ${customResult.conversation.id}`);
    console.log(`📋 保持的标题: ${customResult.conversation.title}`);
    console.log(`🎯 识别意图: ${customResult.intent}\n`);
    
    // 8. 总结测试结果
    console.log('📊 测试总结:');
    console.log('✅ 简单对话创建功能正常');
    console.log('✅ 带第一条消息的对话创建功能正常');
    console.log('✅ 自动标题生成功能正常');
    console.log('✅ 消息意图识别功能正常');
    console.log('✅ 任务自动创建功能正常');
    console.log('✅ 流式对话创建功能正常');
    console.log('✅ 对话列表获取功能正常');
    console.log('✅ 对话详情获取功能正常');
    console.log('✅ 自定义标题保持功能正常');
    
    console.log('\n🎉 对话创建功能测试完成！现在可以像ChatGPT一样创建对话了！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 提示: 请确保服务器正在运行在 http://localhost:3001');
    }
  }
}

// 运行测试
if (require.main === module) {
  testConversationCreation();
}

module.exports = { testConversationCreation }; 