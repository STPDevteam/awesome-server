# 任务引擎事件名称对齐修复

## 🎯 修复目标

保持智能任务引擎的事件名称与Agent智能引擎一致，让前端的智能引擎事件处理逻辑能够正常工作，同时保留任务引擎的增强功能。

## 📋 重要发现

经过分析前端代码发现，前端处理的事件是为**智能引擎**（Agent + Task）设计的，而不是传统的LangChain任务执行。

## 📋 事件名称对齐表

### ✅ 智能引擎事件对齐

| Agent智能引擎事件 | 任务智能引擎事件 | 状态 | 说明 |
|-------------------|------------------|------|------|
| `execution_start` | `execution_start` | ✅ 一致 | 执行开始 |
| `status_update` | `status_update` | ✅ 一致 | 状态更新 |
| `step_executing` | `step_executing` | ✅ 一致 | 步骤执行中 |
| `step_raw_result` | `step_raw_result` | ✅ 一致 | 步骤原始结果 |
| `step_complete` | `step_complete` | ✅ 一致 | 步骤完成 |
| `step_error` | `step_error` | ✅ 一致 | 步骤错误 |
| `mcp_connection_error` | `mcp_connection_error` | ✅ 一致 | MCP连接错误 |
| `final_result` | `final_result` | ✅ 一致 | 最终结果 |
| `workflow_complete` | `workflow_complete` | ✅ 一致 | 工作流完成 |
| `task_complete` | `task_complete` | ✅ 一致 | 任务完成 |
| `error` | `error` | ✅ 一致 | 错误事件 |

### 🆚 传统任务执行 vs 智能引擎

| 传统LangChain执行 | 智能引擎（Agent + Task） | 说明 |
|------------------|-------------------------|------|
| `step_start` | `step_executing` | 步骤开始执行 |
| 无 | `step_raw_result` | 原始MCP结果 |
| 无 | `step_formatted_result` | 格式化结果 |
| `generating_summary` | 无 | 生成摘要（智能引擎中不需要） |
| `summary_chunk` | 无 | 摘要流式块 |

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
// 修改前（任务引擎独有格式）
yield { 
  event: 'step_executing', 
  data: {
    mcpName: currentStep.mcp,
    actionName: actualToolName,
    input: '...',
    // 任务引擎特有字段
  }
};

// 修改后 - 对齐Agent引擎格式
yield { 
  event: 'step_executing', 
  data: {
    step: currentStep.step,
    tool: actualToolName,
    agentName: 'WorkflowEngine',
    message: `WorkflowEngine is executing step ${currentStep.step}: ${actualToolName}`,
    // 与Agent引擎完全一致的toolDetails结构
    toolDetails: {
      toolType: 'mcp',
      toolName: actualToolName,
      mcpName: mcpName,
      args: processedInput,
      expectedOutput: expectedOutput,
      reasoning: reasoning,
      timestamp: new Date().toISOString()
    }
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
// 前端智能引擎事件处理（现有代码无需修改）
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'task_execution_progress') {
    const { event: innerEvent, data: innerData } = data.data;
    
    switch (innerEvent) {
      case 'execution_start':
        console.log('开始执行:', innerData.message);
        break;
        
      case 'step_executing':
        // 访问工具详情（与前端代码一致）
        const { toolDetails } = innerData;
        const { toolName, args } = toolDetails;
        console.log(`执行步骤 ${innerData.step}: ${toolName}`, args);
        break;
        
      case 'step_raw_result':
        console.log('原始结果:', innerData.result);
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
        
      case 'task_complete':
        console.log('任务完成:', innerData.success);
        break;
        
      // 智能引擎增强事件
      case 'step_formatted_result':
        console.log('格式化结果:', innerData.formattedResult);
        break;
        
      case 'task_observation':
        console.log('智能观察:', innerData.shouldContinue);
        break;
        
      case 'workflow_adapted':
        console.log('工作流适配:', innerData.reason);
        break;
    }
  }
});
```

## 🚀 优势总结

1. **✅ 前端兼容性**: 现有智能引擎前端代码无需修改
2. **🔄 事件一致性**: 与Agent智能引擎保持完全一致的事件流
3. **🆕 功能增强**: 保留任务引擎的所有智能特性
4. **📈 可扩展性**: 前端可以无缝处理两种智能引擎的事件
5. **🛠️ 维护性**: 统一的智能引擎事件处理逻辑，降低维护成本

## 🎯 关键修正

**重要发现**: 前端代码是为**智能引擎**设计的，不是传统LangChain任务执行！

- **智能引擎**: 使用 `step_executing` + `toolDetails` 结构
- **传统执行**: 使用 `step_start` + 简单字段

现在任务智能引擎与Agent智能引擎使用完全一致的事件格式。

## 🎉 测试验证

修改后，任务智能引擎将返回与Agent智能引擎完全兼容的事件流：

1. **无修改运行**: 前端智能引擎事件处理逻辑直接适用
2. **功能完整**: 支持所有智能引擎特性（观察、适配、原始结果等）
3. **调试便利**: 通过一致的事件结构获得详细的执行信息
4. **未来扩展**: 新的智能特性可以同时在两个引擎中使用 