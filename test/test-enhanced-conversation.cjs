const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// 测试用户ID
const TEST_USER_ID = 'test-user-enhanced-conversation';

// 测试配置
const testConfig = {
  baseUrl: BASE_URL,
  userId: TEST_USER_ID,
  timeout: 30000
};

// 日志工具
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`)
};

// 延时工具
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// API 调用工具
async function apiCall(endpoint, options = {}) {
  const url = `${testConfig.baseUrl}${endpoint}`;
  const defaultOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: testConfig.timeout,
    ...options
  };

  try {
    const response = await fetch(url, defaultOptions);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.message || '未知错误'}`);
    }
    
    return data;
  } catch (error) {
    log.error(`API调用失败 ${endpoint}: ${error.message}`);
    throw error;
  }
}

// 测试：创建对话
async function testCreateConversation() {
  log.info('测试：创建对话');
  
  const response = await apiCall('/api/conversation/create', {
    body: JSON.stringify({
      userId: testConfig.userId,
      firstMessage: '你好，我是一个新用户，想要了解你的功能。',
      title: '增强对话测试'
    })
  });
  
  log.success(`对话创建成功：${response.conversation.id}`);
  return response.conversation.id;
}

// 测试：发送消息并验证记忆
async function testSendMessage(conversationId, message) {
  log.info(`测试：发送消息 - "${message}"`);
  
  const response = await apiCall('/api/conversation/message', {
    body: JSON.stringify({
      conversationId,
      content: message,
      userId: testConfig.userId
    })
  });
  
  log.success(`消息发送成功，回复：${response.response.content.substring(0, 100)}...`);
  return response;
}

// 测试：流式对话
async function testStreamConversation(conversationId, message) {
  log.info(`测试：流式对话 - "${message}"`);
  
  return new Promise((resolve, reject) => {
    const url = `${testConfig.baseUrl}/api/conversation/message/stream`;
    
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        conversationId,
        content: message,
        userId: testConfig.userId
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      let buffer = '';
      let result = null;
      
      response.body.on('data', chunk => {
        buffer += chunk.toString();
        
        // 处理SSE数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.event === 'processing_complete') {
                result = data.data;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
      
      response.body.on('end', () => {
        if (result) {
          log.success(`流式对话完成：${result.messageId}`);
          resolve(result);
        } else {
          reject(new Error('流式对话未完成'));
        }
      });
      
      response.body.on('error', reject);
    })
    .catch(reject);
  });
}

// 测试：获取对话历史
async function testGetConversationHistory(conversationId) {
  log.info('测试：获取对话历史');
  
  const response = await apiCall('/api/conversation/messages', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversationId
    })
  });
  
  log.success(`获取到 ${response.messages.length} 条历史消息`);
  return response.messages;
}

// 测试：任务创建与对话集成
async function testTaskIntegration(conversationId) {
  log.info('测试：任务创建与对话集成');
  
  const response = await testSendMessage(conversationId, 
    '请帮我搜索一下关于人工智能的最新新闻，然后总结一下主要内容。'
  );
  
  if (response.taskId) {
    log.success(`任务创建成功：${response.taskId}`);
    // 等待任务执行一段时间
    await delay(10000);
    
    // 检查任务执行后的对话历史
    const messages = await testGetConversationHistory(conversationId);
    const taskMessages = messages.filter(msg => 
      msg.taskId === response.taskId ||
      msg.content.includes('任务已创建') ||
      msg.content.includes('Executing task') ||
      msg.content.includes('execution') ||
      msg.content.includes('summary') ||
      msg.content.includes('completed')
    );
    
    log.success(`任务相关消息数量：${taskMessages.length}`);
    
    // 显示任务相关消息
    taskMessages.forEach((msg, index) => {
      log.info(`任务消息 ${index + 1}: ${msg.content.substring(0, 100)}...`);
    });
    
    return taskMessages;
  } else {
    log.warn('消息未被识别为任务');
    return [];
  }
}

// 测试：记忆持久性
async function testMemoryPersistence(conversationId) {
  log.info('测试：记忆持久性');
  
  // 发送包含个人信息的消息
  await testSendMessage(conversationId, 
    '我的名字是张三，我是一名软件工程师，喜欢编程和阅读技术文档。'
  );
  
  await delay(1000);
  
  // 发送引用之前信息的消息
  const response = await testSendMessage(conversationId, 
    '你还记得我的职业吗？我刚才有提到过吗？'
  );
  
  const remembersInfo = response.response.content.toLowerCase().includes('软件工程师') || 
                       response.response.content.toLowerCase().includes('engineer') ||
                       response.response.content.includes('张三');
  
  if (remembersInfo) {
    log.success('记忆系统工作正常，AI记住了用户信息');
  } else {
    log.warn('记忆系统可能存在问题，AI未记住用户信息');
  }
  
  return remembersInfo;
}

// 测试：上下文理解
async function testContextUnderstanding(conversationId) {
  log.info('测试：上下文理解');
  
  // 发送一个需要上下文的问题
  const response = await testSendMessage(conversationId, 
    '基于我们之前的对话，你觉得我可能对哪些技术话题感兴趣？'
  );
  
  const hasContext = response.response.content.length > 50 && 
                     (response.response.content.includes('技术') || 
                      response.response.content.includes('编程') || 
                      response.response.content.includes('软件'));
  
  if (hasContext) {
    log.success('上下文理解正常，AI能基于历史对话提供建议');
  } else {
    log.warn('上下文理解可能存在问题');
  }
  
  return hasContext;
}

// 主测试流程
async function runEnhancedConversationTest() {
  log.info('🚀 开始增强对话功能测试');
  
  try {
    // 1. 创建对话
    const conversationId = await testCreateConversation();
    await delay(1000);
    
    // 2. 基础多轮对话测试
    log.info('\n=== 基础多轮对话测试 ===');
    await testSendMessage(conversationId, '你好，我想了解一下你的功能。');
    await delay(1000);
    
    await testSendMessage(conversationId, '你能帮我做什么？');
    await delay(1000);
    
    // 3. 记忆持久性测试
    log.info('\n=== 记忆持久性测试 ===');
    const memoryWorks = await testMemoryPersistence(conversationId);
    
    // 4. 任务集成测试
    log.info('\n=== 任务集成测试 ===');
    const taskMessages = await testTaskIntegration(conversationId);
    
    // 5. 上下文理解测试
    log.info('\n=== 上下文理解测试 ===');
    const contextWorks = await testContextUnderstanding(conversationId);
    
    // 6. 流式对话测试
    log.info('\n=== 流式对话测试 ===');
    await testStreamConversation(conversationId, '请总结一下我们的对话内容。');
    
    // 7. 最终历史检查
    log.info('\n=== 最终历史检查 ===');
    const finalMessages = await testGetConversationHistory(conversationId);
    
    // 测试结果总结
    log.info('\n=== 测试结果总结 ===');
    log.success(`对话ID: ${conversationId}`);
    log.success(`总消息数: ${finalMessages.length}`);
    log.success(`任务消息数: ${taskMessages.length}`);
    log.success(`记忆系统: ${memoryWorks ? '✅ 正常' : '❌ 异常'}`);
    log.success(`上下文理解: ${contextWorks ? '✅ 正常' : '❌ 异常'}`);
    
    // 显示部分对话历史
    log.info('\n=== 部分对话历史 ===');
    finalMessages.slice(-5).forEach((msg, index) => {
      const type = msg.type === 'user' ? '用户' : '助手';
      const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
      log.info(`${index + 1}. [${type}] ${content}`);
    });
    
    log.success('\n✅ 增强对话功能测试完成！');
    
  } catch (error) {
    log.error(`测试失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  runEnhancedConversationTest();
}

module.exports = {
  runEnhancedConversationTest,
  testConfig,
  log
}; 