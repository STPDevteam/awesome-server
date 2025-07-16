const { AgentConversationService } = require('../src/services/agentConversationService.js');

// Test Agent conversation title cleaning
function testAgentConversationTitleCleaning() {
  console.log('🧪 Testing Agent conversation title cleaning...');
  
  // Test cases
  const testCases = [
    {
      input: 'Cryptocurrency Price Analysis 🤖[agent-123]',
      expected: 'Cryptocurrency Price Analysis',
      description: 'New format with emoji identifier'
    },
    {
      input: '[AGENT:agent-456] GitHub Repository Setup',
      expected: 'GitHub Repository Setup',
      description: 'Old format with prefix identifier'
    },
    {
      input: 'Chat with Social Media Agent 🤖[agent-789]',
      expected: 'Chat with Social Media Agent',
      description: 'Agent chat format'
    },
    {
      input: 'Regular conversation title',
      expected: 'Regular conversation title',
      description: 'Regular conversation (no change)'
    },
    {
      input: 'Market Research Assistant 🤖[very-long-agent-id-123-456]',
      expected: 'Market Research Assistant',
      description: 'Long agent ID'
    }
  ];
  
  let passed = 0;
  let total = testCases.length;
  
  testCases.forEach((testCase, index) => {
    const result = AgentConversationService.cleanAgentConversationTitle(testCase.input);
    const success = result === testCase.expected;
    
    console.log(`Test ${index + 1}: ${testCase.description}`);
    console.log(`  Input: "${testCase.input}"`);
    console.log(`  Expected: "${testCase.expected}"`);
    console.log(`  Got: "${result}"`);
    console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
    
    if (success) passed++;
  });
  
  console.log(`📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testAgentConversationTitleCleaning();
} 