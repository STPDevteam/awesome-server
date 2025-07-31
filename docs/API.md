# MCP LangChain 服务 API 文档

## 概述

MCP LangChain 服务提供基于钱包认证的AI聊天服务，支持 Sign-In with Ethereum (SIWE) 标准进行用户认证。该服务支持会话管理、任务创建和执行，以及MCP工具调用。

**基础URL**: `http://localhost:3001`

## 架构更新 (v2.1)

从v2.1开始，Agent对话系统已完全解耦，具有以下重要变更：

### Agent对话系统解耦

- **独立服务**: 新增 `AgentConversationService` 专门处理Agent多轮对话
- **专用路由**: 新增 `/api/agent-conversation/` 路由处理Agent对话请求
- **完全分离**: Agent对话逻辑与传统任务执行对话完全分离
- **向后兼容**: 传统对话和任务执行功能保持不变

### 新的Agent对话流程

1. **Agent试用**: 使用 `POST /api/agent/:id/try` 开始Agent对话
2. **后续消息**: 使用 `POST /api/agent-conversation/:conversationId/message` 发送消息
3. **流式处理**: 使用 `POST /api/agent-conversation/:conversationId/message/stream` 获得实时响应
4. **对话管理**: 使用 `GET /api/agent-conversation/:conversationId` 获取对话详情
5. **记忆管理**: 使用 `DELETE /api/agent-conversation/:conversationId/memory` 清除记忆

### Agent MCP认证验证系统 (v2.1.1)

从v2.1.1开始，Agent系统引入了完整的MCP认证验证流程：

- **预检查机制**: Agent试用时自动检查所需MCP的认证状态
- **独立认证API**: 提供专门的Agent MCP认证API (`/api/agent/mcp/verify-auth`)
- **状态查询API**: 支持批量查询MCP认证状态 (`/api/agent/mcp/auth-status`)
- **多用户隔离**: 每个用户的MCP认证状态独立管理
- **实时验证**: 消息处理时自动进行MCP认证验证
- **详细反馈**: 提供未认证MCP的完整信息和认证参数
- **前端友好**: 返回结构化的认证信息供前端引导用户

### Agent专用执行器流式响应修复 (v2.1.2)

从v2.1.2开始，Agent专用执行器的流式响应得到了重要修复：

- **全步骤流式响应**: 所有工作流步骤都支持流式结果格式化，不仅仅是最后一步
- **新增事件类型**: 增加了 `step_result_chunk` 事件，用于中间步骤的流式结果块
- **改进用户体验**: 用户可以实时看到每个步骤的格式化结果，而不是等待步骤完成后一次性显示
- **一致的事件系统**: 统一的流式事件处理，所有步骤都提供相同的流式体验
- **性能感知优化**: 减少用户等待时的焦虑，提供更好的任务执行反馈

### 增强任务引擎 (v2.2)

从v2.2开始，引入了全新的增强任务引擎，结合Agent引擎的智能化优势：

- **分析与执行分离**: TaskAnalysisService负责工作流构建，EnhancedIntelligentTaskEngine负责智能执行
- **智能重试机制**: 每个工作流步骤支持最多2次重试，递增延迟策略
- **智能参数推导**: 从执行上下文自动推导缺失的步骤参数
- **双重结果格式**: 原始MCP结果 + LLM格式化结果，分别存储和传输
- **增强错误处理**: 区分MCP连接错误、认证错误等，提供专用错误事件
- **新增执行接口**: 提供 `/api/task/:id/execute/enhanced` 专用增强执行接口
- **向后兼容**: 原有任务执行流程保持不变，通过全局开关控制

#### 修复详情

**修复前问题**:
- 只有最后一步使用流式格式化（`formatAgentResultWithLLMStream`）
- 中间步骤使用普通格式化（`formatAgentResultWithLLM`），结果一次性返回
- 用户无法实时看到中间步骤的进展

**修复后改进**:
- 所有步骤都使用流式格式化（`formatAgentResultWithLLMStream`）
- 中间步骤发送 `step_result_chunk` 事件
- 最后一步发送 `final_result_chunk` 事件
- 提供完整的实时执行体验

**新增流式事件**:
```typescript
// 中间步骤的流式结果块
{
  event: 'step_result_chunk',
  data: {
    step: number,
    chunk: string,
    agentName: string
  }
}

// 最后一步的流式结果块
{
  event: 'final_result_chunk',
  data: {
    chunk: string,
    agentName: string
  }
}
```

### API 新增功能 (v2.1.3)

从v2.1.3开始，新增了以下重要功能：

#### 1. Agent会话历史记录API
- **端点**: `GET /api/agent/:id/conversations`
- **功能**: 获取指定Agent的会话历史记录，从对话角度展示Agent使用情况
- **特性**: 
  - 支持分页和状态筛选
  - 包含完整的会话详情、消息历史和Agent信息
  - 提供任务执行结果和MCP使用详情
  - 以会话为主线，包含完整的用户与Agent的对话记录
  - 显示消息与任务的关联关系及执行步骤
  - 提供Agent使用的统计信息

#### 2. 对话最后使用MCP信息
- **端点**: `GET /api/conversation/:id` （增强功能）
- **功能**: 在对话详情中返回最后一次使用的MCP信息
- **特性**:
  - 自动分析对话中的任务执行历史
  - 提取最近使用的MCP工具信息
  - 包含MCP的详细信息（名称、描述、类别、认证状态等）
  - 记录具体的执行操作和时间
  - 如果未使用MCP则返回null

这些新功能为用户提供了更好的Agent使用体验和对话管理能力。

### 重要说明

- **路由变更**: Agent对话不再使用 `/api/conversation/` 路由
- **功能增强**: Agent对话支持真正的工作流执行和智能意图识别
- **性能优化**: 专门优化的Agent对话处理逻辑
- **错误处理**: 更好的Agent特定错误处理和用户引导
- **认证保障**: 确保Agent任务执行时所需的MCP服务都已正确认证

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
    ],
    "lastUsedMcp": [
      {
        "name": "coingecko-mcp",
        "description": "CoinGecko official MCP server for cryptocurrency market data, historical prices, and OHLC candlestick data",
        "authRequired": true,
        "authVerified": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico",
        "githubUrl": "https://docs.coingecko.com/reference/mcp-server",
        "authParams": {
          "COINGECKO_API_KEY": "COINGECKO_API_KEY"
        },
        "alternatives": [
          {
            "name": "coinmarketcap-mcp",
            "description": "CoinMarketCap cryptocurrency market data and analytics",
            "authRequired": true,
            "authVerified": false,
            "category": "Market Data",
            "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coinmarket.png",
            "githubUrl": "GitHub - shinzo-labs/coinmarketcap-mcp: MCP Implementation for CoinMarketCap",
            "authParams": {
              "COINMARKETCAP_API_KEY1": "COINMARKETCAP_API_KEY1",
              "COINMARKETCAP_API_KEY2": "COINMARKETCAP_API_KEY2"
            }
          }
        ]
      }
    ]
  }
}
```

**响应字段说明**:
- `conversation`: 会话基本信息
- `messages`: 会话中的所有消息列表
- `lastUsedMcp`: 最后一个任务使用的MCP工具数组，包含：
  - `name`: MCP工具名称
  - `description`: MCP工具描述
  - `authRequired`: 是否需要认证
  - `authVerified`: 认证状态
  - `category`: MCP类别
  - `imageUrl`: MCP图标URL
  - `githubUrl`: MCP项目地址
  - `authParams`: 认证参数配置
  - `alternatives`: 备选MCP工具列表，结构与主MCP相同

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

#### 6. 增强流式执行任务

**端点**: `POST /api/task/:id/execute/enhanced`

**描述**: 使用增强任务引擎执行任务工作流，集成Agent引擎的智能化优势，提供更可靠的执行体验

**认证**: 可选（可使用userId参数或访问令牌）

**路径参数**:
- `id`: 任务ID

**请求体**:
```json
{
  "userId": "用户ID（当未使用访问令牌时必需）",
  "skipAnalysis": false // 可选，是否跳过工作流存在性检查
}
```

**响应**: Server-Sent Events (SSE) 流

**增强特性**:
- 🔄 **智能重试**: 每个步骤最多重试2次，递增延迟
- 🧠 **参数推导**: 从上下文自动推导缺失的步骤参数
- 🔗 **连接管理**: 自动确保所需MCP已连接
- 📊 **双重结果**: 原始结果 + LLM格式化结果
- 💾 **消息存储**: 每步骤存储两条消息（原始+格式化）
- 🚨 **错误分类**: 区分MCP连接错误、认证错误等

**响应事件流**:

```
data: {"event":"execution_start","data":{"taskId":"task_123456","mode":"enhanced","workflowInfo":{"totalSteps":3,"mcps":["coingecko-mcp"]}}}

data: {"event":"workflow_execution_start","data":{"totalSteps":3,"workflow":[{"step":1,"mcp":"coingecko-mcp","action":"getPriceData","status":"pending"}]}}

data: {"event":"step_executing","data":{"step":1,"toolDetails":{"toolType":"mcp","toolName":"getPriceData","mcpName":"coingecko-mcp","args":{"symbol":"bitcoin"},"reasoning":"获取比特币价格数据"}}}

data: {"event":"step_raw_result","data":{"step":1,"success":true,"rawResult":{"price":45000,"change":"+2.5%"},"executionDetails":{"toolType":"mcp","attempts":1,"timestamp":"2024-12-28T10:30:00.000Z"}}}

data: {"event":"step_formatted_result","data":{"step":1,"success":true,"formattedResult":"## 比特币价格数据\n\n当前价格: $45,000\n涨跌: +2.5%","formattingDetails":{"originalDataSize":156,"formattedDataSize":67,"needsFormatting":true}}}

data: {"event":"step_complete","data":{"step":1,"success":true,"progress":{"completed":1,"total":3,"percentage":33}}}

data: {"event":"final_result","data":{"finalResult":"工作流执行完成...","success":true,"executionSummary":{"totalSteps":3,"completedSteps":3,"failedSteps":0,"successRate":100}}}

data: [DONE]
```

**错误处理事件**:

```
// MCP连接错误
data: {"event":"mcp_connection_error","data":{"mcpName":"coingecko-mcp","step":1,"errorType":"CONNECTION_FAILED","message":"Failed to connect to MCP service"}}

// 步骤执行错误
data: {"event":"step_error","data":{"step":1,"error":"API rate limit exceeded","mcpName":"coingecko-mcp","action":"getPriceData","attempts":2}}
```

**错误响应**:
- 在事件流中以 `{"event":"error","data":{"message":"错误信息"}}` 格式返回

---

#### 7. 验证MCP授权

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

### Agent MCP认证验证系统

从v2.1.1开始，Agent系统引入了完整的MCP认证验证流程，确保Agent在试用和使用过程中能够正确连接所需的MCP服务：

#### 认证验证特性

- **预检查机制**: Agent试用时自动检查所需MCP的认证状态
- **多用户隔离**: 每个用户的MCP认证状态独立管理，确保数据安全
- **实时验证**: 消息处理时自动进行MCP认证验证
- **详细反馈**: 提供未认证MCP的完整信息和认证参数
- **前端友好**: 返回结构化的认证信息供前端引导用户完成认证

#### 认证验证流程

1. **Agent试用检查**: 用户尝试使用Agent时，系统自动检查Agent所需的MCP认证状态
2. **认证状态返回**: 如果存在未认证的MCP，返回详细的认证信息给前端
3. **用户认证**: 用户根据返回的信息完成MCP认证
4. **重新尝试**: 认证完成后，用户可以重新尝试使用Agent
5. **消息处理验证**: 在Agent对话过程中，每次消息处理前都会验证MCP认证状态

### Agent对话系统架构

从v2.1开始，Agent对话系统已完全解耦，拥有独立的服务和路由：

- **独立服务**: `AgentConversationService` 专门处理Agent多轮对话
- **专用路由**: `/api/agent-conversation/` 路由专门处理Agent对话请求
- **完全解耦**: 与传统任务执行对话完全分离，避免代码耦合
- **智能识别**: 自动识别用户意图（聊天vs任务执行）
- **工作流集成**: 任务时自动使用Agent的MCP工作流执行真实任务
- **上下文记忆**: 维持完整的对话上下文和Agent专属记忆

### Agent MCP认证验证API

从v2.1.1开始，Agent系统提供了专门的MCP认证验证API，允许用户为Agent使用独立认证MCP服务，无需依赖特定任务。

#### 1. 验证Agent MCP认证

**端点**: `POST /api/agent/mcp/verify-auth`

**描述**: 为Agent使用验证MCP认证信息，独立于任务系统。用户可以预先认证Agent所需的MCP服务，确保Agent试用时能够正常工作。

**认证**: 需要访问令牌

**请求体**:
```json
{
  "mcpName": "coingecko-server",
  "authData": {
    "COINGECKO_API_KEY": "your_api_key_here"
  },
  "saveAuth": true
}
```

**参数说明**:
- `mcpName`: MCP服务器名称（必需）
- `authData`: 认证数据对象（必需）
- `saveAuth`: 是否保存认证信息供后续使用（可选，默认true）

**成功响应**:
```json
{
  "success": true,
  "message": "MCP authentication verified successfully",
  "data": {
    "verified": true,
    "mcpName": "coingecko-server",
    "userId": "user_123",
    "details": "API key is valid and permissions are correct"
  }
}
```

**失败响应**:
```json
{
  "success": false,
  "error": "VERIFICATION_FAILED",
  "message": "Invalid API key or insufficient permissions"
}
```

**错误响应**:
- `400 Bad Request`: 缺少必需字段或字段格式错误
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误或MCP认证服务不可用

---

#### 2. 获取用户MCP认证状态

**端点**: `GET /api/agent/mcp/auth-status`

**描述**: 获取当前用户对指定MCP服务的认证状态，用于检查Agent所需MCP的认证情况。

**认证**: 需要访问令牌

**查询参数**:
- `mcpNames`: MCP名称列表，用逗号分隔（必需）

**请求示例**:
```bash
GET /api/agent/mcp/auth-status?mcpNames=coingecko-server,github-mcp-server
```

**响应**:
```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "authStatuses": [
      {
        "mcpName": "coingecko-server",
        "isAuthenticated": true,
        "hasAuthData": true
      },
      {
        "mcpName": "github-mcp-server",
        "isAuthenticated": false,
        "hasAuthData": false
      }
    ]
  }
}
```

**字段说明**:
- `userId`: 用户ID
- `authStatuses`: 认证状态数组
  - `mcpName`: MCP服务器名称
  - `isAuthenticated`: 是否已认证且验证通过
  - `hasAuthData`: 是否存在认证数据

**错误响应**:
- `400 Bad Request`: 缺少必需的查询参数
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

#### Agent MCP认证使用流程

1. **检查认证状态**:
   ```bash
   curl -X GET "http://localhost:3001/api/agent/mcp/auth-status?mcpNames=coingecko-server,github-mcp-server" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

2. **认证未验证的MCP**:
   ```bash
   curl -X POST "http://localhost:3001/api/agent/mcp/verify-auth" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "mcpName": "coingecko-server",
       "authData": {
         "COINGECKO_API_KEY": "your_api_key_here"
       }
     }'
   ```

3. **尝试使用Agent**:
   ```bash
   curl -X POST "http://localhost:3001/api/agent/agent_123/try" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Get me the current Bitcoin price"}'
   ```

#### 认证验证特性

- **独立认证**: 不依赖特定任务，可以预先为Agent使用认证MCP
- **多用户隔离**: 每个用户的MCP认证状态独立管理
- **状态检查**: 支持批量检查多个MCP的认证状态
- **自动保存**: 认证信息自动保存，供后续Agent使用
- **安全验证**: 实际调用MCP服务验证认证信息的有效性
- **详细反馈**: 提供详细的认证失败原因和建议

#### 与任务MCP认证的区别

| 特性 | Agent MCP认证 | 任务MCP认证 |
|------|---------------|-------------|
| **端点** | `/api/agent/mcp/verify-auth` | `/api/task/:id/verify-auth` |
| **依赖** | 无需特定任务 | 需要特定任务ID |
| **用途** | Agent使用预认证 | 任务执行认证 |
| **权限** | 仅需用户认证 | 需要任务所有权 |
| **适用场景** | Agent试用前准备 | 任务执行前验证 |

### Agent数据模型

Agent实体包含以下字段：

- **id**: Agent的唯一标识符
- **userId**: 创建者的用户ID
- **username**: 创建者的用户名（从users表同步）
- **avatar**: 创建者的头像URL（从users表同步）
- **agentAvatar**: Agent专属头像URL（使用DiceBear API自动生成）
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

### Agent头像系统

Agent头像系统使用DiceBear API自动为每个Agent生成独特的头像：

#### 头像生成机制
- **自动生成**: 创建Agent时基于Agent名称自动生成头像
- **唯一性**: 每个Agent名称对应唯一的头像样式
- **URL格式**: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed={seed}`
- **种子生成**: 使用Agent名称的清理版本作为种子值

#### 头像样式规则
- **默认样式**: 使用`bottts-neutral`风格，适合技术类Agent
- **智能推荐**: 根据Agent类别推荐不同样式：
  - `Development Tools` → `bottts-neutral`
  - `Market Data` → `avataaars-neutral`
  - `Social` → `adventurer-neutral`
  - 其他类别 → `bottts-neutral`

#### 种子值处理
- **字符清理**: 移除特殊字符，仅保留字母、数字、连字符和下划线
- **空格处理**: 将空格替换为连字符
- **大小写**: 转换为小写
- **示例**: `"My Test Agent!"` → `"my-test-agent"`

#### 头像URL示例
- Agent名称: `"Bitcoin Price Analyzer"`
- 生成种子: `"bitcoin-price-analyzer"`
- 头像URL: `"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoin-price-analyzer"`

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
    "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoin-price-analyzer",
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
      "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoinpriceanalyzer",
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

### 5. 获取Agent列表（统一接口）

**端点**: `GET /api/agent`

**描述**: 统一的Agent列表接口，支持多种查询类型并返回收藏状态

**认证**: 需要访问令牌

**查询参数**:

- `queryType`: 查询类型 (`public`, `my-private`, `my-saved`, `all`)，默认为 `all`
  - `public`: 公开的Agent
  - `my-private`: 我的私有Agent
  - `my-saved`: 我收藏的Agent
  - `all`: 所有可见的Agent（我的私有 + 公开的）
- `status`: Agent状态筛选 (`private`, `public`)（可选）
- `search`: 搜索关键词（可选）
- `category`: 按类别筛选（可选）
- `orderBy`: 排序字段（默认 `created_at`）
- `order`: 排序方向（`asc` 或 `desc`，默认 `desc`）
- `limit`: 每页数量（默认20）
- `offset`: 偏移量（默认0）

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
        "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoinpriceanalyzer",
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
          "estimatedTime": "30 seconds",
          "category": "crypto"
        },
        "usageCount": 25,
        "isFavorited": true,
        "createdAt": "2023-06-20T08:00:00.000Z",
        "updatedAt": "2023-06-20T08:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0,
    "categories": [
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
    ]
  }
}
```

**字段说明**:
- `agents`: Agent列表数组
- `total`: 符合条件的Agent总数
- `limit`: 每页数量
- `offset`: 偏移量
- `categories`: 当前查询结果中的分类统计（基于返回的Agent列表计算）
  - `name`: 分类名称
  - `count`: 该分类在当前结果中的Agent数量

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
      "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoinpriceanalyzer",
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

### 7. 尝试使用Agent

**端点**: `POST /api/agent/:id/try`

**描述**: 开始与Agent的多轮对话，支持聊天和任务执行，Agent会智能识别用户意图并相应处理。此接口会创建Agent专属对话并返回对话ID，后续消息通过Agent对话API进行处理。

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
      "title": "[AGENT:agent_123456] Try BitcoinPriceAnalyzer",
      "agentInfo": {
        "id": "agent_123456",
        "name": "BitcoinPriceAnalyzer",
        "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis..."
      }
    },
    "message": "Agent trial conversation started successfully. Use /api/agent-conversation/:conversationId/message for subsequent messages."
  }
}
```

**需要认证的响应**（状态码200）:
```json
{
  "success": false,
  "error": "MCP_AUTH_REQUIRED",
  "needsAuth": true,
  "missingAuth": [
    {
      "mcpName": "coingecko-server",
      "description": "CoinGecko官方MCP服务器，提供全面的加密货币市场数据",
      "authRequired": true,
      "authVerified": false,
      "authParams": {
        "COINGECKO_API_KEY": {
          "type": "string",
          "description": "CoinGecko API密钥",
          "required": true
        }
      }
    }
  ],
  "message": "请先完成所有相关MCP服务器的认证验证"
}
```

**重要说明**: 需要MCP认证时返回200状态码，因为这是正常的业务状态而非权限错误。

**MCP认证验证流程**:

1. **自动检查**: Agent试用时自动检查所需MCP的认证状态
2. **多用户隔离**: 每个用户的MCP认证状态独立管理
3. **详细信息**: 返回未认证MCP的详细信息和认证参数
4. **前端引导**: 前端可根据返回信息引导用户完成认证

**认证参数说明**:
- `mcpName`: MCP服务器名称
- `description`: MCP服务器描述
- `authRequired`: 是否需要认证
- `authVerified`: 当前用户是否已认证
- `authParams`: 认证参数详情，包含参数名称、类型、描述和是否必需

**MCP认证完成后的使用流程**:

1. **完成MCP认证**: 使用 `/api/agent/mcp/verify-auth` 接口完成所需MCP的认证
2. **重新尝试Agent**: 重新调用 `/api/agent/:id/try` 接口
3. **开始对话**: 认证通过后即可开始与Agent对话
4. **后续消息**: 使用 `/api/agent-conversation/:conversationId/message` 发送消息

**注意事项**:
- 不同用户需要分别完成MCP认证
- MCP认证状态会影响Agent的任务执行能力
- 建议在Agent试用前引导用户完成必要的认证设置

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

2. **继续对话**（使用返回的会话ID和专用Agent对话接口）:
   ```bash
   curl -X POST "http://localhost:3000/api/agent-conversation/conv_1234567890/message" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Can you get me the current Bitcoin price?"}'
   ```

3. **流式对话**（推荐使用）:
   ```bash
   curl -X POST "http://localhost:3000/api/agent-conversation/conv_1234567890/message/stream" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Can you get me the current Bitcoin price?"}'
   ```

4. **Agent智能处理**:
   - **对话意图**: Agent会进行自然对话，回答问题、提供建议
   - **任务意图**: Agent会识别任务请求，使用其MCP工作流执行具体任务
   - **自动识别**: 基于消息内容和Agent能力智能判断用户意图

### Agent流式对话特性

- **🧠 智能意图识别**: 自动区分对话和任务请求
- **💬 上下文记忆**: 维持整个对话的上下文，理解前后关联
- **⚡ 工作流集成**: 任务时自动使用Agent的MCP工作流
- **💫 自然对话**: 非任务时进行友好的聊天交流
- **🔧 错误处理**: 优雅处理执行错误和异常情况

### Agent对话示例

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

## Agent对话 API

Agent对话系统提供了专门的API端点来处理Agent多轮对话，完全独立于传统的任务执行对话。

### 1. 发送Agent对话消息

**端点**: `POST /api/agent-conversation/:conversationId/message`

**描述**: 向Agent对话发送消息，支持聊天和任务执行，Agent会智能识别用户意图并相应处理。

**重要更新**: 从v2.1.1开始，Agent消息处理时会自动进行MCP认证验证，确保任务执行时所需的MCP服务都已正确认证。

**认证**: 需要访问令牌

**路径参数**:
- `conversationId`: Agent对话ID（通过 `/api/agent/:id/try` 获得）

**请求体**:
```json
{
  "content": "Can you get me the current Bitcoin price and analyze the market trends?"
}
```

**成功响应（认证已验证）**:
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg_123456",
      "conversationId": "conv_1234567890",
      "content": "Can you get me the current Bitcoin price and analyze the market trends?",
      "type": "user",
      "intent": "task",
      "createdAt": "2023-06-20T08:00:00.000Z"
    },
    "assistantMessage": {
      "id": "msg_123457",
      "conversationId": "conv_1234567890",
      "content": "I'll help you get the current Bitcoin price and analyze market trends. Let me fetch that information for you...",
      "type": "assistant",
      "intent": "task",
      "taskId": "task_789",
      "createdAt": "2023-06-20T08:00:05.000Z"
    },
    "intent": "task",
    "taskId": "task_789"
  }
}
```

**需要认证的响应**（状态码200）:
```json
{
  "success": false,
  "error": "MCP_AUTH_REQUIRED",
  "needsAuth": true,
  "missingAuth": [
    {
      "mcpName": "coingecko-server",
      "description": "CoinGecko官方MCP服务器，提供全面的加密货币市场数据",
      "authRequired": true,
      "authVerified": false,
      "authParams": {
        "COINGECKO_API_KEY": {
          "type": "string",
          "description": "CoinGecko API密钥",
          "required": true
        }
      }
    }
  ],
  "message": "请先完成所有相关MCP服务器的认证验证"
}
```

**重要说明**: 需要MCP认证时返回200状态码，因为这是正常的业务状态而非权限错误。

**MCP认证验证特性**:
- **自动检查**: 消息处理时自动检查Agent所需MCP的认证状态
- **多用户隔离**: 每个用户的MCP认证状态独立管理
- **实时验证**: 在任务执行前进行MCP连接验证
- **详细反馈**: 提供未认证MCP的详细信息和认证参数

**错误响应**:
- `400 Bad Request`: 请求参数无效
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent对话
- `404 Not Found`: Agent对话不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 2. 发送Agent对话消息（流式版本）

**端点**: `POST /api/agent-conversation/:conversationId/message/stream`

**描述**: 向Agent对话发送消息的流式版本，实时返回Agent处理过程和响应。包含完整的MCP认证验证流程。

**认证**: 需要访问令牌

**路径参数**:
- `conversationId`: Agent对话ID

**请求体**:
```json
{
  "content": "Can you get me the current Bitcoin price?"
}
```

**流式响应事件**:

**Agent检测和加载**:
```
data: {"event":"agent_detection","data":{"agentId":"agent_123456","agentName":"BitcoinPriceAnalyzer"}}

data: {"event":"agent_loading","data":{"status":"loading"}}

data: {"event":"agent_loaded","data":{"agentId":"agent_123456","agentName":"BitcoinPriceAnalyzer","agentDescription":"An intelligent agent that retrieves Bitcoin's current price..."}}
```

**Agent意图分析**:
```
data: {"event":"agent_intent_analysis","data":{"status":"analyzing","message":"Analyzing user intent based on Agent capabilities..."}}

data: {"event":"agent_intent_analysis","data":{"status":"completed","intent":"task","confidence":0.92,"reasoning":"User is requesting specific task execution that matches Agent's capabilities"}}
```

**Agent MCP认证验证**:
```
data: {"event":"mcp_auth_check","data":{"message":"Checking MCP authentication status..."}}

data: {"event":"mcp_auth_verified","data":{"message":"All required MCPs are authenticated","mcpCount":2}}

data: {"event":"mcp_connection_start","data":{"message":"Establishing MCP connections..."}}

data: {"event":"mcp_connection_success","data":{"message":"MCP connections established successfully","connectedMcps":["coingecko-server"]}}
```

**Agent任务执行**（真正的工作流执行）:
```
data: {"event":"task_creation_start","data":{"message":"Creating task based on Agent workflow..."}}

data: {"event":"task_created","data":{"taskId":"task_789","title":"Get Bitcoin current price","message":"Task created"}}

data: {"event":"workflow_applying","data":{"message":"Applying Agent workflow configuration..."}}

data: {"event":"workflow_applied","data":{"message":"Agent workflow applied successfully","mcpCount":2}}

data: {"event":"task_execution_start","data":{"message":"Starting task execution with Agent workflow..."}}

data: {"event":"task_execution_progress","data":{"step":"calling_coingecko_api","status":"in_progress","message":"Fetching Bitcoin price from CoinGecko..."}}

data: {"event":"step_result_chunk","data":{"step":1,"chunk":"Bitcoin price: $45,230.50 USD","agentName":"BitcoinPriceAnalyzer"}}

data: {"event":"step_result_chunk","data":{"step":1,"chunk":" (+2.3% in 24h). Market cap: $890.2B","agentName":"BitcoinPriceAnalyzer"}}

data: {"event":"final_result_chunk","data":{"chunk":"Based on the latest data, Bitcoin is showing strong bullish momentum...","agentName":"BitcoinPriceAnalyzer"}}

data: {"event":"task_execution_complete","data":{"message":"Task execution completed successfully","taskId":"task_789","success":true}}

data: {"event":"task_response_complete","data":{"responseId":"resp_456","taskId":"task_789","message":"Task processing completed","executionSuccess":true}}
```

**Agent聊天响应**:
```
data: {"event":"agent_chat_response","data":{"content":"Hi! I'm BitcoinPriceAnalyzer."}}

data: {"event":"agent_chat_response","data":{"content":" I can help you get real-time Bitcoin prices"}}

data: {"event":"agent_chat_response","data":{"content":" and analyze market trends. What would you like to know?"}}
```

**处理完成**:
```
data: {"event":"agent_processing_complete","data":{"messageId":"msg_456","responseId":"msg_457","intent":"task","taskId":"task_789","agentId":"agent_123456"}}

data: [DONE]
```

**Agent流式事件类型**:
- `agent_detection`: 检测到Agent试用对话
- `agent_loading`: Agent信息加载中
- `agent_loaded`: Agent信息加载完成
- `agent_intent_analysis`: Agent意图分析（考虑Agent能力）
- `mcp_auth_check`: MCP认证状态检查
- `mcp_auth_verified`: MCP认证验证完成
- `mcp_connection_start`: MCP连接开始
- `mcp_connection_success`: MCP连接成功
- `task_creation_start`: 任务创建开始
- `task_created`: 任务创建完成
- `workflow_applying`: 工作流应用中
- `workflow_applied`: 工作流应用完成
- `task_execution_start`: 任务执行开始
- `task_execution_progress`: 任务执行进度
- `step_result_chunk`: 步骤结果流式块（**v2.1.2新增**）
- `final_result_chunk`: 最终结果流式块
- `task_execution_complete`: 任务执行完成
- `task_response_complete`: 任务响应完成
- `agent_chat_response`: Agent聊天响应流式输出
- `agent_processing_complete`: Agent处理完成

**错误响应**:
- 在事件流中以 `{"event":"error","data":{"message":"错误信息"}}` 格式返回

---

### 3. 获取Agent对话详情

**端点**: `GET /api/agent-conversation/:conversationId`

**描述**: 获取Agent对话的详细信息和消息历史

**认证**: 需要访问令牌

**路径参数**:
- `conversationId`: Agent对话ID

**响应**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_1234567890",
      "userId": "user_123",
      "title": "[AGENT:agent_123456] Try BitcoinPriceAnalyzer",
      "lastMessageContent": "Bitcoin price: $45,230.50 USD (+2.3% in 24h)...",
      "lastMessageAt": "2023-06-20T08:05:30.000Z",
      "taskCount": 1,
      "messageCount": 6,
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:05:30.000Z"
    },
    "messages": [
      {
        "id": "msg_1",
        "conversationId": "conv_1234567890",
        "content": "Can you get me the current Bitcoin price?",
        "type": "user",
        "intent": "task",
        "taskId": "task_789",
        "createdAt": "2023-06-20T08:00:00.000Z"
      },
      {
        "id": "msg_2",
        "conversationId": "conv_1234567890",
        "content": "I'll help you get the current Bitcoin price. Let me fetch that information for you...",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_789",
        "createdAt": "2023-06-20T08:00:05.000Z"
      },
      {
        "id": "msg_3",
        "conversationId": "conv_1234567890",
        "content": "Bitcoin price: $45,230.50 USD (+2.3% in 24h). Market cap: $890.2B. Trading volume: $28.5B. Technical analysis shows bullish momentum with RSI at 65.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_789",
        "createdAt": "2023-06-20T08:05:30.000Z"
      }
    ],
    "agentInfo": {
      "id": "agent_123456",
      "name": "BitcoinPriceAnalyzer",
      "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis...",
      "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoinpriceanalyzer"
    }
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent对话
- `404 Not Found`: Agent对话不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 4. 清除Agent对话记忆

**端点**: `DELETE /api/agent-conversation/:conversationId/memory`

**描述**: 清除Agent对话的上下文记忆，保留消息历史但重置对话上下文

**认证**: 需要访问令牌

**路径参数**:
- `conversationId`: Agent对话ID

**响应**:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_1234567890",
    "message": "Agent conversation memory cleared successfully",
    "clearedAt": "2023-06-20T09:00:00.000Z"
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent对话
- `404 Not Found`: Agent对话不存在
- `500 Internal Server Error`: 服务器内部错误

---

### Agent对话系统特性

#### 1. 完全解耦
- **独立服务**: 使用专门的 `AgentConversationService` 处理Agent对话
- **专用路由**: `/api/agent-conversation/` 路由与传统对话路由完全分离
- **避免耦合**: 不影响传统任务执行对话的逻辑

#### 2. 智能意图识别
- **上下文感知**: 基于Agent能力和对话历史进行意图分析
- **自动判断**: 智能区分聊天请求和任务执行请求
- **置信度评分**: 提供意图识别的置信度和决策理由

#### 3. MCP认证验证
- **预检查机制**: Agent试用时自动检查所需MCP的认证状态
- **实时验证**: 消息处理时自动进行MCP认证验证
- **多用户隔离**: 每个用户的MCP认证状态独立管理
- **详细反馈**: 提供未认证MCP的完整信息和认证参数
- **认证引导**: 为未认证的MCP提供详细的认证指导

#### 4. 真实任务执行
- **工作流集成**: 任务时自动使用Agent的MCP工作流
- **真实执行**: 调用TaskExecutorService执行完整的任务流程
- **实时反馈**: 提供任务创建、执行和完成的实时进度

#### 5. 上下文记忆
- **对话记忆**: 维护Agent对话的完整上下文
- **多轮理解**: 支持基于历史对话的语义理解
- **记忆管理**: 支持清除记忆但保留消息历史

#### 6. 流式处理
- **实时响应**: 支持流式消息处理和实时反馈
- **事件驱动**: 提供详细的事件类型用于前端状态管理
- **错误处理**: 优雅处理各种异常情况

---

### 8. Agent对话使用流程

从v2.1开始，Agent对话系统已完全解耦，使用专门的Agent对话API。以下是完整的使用流程：

#### 完整Agent对话流程

1. **开始Agent试用** (创建Agent对话):
   ```bash
   curl -X POST "http://localhost:3000/api/agent/agent_123/try" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Hello"}'
   ```

2. **使用专用Agent对话接口继续对话**:
   ```bash
   curl -X POST "http://localhost:3000/api/agent-conversation/conv_1234567890/message/stream" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Get me the current Bitcoin price"}'
   ```

3. **获取Agent对话详情**:
   ```bash
   curl -X GET "http://localhost:3000/api/agent-conversation/conv_1234567890" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **清除Agent对话记忆**（可选）:
   ```bash
   curl -X DELETE "http://localhost:3000/api/agent-conversation/conv_1234567890/memory" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

#### 前端集成建议

1. **使用专用路由**: 始终使用 `/api/agent-conversation/` 路由处理Agent对话
2. **监听Agent事件**: 监听 `agent_` 前缀的流式事件进行UI优化
3. **处理认证**: 在Agent试用前检查并完成必要的MCP认证
4. **展示Agent信息**: 利用Agent信息优化用户体验
5. **记忆管理**: 提供清除记忆功能让用户重置对话上下文

#### 架构优势

- **完全解耦**: Agent对话与传统对话完全分离
- **专用优化**: 针对Agent特性进行的专门优化
- **真实执行**: 支持真正的任务工作流执行
- **智能识别**: 基于Agent能力的智能意图识别
- **上下文记忆**: 专门的Agent对话记忆管理

---

### 9. 更新Agent

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
      "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=enhanced-bitcoin-price-analyzer",
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

### 9. 删除Agent

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

### 10. 收藏Agent

**端点**: `POST /api/agent/:id/favorite`

**描述**: 收藏指定的公开Agent

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "收藏成功",
    "agentId": "agent_123456",
    "isFavorited": true
    }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `400 Bad Request`: 只能收藏公开的Agent
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 11. 取消收藏Agent

**端点**: `DELETE /api/agent/:id/favorite`

**描述**: 取消收藏指定的Agent

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "取消收藏成功",
    "agentId": "agent_123456",
    "isFavorited": false
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `404 Not Found`: Agent不存在
- `500 Internal Server Error`: 服务器内部错误

---

### 12. 检查Agent收藏状态

**端点**: `GET /api/agent/:id/favorite/status`

**描述**: 检查指定Agent的收藏状态

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**响应**:
```json
{
  "success": true,
  "data": {
    "agentId": "agent_123456",
    "isFavorited": true
  }
}
```

**错误响应**:
- `401 Unauthorized`: 无效的访问令牌
- `500 Internal Server Error`: 服务器内部错误

---

### 13. 获取Agent分类列表

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
  ]
}
```

**字段说明**:
- `name`: 分类名称
- `count`: 该分类下的Agent数量

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 14. 按分类获取Agent列表

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
        "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=bitcoinpriceanalyzer",
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
# 首先检查Agent所需MCP的认证状态
curl -X GET "http://localhost:3001/api/agent/mcp/auth-status?mcpNames=coingecko-server,github-mcp-server" \
  -H "Authorization: Bearer OTHER_USER_ACCESS_TOKEN"

# 如果有未认证的MCP，先完成认证
curl -X POST http://localhost:3001/api/agent/mcp/verify-auth \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OTHER_USER_ACCESS_TOKEN" \
  -d '{
    "mcpName": "coingecko-server",
    "authData": {
      "COINGECKO_API_KEY": "your_api_key_here"
    },
    "saveAuth": true
  }'

# 认证完成后尝试使用Agent
curl -X POST http://localhost:3001/api/agent/agent_123456/try \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OTHER_USER_ACCESS_TOKEN" \
  -d '{"content":"I want to check the current Bitcoin price and get market analysis"}'

# 如果Agent试用时仍然返回需要认证的响应，根据返回的missingAuth信息进行认证
# 然后重新尝试使用Agent
curl -X POST http://localhost:3001/api/agent/agent_123456/try \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OTHER_USER_ACCESS_TOKEN" \
  -d '{"content":"I want to check the current Bitcoin price and get market analysis"}'
```

#### 5. 收藏和管理Agent

```bash
# 收藏Agent
curl -X POST http://localhost:3001/api/agent/agent_123456/favorite \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 取消收藏Agent
curl -X DELETE http://localhost:3001/api/agent/agent_123456/favorite \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 检查收藏状态
curl -X GET http://localhost:3001/api/agent/agent_123456/favorite/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 6. 使用统一接口获取不同类型的Agent

```bash
# 获取公开的Agent
curl -X GET "http://localhost:3001/api/agent?queryType=public&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 获取我的私有Agent
curl -X GET "http://localhost:3001/api/agent?queryType=my-private&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 获取我收藏的Agent
curl -X GET "http://localhost:3001/api/agent?queryType=my-saved&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 获取所有可见的Agent（默认）
curl -X GET "http://localhost:3001/api/agent?queryType=all&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 搜索公开Agent
curl -X GET "http://localhost:3001/api/agent?queryType=public&search=bitcoin&category=crypto" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
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

#### 3. MCP认证验证系统
- **预检查机制**: Agent试用时自动检查所需MCP的认证状态
- **独立认证API**: 提供专门的Agent MCP认证API，无需依赖特定任务
- **状态查询**: 支持批量查询多个MCP的认证状态
- **多用户隔离**: 每个用户的MCP认证状态独立管理
- **实时验证**: 消息处理时自动进行MCP认证验证
- **详细反馈**: 提供未认证MCP的完整信息和认证参数
- **认证引导**: 为未认证的MCP提供详细的认证指导和参数说明
- **前端友好**: 返回结构化的认证信息供前端引导用户完成认证
- **错误处理**: 优雅处理认证失败和MCP连接异常情况

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

#### 8. 头像生成
- **自动生成**: 每个Agent都有独特的DiceBear头像
- **基于名称**: 头像基于Agent名称生成，确保一致性
- **样式适配**: 根据Agent类别自动选择合适的头像风格
- **URL稳定**: 头像URL基于名称生成，重复生成结果一致

### 数据库迁移

从v2.0开始，Agent系统引入了重要的数据库结构变更：

#### 新增字段
- **username**: 创建者用户名（从users表同步）
- **avatar**: 创建者头像URL（从users表同步）
- **agentAvatar**: Agent专属头像URL（使用DiceBear API自动生成）
- **categories**: Agent类别列表（JSONB格式，从MCP工作流中提取）

#### 迁移脚本
数据库迁移脚本会自动：
1. 添加新字段到agents表（username、avatar、agentAvatar、categories）
2. 为categories字段创建GIN索引以提高查询性能
3. 从现有的mcp_workflow数据中提取类别信息
4. 同步用户信息到Agent记录
5. 为现有Agent自动生成头像URL
6. 确保所有Agent都有至少一个类别

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
- **头像预览**: Agent头像会根据名称自动生成，建议预览头像效果

#### 2. Agent使用
- **认证准备**: 在使用Agent前准备好所需的MCP认证信息
- **认证流程**: 遵循Agent试用 → MCP认证 → 重新试用的完整流程
- **多用户认证**: 理解每个用户需要独立完成MCP认证
- **认证状态检查**: 定期检查和更新MCP认证状态
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

#### 5. 头像性能
- **CDN缓存**: DiceBear头像支持CDN缓存，提高加载速度
- **懒加载**: 在列表页面可以考虑对头像进行懒加载
- **尺寸优化**: 可以在URL中添加size参数控制头像大小
- **格式选择**: 支持SVG格式，矢量图形适合各种尺寸显示

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

**描述**: 获取特定对话的详细信息和所有消息，包含最后一次使用的MCP信息。

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
    ],
    "lastUsedMcp": [
      {
        "name": "coingecko-server",
        "description": "CoinGecko官方MCP服务器，提供全面的加密货币市场数据",
        "category": "Market Data",
        "imageUrl": "https://example.com/coingecko.png",
        "githubUrl": "https://docs.coingecko.com/reference/mcp-server",
        "taskId": "task_123456",
        "usedAt": "2023-06-20T08:05:30.000Z",
        "authRequired": true,
        "authVerified": true,
        "authParams": {
          "COINGECKO_API_KEY": "COINGECKO_API_KEY"
        },
        "alternatives": [
          {
            "name": "coinmarketcap-mcp",
            "description": "CoinMarketCap cryptocurrency market data and analytics",
            "authRequired": true,
            "authVerified": false,
            "category": "Market Data",
            "imageUrl": "https://example.com/coinmarketcap.png",
            "githubUrl": "https://github.com/shinzo-labs/coinmarketcap-mcp",
            "authParams": {
              "COINMARKETCAP_API_KEY1": "COINMARKETCAP_API_KEY1",
              "COINMARKETCAP_API_KEY2": "COINMARKETCAP_API_KEY2"
            }
          }
        ]
      }
    ]
  }
}
```

**新增字段说明**:
- `lastUsedMcp`: 最后一个任务中使用的所有MCP信息数组（如果对话中有任务执行）
  - `name`: MCP服务器名称
  - `description`: MCP服务器描述
  - `category`: MCP类别
  - `imageUrl`: MCP图标URL
  - `githubUrl`: MCP GitHub仓库URL
  - `taskId`: 关联的任务ID
  - `usedAt`: 最后使用时间
  - `authRequired`: 是否需要认证
  - `authVerified`: 认证状态
  - `authParams`: 认证参数配置（如果需要认证）
  - `alternatives`: 备选MCP列表（包含完整的替代选项信息）

**注意**: 如果对话中没有任务执行或未使用MCP，`lastUsedMcp` 字段将为空数组 `[]`。

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

## Agent 相关 API

### 初始化Agent对话环境

**端点**: `POST /api/agent/:id/init`

**描述**: 初始化Agent对话环境，创建专属对话会话并返回Agent的欢迎语。此接口不进行MCP权限校验，仅负责环境准备。MCP权限校验将在用户发送消息时进行。

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**请求体**: 无需请求体参数

**响应**:
```json
{
  "success": true,
  "data": {
    "conversationId": "conversation_id",
    "agentInfo": {
      "id": "agent_id",
      "name": "Agent名称",
      "description": "Agent描述"
    },
    "welcomeMessage": "Hello! I'm Agent名称. Agent描述\n\nMy capabilities include: general assistance\n\nYou can:\n- Chat with me about anything\n- Ask me to help with tasks related to my capabilities\n- Request me to demonstrate my functionality\n\nHow can I assist you today?",
    "ready": true
  }
}
```

**注意事项**:
- 此接口不检查MCP权限，仅创建对话环境
- MCP权限校验在用户发送消息时进行
- 如果Agent需要MCP权限，会在消息处理时提示用户完成认证

### 发送消息到Agent对话

**端点**: `POST /api/agent-conversation/:conversationId/message/stream`

**描述**: 向已初始化的Agent对话发送消息，支持任务和聊天意图的自动识别，流式返回处理结果。
此接口会在消息处理前进行MCP权限校验，确保用户已完成所需的MCP认证。

**认证**: 需要访问令牌

**路径参数**:
- `conversationId`: 对话ID（通过初始化接口获得）

**请求体**:
```json
{
  "content": "用户消息内容"
}
```

**流式响应**: Server-Sent Events (SSE) 格式

#### MCP权限校验和消息处理流程
```
data: {"event":"connection_established","data":{"conversationId":"conv_456","status":"connected"}}

data: {"event":"auth_checking","data":{"message":"Checking MCP authentication status..."}}

# 如果需要MCP认证
data: {"event":"auth_required","data":{"message":"MCP authentication required","missingAuth":[...]}}

# 如果认证通过
data: {"event":"auth_verified","data":{"message":"MCP authentication verified"}}

data: {"event":"user_message_created","data":{"messageId":"msg_789"}}

data: {"event":"intent_analysis_start","data":{"message":"Analyzing user intent..."}}

data: {"event":"intent_analysis_complete","data":{"intent":"task","confidence":0.85}}
```

#### MCP认证提示响应
如果用户未完成必要的MCP认证，系统会返回认证提示消息：
```
data: {"event":"auth_required","data":{"message":"MCP authentication required","missingAuth":[{"mcpName":"github-mcp-server","description":"GitHub MCP服务器","authParams":{"GITHUB_TOKEN":"GitHub访问令牌"},"authInstructions":"To use github-mcp-server, you need to provide authentication credentials.\n\nRequired parameters:\n• GITHUB_TOKEN: GitHub访问令牌 (Required)"}]}}

data: {"event":"message_complete","data":{"messageId":"msg_456","content":"🔐 **Authentication Required**\n\nTo use my capabilities, you need to authenticate the following MCP services: **github-mcp-server**\n\n**1. github-mcp-server**\nGitHub MCP服务器\nTo use github-mcp-server, you need to provide authentication credentials.\n\nRequired authentication parameters:\n✅ **GITHUB_TOKEN**: GitHub访问令牌\n\nPlease use the MCP authentication interface to provide your credentials, then try again..."}}
```

#### 任务执行流程（如果识别为任务意图）
```
data: {"event":"task_creation_start","data":{"message":"Creating task based on Agent workflow..."}}

data: {"event":"task_created","data":{"taskId":"task_101","title":"检查GitHub仓库状态","message":"Task created: 检查GitHub仓库状态"}}

data: {"event":"task_execution_start","data":{"message":"Starting task execution with Agent workflow..."}}

data: {"event":"task_execution_progress","data":{"event":"step_start","data":{"step":1,"mcpName":"github-mcp-server","actionName":"list_repositories"}}}

data: {"event":"task_execution_progress","data":{"event":"step_complete","data":{"step":1,"success":true,"result":"Found 5 repositories..."}}}

data: {"event":"task_execution_complete","data":{"message":"Task execution completed successfully","taskId":"task_101","success":true}}

data: {"event":"message_complete","data":{"messageId":"msg_790","content":"✅ 任务已使用GitHub助手的功能成功完成！\n\n**任务**: 检查GitHub仓库状态\n**Agent**: GitHub助手\n**任务ID**: task_101\n\n我已经成功检查了您的GitHub仓库状态，找到了5个仓库。","taskId":"task_101"}}
```

#### 聊天流程（如果识别为聊天意图）
```
data: {"event":"chat_chunk","data":{"content":"Hello! I'm "}}

data: {"event":"chat_chunk","data":{"content":"GitHub助手"}}

data: {"event":"chat_chunk","data":{"content":"，我可以帮助您..."}}

data: {"event":"message_complete","data":{"messageId":"msg_790","content":"Hello! I'm GitHub助手，我可以帮助您管理GitHub仓库、查看代码统计等。有什么我可以为您做的吗？"}}
```

#### 完成和错误处理
```
data: {"event":"final_result","data":{"userMessageId":"msg_789","assistantMessageId":"msg_790","intent":"task","taskId":"task_101"}}

data: {"event":"stream_complete","data":{"status":"completed"}}

data: [DONE]
```

**前端集成示例**:

```javascript
// 1. 初始化Agent对话环境
// 1. 初始化Agent（不进行MCP权限校验）
async function initializeAgent(agentId) {
  try {
    const response = await fetch(`/api/agent/${agentId}/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      return {
        conversationId: result.data.conversationId,
        agentInfo: result.data.agentInfo,
        welcomeMessage: result.data.welcomeMessage,
        ready: true
      };
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    throw error;
  }
}

// 2. 发送消息到Agent
async function sendMessageToAgent(conversationId, message) {
  const response = await fetch(`/api/agent-conversation/${conversationId}/message/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: message })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('Message processing completed');
          return;
        }

        try {
          const event = JSON.parse(data);
          handleMessageEvent(event);
        } catch (e) {
          console.error('Failed to parse event:', e);
        }
      }
    }
  }
}

// 3. 处理消息事件（包括MCP权限校验）
function handleMessageEvent(event) {
  switch (event.event) {
    case 'auth_checking':
      showAuthCheckingStatus('正在检查MCP认证状态...');
      break;
    
    case 'auth_required':
      showAuthModal(event.data.missingAuth);
      break;
    
    case 'auth_verified':
      showAuthVerifiedStatus('MCP认证验证通过');
      break;
    
    case 'intent_analysis_complete':
      showIntentBadge(event.data.intent);
      break;
    
    case 'task_created':
      showTaskCard(event.data.taskId, event.data.title);
      break;
    
    case 'task_execution_progress':
      updateTaskProgress(event.data);
      break;
    
    case 'step_result_chunk':
      appendStepResultChunk(event.data.step, event.data.chunk, event.data.agentName);
      break;
    
    case 'final_result_chunk':
      appendFinalResultChunk(event.data.chunk, event.data.agentName);
      break;
    
    case 'chat_chunk':
      appendChatContent(event.data.content);
      break;
    
    case 'message_complete':
      finalizeMessage(event.data.messageId, event.data.content);
      break;
    
    case 'error':
      showError(event.data.message);
      break;
  }
}

// 4. 完整的使用流程（新的权限校验流程）
async function useAgent(agentId, userMessage) {
  // 初始化Agent环境（不进行MCP权限校验）
  const initResult = await initializeAgent(agentId);
  
  if (!initResult.ready) {
    throw new Error('Failed to initialize agent');
  }
  
  // 显示Agent信息和欢迎语
  displayAgentInfo(initResult.agentInfo);
  displayWelcomeMessage(initResult.welcomeMessage);
  
  // 发送用户消息（此时会进行MCP权限校验）
  await sendMessageToAgent(initResult.conversationId, userMessage);
}
```

**使用场景和流程**:

1. **页面初始化**: 用户打开Agent页面时调用初始化接口，获取欢迎语
2. **环境准备**: 系统创建对话环境，不进行MCP权限校验
3. **消息处理**: 用户发送消息时，系统首先检查MCP认证状态
4. **权限校验**: 如果需要MCP认证，提示用户完成认证
5. **意图识别**: 认证通过后，系统自动识别意图（任务/聊天）
6. **智能执行**: 根据意图自动执行任务或进行对话
7. **流式反馈**: 实时显示处理进度和结果

**错误响应**:
- `401 Unauthorized`: 未认证
- `400 Bad Request`: 请求参数无效或对话不存在
- `404 Not Found`: Agent不存在
- `403 Forbidden`: 无权访问私有Agent
- `500 Internal Server Error`: 服务器内部错误

---

## 重要技术更新

### Agent专用执行器流式响应修复 (v2.1.2)

#### 背景
在Agent专用执行器的初始实现中，存在一个影响用户体验的问题：只有工作流的最后一步支持流式响应，中间步骤的结果都是一次性返回的。这导致用户在多步骤任务执行过程中无法实时看到中间步骤的进展。

#### 修复内容

**核心修改**:
```typescript
// 修复前：中间步骤使用普通格式化
if (stepNumber === workflow.length) {
  // 只有最后一步使用流式格式化
  formattedResult = await this.formatAgentResultWithLLMStream(/*...*/);
} else {
  // 中间步骤使用普通格式化 - 没有流式响应
  formattedResult = await this.formatAgentResultWithLLM(/*...*/);
}

// 修复后：所有步骤都使用流式格式化
if (stepNumber === workflow.length) {
  // 最后一步发送 final_result_chunk 事件
  formattedResult = await this.formatAgentResultWithLLMStream(/*...*/);
} else {
  // 中间步骤发送 step_result_chunk 事件
  formattedResult = await this.formatAgentResultWithLLMStream(/*...*/);
}
```

**新增事件类型**:
1. `step_result_chunk`: 中间步骤的流式结果块
2. `final_result_chunk`: 最后一步的流式结果块

**修复效果**:
- ✅ **完整的流式体验**: 所有步骤都提供实时格式化结果
- ✅ **更好的用户反馈**: 用户可以实时看到每个步骤的进展
- ✅ **一致的事件系统**: 统一的流式事件处理
- ✅ **改进的性能感知**: 减少用户等待时的焦虑

#### 前端集成建议

```javascript
// 处理新的流式事件
function handleAgentStreamingEvents(event) {
  switch (event.event) {
    case 'step_result_chunk':
      // 处理中间步骤的流式结果
      updateStepProgress(event.data.step, event.data.chunk, event.data.agentName);
      break;
    
    case 'final_result_chunk':
      // 处理最终结果的流式块
      updateFinalResult(event.data.chunk, event.data.agentName);
      break;
    
    // ... 其他事件处理
  }
}
```

#### 兼容性
- **向后兼容**: 现有的流式事件处理逻辑保持不变
- **渐进增强**: 前端可以选择性地处理新的事件类型
- **优雅降级**: 不处理新事件类型的前端仍然可以正常工作

这个修复显著改善了Agent任务执行的用户体验，特别是对于包含多个步骤的复杂工作流。

---

### 15. 获取Agent特定会话详情

**端点**: `GET /api/agent/:id/conversations?conversationId=xxx`

**描述**: 获取指定Agent的特定会话详情，包含完整的消息历史、任务关联关系以及metadata字段（用于前端区分消息阶段）。前端可以根据metadata.contentType字段来区分不同阶段的消息并进行相应的UI展示。

**认证**: 需要访问令牌

**路径参数**:
- `id`: Agent ID

**查询参数**:
- `conversationId`: 会话ID（必需）

**响应**:
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "conv_987654321",
      "title": "[AGENT:agent_123456] Try BitcoinPriceAnalyzer",
      "type": "agent",
      "agentId": "agent_123456",
      "createdAt": "2023-06-20T08:00:00.000Z",
      "updatedAt": "2023-06-20T08:05:30.000Z",
      "messageCount": 8,
      "taskCount": 2
    },
    "agent": {
      "id": "agent_123456",
      "name": "BitcoinPriceAnalyzer",
      "description": "An intelligent agent that retrieves Bitcoin's current price and provides comprehensive market analysis",
      "categories": ["Market Data", "Trading"]
    },
    "messages": [
      {
        "id": "msg_123456",
        "content": "Can you get me the current Bitcoin price?",
        "type": "user",
        "intent": "task",
        "taskId": "task_789",
        "metadata": {
          "contentType": "user_input"
        },
        "createdAt": "2023-06-20T08:00:00.000Z",
        "taskDetails": null
      },
      {
        "id": "msg_123457",
        "content": "I'll help you get the current Bitcoin price. Let me fetch that information for you...",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_789",
        "metadata": {
          "contentType": "step_thinking"
        },
        "createdAt": "2023-06-20T08:00:05.000Z",
        "taskDetails": {
          "id": "task_789",
          "title": "【机器人】Get Bitcoin current price",
          "status": "completed",
          "taskType": "agent",
          "result": {
            "summary": "Task execution completed successfully",
            "finalResult": "Bitcoin price: $45,230.50 USD (+2.3% in 24h)..."
          },
          "mcpWorkflow": {
            "mcps": [
              {
                "name": "coingecko-server",
                "description": "CoinGecko官方MCP服务器",
                "category": "Market Data",
                "authRequired": true,
                "authVerified": true
              }
            ]
          }
        }
      },
      {
        "id": "msg_123458",
        "content": "Bitcoin price: $45,230.50 USD (+2.3% in 24h). Market cap: $890.2B. Trading volume: $28.5B. Technical analysis shows bullish momentum with RSI at 65.",
        "type": "assistant",
        "intent": "task",
        "taskId": "task_789",
        "metadata": {
          "contentType": "final_result"
        },
        "createdAt": "2023-06-20T08:05:25.000Z",
        "taskDetails": {
          "id": "task_789",
          "title": "【机器人】Get Bitcoin current price",
          "status": "completed",
          "taskType": "agent",
          "result": {
            "summary": "Task execution completed successfully",
            "finalResult": "Bitcoin price: $45,230.50 USD (+2.3% in 24h)..."
          },
          "mcpWorkflow": {
            "mcps": [
              {
                "name": "coingecko-server",
                "description": "CoinGecko官方MCP服务器",
                "category": "Market Data",
                "authRequired": true,
                "authVerified": true
              }
            ]
          }
        }
      },
      {
        "id": "msg_123459",
        "content": "What about Ethereum?",
        "type": "user",
        "intent": "chat",
        "taskId": null,
        "metadata": {
          "contentType": "user_input"
        },
        "createdAt": "2023-06-20T08:05:30.000Z",
        "taskDetails": null
      },
      {
        "id": "msg_123460",
        "content": "I can help you get Ethereum price information as well! Would you like me to fetch the current Ethereum price and market data?",
        "type": "assistant",
        "intent": "chat",
        "taskId": null,
        "metadata": {
          "contentType": "chat_response"
        },
        "createdAt": "2023-06-20T08:05:35.000Z",
        "taskDetails": null
      }
    ]
  }
}
```

**字段说明**:
- `conversation`: 会话基本信息
  - `id`: 会话ID
  - `title`: 会话标题
  - `type`: 会话类型（"agent"表示Agent会话）
  - `agentId`: 关联的Agent ID
  - `messageCount`: 消息数量
  - `taskCount`: 任务数量
- `agent`: Agent基本信息
  - `id`: Agent ID
  - `name`: Agent名称
  - `description`: Agent描述
  - `categories`: Agent分类
- `messages`: 消息列表
  - `id`: 消息ID
  - `content`: 消息内容
  - `type`: 消息类型（user/assistant）
  - `intent`: 消息意图（chat/task）
  - `taskId`: 关联的任务ID（如果是任务消息）
  - `metadata`: 消息元数据
    - `contentType`: 消息内容类型，用于前端区分显示
      - `user_input`: 用户输入消息
      - `chat_response`: 普通聊天回复
      - `step_thinking`: 中间执行步骤（思考过程）
      - `final_result`: 最终格式化结果
  - `taskDetails`: 关联任务的详细信息（如果有）

**前端集成建议**:
根据 `metadata.contentType` 字段可以实现不同的UI展示：
- `user_input`: 正常显示用户消息
- `chat_response`: 正常显示聊天回复
- `step_thinking`: 可以默认折叠，标记为"思考过程"
- `final_result`: 高亮显示，标记为"最终结果"

**接口特性**:
- **单一会话详情**: 获取特定会话的完整信息
- **完整消息历史**: 包含用户发送和助手回复的所有消息
- **任务关联**: 显示消息与任务的关联关系
- **元数据支持**: 提供metadata字段供前端进行消息分类展示
- **任务详情**: 为关联任务的消息提供完整的任务信息

**错误响应**:
- `400 Bad Request`: 缺少conversationId参数或参数无效
- `401 Unauthorized`: 无效的访问令牌
- `403 Forbidden`: 无权访问该Agent或会话
- `404 Not Found`: Agent不存在或会话不存在
- `500 Internal Server Error`: 服务器内部错误

**使用示例**:
```bash
# 获取指定Agent的特定会话详情
curl -X GET "http://localhost:3001/api/agent/agent_123456/conversations?conversationId=conv_987654321" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## MCP错误处理和诊断系统 (v2.2)

从v2.2开始，系统引入了全新的MCP错误处理和诊断机制，提供智能化的错误分析和用户友好的错误提示。

### MCP错误处理机制概述

当用户的MCP认证信息填写错误时，系统会通过以下多层机制进行处理：

#### 1. 事前检查阶段

在Agent任务启动前，系统会主动检查所需MCP的认证状态：

**检查流程**:
- 自动扫描Agent所需的MCP服务
- 验证每个MCP的认证状态
- 生成详细的认证指引信息

**如果认证缺失，用户会收到**:
- 🔐 详细的认证提示消息
- 📋 每个MCP所需的认证参数列表  
- 💡 如何进行认证的步骤指引

#### 2. 运行时智能错误检测

当执行过程中遇到认证错误时，新的LLM增强错误分析系统会：

**智能识别各种认证错误模式**:
```typescript
// 系统能识别的错误模式包括：
- /invalid.*api.*key/i          // API Key无效
- /wrong.*password/i            // 密码错误  
- /authentication.*failed/i     // 认证失败
- /unauthorized/i               // 未授权
- /401/, /403/                  // HTTP状态码
- /error.*399/i                 // Twitter特定错误码
- /token.*expired/i             // Token过期
```

**错误分析结果包括**:
- 🎯 精确的错误类型识别
- 💬 用户友好的错误说明
- 🔧 具体的解决建议
- 🤖 LLM增强的智能分析

#### 3. 专门的MCP连接错误事件

对于认证相关的错误，系统会发送专门的 `mcp_connection_error` 事件，而不是普通的执行错误事件。

### MCP连接错误事件

#### mcp_connection_error

**事件格式**:
```json
{
  "event": "mcp_connection_error",
  "data": {
    "mcpName": "twitter-client-mcp",
    "step": 2,
    "agentName": "Twitter Assistant",
    "errorType": "INVALID_API_KEY",
    "title": "Invalid API Key",
    "message": "The API Key you provided is invalid. Please check and enter a valid API Key",
    "suggestions": [
      "Check if the API Key is complete without missing characters",
      "Ensure the API Key does not contain extra spaces",
      "Verify the API Key is from the correct service provider",
      "If this is a newly created API Key, wait a few minutes and try again"
    ],
    "authFieldsRequired": ["TWITTER_API_KEY", "TWITTER_API_SECRET_KEY"],
    "isRetryable": false,
    "requiresUserAction": true,
    "llmAnalysis": "{\"errorType\":\"authentication\",\"likelyIssue\":\"Invalid Twitter API credentials\",\"userFriendlyExplanation\":\"Your Twitter API key appears to be incorrect or malformed\",\"specificSuggestions\":[\"Double-check your Twitter API key from the developer dashboard\",\"Ensure you're using the correct API key type\"]}",
    "originalError": "API authentication failed: invalid api key provided",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**字段说明**:
- `mcpName`: 出错的MCP服务名称
- `step`: 出错的执行步骤编号
- `agentName`: 执行Agent的名称
- `errorType`: 错误类型枚举值
- `title`: 错误标题（用户友好）
- `message`: 错误描述（用户友好）
- `suggestions`: 具体的解决建议数组
- `authFieldsRequired`: 需要的认证字段列表
- `isRetryable`: 是否可重试
- `requiresUserAction`: 是否需要用户操作
- `llmAnalysis`: LLM智能分析结果（JSON字符串）
- `originalError`: 原始错误信息（用于调试）
- `timestamp`: 错误发生时间

### MCP测试连接API

#### POST /api/mcp/test-connection

测试MCP连接并返回详细的错误信息

**认证**: 需要访问令牌

**请求体**:
```json
{
  "mcpName": "twitter-client-mcp",
  "authData": {
    "TWITTER_API_KEY": "your_api_key",
    "TWITTER_API_SECRET_KEY": "your_secret_key",
    "TWITTER_ACCESS_TOKEN": "your_access_token",
    "TWITTER_ACCESS_TOKEN_SECRET": "your_token_secret"
  }
}
```

**成功响应 (200)**:
```json
{
  "success": true,
  "data": {
    "message": "MCP connection test successful",
    "mcpName": "twitter-client-mcp",
    "toolCount": 15,
    "connectionTest": {
      "status": "success",
      "testTime": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**错误响应 (401/403/500)**:
```json
{
  "success": false,
  "error": {
    "type": "INVALID_API_KEY",
    "title": "Invalid API Key",
    "message": "The API Key you provided is invalid. Please check and enter a valid API Key",
    "suggestions": [
      "Check if the API Key is complete without missing characters",
      "Ensure the API Key does not contain extra spaces",
      "Verify the API Key is from the correct service provider"
    ],
    "isRetryable": false,
    "requiresUserAction": true,
    "mcpName": "twitter-client-mcp",
    "authFieldsRequired": ["TWITTER_API_KEY", "TWITTER_API_SECRET_KEY"],
    "llmAnalysis": "{\"errorType\":\"authentication\",\"likelyIssue\":\"Invalid API credentials\"}"
  },
  "technical": {
    "originalError": "API authentication failed: invalid api key provided",
    "httpStatus": 401
  }
}
```

### 错误类型枚举

系统支持以下MCP错误类型：

#### 认证相关错误
- `INVALID_API_KEY`: API Key无效
- `EXPIRED_API_KEY`: API Key已过期
- `WRONG_PASSWORD`: 密码错误
- `MISSING_AUTH_PARAMS`: 缺少认证参数
- `INVALID_AUTH_FORMAT`: 认证格式无效
- `INSUFFICIENT_PERMISSIONS`: 权限不足

#### 连接相关错误
- `CONNECTION_TIMEOUT`: 连接超时
- `CONNECTION_REFUSED`: 连接被拒绝
- `NETWORK_ERROR`: 网络错误
- `SERVICE_UNAVAILABLE`: 服务不可用

#### 配置相关错误
- `INVALID_CONFIGURATION`: 配置错误
- `MISSING_DEPENDENCIES`: 依赖缺失
- `INVALID_COMMAND`: 命令无效

#### 服务器相关错误
- `INTERNAL_SERVER_ERROR`: 服务器内部错误
- `RATE_LIMIT_EXCEEDED`: 请求频率超限
- `QUOTA_EXCEEDED`: 配额超限

#### MCP特定错误
- `MCP_CONNECTION_FAILED`: MCP连接失败
- `MCP_AUTH_REQUIRED`: MCP需要认证
- `MCP_SERVICE_INIT_FAILED`: MCP服务初始化失败

### 错误处理示例

#### API Key错误示例
```json
{
  "event": "mcp_connection_error",
  "data": {
    "errorType": "INVALID_API_KEY",
    "title": "Invalid API Key",
    "message": "The API Key you provided is invalid. Please check and enter a valid API Key",
    "suggestions": [
      "Check if the API Key is complete without missing characters",
      "Ensure the API Key does not contain extra spaces",
      "Verify the API Key is from the correct service provider",
      "If this is a newly created API Key, wait a few minutes and try again"
    ]
  }
}
```

#### 密码错误示例
```json
{
  "event": "mcp_connection_error",
  "data": {
    "errorType": "WRONG_PASSWORD",
    "title": "Wrong Password",
    "message": "The password you entered is incorrect. Please check and re-enter",
    "suggestions": [
      "Verify the password case sensitivity is correct",
      "Check if Caps Lock is enabled",
      "If entered incorrectly multiple times, the account may be temporarily locked",
      "Try resetting the password or using alternative authentication methods"
    ]
  }
}
```

#### Token过期示例
```json
{
  "event": "mcp_connection_error",
  "data": {
    "errorType": "EXPIRED_API_KEY",
    "title": "Token Expired",
    "message": "Your access token has expired and needs to be refreshed or renewed",
    "suggestions": [
      "Try refreshing the token",
      "Re-login to get a new token",
      "Check the token validity period settings",
      "Ensure system time is correct"
    ]
  }
}
```

### 前端处理建议

#### 1. 事件监听
```javascript
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'mcp_connection_error') {
    handleMCPConnectionError(data.data);
  } else if (data.event === 'step_error') {
    handleStepError(data.data);
  }
});
```

#### 2. 错误处理
```javascript
function handleMCPConnectionError(errorData) {
  // 显示MCP连接错误对话框
  showMCPErrorDialog({
    mcpName: errorData.mcpName,
    title: errorData.title,
    message: errorData.message,
    suggestions: errorData.suggestions,
    authFieldsRequired: errorData.authFieldsRequired,
    requiresUserAction: errorData.requiresUserAction
  });
  
  // 如果需要用户操作，跳转到认证页面
  if (errorData.requiresUserAction) {
    redirectToMCPAuth(errorData.mcpName, errorData.authFieldsRequired);
  }
}
```

#### 3. 用户体验优化
```javascript
function showMCPErrorDialog(errorData) {
  // 创建错误提示对话框
  const dialog = createDialog({
    title: `🔧 ${errorData.title}`,
    message: errorData.message,
    type: 'mcp-error',
    actions: [
      {
        text: 'Fix Authentication',
        primary: true,
        action: () => redirectToMCPAuth(errorData.mcpName)
      },
      {
        text: 'View Details',
        action: () => showErrorDetails(errorData)
      }
    ]
  });
  
  // 显示解决建议
  if (errorData.suggestions?.length > 0) {
    dialog.addSuggestions(errorData.suggestions);
  }
  
  dialog.show();
}
```

### 用户体验流程

完整的错误处理用户体验流程：

1. **启动Agent** → 系统检查认证状态
2. **认证缺失** → 显示详细的认证指引和参数要求  
3. **执行过程中错误** → 触发专门的 `mcp_connection_error` 事件
4. **前端接收** → 显示具体错误类型和解决建议
5. **LLM分析** → 提供智能化的错误解释和修复指导
6. **用户修正** → 根据建议更新认证信息
7. **重试执行** → 系统使用新的认证信息重新尝试

### 系统特性亮点

- 🤖 **LLM增强分析**: 智能识别复杂错误并提供精准建议
- 🎯 **专门事件类型**: 区分MCP连接错误和普通执行错误
- 📱 **前端友好**: 结构化的错误信息，便于UI展示
- 🔄 **动态指引**: 根据不同MCP提供特定的认证指导
- 🛠️ **开发者友好**: 保留原始错误信息用于调试
- 🔍 **主动检测**: 事前检查认证状态，减少运行时错误
- 💡 **智能建议**: 基于错误类型提供具体的解决方案

---

### Agent系统特性