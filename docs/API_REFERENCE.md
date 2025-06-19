# API接口文档

本文档详细描述MCP-LangChain系统提供的所有API端点，包括请求参数、响应格式和使用示例。

## 目录

- [通用规范](#通用规范)
- [认证接口](#认证接口)
- [任务管理接口](#任务管理接口)
- [任务分析接口](#任务分析接口)
- [MCP授权接口](#MCP授权接口)
- [任务执行接口](#任务执行接口)

## 通用规范

### 基础URL

所有API请求的基础URL为：`http://localhost:3001/api` 或部署后的服务地址。

### 认证方式

除特殊说明外，所有API都需要JWT认证。在HTTP请求头中添加：
```
Authorization: Bearer YOUR_JWT_TOKEN
```

> 注意：在本地测试模式下，可以使用URL查询参数`userId`或请求体中的`userId`字段来跳过认证。

### 响应格式

所有API的响应格式如下：

#### 成功响应

HTTP状态码：200 OK
```json
{
  "success": true,
  "data": {
    // 响应数据，不同接口有不同结构
  }
}
```

#### 错误响应

HTTP状态码：400, 401, 403, 404, 500等
```json
{
  "success": false,
  "error": "错误类型",
  "message": "错误描述",
  "details": {
    // 可选，详细错误信息
  }
}
```

## 认证接口

### 用户注册

```
POST /auth/register
```

**请求体**
```json
{
  "username": "用户名",
  "email": "邮箱地址",
  "password": "密码"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "用户ID",
      "username": "用户名",
      "email": "邮箱地址",
      "createdAt": "创建时间"
    },
    "tokens": {
      "accessToken": "JWT访问令牌",
      "refreshToken": "刷新令牌"
    }
  }
}
```

### 用户登录

```
POST /auth/login
```

**请求体**
```json
{
  "email": "邮箱地址",
  "password": "密码"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "用户ID",
      "username": "用户名",
      "email": "邮箱地址",
      "lastLoginAt": "最后登录时间"
    },
    "tokens": {
      "accessToken": "JWT访问令牌",
      "refreshToken": "刷新令牌"
    }
  }
}
```

### 钱包登录

```
POST /auth/wallet/login
```

**请求体**
```json
{
  "address": "钱包地址",
  "signature": "签名",
  "message": "签名消息"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "用户ID",
      "username": "用户名",
      "walletAddress": "钱包地址",
      "lastLoginAt": "最后登录时间"
    },
    "tokens": {
      "accessToken": "JWT访问令牌",
      "refreshToken": "刷新令牌"
    }
  }
}
```

### 刷新令牌

```
POST /auth/refresh
```

**请求体**
```json
{
  "refreshToken": "刷新令牌"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "accessToken": "新的JWT访问令牌",
    "refreshToken": "新的刷新令牌"
  }
}
```

## 任务管理接口

### 创建任务

```
POST /task
```

**请求体**
```json
{
  "content": "任务内容",
  "title": "任务标题（可选）"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "任务ID",
      "userId": "用户ID",
      "title": "任务标题",
      "content": "任务内容",
      "status": "created",
      "createdAt": "创建时间",
      "updatedAt": "更新时间"
    }
  }
}
```

### 生成任务标题

```
POST /task/title
```

**请求体**
```json
{
  "content": "任务内容"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "title": "生成的标题",
    "originalContent": "原始内容"
  }
}
```

### 获取任务列表

```
GET /task
```

**查询参数**
- `status`: 任务状态过滤（可选）
- `limit`: 每页数量（可选，默认10）
- `offset`: 偏移量（可选，默认0）
- `sortBy`: 排序字段（可选，默认created_at）
- `sortDir`: 排序方向，asc或desc（可选，默认desc）
- `userId`: 用户ID（仅本地测试模式使用）

**响应**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "任务ID",
        "userId": "用户ID",
        "title": "任务标题",
        "content": "任务内容",
        "status": "任务状态",
        "mcpWorkflow": "工作流配置（可选）",
        "result": "任务结果（可选）",
        "createdAt": "创建时间",
        "updatedAt": "更新时间",
        "completedAt": "完成时间（可选）"
      }
      // 更多任务...
    ],
    "total": 总数量
  }
}
```

### 获取任务详情

```
GET /task/:id
```

**路径参数**
- `id`: 任务ID

**查询参数**
- `userId`: 用户ID（仅本地测试模式使用）

**响应**
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "任务ID",
      "userId": "用户ID",
      "title": "任务标题",
      "content": "任务内容",
      "status": "任务状态",
      "mcpWorkflow": "工作流配置（可选）",
      "result": "任务结果（可选）",
      "createdAt": "创建时间",
      "updatedAt": "更新时间",
      "completedAt": "完成时间（可选）"
    },
    "steps": [
      {
        "id": "步骤ID",
        "taskId": "任务ID",
        "stepType": "步骤类型",
        "title": "步骤标题",
        "content": "步骤内容",
        "reasoning": "推理过程（可选）",
        "reasoningTime": "推理时间（毫秒，可选）",
        "orderIndex": "步骤顺序",
        "createdAt": "创建时间",
        "updatedAt": "更新时间"
      }
      // 更多步骤...
    ]
  }
}
```

## 任务分析接口

### 分析任务

```
POST /task/:id/analyze
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "message": "任务分析已启动",
    "taskId": "任务ID"
  }
}
```

### 流式分析任务

```
POST /task/:id/analyze/stream
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
使用Server-Sent Events (SSE)流式返回分析结果。每个事件的格式如下：

```json
{
  "event": "事件类型",
  "data": {
    // 事件数据，根据事件类型不同而不同
  }
}
```

常见的事件类型包括：
- `analysis_started`: 分析开始
- `step_completed`: 步骤完成
- `analysis_completed`: 分析完成
- `error`: 发生错误

分析完成或发生错误时，会发送结束标记：
```
data: [DONE]
```

## MCP授权接口

### 验证MCP授权

```
POST /task/:id/verify-auth
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "mcpName": "MCP名称",
  "authData": {
    "key1": "值1",
    "key2": "值2"
    // MCP特定的授权数据
  },
  "saveForLater": true/false,
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "verified": true/false,
    "message": "验证结果消息",
    "details": {
      // 详细验证信息（可选）
    },
    "mcpName": "MCP名称"
  }
}
```

### 获取MCP替代选项

```
GET /task/:id/mcp-alternatives/:mcpName
```

**路径参数**
- `id`: 任务ID
- `mcpName`: 原MCP名称

**查询参数**
- `userId`: 用户ID（仅本地测试模式使用）

**响应**
```json
{
  "success": true,
  "data": {
    "originalMcp": "原MCP名称",
    "alternatives": [
      {
        "mcpName": "替代MCP名称",
        "description": "描述",
        "compatibilityScore": 兼容性评分
      }
      // 更多替代选项...
    ]
  }
}
```

### 替换MCP

```
POST /task/:id/replace-mcp
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "originalMcpName": "原MCP名称",
  "newMcpName": "新MCP名称",
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "message": "MCP替换成功",
    "originalMcpName": "原MCP名称",
    "newMcpName": "新MCP名称"
  }
}
```

## 任务执行接口

### 执行任务

```
POST /task/:id/execute
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
```json
{
  "success": true,
  "data": {
    "message": "任务执行已启动",
    "taskId": "任务ID"
  }
}
```

### 流式执行任务

```
POST /task/:id/execute/stream
```

**路径参数**
- `id`: 任务ID

**请求体**
```json
{
  "userId": "用户ID（仅本地测试模式使用）"
}
```

**响应**
使用Server-Sent Events (SSE)流式返回执行结果。每个事件的格式如下：

```json
{
  "event": "事件类型",
  "data": {
    // 事件数据，根据事件类型不同而不同
  }
}
```

常见的事件类型包括：
- `execution_started`: 执行开始
- `mcp_call_started`: MCP调用开始
- `mcp_call_progress`: MCP调用进度
- `mcp_call_completed`: MCP调用完成
- `execution_completed`: 执行完成
- `error`: 发生错误

执行完成或发生错误时，会发送结束标记：
```
data: [DONE]
``` 