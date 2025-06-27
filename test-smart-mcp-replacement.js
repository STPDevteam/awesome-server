const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function testSmartMCPReplacement() {
  try {
    console.log('🚀 开始测试智能MCP替换功能...\n');
    
    // 1. 创建一个测试任务
    console.log('📝 步骤1: 创建测试任务');
    const createTaskResponse = await axios.post(`${API_BASE}/tasks`, {
      content: '获取比特币当前价格和市场分析',
      userId: 'test-user-smart-replacement'
    });
    
    const taskId = createTaskResponse.data.task.id;
    console.log(`✅ 任务创建成功，ID: ${taskId}\n`);
    
    // 2. 执行任务分析生成工作流
    console.log('📊 步骤2: 执行任务分析生成工作流');
    const analyzeResponse = await axios.post(`${API_BASE}/tasks/${taskId}/analyze-stream`, {
      userId: 'test-user-smart-replacement'
    }, {
      responseType: 'stream'
    });
    
    // 等待分析完成并收集结果
    const originalAnalysisResult = await new Promise((resolve, reject) => {
      let analysisResult = null;
      
      analyzeResponse.data.on('data', (chunk) => {
        const data = chunk.toString();
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const eventData = JSON.parse(line.substring(6));
              if (eventData.event === 'analysis_complete') {
                analysisResult = eventData.data;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
      
      analyzeResponse.data.on('end', () => {
        if (analysisResult) {
          resolve(analysisResult);
        } else {
          reject(new Error('分析未完成或结果格式错误'));
        }
      });
      
      analyzeResponse.data.on('error', reject);
    });
    
    console.log(`✅ 原始任务分析完成`);
    console.log(`📋 原始工作流包含 ${originalAnalysisResult.mcpWorkflow.mcps.length} 个MCP`);
    console.log(`🔧 原始工作流步骤数: ${originalAnalysisResult.mcpWorkflow.workflow.length}`);
    
    // 显示原始MCP列表
    const originalMcps = originalAnalysisResult.mcpWorkflow.mcps.map(mcp => mcp.name);
    console.log(`📦 原始MCP列表: ${originalMcps.join(', ')}\n`);
    
    // 3. 获取第一个MCP的替代选项
    if (originalMcps.length === 0) {
      console.log('❌ 没有MCP可以替换，测试终止');
      return;
    }
    
    const targetMcp = originalMcps[0];
    console.log(`🔍 步骤3: 获取 ${targetMcp} 的替代选项`);
    
    const alternativesResponse = await axios.get(`${API_BASE}/tasks/${taskId}/mcp-alternatives/${targetMcp}`, {
      params: { userId: 'test-user-smart-replacement' }
    });
    
    const alternatives = alternativesResponse.data.data.alternatives;
    console.log(`✅ 找到 ${alternatives.length} 个替代选项`);
    
    if (alternatives.length === 0) {
      console.log('❌ 没有找到替代选项，测试终止');
      return;
    }
    
    // 选择第一个替代选项进行替换
    const replacementMcp = alternatives[0].name;
    console.log(`🔄 选择替换: ${targetMcp} -> ${replacementMcp}\n`);
    
    // 4. 执行智能替换
    console.log('🔄 步骤4: 执行智能MCP替换');
    const replacementResponse = await axios.post(`${API_BASE}/tasks/${taskId}/replace-mcp-smart`, {
      originalMcpName: targetMcp,
      newMcpName: replacementMcp,
      userId: 'test-user-smart-replacement'
    });
    
    if (!replacementResponse.data.success) {
      console.log(`❌ MCP替换失败: ${replacementResponse.data.message}`);
      return;
    }
    
    const replacementResult = replacementResponse.data.data;
    console.log(`✅ MCP替换成功: ${replacementResult.message}`);
    
    // 5. 验证替换后的格式是否与原始分析一致
    console.log('\n🔍 步骤5: 验证返回格式一致性');
    
    // 检查必要字段
    const requiredFields = ['taskId', 'mcpWorkflow', 'metadata'];
    const missingFields = requiredFields.filter(field => !replacementResult.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      console.log(`❌ 缺少必要字段: ${missingFields.join(', ')}`);
      return;
    }
    
    // 检查mcpWorkflow结构
    const mcpWorkflow = replacementResult.mcpWorkflow;
    if (!mcpWorkflow.mcps || !mcpWorkflow.workflow) {
      console.log('❌ mcpWorkflow结构不完整');
      return;
    }
    
    // 检查metadata结构
    const metadata = replacementResult.metadata;
    const requiredMetadataFields = ['totalSteps', 'requiresAuth', 'mcpsRequiringAuth'];
    const missingMetadataFields = requiredMetadataFields.filter(field => !metadata.hasOwnProperty(field));
    
    if (missingMetadataFields.length > 0) {
      console.log(`❌ metadata缺少必要字段: ${missingMetadataFields.join(', ')}`);
      return;
    }
    
    console.log('✅ 返回格式验证通过');
    
    // 6. 详细比较原始分析和替换后的结果
    console.log('\n📊 步骤6: 详细结果对比');
    
    console.log('=== 原始分析结果 ===');
    console.log(`MCP数量: ${originalAnalysisResult.mcpWorkflow.mcps.length}`);
    console.log(`工作流步骤: ${originalAnalysisResult.mcpWorkflow.workflow.length}`);
    console.log(`需要认证: ${originalAnalysisResult.metadata.requiresAuth}`);
    console.log(`需要认证的MCP: ${originalAnalysisResult.metadata.mcpsRequiringAuth.join(', ') || '无'}`);
    
    console.log('\n=== 替换后结果 ===');
    console.log(`MCP数量: ${mcpWorkflow.mcps.length}`);
    console.log(`工作流步骤: ${mcpWorkflow.workflow.length}`);
    console.log(`需要认证: ${metadata.requiresAuth}`);
    console.log(`需要认证的MCP: ${metadata.mcpsRequiringAuth.join(', ') || '无'}`);
    
    // 7. 验证MCP替换是否成功
    const newMcpNames = mcpWorkflow.mcps.map(mcp => mcp.name);
    const replacementSuccess = newMcpNames.includes(replacementMcp) && !newMcpNames.includes(targetMcp);
    
    if (replacementSuccess) {
      console.log('\n✅ MCP替换验证成功: ' + targetMcp + ' 已被 ' + replacementMcp + ' 替换');
    } else {
      console.log('\n❌ MCP替换验证失败');
      console.log(`期望移除: ${targetMcp}`);
      console.log(`期望添加: ${replacementMcp}`);
      console.log(`实际MCP列表: ${newMcpNames.join(', ')}`);
    }
    
    // 8. 验证认证状态设置是否正确
    console.log('\n🔐 步骤7: 验证认证状态');
    const replacedMcp = mcpWorkflow.mcps.find(mcp => mcp.name === replacementMcp);
    if (replacedMcp) {
      const authStatusCorrect = replacedMcp.authRequired ? !replacedMcp.authVerified : replacedMcp.authVerified;
      if (authStatusCorrect) {
        console.log(`✅ 认证状态设置正确: authRequired=${replacedMcp.authRequired}, authVerified=${replacedMcp.authVerified}`);
      } else {
        console.log(`❌ 认证状态设置错误: authRequired=${replacedMcp.authRequired}, authVerified=${replacedMcp.authVerified}`);
      }
    }
    
    console.log('\n🎉 智能MCP替换功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
testSmartMCPReplacement(); 