import { IntelligentWorkflowEngine } from '../dist/services/intelligentWorkflowEngine.js';

async function testIntelligentWorkflow() {
  console.log('🚀 测试智能工作流引擎...');

  try {
    // 创建工作流引擎实例
    const engine = new IntelligentWorkflowEngine();
    
    console.log('✅ 工作流引擎创建成功');

    // 测试简单的工作流执行
    const taskId = 'test-task-' + Date.now();
    const query = '比较 ElizaOS 与 CrewAI 后，选出更适合在 Cursor IDE 中落地的那个，并仅输出一段 Markdown 指南：用 3 步（① git clone 仓库，② 安装依赖，③ 运行示例脚本）告诉用户如何在 Cursor 里跑通；示例命令放在代码块内，除此之外不输出任何多余内容。';

    console.log(`📋 开始执行任务: ${query}`);

    // 执行工作流
    const result = await engine.executeWorkflow(taskId, query, 5);

    console.log('🎉 工作流执行完成!');
    console.log('📊 执行结果:', JSON.stringify(result, null, 2));

    // 测试流式执行
    console.log('\n🌊 测试流式执行...');
    
    const streamTaskId = 'stream-task-' + Date.now();
    const streamQuery = '帮我分析一下人工智能的发展趋势';

    for await (const event of engine.executeWorkflowStream(streamTaskId, streamQuery, 2)) {
      console.log(`📡 事件: ${event.event}`, event.data);
    }

    console.log('✅ 流式执行测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
testIntelligentWorkflow().catch(console.error); 