# MCP LangChain 服务 API 文档

## 概述

MCP LangChain 服务提供基于钱包认证的AI聊天服务，支持 Sign-In with Ethereum (SIWE) 标准进行用户认证。该服务支持会话管理、任务创建和执行，以及MCP工具调用。

**基础URL**: `http://localhost:3001`

## 认证

本API使用JWT (JSON Web Token) 进行认证。大部分端点需要在请求头中包含有效的访问令牌：

```
Authorization: Bearer <access_token>
```

## 响应格式

所有API响应都遵循统一的格式：

### 成功响应
```json
{
  "success": true,
  "data": {
    // 响应数据
  }
}
```

### 错误响应
```json
{
  "error": "Error Type",
  "message": "错误描述"
}
```

## API 端点

### 认证相关 API

#### 1. 获取钱包登录随机数

**端点**: `POST /api/auth/wallet/nonce`

**描述**: 获取用于钱包登录的随机数和SIWE消息

**请求体**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "nonce": "UI4hLlxvuVSDyLRrJ",
    "message": "localhost:3001 wants you to sign in with your Ethereum account:\n0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8\n\nSign in to MCP LangChain Service\n\nURI: http://localhost:3001\nVersion: 1\nChain ID: 1\nNonce: UI4hLlxvuVSDyLRrJ\nIssued At: 2025-06-16T06:59:27.933Z\nExpiration Time: 2025-06-16T07:09:27.933Z",
    "domain": "localhost:3001",
    "uri": "http://localhost:3001"
  }
}
```

**错误响应**:
- `400 Bad Request`: 钱包地址为空或无效
- `500 Internal Server Error`: 服务器内部错误

---

#### 2. 钱包登录

**端点**: `POST /api/auth/wallet/login`

**描述**: 使用钱包签名进行登录

**请求体**:
```json
{
  "message": "SIWE消息内容",
  "signature": "0x...",
  "username": "用户名（可选）",
  "avatar": "头像URL（可选）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "用户名",
      "avatar": "头像URL",
      "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8",
      "balance": "0.0",
      "email": null,
      "createdAt": "2025-06-16T06:59:27.933Z",
      "lastLoginAt": "2025-06-16T06:59:27.933Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 3600
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 消息或签名为空
- `401 Unauthorized`: 签名验证失败
- `500 Internal Server Error`: 服务器内部错误

---

#### 3. 刷新访问令牌

**端点**: `POST /api/auth/refresh`

**描述**: 使用刷新令牌获取新的访问令牌

**请求体**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

**错误响应**:
- `400 Bad Request`: 刷新令牌为空
- `401 Unauthorized`: 无效的刷新令牌或用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 4. 登出

**端点**: `POST /api/auth/logout`

**描述**: 登出并撤销刷新令牌

**认证**: 需要访问令牌

**请求体**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应**:
```json
{
  "success": true,
  "message": "已成功登出"
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 5. 获取用户信息

**端点**: `GET /api/auth/me`

**描述**: 获取当前登录用户的信息

**认证**: 需要访问令牌

**响应**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "用户名",
      "avatar": "头像URL",
      "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8",
      "balance": "0.0",
      "email": null,
      "loginMethods": {
        "wallet": {
          "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8",
          "verified": true
        }
      },
      "createdAt": "2025-06-16T06:59:27.933Z",
      "lastLoginAt": "2025-06-16T06:59:27.933Z"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 6. 更新用户信息

**端点**: `PUT /api/auth/me`

**描述**: 更新当前登录用户的信息

**认证**: 需要访问令牌

**请求体**:
```json
{
  "username": "新用户名（可选）",
  "avatar": "新头像URL（可选）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "新用户名",
      "avatar": "新头像URL",
      "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8",
      "balance": "0.0",
      "email": null,
      "updatedAt": "2025-06-16T07:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 没有要更新的字段
- `401 Unauthorized`: 无效的访问令牌
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 7. 撤销所有令牌

**端点**: `POST /api/auth/revoke-all`

**描述**: 撤销用户的所有刷新令牌（强制登出所有设备）

**认证**: 需要访问令牌

**响应**:
```json
{
  "success": true,
  "message": "已撤销所有令牌"
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 聊天相关 API

#### 8. AI 聊天

**端点**: `POST /api/chat`

**描述**: 与AI进行对话，支持MCP工具调用

**认证**: 需要访问令牌

**请求体**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "你好，请帮我查询天气"
    }
  ],
  "config": {
    // 可选配置参数
  }
}
```

**响应**:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "你好！我可以帮你查询天气信息。请告诉我你想查询哪个城市的天气？"
      }
    }
  ]
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 9. 流式聊天

**端点**: `POST /api/chat/stream`

**描述**: 与AI进行流式对话

**认证**: 需要访问令牌

**请求体**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "请写一首关于春天的诗"
    }
  ],
  "config": {
    // 可选配置参数
  }
}
```

**响应**: Server-Sent Events (SSE) 流

```
data: {"choices":[{"delta":{"content":"春"}}]}

data: {"choices":[{"delta":{"content":"天"}}]}

data: {"choices":[{"delta":{"content":"来"}}]}

data: [DONE]
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### AWE代币支付 API

#### 1. 计算AWE支付价格

**端点**: `GET /api/payment/calculate-awe-price`

**描述**: 计算指定会员类型和订阅周期所需的AWE代币数量

**认证**: 需要访问令牌

**查询参数**:
- `membershipType`: `"plus"` 或 `"pro"`
- `subscriptionType`: `"monthly"` 或 `"yearly"`

**响应**:
```json
{
  "success": true,
  "data": {
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "usdPrice": "4.99",
    "aweAmount": "49.900000",
    "aweAmountInWei": "49900000000000000000",
    "aweUsdPrice": 0.1,
    "tokenAddress": "0x1B4617734C43F6159F3a70b7E06d883647512778",
    "receiverAddress": "0x1cAb57bDD051613214D761Ce1429f94975dD0116",
    "chainId": 8453,
    "chainName": "Base"
  }
}
```

**错误响应**:
- `400 Bad Request`: 无效的会员类型或订阅周期
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 2. 确认AWE支付

**端点**: `POST /api/payment/confirm-awe-payment`

**描述**: 验证交易并创建支付记录

**认证**: 需要访问令牌

**请求体**:
```json
{
  "membershipType": "plus",
  "subscriptionType": "monthly",
  "transactionHash": "0x..."
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "paymentId": "uuid",
    "status": "confirmed",
    "amount": "50.000000",
    "transactionHash": "0x...",
    "confirmedAt": "2024-12-17T10:00:00.000Z",
    "membershipType": "plus",
    "subscriptionType": "monthly"
  }
}
```

**错误响应**:
- `400 Bad Request`: 
  - 无效的会员类型或订阅周期
  - 交易哈希为空或无效
  - 交易未找到
  - 交易确认数不足
  - 支付金额不足
  - 交易已被其他用户使用
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 3. 获取AWE支付状态

**端点**: `GET /api/payment/awe-payment/:paymentId`

**描述**: 获取指定支付记录的详细信息

**认证**: 需要访问令牌

**路径参数**:
- `paymentId`: 支付记录ID

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-id",
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "amount": "50.000000",
    "amountInWei": "50000000000000000000",
    "usdValue": "4.99",
    "status": "confirmed",
    "transactionHash": "0x...",
    "blockNumber": 12345678,
    "fromAddress": "0x...",
    "confirmedAt": "2024-12-17T10:00:00.000Z",
    "createdAt": "2024-12-17T10:00:00.000Z",
    "updatedAt": "2024-12-17T10:00:00.000Z"
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该支付记录
- `404 Not Found`: 支付记录不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 4. 获取AWE支付历史

**端点**: `GET /api/payment/awe-payments`

**描述**: 获取当前用户的所有AWE支付记录

**认证**: 需要访问令牌

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "membershipType": "plus",
      "subscriptionType": "monthly",
      "amount": "50.000000",
      "status": "confirmed",
      "transactionHash": "0x...",
      "createdAt": "2024-12-17T10:00:00.000Z"
    }
  ]
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

#### 5. 获取会员状态

**端点**: `GET /api/payment/membership-status`

**描述**: 获取当前用户的会员状态信息

**认证**: 需要访问令牌

**响应**:
```json
{
  "success": true,
  "data": {
    "isActive": true,
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "expiresAt": "2024-02-01T11:30:00.000Z"
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 6. 清除会员状态

**端点**: `DELETE /api/payment/membership`

**描述**: 清除当前用户的会员状态，将用户的会员类型、订阅类型和过期时间重置为空

**认证**: 需要访问令牌

**响应**:
```json
{
  "success": true,
  "message": "会员状态已成功清除"
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 会话管理 API

会话系统提供了一种整合对话和任务的方式，允许用户在自然对话中触发任务执行，并在同一个界面中查看结果。

#### 1. 创建新会话

**端点**: `POST /api/conversation`

**描述**: 创建一个新的会话

**认证**: 需要访问令牌

**请求体**:
```json
{
  "title": "会话标题（可选）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_123456",
      "userId": "user_id",
      "title": "会话标题",
      "taskCount": 0,
      "messageCount": 0,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 2. 获取会话列表

**端点**: `GET /api/conversation`

**描述**: 获取用户的所有会话

**认证**: 需要访问令牌

**查询参数**:
- `limit`: 每页数量（可选，默认10）
- `offset`: 偏移量（可选，默认0）
- `sortBy`: 排序字段（可选，默认last_message_at）
- `sortDir`: 排序方向，asc或desc（可选，默认desc）

**响应**:
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_123456",
        "userId": "user_id",
        "title": "会话标题",
        "lastMessageContent": "最后一条消息内容",
        "lastMessageAt": "2023-06-20T09:30:00.000Z",
        "taskCount": 2,
        "messageCount": 15,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T09:30:00.000Z"
      },
      // 更多会话...
    ],
    "total": 25
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### 3. 获取会话详情

**端点**: `GET /api/conversation/:id`

**描述**: 获取特定会话的详情和消息历史

**认证**: 需要访问令牌

**路径参数**:
- `id`: 会话ID

**响应**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_123456",
      "userId": "user_id",
      "title": "会话标题",
      "lastMessageContent": "最后一条消息内容",
      "lastMessageAt": "2023-06-20T09:30:00.000Z",
      "taskCount": 2,
      "messageCount": 15,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T09:30:00.000Z"
    },
    "messages": [
      {
        "id": "msg_1",
        "conversationId": "conv_123456",
        "content": "你好，我想搜索一下MCP协议",
        "type": "user",
        "intent": "chat",
        "createdAt": "2023-06-20T08:05:00.000Z"
      },
      {
        "id": "msg_2",
        "conversationId": "conv_123456",
        "content": "您好！我很乐意帮您搜索MCP协议相关信息。请告诉我您具体想了解哪方面的内容？",
        "type": "assistant",
        "intent": "chat",
        "createdAt": "2023-06-20T08:05:10.000Z"
      },
      // 更多消息...
    ]
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该会话
- `404 Not Found`: 会话不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 4. 发送消息

**端点**: `POST /api/conversation/:id/message`

**描述**: 向会话发送消息，系统会自动识别是聊天还是任务意图

**认证**: 需要访问令牌

**路径参数**:
- `id`: 会话ID

**请求体**:
```json
{
  "content": "消息内容"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg_3",
      "conversationId": "conv_123456",
      "content": "使用Playwright访问百度并搜索MCP协议",
      "type": "user",
      "intent": "task",
      "createdAt": "2023-06-20T08:10:00.000Z"
    },
    "assistantResponse": {
      "id": "msg_4",
      "conversationId": "conv_123456",
      "content": "已为您创建任务：使用Playwright访问百度并搜索MCP协议\n任务ID：task_123\n我将开始执行此任务。",
      "type": "assistant",
      "intent": "task",
      "taskId": "task_123",
      "createdAt": "2023-06-20T08:10:05.000Z"
    },
    "intent": "task",
    "taskId": "task_123"
  }
}
```

**错误响应**:
- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该会话
- `404 Not Found`: 会话不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 5. 流式发送消息

**端点**: `POST /api/conversation/:id/message/stream`

**描述**: 以流式方式向会话发送消息，实时获取响应

**认证**: 需要访问令牌

**路径参数**:
- `id`: 会话ID

**请求体**:
```json
{
  "content": "消息内容"
}
```

**响应**: Server-Sent Events (SSE) 流

示例事件流：
```
data: {"event":"processing_start","data":{"messageId":"msg_5"}}

data: {"event":"intent_detection","data":{"status":"processing"}}

data: {"event":"intent_detection","data":{"status":"completed","intent":"chat","confidence":0.95}}

data: {"event":"chat_response","data":{"content":"您好！"}}

data: {"event":"chat_response","data":{"content":"我可以"}}

data: {"event":"chat_response","data":{"content":"帮助您。"}}

data: {"event":"processing_complete","data":{"messageId":"msg_5","responseId":"msg_6","intent":"chat"}}

data: [DONE]
```

对于任务意图，事件流将包含任务处理状态：
```
data: {"event":"processing_start","data":{"messageId":"msg_7"}}

data: {"event":"intent_detection","data":{"status":"completed","intent":"task","confidence":0.98}}

data: {"event":"task_processing","data":{"status":"creating_task"}}

data: {"event":"task_processing","data":{"status":"task_created","taskId":"task_456","title":"使用Playwright访问百度"}}

data: {"event":"task_processing","data":{"status":"executing_task"}}

data: {"event":"task_processing","data":{"step":1,"status":"success","action":"browser_navigate"}}

data: {"event":"processing_complete","data":{"messageId":"msg_7","responseId":"msg_8","intent":"task","taskId":"task_456"}}

data: [DONE]
```

**错误响应**:
- 在事件流中以 `{"event":"error","data":{"message":"错误信息"}}` 格式返回

---

#### 6. 获取会话关联的任务

**端点**: `GET /api/conversation/:id/tasks`

**描述**: 获取与特定会话关联的所有任务

**认证**: 需要访问令牌

**路径参数**:
- `id`: 会话ID

**响应**:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_123456",
    "tasks": [
      {
        "id": "task_123",
        "userId": "user_id",
        "title": "使用Playwright访问百度并搜索MCP协议",
        "content": "使用Playwright访问百度并搜索MCP协议",
        "status": "completed",
        "conversationId": "conv_123456",
        "createdAt": "2023-06-20T08:10:05.000Z",
        "updatedAt": "2023-06-20T08:11:30.000Z",
        "completedAt": "2023-06-20T08:11:30.000Z"
      },
      // 更多任务...
    ],
    "count": 2
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该会话
- `404 Not Found`: 会话不存在
- `500 Internal Server Error`: 服务器内部错误

### 任务管理 API

#### 获取任务关联的会话

**端点**: `GET /api/task/:id/conversation`

**描述**: 获取与特定任务关联的会话信息

**认证**: 需要访问令牌

**路径参数**:
- `id`: 任务ID

**响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_123",
    "conversation": {
      "id": "conv_123456",
      "userId": "user_id",
      "title": "会话标题",
      "lastMessageContent": "最后一条消息内容",
      "lastMessageAt": "2023-06-20T09:30:00.000Z",
      "taskCount": 2,
      "messageCount": 15,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T09:30:00.000Z"
    }
  }
}
```

当任务没有关联的会话时：
```json
{
  "success": true,
  "data": {
    "taskId": "task_123",
    "conversation": null,
    "message": "此任务未关联到任何会话"
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

## 错误代码

| 状态码 | 错误类型 | 描述 |
|--------|----------|------|
| 400 | Bad Request | 请求参数错误或缺失 |
| 401 | Unauthorized | 认证失败或令牌无效 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 资源不存在 |
| 429 | Too Many Requests | 请求频率超限 |
| 500 | Internal Server Error | 服务器内部错误 |

## 速率限制

- **登录相关端点**: 每15分钟最多5次请求
- **其他端点**: 每15分钟最多100次请求

## 钱包登录流程

1. **获取nonce**: 调用 `/api/auth/wallet/nonce` 获取随机数和SIWE消息
2. **签名消息**: 使用钱包（如MetaMask）对SIWE消息进行签名
3. **验证登录**: 调用 `/api/auth/wallet/login` 提交消息和签名
4. **使用令牌**: 在后续请求中使用返回的访问令牌

## 示例代码

### JavaScript 钱包登录示例

```javascript
// 1. 获取nonce
const nonceResponse = await fetch('/api/auth/wallet/nonce', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: walletAddress })
});
const { data } = await nonceResponse.json();

// 2. 签名消息
const signature = await ethereum.request({
  method: 'personal_sign',
  params: [data.message, walletAddress]
});

// 3. 登录
const loginResponse = await fetch('/api/auth/wallet/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: data.message,
    signature,
    username: '用户名',
    avatar: '头像URL'
  })
});
const loginData = await loginResponse.json();

// 4. 使用访问令牌
const chatResponse = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${loginData.data.tokens.accessToken}`
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '你好' }]
  })
});
```

### cURL 示例

```bash
# 获取nonce
curl -X POST http://localhost:3001/api/auth/wallet/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8e8"}'

# 聊天（需要先登录获取token）
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

## 注意事项

1. **安全性**: 
   - 访问令牌有效期为1小时
   - 刷新令牌有效期为7天
   - 所有敏感操作都需要认证

2. **SIWE标准**: 
   - 严格遵循EIP-4361标准
   - 支持EIP-55地址校验和格式
   - nonce有效期为10分钟

3. **工具调用**: 
   - AI可以自动调用MCP工具
   - 支持官方和自定义MCP适配器
   - 工具执行结果会自动整合到对话中

4. **流式响应**: 
   - 使用Server-Sent Events (SSE)
   - 适合长文本生成场景
   - 需要正确处理连接关闭 

## 使用示例

### 会话-任务流程示例

以下是一个完整的会话-任务流程示例：

1. 创建新会话

```bash
curl -X POST http://localhost:3001/api/conversation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"title":"自动化任务会话"}'
```

2. 在会话中发送消息（询问信息）

```bash
curl -X POST http://localhost:3001/api/conversation/conv_123456/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content":"你能告诉我什么是MCP协议吗？"}'
```

3. 在会话中发送任务请求

```bash
curl -X POST http://localhost:3001/api/conversation/conv_123456/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content":"帮我使用Playwright访问百度并搜索MCP协议"}'
```

4. 获取会话关联的任务

```bash
curl -X GET http://localhost:3001/api/conversation/conv_123456/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

5. 获取任务详情

```bash
curl -X GET http://localhost:3001/api/task/task_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

6. 查看任务结果后，继续在会话中对话

```bash
curl -X POST http://localhost:3001/api/conversation/conv_123456/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content":"搜索结果看起来不错，可以帮我总结一下MCP协议的主要特点吗？"}'
``` 