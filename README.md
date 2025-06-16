# LangChain MCP 后端服务

支持钱包登录的 AI 聊天服务，集成了 MCP (Model Context Protocol) 和用户认证系统。

## 功能特性

- 🔐 **钱包登录** - 支持 EIP-4361 "Sign-In with Ethereum" 标准
- 🤖 **AI 聊天** - 集成 OpenAI GPT 模型
- 🔧 **MCP 集成** - 支持 Model Context Protocol 工具调用
- 👤 **用户管理** - 用户信息、头像、余额管理
- 🛡️ **安全保护** - JWT 令牌、速率限制、签名验证
- 📱 **多登录支持** - 预留 Google、GitHub 等登录方式

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 创建 `.env` 文件：

```env
PORT=3001
OPENAI_API_KEY=sk-your-openai-api-key-here
JWT_ACCESS_SECRET=your-super-secret-access-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
```

3. 启动服务：

```bash
npm run dev
```

服务将在 http://localhost:3001 启动。

## API 端点

### 认证相关 (无需登录)

- `POST /api/auth/wallet/nonce` - 获取钱包登录随机数
- `POST /api/auth/wallet/login` - 钱包登录
- `POST /api/auth/refresh` - 刷新访问令牌
- `GET /health` - 健康检查

### 用户相关 (需要登录)

- `POST /api/auth/logout` - 登出
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/me` - 更新用户信息
- `POST /api/auth/revoke-all` - 撤销所有令牌

### AI 聊天 (需要登录)

- `POST /api/chat` - 普通聊天完成
- `POST /api/chat/stream` - 流式聊天

### MCP 服务 (需要登录)

- `POST /api/mcp/connect` - 连接 MCP 服务
- `POST /api/mcp/disconnect` - 断开 MCP 服务
- `GET /api/mcp/list` - 获取已连接的 MCP 列表
- `GET /api/mcp/:name/tools` - 获取 MCP 工具列表
- `POST /api/mcp/tool` - 调用 MCP 工具

## 详细文档

- 📖 **[API 文档](./docs/API.md)** - 完整的 API 接口文档
- 📋 **[API 概览](./docs/API_OVERVIEW.md)** - 快速查看所有端点
- 🔧 **[Postman 集合](./docs/MCP_LangChain_API.postman_collection.json)** - 导入 Postman 进行 API 测试
- 🔐 **[认证设置](./AUTH_SETUP.md)** - 认证系统设置指南
- 🗄️ **[数据库设置](./DATABASE_SETUP.md)** - 数据库配置指南

## API 测试

### 使用 Postman

1. 导入 `docs/MCP_LangChain_API.postman_collection.json` 到 Postman
2. 设置环境变量 `baseUrl` 为 `http://localhost:3001`
3. 按顺序执行请求：获取 nonce → 钱包登录 → 使用其他 API

### 使用 cURL

```bash
# 1. 获取 nonce
curl -X POST http://localhost:3001/api/auth/wallet/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_WALLET_ADDRESS"}'

# 2. 钱包登录（需要先用钱包签名）
curl -X POST http://localhost:3001/api/auth/wallet/login \
  -H "Content-Type: application/json" \
  -d '{
    "message": "SIWE_MESSAGE",
    "signature": "WALLET_SIGNATURE"
  }'

# 3. AI 聊天
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
``` 