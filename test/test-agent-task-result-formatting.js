const axios = require('axios');

// 测试Agent任务结果格式化功能
async function testAgentTaskResultFormatting() {
  const baseURL = 'https://api-test.awenetwork.ai';
  
  // 使用有效的JWT令牌
  const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzE3NTAzMzY5NTM3OTNfMmFvOTlyd2hoIiwid2FsbGV0QWRkcmVzcyI6IjB4NkJiNzI2QzFBNWM2YTYyOTkxMWVjRTc2NTdEMmZiMzQxNGE1QjIwMCIsImVtYWlsIjpudWxsLCJpYXQiOjE3NTIyMTUxNTcsImV4cCI6MTc1MjI1MTE1N30.dZtKGUVWDAXinO6ujKZ-CPW5Me1WKlddsALrXrfpbdM';
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🧪 Testing Agent Task Result Formatting...\n');

    // 1. 尝试使用一个现有的Agent
    const agentId = 'agent_1750252394006_g7x5fkjqp'; // 使用已知的Agent ID
    
    console.log(`📋 Step 1: Testing Agent ${agentId} with task execution...`);
    
    const agentTryResponse = await axios.post(
      `${baseURL}/api/agent/${agentId}/try`,
      {
        content: '帮我查询比特币的当前价格'
      },
      { headers }
    );

    console.log('✅ Agent Try Response Status:', agentTryResponse.status);
    
    if (agentTryResponse.data.success) {
      console.log('✅ Agent conversation created successfully');
      console.log('📞 Conversation ID:', agentTryResponse.data.data.conversation.id);
      
      // 2. 发送消息触发任务执行
      const conversationId = agentTryResponse.data.data.conversation.id;
      
      console.log('\n📋 Step 2: Sending message to trigger task execution...');
      
      const messageResponse = await axios.post(
        `${baseURL}/api/agent-conversation/${conversationId}/message`,
        {
          content: '请获取比特币的当前价格和市场分析'
        },
        { headers }
      );

      console.log('✅ Message Response Status:', messageResponse.status);
      console.log('📝 Response Data:', JSON.stringify(messageResponse.data, null, 2));
      
      if (messageResponse.data.success) {
        console.log('\n🎉 Success! Agent returned formatted task results:');
        console.log('📄 Assistant Response:');
        console.log(messageResponse.data.data.assistantMessage.content);
        
        if (messageResponse.data.data.taskId) {
          console.log('\n📋 Task ID:', messageResponse.data.data.taskId);
          
          // 3. 验证任务详情
          console.log('\n📋 Step 3: Checking task details...');
          const taskResponse = await axios.get(
            `${baseURL}/api/tasks/${messageResponse.data.data.taskId}`,
            { headers }
          );
          
          console.log('✅ Task Details Status:', taskResponse.status);
          console.log('📊 Task Result:', JSON.stringify(taskResponse.data.data.task.result, null, 2));
        }
      } else {
        console.log('❌ Message failed:', messageResponse.data);
      }
    } else {
      console.log('❌ Agent try failed:', agentTryResponse.data);
      
      if (agentTryResponse.data.needsAuth) {
        console.log('🔐 Authentication required for MCPs:', 
          agentTryResponse.data.missingAuth.map(m => m.mcpName).join(', ')
        );
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// 运行测试
testAgentTaskResultFormatting().catch(console.error); 