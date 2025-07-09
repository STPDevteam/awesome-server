# Try Agent功能实现文档

## 概述

实现了完整的"Try Agent"功能，允许用户快速试用Agent，系统会自动检查认证状态并执行相应的工作流。

## 功能特性

### 核心流程

1. **用户输入任务内容** - 用户随意输入想要完成的任务
2. **系统检查认证状态** - 自动检查Agent工作流中涉及的MCP认证状态
3. **认证验证分支**:
   - **未验证**: 显示红框提示 + LLM对话形式返回：`Please verify auth for all relevant MCP servers first.`
   - **已验证**: 进入第三步
4. **执行工作流** - 根据任务内容，调用LLM+MCP工作流进行交付

### 技术特点

- **智能认证检查**: 自动分析Agent工作流中的MCP认证需求
- **安全验证**: 确保用户只能试用有权访问的Agent
- **统一API**: 与现有任务系统完全集成
- **详细错误信息**: 提供具体的认证参数要求

## 技术实现

### 数据模型扩展 (`src/models/agent.ts`)

```typescript
// Try Agent请求参数
export interface TryAgentRequest {
  agentId: string;
  taskContent: string;
  userId: string;
}

// Try Agent响应
export interface TryAgentResponse {
  success: boolean;
  needsAuth?: boolean;
  missingAuth?: Array<{
    mcpName: string;
    description: string;
    authParams?: Record<string, any>;
  }>;
  message?: string;
  executionResult?: any;
}
```

### 服务层实现 (`src/services/agentService.ts`)

#### 核心方法

1. **`checkAgentMCPAuth(agent, userId)`** - 检查Agent工作流中的MCP认证状态
2. **`tryAgent(request)`** - 主要的Try Agent入口方法

#### 认证检查逻辑

```typescript
// 检查每个需要认证的MCP
for (const mcp of mcpWorkflow.mcps) {
  if (mcp.authRequired) {
    // 检查用户是否已经验证了这个MCP
    const authData = await this.mcpAuthService.getUserMCPAuth(userId, mcp.name);
    if (!authData || !authData.isVerified) {
      missingAuth.push({
        mcpName: mcp.name,
        description: mcp.description,
        authParams: mcp.authParams
      });
    }
  }
}
```

#### 任务创建逻辑

```typescript
// 创建临时任务来执行Agent的工作流
const taskService = getTaskService();
const task = await taskService.createTask({
  userId,
  title: `Try Agent: ${agent.name}`,
  content: taskContent,
  conversationId: undefined
});

// 更新任务的工作流信息
await taskService.updateTask(task.id, {
  mcpWorkflow: agent.mcpWorkflow,
  status: 'completed' // 设置为已完成状态，因为分析已由Agent提供
});
```

### API路由 (`src/routes/agent.ts`)

#### 端点定义

```
POST /api/agent/:id/try
```

#### 请求格式

```json
{
  "taskContent": "用户输入的任务内容"
}
```

#### 响应格式

**成功响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task-uuid",
    "message": "任务已创建，现在可以执行Agent工作流",
    "agentName": "Agent名称",
    "agentDescription": "Agent描述",
    "mcpWorkflow": { /* 工作流信息 */ }
  }
}
```

**认证需求响应**:
```json
{
  "success": false,
  "error": "AUTH_REQUIRED",
  "message": "Please verify auth for all relevant MCP servers first.",
  "data": {
    "needsAuth": true,
    "missingAuth": [
      {
        "mcpName": "x-mcp",
        "description": "Twitter/X API集成",
        "authParams": {
          "TWITTER_API_KEY": "Twitter API Key",
          "TWITTER_API_SECRET": "Twitter API Secret",
          "TWITTER_ACCESS_TOKEN": "Twitter Access Token",
          "TWITTER_ACCESS_SECRET": "Twitter Access Secret"
        }
      }
    ]
  }
}
```

## 安全控制

### 访问权限验证

```typescript
// 检查Agent是否为公开或属于当前用户
if (agent.status === 'private' && agent.userId !== userId) {
  return {
    success: false,
    message: '无权访问该Agent'
  };
}
```

### 认证状态检查

- 自动检查Agent工作流中所有MCP的认证需求
- 只有通过认证验证的MCP才能执行
- 提供详细的认证参数信息供用户参考

## 使用示例

### 1. 试用无需认证的Agent

```javascript
const response = await fetch('/api/agent/agent-id/try', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token'
  },
  body: JSON.stringify({
    taskContent: '获取比特币当前价格'
  })
});

const result = await response.json();
// result.success === true
// result.data.taskId 可用于跟踪任务执行
```

### 2. 试用需要认证的Agent

```javascript
const response = await fetch('/api/agent/agent-id/try', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token'
  },
  body: JSON.stringify({
    taskContent: '发送一条推文：Hello World!'
  })
});

const result = await response.json();
if (result.error === 'AUTH_REQUIRED') {
  // 显示认证需求
  console.log('需要认证的MCP:', result.data.missingAuth);
  // 前端可以显示红框提示和认证参数
}
```

## 前端集成建议

### 1. 认证状态显示

```javascript
// 当需要认证时，显示红框提示
if (result.error === 'AUTH_REQUIRED') {
  // 显示红框包围的输入区域
  showAuthRequiredUI(result.data.missingAuth);
  
  // 显示LLM对话形式的提示
  showLLMMessage(result.message);
}
```

### 2. 认证参数显示

```javascript
// 为每个需要认证的MCP显示认证参数
result.data.missingAuth.forEach(mcp => {
  showAuthForm(mcp.mcpName, mcp.authParams);
});
```

### 3. 任务执行跟踪

```javascript
// 成功创建任务后，可以跟踪任务执行
if (result.success) {
  const taskId = result.data.taskId;
  // 可以调用现有的任务执行API
  executeTask(taskId);
}
```

## 测试验证

### 测试文件

`test/test-try-agent.js` - 完整的功能测试

### 测试场景

1. **无需认证的Agent试用** - 验证成功创建任务
2. **需要认证但未验证的Agent** - 验证正确返回认证需求
3. **已认证的Agent试用** - 验证成功执行
4. **不存在的Agent** - 验证错误处理
5. **私有Agent访问权限** - 验证权限控制

### 运行测试

```bash
cd test
node test-try-agent.js
```

## 扩展功能

### 1. 流式执行支持

可以扩展为支持流式执行，实时返回Agent执行进度：

```javascript
// 可以添加流式Try Agent端点
POST /api/agent/:id/try/stream
```

### 2. 认证缓存

可以添加认证状态缓存，减少重复验证：

```javascript
// 在Agent服务中添加认证缓存
private authCache = new Map();
```

### 3. 使用统计

已集成Agent使用统计功能：

```javascript
// 自动记录Agent使用
await this.recordAgentUsage(agentId, userId, task.id);
```

## 总结

Try Agent功能为用户提供了一个无缝的Agent试用体验，通过智能的认证检查和任务创建机制，确保用户可以安全、便捷地试用各种Agent功能。该功能与现有的任务系统完全集成，为后续的Agent市场和用户体验提供了坚实的基础。 