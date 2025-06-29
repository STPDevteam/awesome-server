import { IntelligentWorkflowEngine } from '../dist/services/intelligentWorkflowEngine.js';

async function testSimpleWorkflow() {
  console.log('🚀 测试简化版智能工作流引擎...');

  try {
    // 创建工作流引擎实例
    const engine = new IntelligentWorkflowEngine();
    
    console.log('✅ 工作流引擎创建成功');

    // 测试 ElizaOS vs CrewAI 比较任务
    const taskId = 'eliza-crew-comparison-' + Date.now();
    const query = '比较 ElizaOS 与 CrewAI 后，选出更适合在 Cursor IDE 中落地的那个，并仅输出一段 Markdown 指南：用 3 步（① git clone 仓库，② 安装依赖，③ 运行示例脚本）告诉用户如何在 Cursor 里跑通；示例命令放在代码块内，除此之外不输出任何多余内容。';

    console.log(`📋 开始执行任务: ${query.substring(0, 100)}...`);

    // 执行工作流 - 只需要 3 个迭代就够了
    const result = await engine.executeWorkflow(taskId, query, 3);

    console.log('🎉 工作流执行完成!');
    
    // 输出最终结果
    if (result.executionHistory && result.executionHistory.length > 0) {
      const lastStep = result.executionHistory[result.executionHistory.length - 1];
      if (lastStep.result && lastStep.result.content) {
        console.log('\n📄 最终输出结果:');
        console.log('=' .repeat(50));
        console.log(lastStep.result.content);
        console.log('=' .repeat(50));
      }
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testSimpleWorkflow().catch(console.error); 