const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';

// Test configuration
const TEST_CONFIG = {
  userId: 'user_1750823953894_l3vgsuzo7',
  agentId: '33fd43cd-7dc8-4987-a416-5bc8bcdff14a', // Example Agent ID
  testQueries: [
    'Get the current price of Bitcoin',
    'Search for information about Ethereum',
    'Show me the latest news about cryptocurrency',
    'Find the GitHub repository for React',
    'What is the weather like today?'
  ]
};

async function testAgentDynamicWorkflow() {
  console.log('🧪 Testing Agent Dynamic Workflow Generation...\n');

  try {
    // Step 1: Initialize Agent conversation
    console.log('📝 Step 1: Initializing Agent conversation...');
    const initResponse = await fetch(`${BASE_URL}/api/agent/${TEST_CONFIG.agentId}/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_CONFIG.userId}`
      }
    });

    const initResult = await initResponse.json();
    console.log('Init result:', JSON.stringify(initResult, null, 2));

    if (!initResult.success) {
      if (initResult.needsAuth) {
        console.log('❌ MCP authentication required. Please authenticate first.');
        console.log('Missing auth:', initResult.missingAuth);
        return;
      }
      throw new Error(`Failed to initialize Agent: ${initResult.message}`);
    }

    const conversationId = initResult.data.conversationId;
    console.log(`✅ Conversation initialized: ${conversationId}\n`);

    // Step 2: Test dynamic workflow with different queries
    for (let i = 0; i < TEST_CONFIG.testQueries.length; i++) {
      const query = TEST_CONFIG.testQueries[i];
      console.log(`📝 Step 2.${i + 1}: Testing dynamic workflow with query: "${query}"`);

      try {
        const messageResponse = await fetch(`${BASE_URL}/api/agent-conversation/${conversationId}/message/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_CONFIG.userId}`
          },
          body: JSON.stringify({
            content: query
          })
        });

        if (!messageResponse.ok) {
          throw new Error(`HTTP ${messageResponse.status}: ${messageResponse.statusText}`);
        }

        console.log('📡 Receiving streaming response...');
        
        // Process streaming response
        const reader = messageResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let workflowDetected = false;
        let executionSteps = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.event === 'workflow_applying') {
                  workflowDetected = true;
                  console.log('🔄 Dynamic workflow generation detected');
                }
                
                if (data.event === 'step_start') {
                  executionSteps.push({
                    step: data.data.step,
                    mcpName: data.data.mcpName,
                    actionName: data.data.actionName,
                    input: data.data.input
                  });
                  console.log(`📍 Step ${data.data.step}: ${data.data.mcpName} - ${data.data.actionName}`);
                }
                
                if (data.event === 'step_complete') {
                  console.log(`✅ Step ${data.data.step} completed successfully`);
                }
                
                if (data.event === 'workflow_complete') {
                  console.log(`🎉 Workflow completed with success: ${data.data.success}`);
                }
                
                if (data.event === 'final_result') {
                  console.log('📋 Final result received');
                }
                
                if (data.event === 'stream_complete') {
                  console.log('✅ Stream completed\n');
                  break;
                }
                
                if (data.event === 'error') {
                  console.error(`❌ Error: ${data.data.message}`);
                  if (data.data.details) {
                    console.error(`Details: ${data.data.details}`);
                  }
                }
              } catch (parseError) {
                // Ignore parse errors for partial data
              }
            }
          }
        }

        console.log(`📊 Query Analysis Results for: "${query}"`);
        console.log(`- Workflow detected: ${workflowDetected}`);
        console.log(`- Execution steps: ${executionSteps.length}`);
        if (executionSteps.length > 0) {
          console.log('- Steps executed:');
          executionSteps.forEach(step => {
            console.log(`  ${step.step}. ${step.mcpName}: ${step.actionName}`);
          });
        }
        console.log('');

      } catch (queryError) {
        console.error(`❌ Failed to test query "${query}":`, queryError.message);
        console.log('');
      }

      // Wait between queries
      if (i < TEST_CONFIG.testQueries.length - 1) {
        console.log('⏳ Waiting 2 seconds before next query...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Helper function to create readable delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  testAgentDynamicWorkflow().catch(console.error);
}

module.exports = {
  testAgentDynamicWorkflow
}; 