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

#### 消息存储机制

从v2.0开始，系统会将任务分析和执行的每个步骤作为消息存储到会话中，支持完整的任务处理过程记录：

**消息类型**:
- `user`: 用户消息
- `assistant`: AI助手消息

**消息意图**:
- `chat`: 普通聊天
- `task`: 任务相关

**消息步骤类型** (`metadata.stepType`):
- `ANALYSIS`: 需求分析
- `MCP_SELECTION`: MCP工具选择
- `DELIVERABLES`: 可交付确认
- `WORKFLOW`: 工作流构建
- `EXECUTION`: 任务执行
- `TASK_CREATION`: 任务创建
- `SUMMARY`: 结果摘要

**消息元数据** (`metadata`):
```json
{
  "stepType": "ANALYSIS",
  "stepNumber": 1,
  "stepName": "Analyze Task Requirements", 
  "totalSteps": 4,
  "taskPhase": "analysis",
  "isStreaming": false,
  "isComplete": true
}
```

**重要特性**:
- **原始内容存储**: 消息内容保持分析和执行接口的原始输出，不包含额外的格式化装饰
- **字段区分**: 通过 `metadata` 字段区分不同步骤和状态，方便前端灵活展示
- **流式支持**: 支持流式消息更新，提供实时的任务处理反馈
- **完整记录**: 从任务创建到分析到执行的每个步骤都有对应的消息记录

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
        "content": "帮我获取比特币当前价格并分析趋势",
        "type": "user",
        "intent": "task",
        "taskId": "task_123456",
        "createdAt": "2023-06-20T08:05:00.000Z"
      },
      {
        "id": "msg_2",
        "conversationId": "conv_123456",
        "content": "Task created: 帮我获取比特币当前价格并分析趋势",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "metadata": {
          "stepType": "TASK_CREATION",
          "stepName": "Task Creation",
          "taskPhase": "analysis",
          "isComplete": true
        },
        "createdAt": "2023-06-20T08:05:05.000Z"
      },
      {
        "id": "msg_3",
        "conversationId": "conv_123456",
        "content": "Based on your request to get Bitcoin's current price and analyze trends, I need to understand what specific information you're looking for and how detailed the analysis should be.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "metadata": {
          "stepType": "ANALYSIS",
          "stepNumber": 1,
          "stepName": "Analyze Task Requirements",
          "totalSteps": 4,
          "taskPhase": "analysis",
          "isComplete": true
        },
        "createdAt": "2023-06-20T08:05:10.000Z"
      },
      {
        "id": "msg_4",
        "conversationId": "conv_123456",
        "content": "For this task, I recommend using CoinGecko MCP server which provides comprehensive cryptocurrency market data including current prices, historical data, and market analytics.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "metadata": {
          "stepType": "MCP_SELECTION",
          "stepNumber": 2,
          "stepName": "Identify Relevant MCP Tools",
          "totalSteps": 4,
          "taskPhase": "analysis",
          "isComplete": true
        },
        "createdAt": "2023-06-20T08:05:15.000Z"
      },
      {
        "id": "msg_5",
        "conversationId": "conv_123456",
        "content": "Bitcoin price: $45,230.50 USD (+2.3% in 24h). Market cap: $890.2B. Trading volume: $28.5B. Technical analysis shows bullish momentum with RSI at 65.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "metadata": {
          "stepType": "EXECUTION",
          "stepNumber": 1,
          "stepName": "Get Bitcoin current price and market data",
          "totalSteps": 1,
          "taskPhase": "execution",
          "isComplete": true
        },
        "createdAt": "2023-06-20T08:05:25.000Z"
      },
      {
        "id": "msg_6",
        "conversationId": "conv_123456",
        "content": "Task execution completed successfully. Retrieved Bitcoin's current price ($45,230.50) with comprehensive market analysis including price trends, market cap, and technical indicators.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_123456",
        "metadata": {
          "stepType": "SUMMARY",
          "stepName": "Execution Summary",
          "taskPhase": "execution",
          "isComplete": true
        },
        "createdAt": "2023-06-20T08:05:30.000Z"
      }
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

对于任务意图，事件流将包含任务处理状态和消息存储：
```
data: {"event":"processing_start","data":{"messageId":"msg_7"}}

data: {"event":"intent_detection","data":{"status":"completed","intent":"task","confidence":0.98}}

data: {"event":"task_processing","data":{"status":"creating_task"}}

data: {"event":"message_stored","data":{"messageId":"msg_8","stepType":"TASK_CREATION","content":"Task created: 使用Playwright访问百度"}}

data: {"event":"task_processing","data":{"status":"task_created","taskId":"task_456","title":"使用Playwright访问百度"}}

data: {"event":"task_processing","data":{"status":"analyzing_task"}}

data: {"event":"message_stored","data":{"messageId":"msg_9","stepType":"ANALYSIS","stepNumber":1,"content":"Based on your request to use Playwright to access Baidu..."}}

data: {"event":"message_stored","data":{"messageId":"msg_10","stepType":"MCP_SELECTION","stepNumber":2,"content":"For this task, I recommend using Playwright MCP server..."}}

data: {"event":"task_processing","data":{"status":"executing_task"}}

data: {"event":"message_stored","data":{"messageId":"msg_11","stepType":"EXECUTION","stepNumber":1,"content":"Successfully navigated to Baidu homepage..."}}

data: {"event":"message_stored","data":{"messageId":"msg_12","stepType":"SUMMARY","content":"Task execution completed successfully..."}}

data: {"event":"processing_complete","data":{"messageId":"msg_7","responseId":"msg_8","intent":"task","taskId":"task_456"}}

data: [DONE]
```

**新增事件类型**:
- `message_stored`: 当任务步骤消息被存储时触发，包含消息ID、步骤类型和内容
- 每个事件包含 `stepType`、`stepNumber`（如适用）和原始内容
- 前端可以实时更新会话界面，显示任务处理的每个步骤

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
data: {"event":"analysis_start","data":{"taskId":"task_123456","conversationId":"conv_123456"}}

data: {"event":"step_start","data":{"step":1,"title":"Analyzing task requirements"}}

data: {"event":"message_stored","data":{"messageId":"msg_101","stepType":"ANALYSIS","stepNumber":1,"content":"Based on your request to get Bitcoin's current price and analyze trends, I need to understand what specific information you're looking for..."}}

data: {"event":"step_complete","data":{"step":1,"title":"Analyze Task Requirements","status":"completed"}}

data: {"event":"step_start","data":{"step":2,"title":"Identifying relevant MCP tools"}}

data: {"event":"message_stored","data":{"messageId":"msg_102","stepType":"MCP_SELECTION","stepNumber":2,"content":"For this task, I recommend using CoinGecko MCP server which provides comprehensive cryptocurrency market data..."}}

data: {"event":"step_complete","data":{"step":2,"title":"Identify Relevant MCP Tools","status":"completed"}}

data: {"event":"step_start","data":{"step":3,"title":"Confirming deliverables"}}

data: {"event":"message_stored","data":{"messageId":"msg_103","stepType":"DELIVERABLES","stepNumber":3,"content":"I can deliver the following for your Bitcoin price analysis request: Current price in USD, 24-hour price change..."}}

data: {"event":"step_complete","data":{"step":3,"title":"Confirm Deliverables","status":"completed"}}

data: {"event":"step_start","data":{"step":4,"title":"Building MCP workflow"}}

data: {"event":"message_stored","data":{"messageId":"msg_104","stepType":"WORKFLOW","stepNumber":4,"content":"I will create a workflow that uses the CoinGecko MCP server to retrieve Bitcoin's current price and market data..."}}

data: {"event":"step_complete","data":{"step":4,"title":"Build MCP Workflow","status":"completed"}}

data: {"event":"message_stored","data":{"messageId":"msg_105","stepType":"SUMMARY","content":"Task analysis completed. Identified 1 relevant tools and built 1 execution steps."}}

data: {"event":"analysis_complete","data":{"mcpWorkflow":{"mcps":[...],"workflow":[...]}}}

data: [DONE]
```

**消息存储特性**:
- 每个分析步骤都会创建对应的消息记录
- 消息内容为分析接口的原始输出，不包含额外的格式化装饰
- 通过 `stepType` 和 `stepNumber` 区分不同的分析阶段
- 前端可以实时显示分析进度和结果

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
data: {"event":"execution_start","data":{"taskId":"task_123456","conversationId":"conv_123456"}}

data: {"event":"step_start","data":{"step":1,"mcp":"coingecko-server","action":"Get Bitcoin current price and market data"}}

data: {"event":"message_stored","data":{"messageId":"msg_201","stepType":"EXECUTION","stepNumber":1,"content":"Bitcoin price: $45,230.50 USD (+2.3% in 24h). Market cap: $890.2B. Trading volume: $28.5B. Technical analysis shows bullish momentum with RSI at 65."}}

data: {"event":"step_complete","data":{"step":1,"status":"success","result":"Bitcoin price: $45,230.50 USD (+2.3% in 24h)..."}}

data: {"event":"message_stored","data":{"messageId":"msg_202","stepType":"SUMMARY","content":"Task execution completed successfully. Retrieved Bitcoin's current price ($45,230.50) with comprehensive market analysis including price trends, market cap, and technical indicators."}}

data: {"event":"execution_complete","data":{"summary":"Task execution completed successfully. Retrieved Bitcoin's current price with comprehensive market analysis."}}

data: [DONE]
```

**执行消息存储特性**:
- 每个执行步骤都会创建对应的消息记录
- 消息内容为执行结果的原始输出，保持工具返回的原始格式
- 执行完成后会创建总结消息
- 支持错误状态的消息存储（如执行失败时）

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

## 消息存储机制详解

### 概述

从v2.0开始，MCP LangChain 服务引入了完整的消息存储机制，将任务分析和执行的每个步骤都作为消息存储到会话中。这使得前端可以展示完整的任务处理过程，提供更好的用户体验。

### 核心特性

#### 1. 原始内容存储
- **无额外装饰**: 消息内容直接存储分析和执行接口的原始输出
- **保持格式**: 不添加额外的中文格式化内容（如表情符号、标题装饰等）
- **纯净数据**: 前端可以根据需要自行格式化展示

#### 2. 字段驱动区分
- **stepType**: 通过枚举值区分不同的处理步骤
- **taskPhase**: 区分分析阶段（analysis）和执行阶段（execution）
- **stepNumber**: 标识步骤在当前阶段中的顺序
- **metadata**: 包含完整的步骤元信息

#### 3. 流式支持
- **实时更新**: 支持流式消息创建和更新
- **占位消息**: 创建占位消息后实时更新内容
- **完成标记**: 通过 `isComplete` 标识消息是否完成

### 消息类型和步骤

#### 任务分析阶段消息
```json
{
  "stepType": "ANALYSIS",
  "stepNumber": 1,
  "stepName": "Analyze Task Requirements",
  "taskPhase": "analysis",
  "content": "Based on your request to get Bitcoin's current price..."
}
```

#### 任务执行阶段消息
```json
{
  "stepType": "EXECUTION", 
  "stepNumber": 1,
  "stepName": "Get Bitcoin current price and market data",
  "taskPhase": "execution",
  "content": "Bitcoin price: $45,230.50 USD (+2.3% in 24h)..."
}
```

### 前端展示建议

#### 1. 步骤分组
```javascript
// 按 taskPhase 分组
const analysisMessages = messages.filter(m => 
  m.metadata?.taskPhase === 'analysis'
);
const executionMessages = messages.filter(m => 
  m.metadata?.taskPhase === 'execution'
);
```

#### 2. 步骤排序
```javascript
// 按 stepNumber 排序
const sortedSteps = messages
  .filter(m => m.metadata?.stepNumber)
  .sort((a, b) => a.metadata.stepNumber - b.metadata.stepNumber);
```

#### 3. 状态显示
```javascript
// 根据 stepType 显示不同图标
const getStepIcon = (stepType) => {
  switch(stepType) {
    case 'ANALYSIS': return '🔍';
    case 'MCP_SELECTION': return '🔧';
    case 'DELIVERABLES': return '📦';
    case 'WORKFLOW': return '⚙️';
    case 'EXECUTION': return '🚀';
    case 'SUMMARY': return '📋';
    default: return '💬';
  }
};
```

### 实现优势

#### 1. 完整追踪
- 用户可以看到任务从创建到完成的每个步骤
- 便于调试和问题排查
- 提供透明的处理过程

#### 2. 灵活展示
- 前端可以根据 stepType 自定义展示样式
- 支持折叠/展开不同阶段的详情
- 可以实现进度条或时间线视图

#### 3. 向后兼容
- 不影响原有的聊天消息功能
- 现有的消息结构保持不变
- 新功能通过 metadata 字段扩展

### 最佳实践

#### 1. 消息展示
- 使用 stepType 区分消息类型并应用不同样式
- 对于长内容，考虑提供展开/折叠功能
- 显示步骤进度（如 "步骤 2/4"）

#### 2. 错误处理
- 监听流式响应中的错误事件
- 对于失败的步骤，显示错误信息
- 提供重试机制

#### 3. 性能优化
- 对于大量消息，考虑虚拟滚动
- 懒加载历史消息
- 缓存消息内容以避免重复渲染

---

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

## Agent管理 API

Agent系统允许用户将完成的任务工作流保存为可重用的Agent，支持私有和公开两种模式。Agent包含自动生成的名称、描述和相关问题，用户可以尝试使用Agent来执行类似的任务。

### Agent数据模型

Agent实体包含以下字段：

- **id**: Agent的唯一标识符
- **userId**: 创建者的用户ID
- **username**: 创建者的用户名（从users表同步）
- **avatar**: 创建者的头像URL（从users表同步）
- **name**: Agent的名称（最多50字符）
- **description**: Agent的描述（最多280字符）
- **status**: Agent的状态（`private`/`public`/`draft`）
- **taskId**: 来源任务的ID（可选）
- **categories**: Agent所属的类别列表（从MCP工作流中提取）
- **mcpWorkflow**: 完整的MCP工作流配置
- **metadata**: 元数据信息（如所需MCP、步骤数、预计时间等）
- **relatedQuestions**: 相关问题列表（帮助用户理解使用场景）
- **usageCount**: 使用次数统计
- **createdAt**: 创建时间
- **updatedAt**: 更新时间

### Agent状态说明

- **private**: 私有Agent，仅创建者可见和使用
- **public**: 公开Agent，在Agent市场中对所有用户可见
- **draft**: 草稿状态，仅创建者可见，用于编辑中的Agent

### 1. 创建Agent（通用接口）

**端点**: `POST /api/agent`

**描述**: 通用的Agent创建接口，允许用户从零开始创建Agent或基于现有配置创建

**认证**: 需要访问令牌

**请求体**:
```json
{
  "name": "Bitcoin Price Analyzer",
  "description": "A comprehensive cryptocurrency price analysis agent",
  "status": "private",
  "taskId": "task_123456",
  "username": "CryptoTrader",
  "avatar": "https://example.com/avatar.png",
  "categories": ["Market Data", "Trading"],
  "mcpWorkflow": {
    "mcps": [
      {
        "name": "coingecko-server",
        "description": "CoinGecko API integration",
        "authRequired": true,
        "category": "Market Data"
      }
    ],
    "workflow": [
      {
        "step": 1,
        "mcp": "coingecko-server",
        "action": "Get cryptocurrency prices",
        "input": {}
      }
    ]
  },
  "metadata": {
    "requiredMcps": ["coingecko-server"],
    "totalSteps": 1,
    "estimatedTime": "30 seconds"
  },
  "relatedQuestions": [
    "How to get crypto prices?",
    "What cryptocurrencies are supported?",
    "Can I track price changes?"
  ]
}
```

**必需字段**:
- `name`: Agent名称（字符串，最多50字符）
- `description`: Agent描述（字符串，最多280字符）
- `status`: Agent状态（`private`/`public`/`draft`）

**可选字段**:
- `taskId`: 关联的任务ID（可选）
- `username`: 用户名（可选，默认从当前用户获取）
- `avatar`: 头像URL（可选，默认从当前用户获取）
- `categories`: 分类列表（可选，字符串数组）
- `mcpWorkflow`: MCP工作流配置（可选）
- `metadata`: 元数据信息（可选）
- `relatedQuestions`: 相关问题列表（可选，字符串数组）

**字段验证**:
- `categories`: 必须是字符串数组
- `relatedQuestions`: 必须是字符串数组
- `status`: 必须是 `private`、`public` 或 `draft` 之一

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "agent_123456",
    "userId": "user_123",
    "username": "CryptoTrader",
    "avatar": "https://example.com/avatar.png",
    "name": "Bitcoin Price Analyzer",
    "description": "A comprehensive cryptocurrency price analysis agent",
    "status": "private",
    "taskId": "task_123456",
    "categories": ["Market Data", "Trading"],
    "mcpWorkflow": {...},
    "metadata": {...},
    "relatedQuestions": [...],
    "usageCount": 0,
    "createdAt": "2023-06-20T08:00:00.000Z",
    "updatedAt": "2023-06-20T08:00:00.000Z"
  }
}
```

**错误响应**:
- `400 Bad Request`: 缺少必需字段或字段格式错误
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 2. 生成Agent信息

**端点**: `POST /api/agent/generate-info/:taskId`

**描述**: 生成Agent的name和description供前端显示，用户可以在此基础上编辑后创建Agent

**认证**: 需要访问令牌

**路径参数**:
- `taskId`: 任务ID

**响应**:
```json
{
  "success": true,
  "data": {
    "name": "BitcoinPriceAnalyzer",
    "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis including price trends, market cap, and technical indicators using CoinGecko data."
  }
}
```

**错误响应**:
- `401 Unauthorized`: User not authenticated
- `404 Not Found`: Task not found or access denied
- `400 Bad Request`: Task is not completed
- `500 Internal Server Error`: Failed to generate Agent info

---

### 2. 从任务预览Agent

**端点**: `GET /api/agent/preview/:taskId`

**描述**: 预览从指定任务创建Agent时的自动生成内容，不实际创建Agent

**认证**: 需要访问令牌

**路径参数**:
- `taskId`: 任务ID

**响应**:
```json
{
  "success": true,
  "data": {
    "suggestedName": "BitcoinPriceAnalyzer",
    "suggestedDescription": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis including price trends, market cap, and technical indicators using CoinGecko data.",
    "relatedQuestions": [
      "How do I get real-time cryptocurrency prices?",
      "What market data can this agent provide?",
      "Can this agent analyze other cryptocurrencies?"
    ],
    "taskInfo": {
      "title": "Get Bitcoin current price and market analysis",
      "content": "Help me get Bitcoin's current price and analyze market trends",
      "status": "completed"
    },
    "mcpWorkflow": {
      "mcps": [...],
      "workflow": [...]
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 4. 从任务创建Agent

**端点**: `POST /api/agent/create/:taskId`

**描述**: 从指定任务创建Agent，支持私有和公开模式，可选择使用自定义的name和description

**认证**: 需要访问令牌

**路径参数**:
- `taskId`: 任务ID

**请求体**:
```json
{
  "status": "private",
  "name": "自定义Agent名称（可选）",
  "description": "自定义Agent描述（可选）",
  "username": "用户名（可选）",
  "avatar": "头像URL（可选）",
  "categories": ["Market Data", "Trading"],
  "relatedQuestions": [
    "How to get real-time crypto prices?",
    "What market data is available?",
    "Can I analyze other cryptocurrencies?"
  ]
}
```

**参数说明**:
- `status`: Agent状态（必需）
  - `private`: 私有Agent，仅创建者可见和使用
  - `public`: 公开Agent，在Agent市场中对所有用户可见
- `name`: 自定义Agent名称（可选）。如果不提供，系统会自动生成
- `description`: 自定义Agent描述（可选）。如果不提供，系统会自动生成
- `username`: 用户名（可选）。如果不提供，会从当前用户信息中自动获取
- `avatar`: 头像URL（可选）。如果不提供，会从当前用户信息中自动获取
- `categories`: 分类列表（可选，字符串数组）。如果不提供，会从MCP工作流中自动提取
- `relatedQuestions`: 相关问题列表（可选，字符串数组）。如果不提供，系统会自动生成

**响应**:
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_123456",
      "userId": "user_123",
      "username": "CryptoTrader",
      "avatar": "https://example.com/avatar.png",
      "name": "BitcoinPriceAnalyzer",
      "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis including price trends, market cap, and technical indicators using CoinGecko data.",
      "relatedQuestions": [
        "How do I get real-time cryptocurrency prices?",
        "What market data can this agent provide?",
        "Can this agent analyze other cryptocurrencies?"
      ],
      "status": "private",
      "taskId": "task_123456",
      "categories": ["Market Data", "Trading"],
      "mcpWorkflow": {
        "mcps": [
          {
            "name": "coingecko-server",
            "description": "CoinGecko官方MCP服务器",
            "authRequired": true,
            "category": "Market Data",
            "imageUrl": "https://example.com/coingecko.png",
            "githubUrl": "https://docs.coingecko.com/reference/mcp-server"
          }
        ],
        "workflow": [
          {
            "step": 1,
            "mcp": "coingecko-server",
            "action": "Get Bitcoin current price and market data",
            "input": {}
          }
        ]
      },
      "metadata": {
        "requiredMcps": ["coingecko-server"],
        "totalSteps": 1,
        "estimatedTime": "30 seconds"
      },
      "usageCount": 25,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该任务
- `404 Not Found`: 任务不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 5. 获取Agent列表

**端点**: `GET /api/agent`

**描述**: 获取Agent列表，支持按状态和用户筛选

**认证**: 需要访问令牌

**查询参数**:
- `status`: Agent状态筛选 (`private`, `public`, `all`)，默认为 `all`
- `category`: 按类别筛选（可选）
- `search`: 搜索关键词（可选）
- `userId`: 用户ID筛选（可选）
- `limit`: 每页数量（默认10）
- `offset`: 偏移量（默认0）
- `sortBy`: 排序字段（默认 `created_at`）
- `sortDir`: 排序方向（`asc` 或 `desc`，默认 `desc`）

**响应**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_123456",
        "userId": "user_123",
        "username": "CryptoTrader",
        "avatar": "https://example.com/avatar.png",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis...",
        "relatedQuestions": [
          "How do I get real-time cryptocurrency prices?",
          "What market data can this agent provide?",
          "Can this agent analyze other cryptocurrencies?"
        ],
        "status": "public",
        "taskId": "task_123456",
        "categories": ["Market Data", "Trading"],
        "metadata": {
          "requiredMcps": ["coingecko-server"],
          "totalSteps": 1,
          "estimatedTime": "30 seconds"
        },
        "usageCount": 25,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 6. 获取Agent详情

**端点**: `GET /api/agent/:id`

**描述**: 获取指定Agent的详细信息

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**响应**:
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_123456",
      "userId": "user_123",
      "username": "CryptoTrader",
      "avatar": "https://example.com/avatar.png",
      "name": "BitcoinPriceAnalyzer",
      "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis including price trends, market cap, and technical indicators using CoinGecko data.",
      "relatedQuestions": [
        "How do I get real-time cryptocurrency prices?",
        "What market data can this agent provide?",
        "Can this agent analyze other cryptocurrencies?"
      ],
      "status": "public",
      "taskId": "task_123456",
      "categories": ["Market Data", "Trading"],
      "mcpWorkflow": {
        "mcps": [
          {
            "name": "coingecko-server",
            "description": "CoinGecko官方MCP服务器",
            "authRequired": true,
            "authVerified": false,
            "category": "Market Data",
            "imageUrl": "https://example.com/coingecko.png",
            "githubUrl": "https://docs.coingecko.com/reference/mcp-server",
            "authParams": {
              "COINGECKO_API_KEY": "string"
            }
          }
        ],
        "workflow": [
          {
            "step": 1,
            "mcp": "coingecko-server",
            "action": "Get Bitcoin current price and market data",
            "input": {}
          }
        ]
      },
      "metadata": {
        "requiredMcps": ["coingecko-server"],
        "totalSteps": 1,
        "estimatedTime": "30 seconds"
      },
      "usageCount": 25,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent（私有Agent且非创建者）
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 6. 尝试使用Agent

**端点**: `POST /api/agent/:id/try`

**描述**: 开始与Agent的多轮对话，支持聊天和任务执行，Agent会智能识别用户意图并相应处理

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**请求体**:
```json
{
  "content": "Hello, can you help me get the current Bitcoin price?"
}
```

**成功响应（认证已验证）**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_1234567890",
      "title": "Try BitcoinPriceAnalyzer",
      "agentInfo": {
        "id": "agent_123456",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis..."
      }
    },
    "message": "Agent trial conversation started successfully"
  }
}
```

**需要认证的响应**:
```json
{
  "success": false,
  "error": "AUTH_REQUIRED",
  "needsAuth": true,
  "missingAuth": [
    {
      "mcpName": "coingecko-mcp",
      "description": "CoinGecko cryptocurrency market data MCP",
      "authParams": {
        "apiKey": "required"
      }
    }
  ],
  "message": "Please verify auth for all relevant MCP servers first."
}
```

**错误响应**:
- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

### Agent多轮对话流程

1. **开始Agent试用**:
   ```bash
   curl -X POST "http://localhost:3000/api/agent/agent_123/try" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Hello, what can you help me with?"}'
   ```

2. **继续对话**（使用返回的会话ID）:
   ```bash
   curl -X POST "http://localhost:3000/api/conversation/conv_1234567890/message" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Can you get me the current Bitcoin price?"}'
   ```

3. **Agent智能处理**:
   - **对话意图**: Agent会进行自然对话，回答问题、提供建议
   - **任务意图**: Agent会识别任务请求，使用其MCP工作流执行具体任务
   - **自动识别**: 基于消息内容和Agent能力智能判断用户意图

### Agent多轮对话特性

- **🧠 智能意图识别**: 自动区分对话和任务请求
- **💬 上下文记忆**: 维持整个对话的上下文，理解前后关联
- **⚡ 工作流集成**: 任务时自动使用Agent的MCP工作流
- **💫 自然对话**: 非任务时进行友好的聊天交流
- **🔧 错误处理**: 优雅处理执行错误和异常情况

### 使用示例

**场景1 - 对话交流**:
```
用户: "Hello, what can you do?"
Agent: "Hi! I'm BitcoinPriceAnalyzer. I can help you get real-time Bitcoin prices, analyze market trends, and provide cryptocurrency insights. What would you like to know?"
```

**场景2 - 任务执行**:
```
用户: "Get me the current Bitcoin price"
Agent: "I'll help you get the current Bitcoin price. Let me fetch that information for you..."
[Agent执行工作流，调用CoinGecko API]
Agent: "The current Bitcoin price is $43,250.75 USD (as of 2023-06-20 14:30:00 UTC)..."
```

**场景3 - 混合对话**:
```
用户: "What's Bitcoin's performance this week?"
Agent: "Let me analyze Bitcoin's performance for you this week..."
[执行任务]
Agent: "Based on the data, Bitcoin has gained 5.2% this week..."
用户: "Is that good compared to other cryptocurrencies?"
Agent: "Yes, that's quite good! Bitcoin's 5.2% gain outperformed many other major cryptocurrencies..."
```

---

### 7. 更新Agent

**端点**: `PUT /api/agent/:id`

**描述**: 更新Agent信息，仅Agent创建者可操作

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**请求体**:
```json
{
  "name": "Enhanced Bitcoin Price Analyzer",
  "description": "An enhanced intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis...",
  "status": "public",
  "relatedQuestions": [
    "How do I get real-time cryptocurrency prices?",
    "What market data can this agent provide?",
    "Can this agent analyze other cryptocurrencies?",
    "How accurate are the price predictions?"
  ]
}
```

**支持的字段**:
- `name`: Agent名称（可选）
- `description`: Agent描述（可选）
- `status`: Agent状态（可选）
- `metadata`: 元数据信息（可选）
- `relatedQuestions`: 相关问题列表（可选，字符串数组）

**响应**:
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_123456",
      "userId": "user_123",
      "username": "CryptoTrader",
      "avatar": "https://example.com/avatar.png",
      "name": "Enhanced Bitcoin Price Analyzer",
      "description": "An enhanced intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis...",
      "relatedQuestions": [
        "How do I get real-time cryptocurrency prices?",
        "What market data can this agent provide?",
        "Can this agent analyze other cryptocurrencies?",
        "How accurate are the price predictions?"
      ],
      "status": "public",
      "taskId": "task_123456",
      "categories": ["Market Data", "Trading"],
      "mcpWorkflow": {...},
      "metadata": {...},
      "usageCount": 25,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T09:00:00.000Z"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权修改该Agent（仅创建者可修改）
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 8. 删除Agent

**端点**: `DELETE /api/agent/:id`

**描述**: 删除Agent，仅Agent创建者可操作

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "Agent deleted successfully",
    "agentId": "agent_123456",
    "deletedAt": "2023-06-20T09:00:00.000Z"
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权删除该Agent（仅创建者可删除）
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 9. 获取所有Agent分类列表

**端点**: `GET /api/agent/categories`

**描述**: 获取所有可用的Agent分类及其Agent数量统计

**认证**: 不需要认证

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "name": "Market Data",
      "count": 15
    },
    {
      "name": "Development Tools", 
      "count": 8
    },
    {
      "name": "Trading",
      "count": 6
    },
    {
      "name": "Social",
      "count": 4
    }
  ],
  "message": "分类列表功能正在开发中"
}
```

**字段说明**:
- `name`: 分类名称
- `count`: 该分类下的Agent数量

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 10. 按分类获取Agent列表

**端点**: `GET /api/agent/category/:category`

**描述**: 获取指定分类下的所有公开Agent

**认证**: 不需要认证

**路径参数**:
- `category`: 分类名称（如：Market Data、Development Tools等）

**查询参数**:
- `search`: 搜索关键词（可选）
- `orderBy`: 排序字段（可选，默认 `usage_count`）
- `order`: 排序方向（`asc` 或 `desc`，默认 `desc`）
- `limit`: 每页数量（可选，默认10）
- `offset`: 偏移量（可选，默认0）

**响应**:
```json
{
  "success": true,
  "data": {
    "category": "Market Data",
    "agents": [
      {
        "id": "agent_123456",
        "userId": "user_123",
        "username": "CryptoTrader",
        "avatar": "https://example.com/avatar.png",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price...",
        "relatedQuestions": [...],
        "status": "public",
        "categories": ["Market Data", "Trading"],
        "metadata": {...},
        "usageCount": 25,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:00:00.000Z"
      }
    ],
    "total": 15,
    "limit": 10,
    "offset": 0
  }
}
```

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 11. 获取用户创建的Agent

**端点**: `GET /api/agent/my-agents`

**描述**: 获取当前用户创建的所有Agent

**认证**: 需要访问令牌

**查询参数**:
- `status`: Agent状态筛选 (`private`, `public`, `all`)，默认为 `all`
- `category`: 按类别筛选（可选）
- `search`: 搜索关键词（可选）
- `limit`: 每页数量（默认10）
- `offset`: 偏移量（默认0）
- `sortBy`: 排序字段（默认 `created_at`）
- `sortDir`: 排序方向（`asc` 或 `desc`，默认 `desc`）

**响应**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_123456",
        "userId": "user_123",
        "username": "CryptoTrader",
        "avatar": "https://example.com/avatar.png",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price...",
        "relatedQuestions": [...],
        "status": "public",
        "taskId": "task_123456",
        "categories": ["Market Data", "Trading"],
        "metadata": {...},
        "usageCount": 25,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 12. 获取公开Agent列表

**端点**: `GET /api/agent/public`

**描述**: 获取所有公开的Agent，用于Agent市场展示

**认证**: 可选

**查询参数**:
- `category`: 按类别筛选（可选）
- `search`: 搜索关键词（可选）
- `limit`: 每页数量（默认10）
- `offset`: 偏移量（默认0）
- `sortBy`: 排序字段（默认 `usage_count`）
- `sortDir`: 排序方向（`asc` 或 `desc`，默认 `desc`）

**响应**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_123456",
        "userId": "user_123",
        "username": "CryptoTrader",
        "avatar": "https://example.com/avatar.png",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price...",
        "relatedQuestions": [...],
        "status": "public",
        "categories": ["Market Data", "Trading"],
        "metadata": {
          "requiredMcps": ["coingecko-server"],
          "totalSteps": 1,
          "estimatedTime": "30 seconds"
        },
        "usageCount": 25,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### Agent使用流程示例

以下是一个完整的Agent使用流程示例：

#### 1. 创建任务并完成

```bash
# 创建任务
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content":"获取比特币当前价格并分析市场趋势"}'

# 分析任务
curl -X POST http://localhost:3001/api/tasks/task_123456/analyze-stream \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 验证MCP认证
curl -X POST http://localhost:3001/api/tasks/task_123456/verify-auth \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"mcpName":"coingecko-server","authData":{"COINGECKO_API_KEY":"your_api_key"}}'

# 执行任务
curl -X POST http://localhost:3001/api/tasks/task_123456/execute-stream \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 2. 生成Agent信息

```bash
curl -X POST http://localhost:3001/api/agent/generate-info/task_123456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 3. 预览Agent内容

```bash
curl -X GET http://localhost:3001/api/agent/preview/task_123456 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 4. 创建Agent

```bash
# 使用自动生成的名称和描述
curl -X POST http://localhost:3001/api/agent/create/task_123456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"status":"public"}'

# 使用自定义的名称和描述
curl -X POST http://localhost:3001/api/agent/create/task_123456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "public",
    "name": "Bitcoin Market Analyzer Pro",
    "description": "Advanced Bitcoin price analysis tool with comprehensive market insights and trend predictions."
  }'
```

#### 5. 其他用户尝试使用Agent

```bash
curl -X POST http://localhost:3001/api/agent/agent_123456/try \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OTHER_USER_ACCESS_TOKEN" \
  -d '{"content":"I want to check the current Bitcoin price and get market analysis"}'
```

### Agent系统特性

#### 1. 自动内容生成
- **AI生成名称**: 使用AI自动生成符合平台规范的Agent名称（最多50字符，仅包含字母、数字和下划线）
- **智能描述**: 基于任务内容生成详细的Agent描述（最多280字符，英文描述）
- **相关问题**: 自动生成3个相关问题，帮助用户理解Agent的使用场景
- **灵活定制**: 支持用户自定义Agent名称和描述，也支持使用AI生成的内容

#### 2. 权限管理
- **私有Agent**: 仅创建者可见和使用
- **公开Agent**: 在Agent市场中对所有用户可见
- **访问控制**: 完整的权限验证系统

#### 3. 认证验证
- **MCP认证检查**: 尝试使用Agent时自动检查所需MCP的认证状态
- **认证引导**: 为未认证的MCP提供详细的认证指导
- **认证参数**: 清晰展示每个MCP所需的认证参数

#### 4. 用户信息同步
- **用户名同步**: 自动同步创建者的用户名到Agent记录
- **头像同步**: 自动同步创建者的头像到Agent记录
- **直接获取**: 无需联表查询即可获取Agent创建者信息
- **数据一致性**: 创建Agent时实时同步用户信息

#### 5. 分类管理
- **类别提取**: 自动从MCP工作流中提取类别信息
- **多类别支持**: 支持Agent属于多个类别
- **高效查询**: 通过categories字段实现高效的类别过滤

#### 6. 使用追踪
- **使用统计**: 追踪Agent的使用次数
- **排序优化**: 支持按使用次数排序，突出热门Agent

#### 7. 任务集成
- **无缝集成**: Agent基于已完成的任务工作流创建
- **工作流保存**: 完整保存MCP工作流配置
- **一键执行**: 用户可以一键使用Agent执行类似任务

### 数据库迁移

从v2.0开始，Agent系统引入了重要的数据库结构变更：

#### 新增字段
- **username**: 创建者用户名（从users表同步）
- **avatar**: 创建者头像URL（从users表同步）
- **categories**: Agent类别列表（JSONB格式，从MCP工作流中提取）

#### 迁移脚本
数据库迁移脚本会自动：
1. 添加新字段到agents表
2. 为categories字段创建GIN索引以提高查询性能
3. 从现有的mcp_workflow数据中提取类别信息
4. 同步用户信息到Agent记录
5. 确保所有Agent都有至少一个类别

#### 迁移命令
```bash
# 运行数据库迁移
npm run migrate up
```

### 最佳实践

#### 1. Agent创建
- **完整任务**: 确保基础任务已完全执行成功
- **内容生成**: 使用 `/api/agent/generate-info/:taskId` 接口预先生成Agent信息
- **内容编辑**: 基于AI生成的内容进行适当编辑，确保名称和描述准确反映Agent功能
- **描述清晰**: 使用清晰的描述帮助其他用户理解Agent功能
- **适当公开**: 对有价值的Agent选择公开状态

#### 2. Agent使用
- **认证准备**: 在使用Agent前准备好所需的MCP认证信息
- **内容适配**: 根据Agent的功能调整输入内容
- **结果验证**: 验证Agent执行结果是否符合预期

#### 3. Agent管理
- **定期更新**: 根据反馈和使用情况更新Agent信息
- **状态管理**: 合理设置Agent的公开/私有状态
- **性能监控**: 关注Agent的使用情况和执行效果

#### 4. 数据库性能
- **索引利用**: 充分利用categories字段的GIN索引进行类别过滤
- **查询优化**: 使用categories字段而非联表查询获取类别信息
- **缓存策略**: 对于频繁访问的Agent数据考虑使用缓存

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

---

### 8. 删除对话（软删除）

**端点**: `DELETE /api/conversation/:id`

**描述**: 软删除指定的对话。删除对话时，会同时软删除关联的所有消息、任务和任务步骤。软删除的数据不会在正常查询中出现，但数据仍保留在数据库中。

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
    "message": "对话已成功删除",
    "deletedAt": "2023-06-20T09:00:00.000Z",
    "cascadeDeleted": {
      "messages": 15,
      "tasks": 2,
      "taskSteps": 8
    }
  }
}
```

**字段说明**:
- `conversationId`: 被删除的对话ID
- `message`: 删除成功消息
- `deletedAt`: 删除时间戳
- `cascadeDeleted`: 级联删除的相关数据统计
  - `messages`: 被软删除的消息数量
  - `tasks`: 被软删除的任务数量
  - `taskSteps`: 被软删除的任务步骤数量

**软删除特性**:
- **级联删除**: 删除对话时自动软删除所有关联的消息、任务和任务步骤
- **数据保留**: 数据仍保存在数据库中，只是标记为已删除
- **查询过滤**: 软删除的数据不会在正常的列表和详情查询中出现
- **内存清理**: 删除对话时会清理相关的内存缓存
- **事务安全**: 使用数据库事务确保删除操作的原子性

**错误响应**:
- `400 Bad Request`: 参数错误或缺少用户ID
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权限删除此对话（只能删除自己的对话）
- `404 Not Found`: 对话不存在或已被删除
- `500 Internal Server Error`: 服务器内部错误

**使用示例**:
```bash
# 使用访问令牌删除对话
curl -X DELETE http://localhost:3001/api/conversation/conv_123456 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 使用userId参数删除对话
curl -X DELETE "http://localhost:3001/api/conversation/conv_123456?userId=user_123"
```

**注意事项**:
1. **不可恢复**: 目前不提供恢复已删除对话的接口
2. **权限验证**: 用户只能删除自己创建的对话
3. **关联数据**: 删除对话会影响所有关联的消息和任务
4. **缓存清理**: 删除操作会清理相关的内存缓存，可能影响正在进行的任务执行

---

## 软删除系统说明

### 概述

从v2.1开始，MCP LangChain 服务引入了完整的软删除系统，支持对会话、消息、任务和任务步骤进行软删除操作。软删除的数据不会在正常查询中出现，但仍保留在数据库中以便必要时进行数据恢复或审计。

### 软删除特性

#### 1. 级联软删除
- **会话删除**: 删除会话时自动软删除所有关联的消息、任务和任务步骤
- **任务删除**: 删除任务时自动软删除所有关联的任务步骤
- **原子操作**: 使用数据库事务确保级联删除的原子性

#### 2. 查询过滤
- **自动过滤**: 所有查询接口自动过滤已软删除的数据
- **性能优化**: 通过数据库索引优化软删除查询性能
- **一致性保证**: 确保软删除数据不会在任何正常查询中出现

#### 3. 数据保留
- **完整保留**: 软删除的数据完整保留在数据库中
- **删除标记**: 通过 `is_deleted` 字段标记删除状态
- **删除时间**: 通过 `deleted_at` 字段记录删除时间

#### 4. 内存管理
- **缓存清理**: 删除操作会清理相关的内存缓存
- **状态同步**: 确保内存状态与数据库状态保持一致

### 数据库结构

软删除系统在以下表中添加了相关字段：

```sql
-- 所有支持软删除的表都包含以下字段
ALTER TABLE conversations ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE conversations ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE task_steps ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE task_steps ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
```

### 索引优化

为了提高软删除查询的性能，系统创建了以下索引：

```sql
-- 基础软删除索引
CREATE INDEX idx_conversations_is_deleted ON conversations(is_deleted);
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted);
CREATE INDEX idx_tasks_is_deleted ON tasks(is_deleted);
CREATE INDEX idx_task_steps_is_deleted ON task_steps(is_deleted);

-- 复合索引优化查询
CREATE INDEX idx_conversations_user_not_deleted ON conversations(user_id, is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_messages_conversation_not_deleted ON messages(conversation_id, is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_user_not_deleted ON tasks(user_id, is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_task_steps_task_not_deleted ON task_steps(task_id, is_deleted) WHERE is_deleted = FALSE;
```

### API响应格式

软删除相关的API响应都遵循统一格式：

```json
{
  "success": true,
  "data": {
    "id": "被删除的资源ID",
    "message": "删除成功消息",
    "deletedAt": "删除时间戳",
    "cascadeDeleted": {
      "relatedResource1": "删除数量",
      "relatedResource2": "删除数量"
    }
  }
}
```

### 最佳实践

#### 1. 前端处理
- **确认对话框**: 删除操作前显示确认对话框
- **级联提示**: 告知用户删除会话会同时删除相关数据
- **状态更新**: 删除成功后及时更新前端状态

#### 2. 错误处理
- **权限检查**: 确保用户只能删除自己的数据
- **存在验证**: 检查资源是否存在且未被删除
- **事务回滚**: 删除失败时自动回滚所有相关操作

#### 3. 性能考虑
- **批量操作**: 对于大量数据的删除，考虑分批处理
- **索引利用**: 充分利用软删除相关的数据库索引
- **缓存清理**: 及时清理相关的内存缓存

### 未来扩展

软删除系统为未来的功能扩展预留了空间：

1. **数据恢复**: 可以添加恢复已删除数据的接口
2. **定期清理**: 可以实现定期清理长期软删除数据的机制
3. **审计日志**: 可以基于软删除记录实现完整的操作审计
4. **用户管理**: 管理员可以查看和管理所有用户的软删除数据