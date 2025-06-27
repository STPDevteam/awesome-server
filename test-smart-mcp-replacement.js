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
    
    // 等待分析完成
    await new Promise((resolve) => {
      analyzeResponse.data.on('data', (chunk) => {
        const data = chunk.toString();
        if (data.includes('[DONE]')) {
          resolve();
        }
      });
    });
    
    // 3. 获取分析后的任务信息
    const taskResponse = await axios.get(`${API_BASE}/tasks/${taskId}?userId=test-user-smart-replacement`);
    const task = taskResponse.data.data.task;
    
    if (!task.mcpWorkflow || !task.mcpWorkflow.mcps || task.mcpWorkflow.mcps.length === 0) {
      console.log('❌ 任务分析失败，没有生成工作流');
      return;
    }
    
    console.log(`✅ 任务分析完成，生成了 ${task.mcpWorkflow.mcps.length} 个MCP的工作流`);
    console.log('当前MCP列表:', task.mcpWorkflow.mcps.map(mcp => mcp.name).join(', '));
    console.log('当前工作流步骤数:', task.mcpWorkflow.workflow.length);
    console.log('');
    
    // 选择第一个MCP进行替换测试
    const originalMcp = task.mcpWorkflow.mcps[0];
    console.log(`🔄 步骤3: 测试替换MCP "${originalMcp.name}"`);
    
    // 4. 获取替代选项（增强版）
    console.log('🔍 步骤4: 获取智能替代选项');
    const alternativesResponse = await axios.get(
      `${API_BASE}/tasks/${taskId}/mcp-alternatives/${originalMcp.name}?userId=test-user-smart-replacement`
    );
    
    const alternatives = alternativesResponse.data.data.alternatives;
    console.log(`✅ 找到 ${alternatives.length} 个替代选项:`);
    alternatives.forEach((alt, index) => {
      console.log(`   ${index + 1}. ${alt.name} - ${alt.description} (类别: ${alt.category})`);
    });
    console.log('');
    
    if (alternatives.length === 0) {
      console.log('❌ 没有找到替代选项，无法继续测试');
      return;
    }
    
    // 选择第一个替代选项进行测试
    const newMcp = alternatives[0];
    console.log(`🎯 选择替代MCP: ${newMcp.name}`);
    
    // 5. 验证替换的合理性
    console.log('🔬 步骤5: 验证MCP替换的合理性');
    const validationResponse = await axios.post(`${API_BASE}/tasks/${taskId}/validate-mcp-replacement`, {
      originalMcpName: originalMcp.name,
      newMcpName: newMcp.name,
      userId: 'test-user-smart-replacement'
    });
    
    const validation = validationResponse.data.data.validation;
    console.log(`✅ 验证结果:`);
    console.log(`   - 是否有效: ${validation.isValid ? '是' : '否'}`);
    console.log(`   - 置信度: ${validation.confidence}%`);
    console.log(`   - 支持理由: ${validation.reasons.join(', ')}`);
    if (validation.warnings.length > 0) {
      console.log(`   - 警告: ${validation.warnings.join(', ')}`);
    }
    console.log('');
    
    // 6. 执行智能替换
    if (validation.isValid && validation.confidence > 50) {
      console.log('🚀 步骤6: 执行智能MCP替换和重新分析');
      const replacementResponse = await axios.post(`${API_BASE}/tasks/${taskId}/replace-mcp-smart`, {
        originalMcpName: originalMcp.name,
        newMcpName: newMcp.name,
        userId: 'test-user-smart-replacement'
      });
      
      if (replacementResponse.data.success) {
        const result = replacementResponse.data.data;
        console.log(`✅ 替换成功: ${result.message}`);
        console.log(`新工作流包含 ${result.newWorkflow.mcps.length} 个MCP`);
        console.log('新MCP列表:', result.newWorkflow.mcps.map(mcp => mcp.name).join(', '));
        console.log(`新工作流步骤数: ${result.newWorkflow.workflow.length}`);
        
        // 7. 验证替换后的任务状态
        console.log('\n🔍 步骤7: 验证替换后的任务状态');
        const updatedTaskResponse = await axios.get(`${API_BASE}/tasks/${taskId}?userId=test-user-smart-replacement`);
        const updatedTask = updatedTaskResponse.data.data.task;
        
        console.log(`✅ 任务状态: ${updatedTask.status}`);
        console.log(`MCP数量: ${updatedTask.mcpWorkflow.mcps.length}`);
        console.log('最终MCP列表:', updatedTask.mcpWorkflow.mcps.map(mcp => mcp.name).join(', '));
        
        // 检查是否成功替换
        const hasOriginalMcp = updatedTask.mcpWorkflow.mcps.some(mcp => mcp.name === originalMcp.name);
        const hasNewMcp = updatedTask.mcpWorkflow.mcps.some(mcp => mcp.name === newMcp.name);
        
        if (!hasOriginalMcp && hasNewMcp) {
          console.log(`✅ 替换验证成功: ${originalMcp.name} -> ${newMcp.name}`);
        } else {
          console.log(`❌ 替换验证失败: 原MCP仍存在(${hasOriginalMcp}), 新MCP存在(${hasNewMcp})`);
        }
        
      } else {
        console.log(`❌ 替换失败: ${replacementResponse.data.message}`);
      }
    } else {
      console.log(`⚠️ 跳过替换: 验证置信度过低 (${validation.confidence}%) 或无效`);
    }
    
    console.log('\n🎉 智能MCP替换测试完成!');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
testSmartMCPReplacement(); 