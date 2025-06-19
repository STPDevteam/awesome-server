# LangChain MCP 后端服务

支持钱包登录的 AI 聊天服务，集成了 MCP (Model Context Protocol) 和用户认证系统。

## 功能特性

- 🔐 **钱包登录** - 支持 EIP-4361 "Sign-In with Ethereum" 标准
- 🤖 **AI 聊天** - 集成 OpenAI GPT 模型
- 🔧 **MCP 集成** - 支持 Model Context Protocol 工具调用
- 👤 **用户管理** - 用户信息、头像、余额管理
- 🛡️ **安全保护** - JWT 令牌、速率限制、签名验证
- 📱 **多登录支持** - 预留 Google、GitHub 等登录方式
- 💳 **加密支付** - Coinbase Commerce 集成，支持 USDT/USDC 支付
- 👑 **会员系统** - Plus/Pro 会员订阅管理

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
vim .env
```

**必需配置**：
- `OPENAI_API_KEY`: OpenAI API 密钥
- `DB_PASSWORD`: 数据库密码
- `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET`: JWT 令牌密钥

详细配置请参考：[ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)

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

### 支付和会员 (需要登录)

- `GET /api/payment/pricing` - 获取会员定价
- `POST /api/payment/create-payment` - 创建支付订单
- `GET /api/payment/payment/:id` - 获取支付状态
- `GET /api/payment/payments` - 获取支付历史
- `GET /api/payment/membership-status` - 获取会员状态
- `POST /api/payment/webhooks/coinbase` - Coinbase Commerce webhook 回调

## 📁 项目结构

```
mcp-server/
├── src/                    # 后端源代码
├── deployment/            # 部署相关文件
│   ├── docker-compose.yml     # 主要编排（后端+数据库）
│   ├── deploy.sh              # 部署脚本
│   └── Dockerfile             # Docker 镜像构建
├── docs/                  # 项目文档
├── examples/              # 示例代码
├── test/                  # 测试文件
├── .env                   # 环境变量配置
└── package.json          # 项目依赖
```

## 详细文档

- 📖 **[API 文档](./docs/API.md)** - 完整的 API 接口文档
- 📋 **[API 概览](./docs/API_OVERVIEW.md)** - 快速查看所有端点
- 🔧 **[Postman 集合](./docs/MCP_LangChain_API.postman_collection.json)** - 导入 Postman 进行 API 测试
- 🔐 **[认证设置](./docs/AUTH_SETUP.md)** - 认证系统设置指南
- 🗄️ **[数据库设置](./docs/DATABASE_SETUP.md)** - 数据库配置指南
- 🚀 **[MVP 部署指南](./docs/README_MVP.md)** - 快速部署指南
- 💳 **[支付 API 文档](./docs/PAYMENT_API.md)** - 支付功能使用指南
- 🏪 **[Coinbase Commerce 集成](./docs/COINBASE_COMMERCE_INTEGRATION.md)** - 官方接入文档
- 💰 **[Coinbase Commerce 设置指南](./docs/COINBASE_COMMERCE_SETUP_GUIDE.md)** - 账户配置必读

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