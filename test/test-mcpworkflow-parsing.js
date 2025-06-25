// 测试mcpWorkflow的解析
import { getTaskService } from '../src/services/taskService.js';
import { logger } from '../src/utils/logger.js';

async function testMcpWorkflowParsing() {
  try {
    console.log('开始测试mcpWorkflow的解析...');
    
    // 创建一个测试用的mcpWorkflow字符串
    const mcpWorkflowStr = `{
      "mcps": [
        {
          "name": "12306-mcp",
          "category": "交通工具",
          "imageUrl": "https://www.12306.cn/index/images/logo.jpg",
          "githubUrl": "https://github.com/12306-mcp",
          "description": "12306 火车票查询和预订工具",
          "authRequired": false,
          "authVerified": true
        }
      ],
      "workflow": [
        {
          "mcp": "12306-mcp",
          "step": 1,
          "input": "None",
          "action": "获取当前日期",
          "output": "Current date"
        }
      ]
    }`;
    
    // 获取taskService实例
    const taskService = getTaskService();
    
    // 创建一个测试任务
    console.log('创建测试任务...');
    const task = await taskService.createTask({
      userId: 'test-user',
      title: '测试mcpWorkflow解析',
      content: '测试mcpWorkflow解析'
    });
    
    console.log(`任务创建成功，ID: ${task.id}`);
    
    // 更新任务的mcpWorkflow为字符串格式
    console.log('更新任务的mcpWorkflow为字符串格式...');
    await taskService.updateTask(task.id, {
      mcpWorkflow: mcpWorkflowStr
    });
    
    // 获取更新后的任务
    console.log('获取更新后的任务...');
    const updatedTask = await taskService.getTaskById(task.id);
    
    // 检查mcpWorkflow是否正确解析为对象
    console.log('检查mcpWorkflow是否正确解析为对象...');
    console.log('mcpWorkflow类型:', typeof updatedTask.mcpWorkflow);
    console.log('mcpWorkflow内容:', JSON.stringify(updatedTask.mcpWorkflow, null, 2));
    
    // 清理测试数据
    console.log('清理测试数据...');
    // 这里可以添加删除测试任务的代码，如果需要的话
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
testMcpWorkflowParsing(); 