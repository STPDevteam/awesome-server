# 任务引擎事件名称对齐修复

## 🎯 修复目标

保持智能任务引擎的事件名称与传统任务执行一致，让前端无需修改处理逻辑，同时保留智能引擎的增强功能。

## 📋 事件名称对齐表

### ✅ 已对齐的核心事件

| 传统任务执行事件 | 智能任务引擎事件 | 状态 | 说明 |
|------------------|------------------|------|------|
| `execution_start` | `execution_start` | ✅ 一致 | 执行开始 |
| `step_start` | ~~`step_executing`~~ → `step_start` | ✅ 已修复 | 步骤开始 |
| `step_complete` | `step_complete` | ✅ 一致 | 步骤完成 |
| `step_error` | `step_error` | ✅ 一致 | 步骤错误 |
| `mcp_connection_error` | `mcp_connection_error` | ✅ 一致 | MCP连接错误 |
| `final_result_chunk` | ~~`step_result_chunk`~~ → `final_result_chunk` | ✅ 已修复 | 最终结果流式块 |
| `final_result` | `final_result` | ✅ 一致 | 最终结果 |
| `workflow_complete` | `workflow_complete` | ✅ 新增 | 工作流完成 |
| `task_complete` | `task_complete` | ✅ 新增 | 任务完成 |
| `error` | ~~`task_execution_error`~~ → `error` | ✅ 已修复 | 错误事件 |

### 🆕 智能引擎独有的增强事件（保留）

| 事件名称 | 说明 | 是否保留 |
|----------|------|----------|
| `workflow_execution_start` | 工作流执行开始 | ✅ 保留 |
| `step_raw_result` | 步骤原始结果 | ✅ 保留 |
| `step_result_chunk` | 中间步骤流式块 | ✅ 保留 |
| `step_formatted_result` | 步骤格式化结果 | ✅ 保留 |
| `task_observation` | 任务观察 | ✅ 保留 |
| `workflow_adapted` | 工作流适配 | ✅ 保留 |

### 🎁 传统任务执行中缺失的事件（暂未添加）

| 事件名称 | 说明 | 状态 |
|----------|------|------|
| `generating_summary` | 生成摘要 | 🚧 智能引擎中暂无 |
| `summary_chunk` | 摘要流式块 | 🚧 智能引擎中暂无 |

## 🔧 主要修改

### 1. 事件名称修改

**修改文件**: `src/services/enhancedIntelligentTaskEngine.ts`

```typescript
// 修改前
yield { event: 'step_executing', data: {...} };

// 修改后 - 对齐传统格式
yield { 
  event: 'step_start', 
  data: {
    step: currentStep.step,
    mcpName: currentStep.mcp,
    actionName: actualToolName,
    input: typeof processedInput === 'object' ? JSON.stringify(processedInput) : processedInput,
    // 保留智能引擎增强字段
    agentName: 'WorkflowEngine',
    toolDetails: {...}
  } 
};
```

### 2. 流式事件条件化

```typescript
// 只在最后一步发送final_result_chunk，中间步骤发送step_result_chunk
event: currentStep.step === state.totalSteps ? 'final_result_chunk' : 'step_result_chunk'
```

### 3. 添加缺失的工作流事件

```typescript
// 新增workflow_complete事件
yield {
  event: 'workflow_complete',
  data: {
    success: overallSuccess,
    message: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with errors',
    finalResult: finalResult,
    executionSummary: {...} // 智能引擎增强字段
  }
};

// 新增task_complete事件
yield {
  event: 'task_complete',
  data: {
    taskId,
    success: overallSuccess
  }
};
```

### 4. 字段格式对齐

**step_start事件字段对齐**:
```typescript
// 传统格式
data: {
  step: stepNumber,
  mcpName,
  actionName,
  input: typeof input === 'object' ? JSON.stringify(input) : input
}

// 智能引擎保持一致并添加增强字段
data: {
  step: currentStep.step,
  mcpName: currentStep.mcp,
  actionName: actualToolName,
  input: typeof processedInput === 'object' ? JSON.stringify(processedInput) : processedInput,
  // 增强字段
  agentName: 'WorkflowEngine',
  toolDetails: {...}
}
```

**step_complete事件字段对齐**:
```typescript
// 传统格式
data: {
  step: stepNumber,
  success: true,
  result: formattedResult,
  rawResult: stepResult
}

// 智能引擎保持一致并添加增强字段
data: {
  step: currentStep.step,
  success: true,
  result: formattedResult || executionResult.result,
  rawResult: executionResult.result,
  // 增强字段
  agentName: 'WorkflowEngine',
  progress: {...}
}
```

## 🎯 前端兼容性

### ✅ 完全兼容的事件

前端现有代码无需修改，可以直接处理：

- `step_start` - 步骤开始
- `step_complete` - 步骤完成  
- `step_error` - 步骤错误
- `final_result_chunk` - 最终结果流式块
- `final_result` - 最终结果
- `workflow_complete` - 工作流完成
- `task_complete` - 任务完成
- `error` - 错误

### 🆕 可选的增强事件

前端可以选择性地处理这些新事件以获得更好的体验：

- `step_raw_result` - 显示原始MCP数据
- `step_formatted_result` - 显示格式化结果
- `task_observation` - 显示智能观察过程
- `workflow_adapted` - 显示工作流动态调整

### 📝 前端使用示例

```javascript
// 现有代码无需修改
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'task_execution_progress') {
    const { event: innerEvent, data: innerData } = data.data;
    
    switch (innerEvent) {
      case 'step_start':
        console.log(`开始执行步骤 ${innerData.step}: ${innerData.actionName}`);
        break;
      case 'step_complete':
        console.log(`步骤 ${innerData.step} 完成:`, innerData.result);
        break;
      case 'final_result':
        console.log('最终结果:', innerData.finalResult);
        break;
      case 'workflow_complete':
        console.log('工作流完成:', innerData.success);
        break;
        
      // 可选：处理智能引擎增强事件
      case 'step_raw_result':
        console.log('原始结果:', innerData.result);
        break;
      case 'task_observation':
        console.log('智能观察:', innerData.shouldContinue);
        break;
    }
  }
});
```

## 🚀 优势总结

1. **✅ 前端兼容性**: 现有前端代码无需修改
2. **🔄 事件一致性**: 与传统任务执行保持一致的事件流
3. **🆕 功能增强**: 保留智能引擎的所有增强功能
4. **📈 可扩展性**: 前端可以选择性地利用新的智能特性
5. **🛠️ 维护性**: 统一的事件处理逻辑，降低维护成本

## 🎉 测试验证

修改后，智能任务引擎将返回与传统任务执行完全兼容的事件流，同时提供额外的智能功能。前端可以：

1. **无修改运行**: 使用现有事件处理逻辑
2. **逐步增强**: 选择性地集成新的智能特性
3. **调试便利**: 通过增强事件获得更详细的执行信息 