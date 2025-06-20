# MCP LangChain 服务 API 文档

## 概述

MCP LangChain 服务提供基于钱包认证的AI聊天服务，支持 Sign-In with Ethereum (SIWE) 标准进行用户认证。

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