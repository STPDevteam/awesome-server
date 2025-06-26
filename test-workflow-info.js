const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function testWorkflowInfo() {
  try {
    console.log('🚀 开始测试任务分析返回的工作流信息...\n');
    
    // 1. 创建一个任务
    console.log('📝 步骤1: 创建测试任务');
    const createTaskResponse = await axios.post(`${API_BASE}/tasks`, {
      content: '获取比特币当前价格和市场分析',
      userId: 'test-user-workflow'
    });
    
    const taskId = createTaskResponse.data.task.id;
    console.log(`✅ 任务创建成功，ID: ${taskId}\n`);
    
    // 2. 执行任务分析（流式）
    console.log('📊 步骤2: 执行流式任务分析');
    
    // 监听流式响应
    const analyzeResponse = await axios.post(`${API_BASE}/tasks/${taskId}/analyze-stream`, {}, {
      responseType: 'stream'
    });
    
    let analysisComplete = false;
    let finalWorkflow = null;
    
    return new Promise((resolve, reject) => {
      analyzeResponse.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.event === 'analysis_complete') {
                console.log('🎉 任务分析完成！');
                finalWorkflow = data.data.mcpWorkflow;
                analysisComplete = true;
                
                // 检查工作流信息完整性
                console.log('\n📋 检查工作流信息完整性:');
                console.log('='.repeat(50));
                
                if (finalWorkflow && finalWorkflow.mcps) {
                  finalWorkflow.mcps.forEach((mcp, index) => {
                    console.log(`\n🔧 MCP ${index + 1}: ${mcp.name}`);
                    console.log(`   描述: ${mcp.description || '❌ 缺失'}`);
                    console.log(`   分类: ${mcp.category || '❌ 缺失'}`);
                    console.log(`   图标: ${mcp.imageUrl ? '✅ 存在' : '❌ 缺失'}`);
                    console.log(`   GitHub: ${mcp.githubUrl ? '✅ 存在' : '❌ 缺失'}`);
                    console.log(`   需要认证: ${mcp.authRequired ? '是' : '否'}`);
                    console.log(`   认证状态: ${mcp.authVerified ? '已验证' : '未验证'}`);
                    
                    if (mcp.authRequired && mcp.authParams) {
                      console.log(`   认证参数: ✅ 存在`);
                    } else if (mcp.authRequired) {
                      console.log(`   认证参数: ❌ 缺失`);
                    }
                  });
                  
                  console.log(`\n📊 工作流步骤数: ${finalWorkflow.workflow ? finalWorkflow.workflow.length : 0}`);
                  if (finalWorkflow.workflow && finalWorkflow.workflow.length > 0) {
                    finalWorkflow.workflow.forEach((step, index) => {
                      console.log(`   步骤 ${step.step}: ${step.mcp} - ${step.action}`);
                    });
                  }
                  
                } else {
                  console.log('❌ 工作流信息缺失');
                }
                
                console.log('\n' + '='.repeat(50));
                resolve(finalWorkflow);
              } else if (data.event === 'step_complete') {
                console.log(`✅ 步骤完成: ${data.data.stepType}`);
              } else if (data.event === 'error') {
                console.error('❌ 分析出错:', data.data.message);
                reject(new Error(data.data.message));
              }
            } catch (parseError) {
              // 忽略解析错误，可能是不完整的数据
            }
          }
        }
      });
      
      analyzeResponse.data.on('end', () => {
        if (!analysisComplete) {
          reject(new Error('分析未完成'));
        }
      });
      
      analyzeResponse.data.on('error', (error) => {
        reject(error);
      });
      
      // 设置超时
      setTimeout(() => {
        if (!analysisComplete) {
          reject(new Error('分析超时'));
        }
      }, 30000);
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
    throw error;
  }
}

// 运行测试
testWorkflowInfo()
  .then((workflow) => {
    console.log('\n🎉 测试完成！');
    
    // 输出完整的工作流信息用于验证
    console.log('\n📄 完整工作流信息:');
    console.log(JSON.stringify(workflow, null, 2));
  })
  .catch((error) => {
    console.error('\n💥 测试失败:', error.message);
    process.exit(1);
  }); 