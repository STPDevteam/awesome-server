# 任务引擎事件包装修复

## 🔧 问题背景

在之前的实现中，Agent引擎和任务引擎返回的事件格式不一致：

- **Agent引擎** (agentConversationService): 所有执行事件都被包装在 `task_execution_progress` 中
- **任务引擎** (enhancedIntelligentTaskEngine): 直接返回原始事件

这导致前端收到不一致的事件格式，影响了事件处理逻辑。

## 📋 修复内容

### 1. 统一事件包装格式

现在两个引擎都返回一致的事件格式：

```typescript
// 统一的事件包装格式
{
  event: 'task_execution_progress',
  data: {
    event: 'step_executing',  // 内部事件类型
    data: {                   // 内部事件数据
      // ... 原始事件数据
    },
    agentName: 'WorkflowEngine' // 或实际的Agent名称
  }
}
```

### 2. 修复的服务

**修改的文件**: `src/services/enhancedIntelligentTaskEngine.ts`

**修改的方法**: `EnhancedIntelligentTaskService.executeTaskEnhanced()`

### 3. 包装的事件类型

所有任务引擎事件现在都被包装在 `task_execution_progress` 中：

1. `execution_start`
2. `workflow_execution_start`
3. `step_executing`
4. `step_raw_result`
5. `step_result_chunk` ✅ (修复事件名称)
6. `step_formatted_result` ✅ (修复事件名称)
7. `step_complete`
8. `step_error`
9. `task_observation`
10. `workflow_adapted`
11. `final_result`
12. `task_execution_complete` 🆕 (新增完成事件)
13. `status_update`
14. `error`

### 4. 修复的事件名称

修复了两处错误的事件名称：
- `event: 'final_result'` → `event: 'step_result_chunk'` (流式格式化块)
- `event: 'final_result'` → `event: 'step_formatted_result'` (格式化结果)

## 🔄 事件流对比

### 修复前 (任务引擎)
```typescript
// 直接返回原始事件
stream({ event: 'step_executing', data: {...} });
stream({ event: 'step_complete', data: {...} });
```

### 修复后 (任务引擎)
```typescript
// 包装在task_execution_progress中
stream({
  event: 'task_execution_progress',
  data: {
    event: 'step_executing',
    data: {...},
    agentName: 'WorkflowEngine'
  }
});
```

### Agent引擎 (已有格式)
```typescript
// 已经使用包装格式
stream({
  event: 'task_execution_progress',
  data: {
    event: 'step_executing',
    data: {...},
    agentName: agent.name
  }
});
```

## ✅ 优势

1. **前端一致性**: 前端现在可以使用统一的事件处理逻辑
2. **代码简化**: 减少前端需要处理的事件类型分支
3. **调试便利**: 统一的事件格式便于调试和监控
4. **向后兼容**: 保持了原有的内部事件结构

## 🎯 前端集成

前端现在可以使用统一的事件监听逻辑：

```javascript
// 统一的事件处理
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'task_execution_progress') {
    const { event: innerEvent, data: innerData, agentName } = data.data;
    
    switch (innerEvent) {
      case 'step_executing':
        handleStepExecuting(innerData, agentName);
        break;
      case 'step_complete':
        handleStepComplete(innerData, agentName);
        break;
      case 'final_result':
        handleFinalResult(innerData, agentName);
        break;
      // ... 其他事件类型
    }
  }
});
```

## 📊 测试验证

修改后，任务引擎的流式执行应该返回与Agent引擎一致的事件格式。可以通过以下方式验证：

1. 调用 `/api/task/:id/execute/stream` 端点
2. 检查返回的事件是否都包装在 `task_execution_progress` 中
3. 验证 `agentName` 字段是否正确设置为 `'WorkflowEngine'`
4. 确认所有内部事件类型名称正确 