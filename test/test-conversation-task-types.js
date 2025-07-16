const { ConversationType } = require('../src/models/conversation.js');

// 测试数据
const testData = {
  conversations: [
    {
      id: 'conv-1',
      title: 'Regular Chat',
      type: ConversationType.NORMAL,
      agentId: null
    },
    {
      id: 'conv-2', 
      title: 'Crypto Analysis Discussion',
      type: ConversationType.AGENT,
      agentId: 'agent-123'
    }
  ],
  tasks: [
    {
      id: 'task-1',
      title: '【流程】Analyze market trends',
      taskType: 'mcp',
      agentId: null
    },
    {
      id: 'task-2',
      title: '【机器人】Generate crypto report',
      taskType: 'agent',
      agentId: 'agent-123'
    }
  ]
};

// 测试会话类型区分
function testConversationTypes() {
  console.log('🧪 Testing conversation types...');
  
  testData.conversations.forEach(conv => {
    console.log(`Conversation ${conv.id}:`);
    console.log(`  Title: ${conv.title}`);
    console.log(`  Type: ${conv.type}`);
    console.log(`  Agent ID: ${conv.agentId || 'None'}`);
    console.log(`  Is Agent Conversation: ${conv.type === ConversationType.AGENT}`);
    console.log('');
  });
}

// 测试任务标签
function testTaskTags() {
  console.log('🧪 Testing task tags...');
  
  testData.tasks.forEach(task => {
    console.log(`Task ${task.id}:`);
    console.log(`  Title: ${task.title}`);
    console.log(`  Type: ${task.taskType}`);
    console.log(`  Agent ID: ${task.agentId || 'None'}`);
    
    // 验证标签
    if (task.taskType === 'mcp' && task.title.startsWith('【流程】')) {
      console.log(`  ✅ Correct MCP task tag`);
    } else if (task.taskType === 'agent' && task.title.startsWith('【机器人】')) {
      console.log(`  ✅ Correct Agent task tag`);
    } else {
      console.log(`  ❌ Incorrect or missing task tag`);
    }
    console.log('');
  });
}

// 测试前端识别逻辑
function testFrontendIdentification() {
  console.log('🧪 Testing frontend identification logic...');
  
  // 模拟前端如何识别会话类型
  console.log('Frontend conversation type identification:');
  testData.conversations.forEach(conv => {
    const isAgentConversation = conv.type === ConversationType.AGENT;
    const displayType = isAgentConversation ? 'Agent Chat' : 'Normal Chat';
    
    console.log(`  ${conv.id}: ${displayType} (${conv.type})`);
  });
  
  console.log('');
  
  // 模拟前端如何识别任务类型
  console.log('Frontend task type identification:');
  testData.tasks.forEach(task => {
    const taskTypeDisplay = task.taskType === 'agent' ? 'Agent Task' : 'MCP Task';
    const hasCorrectTag = (task.taskType === 'mcp' && task.title.includes('【流程】')) ||
                         (task.taskType === 'agent' && task.title.includes('【机器人】'));
    
    console.log(`  ${task.id}: ${taskTypeDisplay} - Tag: ${hasCorrectTag ? '✅' : '❌'}`);
  });
}

// 运行所有测试
function runTests() {
  console.log('🚀 Running conversation and task type tests...\n');
  
  testConversationTypes();
  testTaskTags();
  testFrontendIdentification();
  
  console.log('✅ All tests completed!');
}

// 如果直接运行此脚本，则执行测试
if (require.main === module) {
  runTests();
}

module.exports = {
  testConversationTypes,
  testTaskTags,
  testFrontendIdentification,
  runTests
}; 