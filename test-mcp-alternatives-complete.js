const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000/api';
const TEST_USER_ID = 'test-user-123';

async function testCompleteAlternatives() {
  console.log('🧪 Testing Complete MCP Alternatives Feature');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Create a test task
    console.log('\n📝 Step 1: Creating test task...');
    const createResponse = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Get the current price of Bitcoin and analyze its market trends',
        userId: TEST_USER_ID
      })
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create task: ${createResponse.status}`);
    }
    
    const taskData = await createResponse.json();
    const taskId = taskData.data.id;
    console.log(`✅ Task created with ID: ${taskId}`);
    
    // Step 2: Analyze task with streaming to get complete alternatives
    console.log('\n🔍 Step 2: Analyzing task with streaming...');
    const analyzeResponse = await fetch(`${API_BASE}/tasks/${taskId}/analyze-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: TEST_USER_ID })
    });
    
    if (!analyzeResponse.ok) {
      throw new Error(`Failed to start task analysis: ${analyzeResponse.status}`);
    }
    
    // Process streaming response
    let analysisResult = null;
    const reader = analyzeResponse.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const event = JSON.parse(data);
            console.log(`📡 Event: ${event.event}`);
            
            if (event.event === 'analysis_complete') {
              analysisResult = event.data;
              console.log('✅ Analysis completed');
            }
          } catch (e) {
            // Ignore malformed JSON
          }
        }
      }
    }
    
    if (!analysisResult) {
      throw new Error('No analysis result received');
    }
    
    // Step 3: Verify complete alternatives information
    console.log('\n🔍 Step 3: Verifying complete alternatives information...');
    const mcpWorkflow = analysisResult.mcpWorkflow;
    
    if (!mcpWorkflow || !mcpWorkflow.mcps) {
      throw new Error('No MCP workflow found in analysis result');
    }
    
    console.log(`📊 Found ${mcpWorkflow.mcps.length} recommended MCPs`);
    
    let totalAlternatives = 0;
    let completeAlternatives = 0;
    
    mcpWorkflow.mcps.forEach((mcp, index) => {
      console.log(`\n🔧 MCP ${index + 1}: ${mcp.name}`);
      console.log(`   Description: ${mcp.description}`);
      console.log(`   Category: ${mcp.category || 'N/A'}`);
      console.log(`   Auth Required: ${mcp.authRequired}`);
      
      if (mcp.alternatives && mcp.alternatives.length > 0) {
        console.log(`   📋 Alternatives (${mcp.alternatives.length}):`);
        
        mcp.alternatives.forEach((alt, altIndex) => {
          totalAlternatives++;
          
          // Check if alternative has complete information
          const hasCompleteInfo = alt.name && alt.description && 
                                 typeof alt.authRequired === 'boolean' &&
                                 alt.category;
          
          if (hasCompleteInfo) {
            completeAlternatives++;
          }
          
          console.log(`     ${altIndex + 1}. ${alt.name}`);
          console.log(`        Description: ${alt.description || 'N/A'}`);
          console.log(`        Category: ${alt.category || 'N/A'}`);
          console.log(`        Auth Required: ${alt.authRequired}`);
          console.log(`        Complete Info: ${hasCompleteInfo ? '✅' : '❌'}`);
          
          if (alt.imageUrl) {
            console.log(`        Image URL: ${alt.imageUrl}`);
          }
          if (alt.githubUrl) {
            console.log(`        GitHub URL: ${alt.githubUrl}`);
          }
          if (alt.authParams) {
            console.log(`        Auth Params: ${Object.keys(alt.authParams).join(', ')}`);
          }
        });
      } else {
        console.log(`   📋 Alternatives: None`);
      }
    });
    
    // Step 4: Generate test summary
    console.log('\n📊 Test Summary:');
    console.log('=' .repeat(40));
    console.log(`Total MCPs recommended: ${mcpWorkflow.mcps.length}`);
    console.log(`Total alternatives found: ${totalAlternatives}`);
    console.log(`Complete alternatives: ${completeAlternatives}`);
    console.log(`Completion rate: ${totalAlternatives > 0 ? Math.round((completeAlternatives / totalAlternatives) * 100) : 0}%`);
    
    // Step 5: Verify data structure
    console.log('\n🔍 Step 4: Verifying data structure compliance...');
    
    let structureValid = true;
    const requiredFields = ['name', 'description', 'authRequired'];
    const optionalFields = ['category', 'imageUrl', 'githubUrl', 'authParams'];
    
    mcpWorkflow.mcps.forEach((mcp) => {
      if (mcp.alternatives) {
        mcp.alternatives.forEach((alt) => {
          // Check required fields
          requiredFields.forEach(field => {
            if (!(field in alt)) {
              console.log(`❌ Missing required field '${field}' in alternative: ${alt.name || 'Unknown'}`);
              structureValid = false;
            }
          });
          
          // Check data types
          if (typeof alt.authRequired !== 'boolean') {
            console.log(`❌ Invalid authRequired type in alternative: ${alt.name || 'Unknown'}`);
            structureValid = false;
          }
        });
      }
    });
    
    if (structureValid) {
      console.log('✅ All alternatives have valid data structure');
    } else {
      console.log('❌ Some alternatives have invalid data structure');
    }
    
    // Final result
    console.log('\n🎯 Final Result:');
    console.log('=' .repeat(40));
    
    const success = totalAlternatives > 0 && completeAlternatives === totalAlternatives && structureValid;
    
    if (success) {
      console.log('✅ SUCCESS: Complete MCP alternatives feature is working correctly!');
      console.log('   - All alternatives contain complete information');
      console.log('   - Data structure is valid');
      console.log('   - Frontend can use alternatives directly for replacement');
    } else {
      console.log('❌ ISSUES FOUND:');
      if (totalAlternatives === 0) {
        console.log('   - No alternatives were generated');
      }
      if (completeAlternatives < totalAlternatives) {
        console.log('   - Some alternatives lack complete information');
      }
      if (!structureValid) {
        console.log('   - Data structure validation failed');
      }
    }
    
    return { success, taskId, totalAlternatives, completeAlternatives };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run the test
if (require.main === module) {
  testCompleteAlternatives()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteAlternatives }; 