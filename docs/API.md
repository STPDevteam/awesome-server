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

### 支付相关 API

#### 1. 获取会员定价信息

**端点**: `GET /api/payment/pricing`

**描述**: 获取会员订阅的定价信息，包括USD价格和对应的AWE代币数量（以Wei为单位）

**认证**: 无需认证

**响应**:
```json
{
  "success": true,
  "data": {
    "plus": {
      "monthly": {
        "amount": "20",
        "currency": "USDT"
      },
      "yearly": {
        "amount": "200",
        "currency": "USDT"
      }
    },
    "pro": {
      "monthly": {
        "amount": "200",
        "currency": "USDT"
      },
      "yearly": {
        "amount": "2000",
        "currency": "USDT"
      }
    },
    "aweAmountForPlusMonthlyInWei": "40453200000000000000",
    "aweAmountForPlusYearlyInWei": "388950700000000000000",
    "aweAmountForProMonthlyInWei": "121459700000000000000",
    "aweAmountForProYearlyInWei": "1167852200000000000000",
    "usdtAmountForPlusMonthlyByAwe": 16,
    "usdtAmountForPlusYearlyByAwe": 160,
    "usdtAmountForProMonthlyByAwe": 160,
    "usdtAmountForProYearlyByAwe": 1600
  }
}
```

**字段说明**:
- `plus/pro.monthly/yearly`: 各会员档位的USDT定价
- `aweAmountForPlusMonthlyInWei`: Plus月付所需的AWE数量（以Wei为单位）
- `aweAmountForPlusYearlyInWei`: Plus年付所需的AWE数量（以Wei为单位）
- `aweAmountForProMonthlyInWei`: Pro月付所需的AWE数量（以Wei为单位）
- `aweAmountForProYearlyInWei`: Pro年付所需的AWE数量（以Wei为单位）
- `usdtAmountForPlusMonthlyByAwe`: 使用AWE支付Plus月付对应的USDT价格（原价*0.8）
- `usdtAmountForPlusYearlyByAwe`: 使用AWE支付Plus年付对应的USDT价格（原价*0.8）
- `usdtAmountForProMonthlyByAwe`: 使用AWE支付Pro月付对应的USDT价格（原价*0.8）
- `usdtAmountForProYearlyByAwe`: 使用AWE支付Pro年付对应的USDT价格（原价*0.8）

**注意**:
- AWE价格是基于当前市场汇率实时计算的，会随币价波动而变化
- 1 AWE = 10^18 Wei
- 这些Wei值可直接用于前端支付计算，无需再次调用calculate-awe-price接口
- 使用AWE支付享受8折优惠，`usdtAmountForXxxByAwe` 字段表示折扣后的等值USDT价格

**错误响应**:
- `500 Internal Server Error`: 获取价格信息失败

---

### AWE代币支付 API

#### 2. 计算AWE支付价格

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

#### 3. 确认AWE支付

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

#### 4. 获取AWE支付状态

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

#### 5. 获取AWE支付历史

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

#### 6. 获取会员状态

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

#### 7. 清除会员状态

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

#### 1. 创建任务

**端点**: `POST /api/tasks`

**描述**: 创建一个新任务

**认证**: 可选（可使用userId参数或访问令牌）

**请求体**:
```json
{
  "content": "获取比特币当前价格和市场分析",
  "title": "任务标题（可选）",
  "conversationId": "关联的会话ID（可选）",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "task_123456",
      "userId": "user_id",
      "title": "获取比特币当前价格和市场分析",
      "content": "获取比特币当前价格和市场分析",
      "status": "created",
      "conversationId": "conv_123456",
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 请求参数无效或缺少用户ID
- `500 Internal Server Error`: 服务器内部错误

---

#### 2. 获取任务列表

**端点**: `GET /api/tasks`

**描述**: 获取用户的任务列表

**认证**: 可选（可使用userId参数或访问令牌）

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）
- `status`: 任务状态过滤（可选）
- `limit`: 每页数量（可选，默认10）
- `offset`: 偏移量（可选，默认0）
- `sortBy`: 排序字段（可选）
- `sortDir`: 排序方向，asc或desc（可选）

**响应**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "task_123456",
        "userId": "user_id",
        "title": "获取比特币当前价格和市场分析",
        "content": "获取比特币当前价格和市场分析",
        "status": "completed",
        "conversationId": "conv_123456",
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:30:00.000Z",
        "completedAt": "2023-06-20T08:30:00.000Z"
      }
    ],
    "total": 25
  }
}
```

**错误响应**:
- `400 Bad Request`: 缺少用户ID
- `500 Internal Server Error`: 服务器内部错误

---

#### 3. 获取任务详情

**端点**: `GET /api/tasks/:id`

**描述**: 获取特定任务的详细信息

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）

**响应**:
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "task_123456",
      "userId": "user_id",
      "title": "获取比特币当前价格和市场分析",
      "content": "获取比特币当前价格和市场分析",
      "status": "completed",
      "mcpWorkflow": {
        "mcps": [
          {
            "name": "coingecko-server",
            "description": "CoinGecko官方MCP服务器",
            "authRequired": true,
            "authVerified": true,
            "category": "Market Data",
            "imageUrl": "https://example.com/coingecko.png",
            "githubUrl": "https://github.com/coingecko/mcp-server",
            "alternatives": [
              {
                "name": "coinmarketcap-mcp-service",
                "description": "CoinMarketCap MCP service for crypto data",
                "authRequired": false,
                "authVerified": true,
                "category": "Market Data",
                "imageUrl": "https://example.com/coinmarketcap.png",
                "githubUrl": "https://github.com/example/coinmarketcap-mcp"
              },
              {
                "name": "cryptocompare-mcp",
                "description": "CryptoCompare MCP for cryptocurrency information",
                "authRequired": true,
                "authVerified": false,
                "category": "Market Data",
                "imageUrl": "https://example.com/cryptocompare.png",
                "githubUrl": "https://github.com/example/cryptocompare-mcp",
                "authParams": {
                  "api_key": "string"
                }
              }
            ]
          }
        ],
        "workflow": [
          {
            "step": 1,
            "mcp": "coingecko-server",
            "action": "获取比特币当前价格",
            "input": {}
          }
        ]
      },
      "result": "比特币当前价格：$45,000",
      "conversationId": "conv_123456",
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:30:00.000Z",
      "completedAt": "2023-06-20T08:30:00.000Z"
    },
    "steps": [
      {
        "id": "step_1",
        "taskId": "task_123456",
        "stepType": "analysis",
        "title": "分析任务需求",
        "content": "分析用户需求：获取比特币价格信息",
        "reasoning": "用户需要获取比特币的实时价格数据",
        "orderIndex": 1,
        "createdAt": "2023-06-20T08:05:00.000Z"
      }
    ]
  }
}
```

**错误响应**:
- `400 Bad Request`: 缺少用户ID
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 4. 流式分析任务

**端点**: `POST /api/tasks/:id/analyze-stream`

**描述**: 使用AI分析任务并生成MCP工作流（流式响应）

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**: Server-Sent Events (SSE) 流

```
data: {"event":"analysis_start","data":{"step":"开始分析任务需求"}}

data: {"event":"step_complete","data":{"step":1,"title":"分析任务需求","status":"completed"}}

data: {"event":"step_complete","data":{"step":2,"title":"识别相关MCP工具","status":"completed"}}

data: {"event":"step_complete","data":{"step":3,"title":"确认可交付内容","status":"completed"}}

data: {"event":"step_complete","data":{"step":4,"title":"构建MCP工作流","status":"completed"}}

data: {"event":"analysis_complete","data":{"mcpWorkflow":{"mcps":[...],"workflow":[...]}}}

data: [DONE]
```

**重要更新**: 从v2.0开始，每个推荐的MCP都会包含备选MCP列表，格式如下：

```json
{
  "mcpWorkflow": {
    "mcps": [
      {
        "name": "coingecko-server",
        "description": "CoinGecko官方MCP服务器",
        "authRequired": true,
        "authVerified": false,
        "category": "Market Data",
        "imageUrl": "https://example.com/coingecko.png",
        "githubUrl": "https://github.com/coingecko/mcp-server",
        "alternatives": [
          {
            "name": "coinmarketcap-mcp-service",
            "description": "CoinMarketCap MCP service for crypto data",
            "authRequired": false,
            "authVerified": true,
            "category": "Market Data",
            "imageUrl": "https://example.com/coinmarketcap.png",
            "githubUrl": "https://github.com/example/coinmarketcap-mcp"
          },
          {
            "name": "cryptocompare-mcp",
            "description": "CryptoCompare MCP for cryptocurrency information",
            "authRequired": true,
            "authVerified": false,
            "category": "Market Data",
            "imageUrl": "https://example.com/cryptocompare.png",
            "githubUrl": "https://github.com/example/cryptocompare-mcp",
            "authParams": {
              "api_key": "string"
            }
          }
        ]
      }
    ],
    "workflow": [...]
  }
}
```

**alternatives字段说明**:
- 包含2-3个功能相似的备选MCP工具的完整信息
- 每个备选工具包含与主MCP完全一致的字段：name、description、authRequired、authVerified、category、imageUrl、githubUrl等
- authVerified字段表示认证状态：不需要认证的工具为true，需要认证的工具为false（需要用户重新认证）
- 如果需要认证，还会包含authParams字段，描述需要的认证参数
- 如果没有合适的备选方案，该字段可能为空数组
- 备选MCP按推荐优先级排序
- 前端可以直接使用这些完整信息进行MCP替换，包括处理认证流程，无需额外的API调用

**错误响应**:
- 在事件流中以 `{"event":"error","data":{"message":"错误信息"}}` 格式返回

---

#### 5. 流式执行任务

**端点**: `POST /api/tasks/:id/execute-stream`

**描述**: 执行任务工作流（流式响应）

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**: Server-Sent Events (SSE) 流

```
data: {"event":"execution_start","data":{"taskId":"task_123456"}}

data: {"event":"step_start","data":{"step":1,"mcp":"coingecko-server","action":"获取比特币价格"}}

data: {"event":"step_complete","data":{"step":1,"status":"success","result":"BTC价格：$45,000"}}

data: {"event":"execution_complete","data":{"summary":"任务执行完成，成功获取比特币价格信息"}}

data: [DONE]
```

**错误响应**:
- 在事件流中以 `{"event":"error","data":{"message":"错误信息"}}` 格式返回

---

#### 6. 验证MCP授权

**端点**: `POST /api/tasks/:id/verify-auth`

**描述**: 验证单个MCP的授权信息

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "mcpName": "coingecko-server",
  "authData": {
    "COINGECKO_API_KEY": "your_api_key_here"
  },
  "saveForLater": true,
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "message": "授权验证成功",
  "data": {
    "verified": true,
    "details": "API密钥有效，权限正常",
    "mcpName": "coingecko-server"
  }
}
```

**错误响应**:
- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 缺少用户ID
- `403 Forbidden`: 无权验证该任务的授权
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 7. 批量验证MCP授权

**端点**: `POST /api/tasks/:id/verify-multiple-auth`

**描述**: 批量验证多个MCP的授权信息

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "mcpAuths": [
    {
      "mcpName": "coingecko-server",
      "authData": {
        "COINGECKO_API_KEY": "your_api_key_here"
      }
    },
    {
      "mcpName": "github-mcp-server",
      "authData": {
        "github_token": "your_github_token"
      }
    }
  ],
  "saveForLater": true,
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "message": "2/2 MCP授权验证成功",
  "data": {
    "results": [
      {
        "mcpName": "coingecko-server",
        "success": true,
        "message": "授权验证成功",
        "details": "API密钥有效"
      },
      {
        "mcpName": "github-mcp-server",
        "success": true,
        "message": "授权验证成功",
        "details": "GitHub令牌有效"
      }
    ],
    "summary": {
      "total": 2,
      "successful": 2,
      "failed": 0
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 缺少用户ID
- `403 Forbidden`: 无权验证该任务的授权
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

### MCP替换和替代API

#### 8. 获取MCP替代选项（增强版）

**端点**: `GET /api/tasks/:id/mcp-alternatives/:mcpName`

**描述**: 智能获取指定MCP的替代选项，考虑任务内容和当前工作流上下文

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID
- `mcpName`: 要替换的MCP名称

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）

**响应**:
```json
{
  "success": true,
  "data": {
    "originalMcp": "coingecko-server",
    "alternatives": [
      {
        "name": "coinmarketcap-mcp",
        "description": "CoinMarketCap市场数据集成",
        "authRequired": true,
        "category": "Market Data",
        "imageUrl": "https://example.com/cmc.png",
        "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp"
      },
      {
        "name": "dexscreener-mcp-server",
        "description": "DexScreener去中心化交易所数据",
        "authRequired": false,
        "category": "Market Data",
        "imageUrl": "https://example.com/dexscreener.png",
        "githubUrl": "https://github.com/dexscreener/mcp-server"
      }
    ],
    "taskContent": "获取比特币当前价格和市场分析",
    "currentWorkflow": {
      "mcps": [...],
      "workflow": [...]
    }
  }
}
```

**错误响应**:
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 9. 验证MCP替换的合理性

**端点**: `POST /api/tasks/:id/validate-mcp-replacement`

**描述**: 使用AI验证将一个MCP替换为另一个MCP的合理性和可行性

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "originalMcpName": "coingecko-server",
  "newMcpName": "coinmarketcap-mcp",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "validation": {
      "isValid": true,
      "confidence": 85,
      "reasons": [
        "两个工具都提供加密货币市场数据",
        "功能高度相似，可以完成相同的任务",
        "都支持实时价格查询"
      ],
      "warnings": [
        "API接口可能略有不同，需要调整参数",
        "数据格式可能存在差异"
      ]
    },
    "originalMcp": "coingecko-server",
    "newMcp": "coinmarketcap-mcp",
    "taskId": "task_123456"
  }
}
```

**字段说明**:
- `isValid`: 是否建议进行替换
- `confidence`: 替换成功的置信度（0-100）
- `reasons`: 支持替换的理由列表
- `warnings`: 替换时需要注意的问题列表

**错误响应**:
- `400 Bad Request`: 缺少必要参数
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 10. 智能替换MCP并重新分析任务

**端点**: `POST /api/tasks/:id/replace-mcp-smart`

**描述**: 智能替换任务中的MCP并重新分析工作流，确保新MCP与其他工具的协作。**返回格式与原始任务分析完全一致**。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "originalMcpName": "coingecko-server",
  "newMcpName": "coinmarketcap-mcp",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_123456",
    "message": "成功将 coingecko-server 替换为 coinmarketcap-mcp 并重新生成了工作流",
    "mcpWorkflow": {
      "mcps": [
        {
          "name": "coinmarketcap-mcp",
          "description": "CoinMarketCap市场数据集成",
          "authRequired": true,
          "authVerified": false,
          "category": "Market Data",
          "imageUrl": "https://example.com/cmc.png",
          "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp",
          "authParams": {
            "API_KEY": "CoinMarketCap API密钥"
          }
        }
      ],
      "workflow": [
        {
          "step": 1,
          "mcp": "coinmarketcap-mcp",
          "action": "获取比特币当前价格和市场数据",
          "input": {
            "symbol": "BTC"
          }
        }
      ]
    },
    "metadata": {
      "totalSteps": 1,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp"]
    },
    "replacementInfo": {
      "originalMcp": "coingecko-server",
      "newMcp": "coinmarketcap-mcp",
      "timestamp": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 参数错误或替换失败
- `403 Forbidden`: 无权限替换此任务的MCP
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 11. 智能替换MCP并重新分析任务（流式版本）

**端点**: `POST /api/tasks/:id/replace-mcp-smart/stream`

**描述**: 智能替换任务中的MCP并重新分析工作流的流式版本，实时返回替换和分析进度。**最终结果格式与原始任务分析完全一致**。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "originalMcpName": "coingecko-server",
  "newMcpName": "coinmarketcap-mcp",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**: Server-Sent Events (SSE) 流式响应

**响应头**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**流式事件格式**:

1. **替换开始**:
```json
{
  "event": "replacement_start",
  "data": {
    "taskId": "task_123456",
    "originalMcp": "coingecko-server",
    "newMcp": "coinmarketcap-mcp",
    "timestamp": "2023-06-20T08:00:00.000Z"
  }
}
```

2. **步骤开始**:
```json
{
  "event": "step_start",
  "data": {
    "stepType": "validation",
    "stepName": "验证替换条件",
    "stepNumber": 1,
    "totalSteps": 5
  }
}
```

3. **步骤完成**:
```json
{
  "event": "step_complete",
  "data": {
    "stepType": "validation",
    "content": "验证通过：可以将 coingecko-server 替换为 coinmarketcap-mcp",
    "reasoning": "新MCP coinmarketcap-mcp 存在且原MCP在当前工作流中"
  }
}
```

4. **MCP列表构建完成**:
```json
{
  "event": "step_complete",
  "data": {
    "stepType": "mcp_replacement",
    "content": "已构建新的MCP列表，包含 1 个工具",
    "reasoning": "成功将 coingecko-server 替换为 coinmarketcap-mcp，保持其他MCP不变",
    "mcps": [
      {
        "name": "coinmarketcap-mcp",
        "description": "CoinMarketCap市场数据集成",
        "authRequired": true,
        "authVerified": false
      }
    ]
  }
}
```

5. **工作流重新生成完成**:
```json
{
  "event": "step_complete",
  "data": {
    "stepType": "workflow_regeneration",
    "content": "已重新生成工作流，包含 1 个步骤",
    "reasoning": "基于新的MCP组合重新分析任务，生成优化的执行步骤",
    "workflow": [
      {
        "step": 1,
        "mcp": "coinmarketcap-mcp",
        "action": "获取比特币当前价格和市场数据",
        "input": {
          "symbol": "BTC"
        }
      }
    ]
  }
}
```

6. **替换完成**:
```json
{
  "event": "replacement_complete",
  "data": {
    "taskId": "task_123456",
    "message": "成功将 coingecko-server 替换为 coinmarketcap-mcp 并重新生成了工作流",
    "mcpWorkflow": {
      "mcps": [
        {
          "name": "coinmarketcap-mcp",
          "description": "CoinMarketCap市场数据集成",
          "authRequired": true,
          "authVerified": false,
          "category": "Market Data",
          "imageUrl": "https://example.com/cmc.png",
          "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp",
          "authParams": {
            "API_KEY": "CoinMarketCap API密钥"
          }
        }
      ],
      "workflow": [
        {
          "step": 1,
          "mcp": "coinmarketcap-mcp",
          "action": "获取比特币当前价格和市场数据",
          "input": {
            "symbol": "BTC"
          }
        }
      ]
    },
    "metadata": {
      "totalSteps": 1,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp"]
    },
    "replacementInfo": {
      "originalMcp": "coingecko-server",
      "newMcp": "coinmarketcap-mcp",
      "timestamp": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

7. **流结束标记**:
```
data: [DONE]
```

**错误事件**:
```json
{
  "event": "error",
  "data": {
    "message": "替换失败: 找不到指定的新MCP",
    "details": "错误详细信息"
  }
}
```

**步骤类型说明**:
- `validation`: 验证替换条件
- `mcp_replacement`: 构建新的MCP列表
- `workflow_regeneration`: 重新生成工作流
- `task_update`: 更新任务信息
- `completion`: 完成替换操作

**错误响应**:
- `400 Bad Request`: 参数错误
- `403 Forbidden`: 无权限替换此任务的MCP
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 获取任务关联的会话

**端点**: `GET /api/tasks/:id/conversation`

**描述**: 获取与特定任务关联的会话信息

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）

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
- `400 Bad Request`: 缺少用户ID
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

### MCP信息查询API

#### 11. 获取所有MCP列表

**端点**: `GET /api/mcp`

**描述**: 获取所有可用的MCP工具列表

**认证**: 可选

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "name": "coingecko-server",
      "description": "CoinGecko官方MCP服务器，提供全面的加密货币市场数据",
      "authRequired": true,
      "authFields": ["COINGECKO_API_KEY"],
      "category": "Market Data",
      "imageUrl": "https://example.com/coingecko.png",
      "githubUrl": "https://docs.coingecko.com/reference/mcp-server"
    },
    {
      "name": "github-mcp-server",
      "description": "GitHub仓库管理和操作",
      "authRequired": true,
      "authFields": ["github_token"],
      "category": "Development Tools",
      "imageUrl": "https://example.com/github.png",
      "githubUrl": "https://github.com/github/github-mcp-server"
    }
  ]
}
```

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

#### 12. 按类别获取MCP

**端点**: `GET /api/mcp/category/:category`

**描述**: 获取指定类别的MCP工具列表

**认证**: 可选

**路径参数**:
- `category`: MCP类别名称（如：Market Data、Development Tools、Trading等）

**响应**:
```json
{
  "success": true,
  "data": {
    "category": "Market Data",
    "mcps": [
      {
        "name": "coingecko-server",
        "description": "CoinGecko官方MCP服务器",
        "authRequired": true,
        "category": "Market Data",
        "imageUrl": "https://example.com/coingecko.png",
        "githubUrl": "https://docs.coingecko.com/reference/mcp-server"
      }
    ]
  }
}
```

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

#### 13. 获取所有MCP类别

**端点**: `GET /api/mcp/categories`

**描述**: 获取所有可用的MCP类别及其包含的工具数量

**认证**: 可选

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "name": "Market Data",
      "count": 8
    },
    {
      "name": "Development Tools",
      "count": 12
    },
    {
      "name": "Trading",
      "count": 4
    },
    {
      "name": "Social",
      "count": 4
    },
    {
      "name": "Chain PRC",
      "count": 2
    }
  ]
}
```

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

#### 14. 根据ID获取MCP详情

**端点**: `GET /api/mcp/:id`

**描述**: 获取指定MCP的详细信息

**认证**: 可选

**路径参数**:
- `id`: MCP的名称/ID

**响应**:
```json
{
  "success": true,
  "data": {
    "name": "coingecko-server",
    "description": "CoinGecko官方MCP服务器，提供全面的加密货币市场数据、历史价格和OHLC K线数据",
    "authRequired": true,
    "authFields": ["COINGECKO_API_KEY"],
    "category": "Market Data",
    "imageUrl": "https://example.com/coingecko.png",
    "githubUrl": "https://docs.coingecko.com/reference/mcp-server",
    "authParams": {
      "COINGECKO_API_KEY": {
        "type": "string",
        "description": "CoinGecko API密钥",
        "required": true
      }
    }
  }
}
```

**错误响应**:
- `404 Not Found`: 指定的MCP不存在
- `500 Internal Server Error`: 服务器内部错误

---

## 智能MCP替换流程示例

以下是一个完整的智能MCP替换流程示例：

### 1. 创建任务并分析

```bash
# 创建任务
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content":"获取比特币当前价格和市场分析"}'

# 分析任务（流式）
curl -X POST http://localhost:3001/api/tasks/task_123456/analyze-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 2. 查看生成的工作流

```bash
curl -X GET http://localhost:3001/api/tasks/task_123456 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. 获取MCP替代选项

```bash
curl -X GET http://localhost:3001/api/tasks/task_123456/mcp-alternatives/coingecko-server \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 4. 验证替换的合理性

```bash
curl -X POST http://localhost:3001/api/tasks/task_123456/validate-mcp-replacement \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "originalMcpName": "coingecko-server",
    "newMcpName": "coinmarketcap-mcp"
  }'
```

### 5. 执行智能替换

```bash
curl -X POST http://localhost:3001/api/tasks/task_123456/replace-mcp-smart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "originalMcpName": "coingecko-server",
    "newMcpName": "coinmarketcap-mcp"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_123456",
    "message": "成功将 coingecko-server 替换为 coinmarketcap-mcp 并重新生成了工作流",
    "mcpWorkflow": {
      "mcps": [
        {
          "name": "coinmarketcap-mcp",
          "description": "CoinMarketCap市场数据集成",
          "authRequired": true,
          "authVerified": false,
          "category": "Market Data",
          "imageUrl": "https://example.com/cmc.png",
          "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp",
          "authParams": {
            "API_KEY": "CoinMarketCap API密钥"
          }
        }
      ],
      "workflow": [
        {
          "step": 1,
          "mcp": "coinmarketcap-mcp",
          "action": "获取比特币当前价格和市场数据",
          "input": {
            "symbol": "BTC"
          }
        }
      ]
    },
    "metadata": {
      "totalSteps": 1,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp"]
    },
    "replacementInfo": {
      "originalMcp": "coingecko-server",
      "newMcp": "coinmarketcap-mcp",
      "timestamp": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**注意**: 返回的 `mcpWorkflow` 和 `metadata` 字段格式与原始任务分析完全一致，前端可以使用相同的逻辑处理。

### 6. 验证替换结果

```bash
curl -X GET http://localhost:3001/api/tasks/task_123456 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**验证要点**:
- 检查 `mcpWorkflow.mcps` 中是否包含新的MCP
- 确认新MCP的认证状态（`authVerified`）
- 验证工作流步骤是否正确更新
- 如果新MCP需要认证，使用认证接口提供必要的认证信息

## 智能替换特性

### 1. 上下文感知替换
- 考虑当前任务内容和目标
- 分析与其他MCP工具的协作关系
- 智能评估功能匹配度

### 2. 合理性验证
- AI驱动的替换可行性分析
- 提供置信度评分（0-100）
- 详细的支持理由和潜在风险警告

### 3. 自动工作流重建
- 替换后自动重新生成工作流
- 确保新MCP与其他工具的兼容性
- 保持任务目标的一致性

### 4. 智能推荐算法
- 移除硬编码的替代映射
- 基于类别、功能和任务内容的智能推荐
- 考虑认证复杂度和工具稳定性

## 注意事项

### 返回格式一致性 ⭐
**重要**: 智能替换MCP接口 (`/api/tasks/:id/replace-mcp-smart`) 的返回格式与原始任务分析接口 (`/api/tasks/:id/analyze-stream`) 完全一致，包括：
- `mcpWorkflow` 结构完全相同
- `metadata` 字段格式完全相同
- MCP认证状态的处理逻辑完全相同

这确保了前端可以使用相同的组件和逻辑来处理两种情况的返回结果，无需额外的适配代码。

### MCP替换限制
1. **认证要求**: 替换后的MCP如果需要认证，需要重新验证
2. **功能差异**: 不同MCP的API接口可能存在差异
3. **数据格式**: 返回的数据格式可能不完全一致
4. **性能影响**: 替换操作会触发工作流重新分析

### 最佳实践
1. **替换前验证**: 始终使用验证接口检查替换的合理性
2. **备份工作流**: 重要任务建议备份原始工作流
3. **分步测试**: 替换后先测试基本功能再执行完整任务
4. **监控结果**: 关注替换后任务执行的成功率和质量 

**步骤类型说明**:
- `validation`: 验证替换条件
- `mcp_replacement`: 构建新的MCP列表
- `workflow_regeneration`: 重新生成工作流
- `task_update`: 更新任务信息
- `completion`: 完成替换操作

**错误响应**:
- `400 Bad Request`: 参数错误
- `403 Forbidden`: 无权限替换此任务的MCP
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 12. 批量替换MCP并重新分析任务

**端点**: `POST /api/tasks/:id/batch-replace-mcp`

**描述**: 批量替换任务中的多个MCP并重新分析工作流。**最终结果格式与原始任务分析完全一致**。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "replacements": [
    {
      "originalMcpName": "coingecko-server",
      "newMcpName": "coinmarketcap-mcp"
    },
    {
      "originalMcpName": "github-mcp-server",
      "newMcpName": "gitlab-mcp-server"
    }
  ],
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_123456",
    "message": "Successfully replaced 2 MCPs and regenerated workflow: coingecko-server -> coinmarketcap-mcp, github-mcp-server -> gitlab-mcp-server",
    "mcpWorkflow": {
      "mcps": [
        {
          "name": "coinmarketcap-mcp",
          "description": "CoinMarketCap市场数据集成",
          "authRequired": true,
          "authVerified": false,
          "category": "Market Data",
          "imageUrl": "https://example.com/cmc.png",
          "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp",
          "authParams": {
            "API_KEY": "CoinMarketCap API密钥"
          }
        },
        {
          "name": "gitlab-mcp-server",
          "description": "GitLab代码仓库管理",
          "authRequired": true,
          "authVerified": false,
          "category": "Development",
          "imageUrl": "https://example.com/gitlab.png",
          "githubUrl": "https://github.com/example/gitlab-mcp",
          "authParams": {
            "GITLAB_TOKEN": "GitLab访问令牌"
          }
        }
      ],
      "workflow": [
        {
          "step": 1,
          "mcp": "coinmarketcap-mcp",
          "action": "获取比特币当前价格和市场数据",
          "input": {
            "symbol": "BTC"
          }
        },
        {
          "step": 2,
          "mcp": "gitlab-mcp-server",
          "action": "创建项目分析报告",
          "input": {
            "project": "crypto-analysis"
          }
        }
      ]
    },
    "metadata": {
      "totalSteps": 2,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp", "gitlab-mcp-server"]
    },
    "replacementInfo": {
      "replacements": [
        {
          "originalMcpName": "coingecko-server",
          "newMcpName": "coinmarketcap-mcp"
        },
        {
          "originalMcpName": "github-mcp-server",
          "newMcpName": "gitlab-mcp-server"
        }
      ],
      "timestamp": "2023-06-20T08:00:00.000Z",
      "totalReplacements": 2
    }
  }
}
```

**错误响应**:
- `400 Bad Request`: 参数错误或批量替换失败
- `403 Forbidden`: 无权限替换此任务的MCP
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

#### 13. 批量替换MCP并重新分析任务（流式版本）

**端点**: `POST /api/tasks/:id/batch-replace-mcp/stream`

**描述**: 批量替换任务中的多个MCP并重新分析工作流的流式版本，实时返回批量替换和分析进度。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "replacements": [
    {
      "originalMcpName": "coingecko-server",
      "newMcpName": "coinmarketcap-mcp"
    },
    {
      "originalMcpName": "github-mcp-server",
      "newMcpName": "gitlab-mcp-server"
    }
  ],
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**流式响应事件**:

1. **批量替换开始**:
```json
{
  "event": "batch_replacement_start",
  "data": {
    "taskId": "task_123456",
    "replacements": [
      {
        "originalMcpName": "coingecko-server",
        "newMcpName": "coinmarketcap-mcp"
      },
      {
        "originalMcpName": "github-mcp-server",
        "newMcpName": "gitlab-mcp-server"
      }
    ],
    "totalReplacements": 2,
    "timestamp": "2023-06-20T08:00:00.000Z"
  }
}
```

2. **步骤开始**:
```json
{
  "event": "step_start",
  "data": {
    "stepType": "batch_validation",
    "stepName": "Validate Batch Replacement Conditions",
    "stepNumber": 1,
    "totalSteps": 5
  }
}
```

3. **步骤完成**:
```json
{
  "event": "step_complete",
  "data": {
    "stepType": "batch_validation",
    "content": "Batch validation passed: Can replace 2 MCPs",
    "reasoning": "All replacement MCPs exist and original MCPs are in current workflow",
    "replacements": "coingecko-server -> coinmarketcap-mcp, github-mcp-server -> gitlab-mcp-server"
  }
}
```

4. **批量替换完成**:
```json
{
  "event": "batch_replacement_complete",
  "data": {
    "taskId": "task_123456",
    "message": "Successfully replaced 2 MCPs and regenerated workflow",
    "mcpWorkflow": {
      "mcps": [...],
      "workflow": [...]
    },
    "metadata": {
      "totalSteps": 2,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp", "gitlab-mcp-server"]
    },
    "replacementInfo": {
      "replacements": [...],
      "replacementSummary": "coingecko-server -> coinmarketcap-mcp, github-mcp-server -> gitlab-mcp-server",
      "timestamp": "2023-06-20T08:00:00.000Z",
      "totalReplacements": 2
    }
  }
}
```

5. **流结束标记**:
```
data: [DONE]
```

**批量替换步骤类型**:
- `batch_validation`: 验证批量替换条件
- `batch_mcp_replacement`: 构建新的MCP列表
- `batch_workflow_regeneration`: 重新生成工作流
- `batch_task_update`: 更新任务信息
- `batch_completion`: 完成批量替换操作

---

#### 14. 确认替换MCP并重新分析任务（前端确认后调用）

**端点**: `POST /api/tasks/:id/confirm-replacement`

**描述**: 用户在前端确认替换选择后，执行最终的MCP替换并重新分析工作流。这是前端确认流程的最后一步。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "replacements": [
    {
      "originalMcpName": "coingecko-server",
      "newMcpName": "coinmarketcap-mcp"
    },
    {
      "originalMcpName": "github-mcp-server",
      "newMcpName": "gitlab-mcp-server"
    }
  ],
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_123456",
    "message": "Successfully replaced 2 MCPs and regenerated workflow: coingecko-server -> coinmarketcap-mcp, github-mcp-server -> gitlab-mcp-server",
    "mcpWorkflow": {
      "mcps": [...],
      "workflow": [...]
    },
    "metadata": {
      "totalSteps": 2,
      "requiresAuth": true,
      "mcpsRequiringAuth": ["coinmarketcap-mcp", "gitlab-mcp-server"]
    },
    "confirmationInfo": {
      "replacements": [...],
      "timestamp": "2023-06-20T08:00:00.000Z",
      "totalReplacements": 2,
      "confirmed": true
    }
  }
}
```

---

#### 15. 确认替换MCP并重新分析任务（流式版本）

**端点**: `POST /api/tasks/:id/confirm-replacement/stream`

**描述**: 用户确认替换的流式版本，实时返回确认和重新分析的进度。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "replacements": [
    {
      "originalMcpName": "coingecko-server",
      "newMcpName": "coinmarketcap-mcp"
    }
  ],
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**流式响应事件**:

1. **确认开始**:
```json
{
  "event": "confirmation_start",
  "data": {
    "taskId": "task_123456",
    "replacements": [...],
    "totalReplacements": 1,
    "timestamp": "2023-06-20T08:00:00.000Z"
  }
}
```

2. **确认完成**:
```json
{
  "event": "confirmation_complete",
  "data": {
    "taskId": "task_123456",
    "message": "MCP replacement confirmed and task reanalysis completed",
    "confirmed": true
  }
}
```

3. **流结束标记**:
```
data: [DONE]
```

---

## 对话管理 API

### 1. 创建新对话

**端点**: `POST /api/conversation`

**描述**: 创建新对话，支持传入第一条消息并自动生成标题。类似ChatGPT、DeepSeek等AI聊天应用的体验。

**认证**: 可选（可使用userId参数或访问令牌）

**请求体**:
```json
{
  "title": "自定义标题（可选）",
  "firstMessage": "第一条消息内容（可选）",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:

1. **仅创建对话（未提供firstMessage）**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_123456",
      "userId": "user_123",
      "title": "自定义标题",
      "taskCount": 0,
      "messageCount": 0,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

2. **创建对话并生成标题（提供firstMessage）**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_123456",
      "userId": "user_123",
      "title": "获取比特币价格信息",
      "taskCount": 0,
      "messageCount": 0,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    },
    "generatedTitle": "获取比特币价格信息",
    "message": "Conversation created successfully. Please send the first message using the message endpoint."
  }
}
```

**特性说明**:
- 如果提供`firstMessage`，系统会基于消息内容自动生成标题，但不存储消息
- 如果未提供`title`且提供了`firstMessage`，会使用AI自动生成标题（支持非流式版本）
- 标题生成降级策略：如果AI生成失败，会使用消息内容的前30个字符作为标题
- 消息处理分离：创建会话后，前端需要单独调用发送消息接口来处理第一条消息，避免消息重复
- 向后兼容：仍然支持传统的仅创建对话方式（不提供firstMessage）
- 优化体验：减少冗余操作，前端可以先创建会话获得标题，再发送消息进行处理

**错误响应**:
- `400 Bad Request`: 参数错误
- `401 Unauthorized`: 无效的访问令牌（如果使用认证）
- `500 Internal Server Error`: 服务器内部错误

---

### 2. 创建新对话（流式版本）

**端点**: `POST /api/conversation/stream`

**描述**: 创建新对话的流式版本，实时返回标题生成和对话创建进度。不处理消息内容，仅用于生成标题。

**认证**: 可选（可使用userId参数或访问令牌）

**请求体**:
```json
{
  "firstMessage": "帮我获取比特币的当前价格并分析趋势",
  "title": "自定义标题（可选）",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**注意**: 流式版本必须提供`firstMessage`参数用于生成标题。

**流式响应事件**:

1. **对话创建开始**:
```json
{
  "event": "conversation_creation_start",
  "data": {
    "userId": "user_123",
    "message": "Starting conversation creation..."
  }
}
```

2. **标题生成开始**:
```json
{
  "event": "title_generation_start",
  "data": {
    "message": "Generating conversation title..."
  }
}
```

3. **标题生成完成**:
```json
{
  "event": "title_generated",
  "data": {
    "title": "获取比特币价格并分析趋势"
  }
}
```

4. **对话创建中**:
```json
{
  "event": "conversation_creating",
  "data": {
    "message": "Creating conversation record..."
  }
}
```

5. **对话创建完成**:
```json
{
  "event": "conversation_created",
  "data": {
    "conversationId": "conv_123456",
    "title": "获取比特币价格并分析趋势",
    "message": "Conversation created successfully"
  }
}
```

6. **创建完成**:
```json
{
  "event": "conversation_creation_complete",
  "data": {
    "conversationId": "conv_123456",
    "title": "获取比特币价格并分析趋势",
    "message": "Conversation created successfully. Please send the first message using the message endpoint."
  }
}
```

7. **流结束标记**:
```
data: [DONE]
```

**使用场景**:
- 实时显示对话创建进度
- 展示AI标题生成过程
- 适合需要良好用户体验的前端应用
- 创建完成后，前端需要单独调用发送消息接口处理实际的消息内容

---

### 3. 获取对话列表

**端点**: `GET /api/conversation`

**描述**: 获取用户的对话列表。

**认证**: 可选（可使用userId参数或访问令牌）

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）
- `limit`: 每页数量（默认10）
- `offset`: 偏移量（默认0）
- `sortBy`: 排序字段（默认last_message_at）
- `sortDir`: 排序方向（asc/desc，默认desc）

**响应**:
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv_123456",
        "userId": "user_123",
        "title": "获取比特币价格信息",
        "lastMessageContent": "任务已完成，比特币当前价格为...",
        "lastMessageAt": "2023-06-20T08:30:00.000Z",
        "taskCount": 1,
        "messageCount": 4,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:30:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### 4. 获取对话详情

**端点**: `GET /api/conversation/:id`

**描述**: 获取特定对话的详细信息和所有消息。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 对话ID

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）

**响应**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_123456",
      "userId": "user_123",
      "title": "获取比特币价格信息",
      "lastMessageContent": "任务已完成",
      "lastMessageAt": "2023-06-20T08:30:00.000Z",
      "taskCount": 1,
      "messageCount": 4,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:30:00.000Z"
    },
    "messages": [
      {
        "id": "msg_123456",
        "conversationId": "conv_123456",
        "content": "帮我获取比特币的当前价格",
        "type": "user",
        "intent": "task",
        "taskId": "task_123456",
        "createdAt": "2023-06-20T08:00:00.000Z"
      },
      {
        "id": "msg_123457",
        "conversationId": "conv_123456",
        "content": "我已经为你创建了获取比特币价格的任务...",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "createdAt": "2023-06-20T08:00:00.000Z"
      }
    ]
  }
}
```

---

### 5. 发送消息

**端点**: `POST /api/conversation/:id/message`

**描述**: 向指定对话发送消息。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 对话ID

**请求体**:
```json
{
  "content": "消息内容",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg_123458",
      "conversationId": "conv_123456",
      "content": "消息内容",
      "type": "user",
      "intent": "chat",
      "createdAt": "2023-06-20T08:35:00.000Z"
    },
    "assistantResponse": {
      "id": "msg_123459",
      "conversationId": "conv_123456",
      "content": "AI助手的回复",
      "type": "assistant",
      "intent": "chat",
      "createdAt": "2023-06-20T08:35:00.000Z"
    },
    "intent": "chat",
    "taskId": null
  }
}
```

---

### 6. 发送消息（流式版本）

**端点**: `POST /api/conversation/:id/message/stream`

**描述**: 向指定对话发送消息的流式版本。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 对话ID

**请求体**:
```json
{
  "content": "消息内容",
  "userId": "用户ID（当未使用访问令牌时必需）"
}
```

**流式响应**: 参考消息处理的流式事件格式。

---

### 7. 获取对话关联的任务

**端点**: `GET /api/conversation/:id/tasks`

**描述**: 获取对话中创建的所有任务。

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 对话ID

**查询参数**:
- `userId`: 用户ID（当未使用访问令牌时必需）

**响应**:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_123456",
    "tasks": [
      {
        "id": "task_123456",
        "userId": "user_123",
        "title": "获取比特币价格数据",
        "content": "帮我获取比特币的当前价格",
        "status": "completed",
        "conversationId": "conv_123456",
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:30:00.000Z",
        "completedAt": "2023-06-20T08:30:00.000Z"
      }
    ],
    "count": 1
  }
}
```

**错误响应**:
- `400 Bad Request`: 参数错误
- `403 Forbidden`: 无权限访问此对话
- `404 Not Found`: 对话不存在
- `500 Internal Server Error`: 服务器内部错误