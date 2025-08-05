# MCP-LangChain 智能任务处理系统

MCP-LangChain是一个基于Model Context Protocol (MCP)和LangChain的智能任务处理平台，支持用户自然语言任务分析、智能工具选择和流式任务执行。

## 核心特性

- 🔐 **钱包登录** - 支持 EIP-4361 "Sign-In with Ethereum" 标准
- 🤖 **AI 聊天** - 集成 OpenAI GPT 模型
- 🔧 **MCP 集成** - 支持 Model Context Protocol 工具调用
- ⚡ **增强任务引擎** - 智能重试、参数推导、双重结果格式化 🆕
- 🎯 **智能代理** - Agent专用多轮对话和任务执行
- 🌍 **多语言支持** - 智能语言检测，支持11种主要语言 🆕
- 👤 **用户管理** - 用户信息、头像、余额管理
- 🛡️ **安全保护** - JWT 令牌、速率限制、签名验证
- 📱 **多登录支持** - 预留 Google、GitHub 等登录方式
- 💳 **加密支付** - Coinbase Commerce 集成，支持 USDT/USDC 支付
- 👑 **会员系统** - Plus/Pro 会员订阅管理


## 快速开始

1. 克隆仓库：

```bash
git clone https://github.com/yourusername/mcp-server.git
cd mcp-server
```

2. 安装依赖：

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

## 系统架构

MCP-LangChain系统采用分层架构设计：

- **API服务层**：处理HTTP请求，提供RESTful接口
- **业务逻辑层**：实现核心业务逻辑，如任务管理、MCP工具适配等
- **AI处理层**：负责任务分析、工具选择和结果生成
- **数据存取层**：处理数据库操作和持久化
- **基础设施层**：提供数据库连接、日志记录等基础服务

详细架构说明请查看[系统概述文档](./docs/SYSTEM_OVERVIEW.md)。

## 任务处理流程

系统的任务处理流程如下：

1. **任务创建** - 用户提交任务内容，系统生成任务标题
2. **任务分析** - 系统分析任务需求，识别适用的MCP工具
3. **工作流构建** - 创建最佳的MCP工具调用顺序
4. **MCP授权** - 用户提供必要的MCP工具授权信息
5. **任务执行** - 系统按照工作流顺序调用MCP工具
6. **结果呈现** - 将执行结果整合并呈现给用户

## API文档

API端点详细说明请查看[API参考文档](./docs/API_REFERENCE.md)。

主要API端点包括：

### 认证接口

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/wallet/login` - 钱包登录
- `POST /api/auth/refresh` - 刷新访问令牌

### 任务管理接口

- `POST /api/task` - 创建任务
- `GET /api/task` - 获取任务列表
- `GET /api/task/:id` - 获取任务详情
- `POST /api/task/title` - 生成任务标题

### 任务分析和执行接口

- `POST /api/task/:id/analyze/stream` - 流式分析任务
- `POST /api/task/:id/execute/stream` - 流式执行任务

### MCP授权接口

- `POST /api/task/:id/verify-auth` - 验证MCP授权
- `GET /api/task/:id/mcp-alternatives/:mcpName` - 获取替代MCP选项
- `POST /api/task/:id/replace-mcp` - 替换工作流中的MCP


## 文档导航

- 📚 [系统概述](./docs/SYSTEM_OVERVIEW.md) - 系统架构、组件和工作流程
- 📘 [API参考](./docs/API_REFERENCE.md) - 详细API规范和示例
- 📖 [用户指南](./docs/USER_GUIDE.md) - 系统使用方法和最佳实践
- ⚡ [增强任务引擎](./docs/ENHANCED_TASK_ENGINE_GUIDE.md) - 智能任务执行系统完整指南 🆕
- 🚀 [增强引擎快速开始](./docs/ENHANCED_TASK_ENGINE_QUICKSTART.md) - 5分钟上手指南 🆕
- 🔧 [MCP适配器配置](./docs/adapter-configuration.md) - 配置和扩展MCP适配器
- 🔄 [自动工具调用](./docs/auto-tool-calling.md) - 自动工具调用机制说明
- 🔌 [MCP连接管理](./docs/mcp-connection-management.md) - MCP连接管理指南
- 🏊 [连接池配置](./docs/CONNECTION_POOL_CONFIG.md) - MCP连接池优化配置
- 🛠️ [数据库设置](./docs/DATABASE_SETUP.md) - 数据库配置指南
- 🔐 [认证设置](./docs/AUTH_SETUP.md) - 认证系统设置指南
- 🔑 [MCP认证流程](./docs/MCP_AUTH_FLOW_GUIDE.md) - MCP工具认证流程完整指南

### 支付和会员 (需要登录)

- `GET /api/payment/pricing` - 获取会员定价
- `POST /api/payment/create-payment` - 创建支付订单
- `GET /api/payment/payment/:id` - 获取支付状态
- `GET /api/payment/payments` - 获取支付历史
- `GET /api/payment/membership-status` - 获取会员状态
- `DELETE /api/payment/membership` - 清除用户会员状态
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
- ⚡ **[增强任务引擎指南](./docs/ENHANCED_TASK_ENGINE_GUIDE.md)** - 智能任务执行系统完整指南 🆕
- 🚀 **[增强引擎快速开始](./docs/ENHANCED_TASK_ENGINE_QUICKSTART.md)** - 5分钟上手指南 🆕
- 🌍 **[多语言支持文档](./docs/MULTILINGUAL_SUPPORT_IMPLEMENTATION.md)** - 11种语言智能检测与适配 🆕
- 🎯 **[语言指令解析功能](./docs/LANGUAGE_INSTRUCTION_PARSING_FEATURE.md)** - 智能识别用户语言指令 🆕
- 🔧 **[Postman 集合](./docs/MCP_LangChain_API.postman_collection.json)** - 导入 Postman 进行 API 测试
- 🔐 **[认证设置](./docs/AUTH_SETUP.md)** - 认证系统设置指南
- 🗄️ **[数据库设置](./docs/DATABASE_SETUP.md)** - 数据库配置指南
- 🚀 **[MVP 部署指南](./docs/README_MVP.md)** - 快速部署指南
- 💳 **[支付 API 文档](./docs/PAYMENT_API.md)** - 支付功能使用指南
- 🏪 **[Coinbase Commerce 集成](./docs/COINBASE_COMMERCE_INTEGRATION.md)** - 官方接入文档
- 💰 **[Coinbase Commerce 设置指南](./docs/COINBASE_COMMERCE_SETUP_GUIDE.md)** - 账户配置必读

## 技术栈

- **后端框架**：Node.js, Express, TypeScript
- **数据库**：PostgreSQL
- **AI接口**：LangChain, OpenAI
- **认证**：JWT, 钱包签名验证
- **实时通讯**：Server-Sent Events (SSE)

## 本地测试

对于本地测试，可以使用以下方法：

```bash
# 使用curl测试API
curl -X POST "http://localhost:3001/api/task" \
  -H "Content-Type: application/json" \
  -d '{"content": "分析最近的股市趋势", "userId": "1"}'

# 获取任务列表
curl -X GET "http://localhost:3001/api/task?userId=1" \
  -H "Content-Type: application/json"

# 获取任务详情
curl -X GET "http://localhost:3001/api/task/YOUR_TASK_ID?userId=1" \
  -H "Content-Type: application/json"
```

## 贡献指南

欢迎对MCP-LangChain项目做出贡献。请先fork仓库，创建特性分支，然后提交PR。

## 许可证

MIT 