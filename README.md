# MCP-LangChain 智能任务处理系统

MCP-LangChain是一个基于Model Context Protocol (MCP)和LangChain的智能任务处理平台，支持用户自然语言任务分析、智能工具选择和流式任务执行。

## 核心特性

- 🧠 **智能任务分析** - 自动分析用户自然语言需求并拆解为具体步骤
- 🛠️ **MCP工具集成** - 自动选择最适合的MCP工具组合
- 🔄 **自动化工作流** - 构建高效的MCP工作流来执行任务
- 💧 **流式响应** - 实时返回处理进度和结果
- 🔐 **多种登录方式** - 支持传统账号和Web3钱包登录
- 🔑 **MCP授权管理** - 管理和存储各种MCP工具的授权信息

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

3. 创建 `.env` 文件：

```env
PORT=3001
OPENAI_API_KEY=your-openai-api-key
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_server
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

4. 设置数据库：

```bash
npm run migrate-database
```

5. 启动服务：

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

- `POST /api/task/:id/analyze` - 分析任务
- `POST /api/task/:id/analyze/stream` - 流式分析任务
- `POST /api/task/:id/execute` - 执行任务
- `POST /api/task/:id/execute/stream` - 流式执行任务

### MCP授权接口

- `POST /api/task/:id/verify-auth` - 验证MCP授权
- `GET /api/task/:id/mcp-alternatives/:mcpName` - 获取替代MCP选项
- `POST /api/task/:id/replace-mcp` - 替换工作流中的MCP

## 文档导航

- 📚 [系统概述](./docs/SYSTEM_OVERVIEW.md) - 系统架构、组件和工作流程
- 📘 [API参考](./docs/API_REFERENCE.md) - 详细API规范和示例
- 📖 [用户指南](./docs/USER_GUIDE.md) - 系统使用方法和最佳实践
- 🔧 [MCP适配器配置](./docs/adapter-configuration.md) - 配置和扩展MCP适配器
- 🔄 [自动工具调用](./docs/auto-tool-calling.md) - 自动工具调用机制说明
- 🔌 [MCP连接管理](./docs/mcp-connection-management.md) - MCP连接管理指南
- 🛠️ [数据库设置](./docs/DATABASE_SETUP.md) - 数据库配置指南
- 🔐 [认证设置](./docs/AUTH_SETUP.md) - 认证系统设置指南

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