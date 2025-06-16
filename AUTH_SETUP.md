# 认证系统设置指南

## 概述

本项目已集成完整的用户认证系统，支持钱包登录（EIP-4361 Sign-In with Ethereum），并为后续添加 Google、GitHub 等登录方式预留了扩展接口。

## 安装依赖

```bash
npm install
```

## 环境变量配置

在项目根目录创建 `.env` 文件，添加以下配置：

```env
# 服务器配置
PORT=3001

# OpenAI API 配置
OPENAI_API_KEY=sk-your-openai-api-key-here

# MCP 适配器配置
USE_OFFICIAL_MCP_ADAPTER=false

# JWT 密钥配置 (生产环境中请使用强密钥)
JWT_ACCESS_SECRET=your-super-secret-access-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# 区块链配置 (可选，用于获取真实的钱包余额)
# ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
# POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your-api-key
```

## API 端点

### 认证相关

- `POST /api/auth/wallet/nonce` - 获取钱包登录随机数
- `POST /api/auth/wallet/login` - 钱包登录
- `POST /api/auth/refresh` - 刷新访问令牌
- `POST /api/auth/logout` - 登出
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/me` - 更新用户信息
- `POST /api/auth/revoke-all` - 撤销所有令牌

### 钱包登录流程

#### 1. 获取登录随机数

```javascript
const response = await fetch('/api/auth/wallet/nonce', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: walletAddress })
});
const { data } = await response.json();
const { nonce, message } = data;
```

#### 2. 签名消息

```javascript
// 使用钱包签名消息
const signature = await signer.signMessage(message);
```

#### 3. 验证登录

```javascript
const loginResponse = await fetch('/api/auth/wallet/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message,
    signature,
    username: 'MyUsername', // 可选
    avatar: 'https://example.com/avatar.jpg' // 可选
  })
});
const { data } = await loginResponse.json();
const { user, tokens } = data;
```

#### 4. 使用访问令牌

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokens.accessToken}`
  },
  body: JSON.stringify({ messages: [...] })
});
```

## 用户数据结构

```typescript
interface User {
  id: string;
  username?: string;
  avatar?: string;
  walletAddress?: string;
  balance?: string;
  email?: string;
  
  loginMethods: {
    wallet?: {
      address: string;
      verified: boolean;
      lastSignedAt?: Date;
    };
    google?: {
      googleId: string;
      email: string;
      verified: boolean;
    };
    github?: {
      githubId: string;
      username: string;
      verified: boolean;
    };
  };
  
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;
}
```

## 受保护的 API 端点

以下端点现在需要认证：

- `POST /api/chat` - AI 聊天
- `POST /api/chat/stream` - 流式聊天
- `POST /api/mcp/connect` - 连接 MCP 服务
- `POST /api/mcp/disconnect` - 断开 MCP 服务
- `GET /api/mcp/list` - 获取 MCP 列表
- `GET /api/mcp/:name/tools` - 获取 MCP 工具
- `POST /api/mcp/tool` - 调用 MCP 工具

## 安全特性

1. **EIP-4361 标准** - 使用标准的"Sign-In with Ethereum"协议
2. **JWT 令牌** - 访问令牌（1小时）+ 刷新令牌（7天）
3. **速率限制** - 登录限制（15分钟5次）+ 一般请求限制（15分钟100次）
4. **令牌撤销** - 支持撤销单个或所有令牌
5. **地址验证** - 严格的以太坊地址格式验证

## 扩展性

系统已为后续添加 Google、GitHub 登录预留接口：

```typescript
// 用户服务已支持多种登录方式
await userService.addLoginMethod(userId, 'google', {
  googleId: 'google-user-id',
  email: 'user@gmail.com'
});

await userService.addLoginMethod(userId, 'github', {
  githubId: 'github-user-id',
  username: 'github-username'
});
```

## 数据存储

当前使用内存存储，生产环境建议迁移到：
- MongoDB（用户数据）
- Redis（会话和令牌管理）

## 启动服务

```bash
npm run dev
```

服务将在 http://localhost:3001 启动，所有 API 端点都已集成认证系统。 