# MCP 集成指南

## 系统架构

本系统现已完全集成 MCP (Model Context Protocol) 功能，通过 mcp-server 提供智能工具调用能力。

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端应用       │────▶│   mcp-server    │────▶│  MCP Services   │
│  (React + TS)   │     │  (智能路由)     │     │  (x-mcp-server) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ↓
                        ┌─────────────────┐
                        │   LangChain     │
                        │  (自动工具选择) │
                        └─────────────────┘
```

## 已实现的功能

1. **状态自动同步** ✅
   - 前端每 5 秒自动同步 MCP 连接状态
   - 页面加载时自动获取已连接的服务

2. **断开连接功能** ✅
   - 可以主动断开已连接的 MCP 服务
   - 断开时清除保存的环境变量

3. **详细状态显示** ✅
   - 显示每个 MCP 的可用工具数量
   - 显示连接状态（connected/error）

4. **智能工具调用** ✅
   - LLM 会自动决定何时使用 MCP 工具
   - 无需手动指定工具调用

## 快速开始

### 1. 启动 mcp-server

```bash
cd mcp-server
npm install
npm run dev
```

服务器将在 http://localhost:3001 运行

### 2. 启动前端应用

```bash
cd mcp-fe
npm install
npm run dev
```

前端将在 http://localhost:5173 运行

### 3. 配置环境变量

在 mcp-server 目录创建 `.env` 文件：

```env
PORT=3001
OPENAI_API_KEY=your-openai-api-key
```

## 使用流程

### 连接 x-mcp-server

1. 打开前端应用
2. 点击菜单中的 "MCP Services"
3. 找到 x-mcp-server 卡片
4. 点击 "Connect"
5. 输入 Twitter API 凭证：
   - TWITTER_API_KEY
   - TWITTER_API_SECRET
   - TWITTER_ACCESS_TOKEN
   - TWITTER_ACCESS_SECRET
6. 点击 "Save & Connect"
7. 成功后显示 "3 tools available"（或其他数量）

### 断开连接

- 点击已连接服务的 "Disconnect" 按钮
- 系统会清除保存的环境变量

## 在聊天中使用

连接 MCP 服务后，直接在聊天中描述你的需求，AI 会自动识别并调用相应工具：

### Twitter 功能示例

- **查看推文**
  - "帮我查看最新的推文"
  - "显示我的 Twitter timeline"
  - "获取最新的 tweets"

- **发布推文**
  - "发布推文：今天天气真好！"
  - "发推文说：正在测试 MCP 集成"
  - "在 Twitter 上发布：Hello World!"

## 技术细节

### 前端状态管理

- 使用 `useLangChainBackend` 标志控制是否使用 MCP 功能
- 默认设置为 `true` 以启用 MCP 支持
- 状态存储在 `mcp-slice.ts` 中

### API 端点

所有 MCP 相关的 API 端点都在 mcp-server 中实现：

- `POST /api/chat` - 智能聊天（自动工具选择）
- `POST /api/chat/stream` - 流式聊天
- `POST /api/mcp/connect` - 连接 MCP 服务
- `POST /api/mcp/disconnect` - 断开 MCP 服务
- `GET /api/mcp/list` - 获取已连接的 MCP 列表
- `GET /api/mcp/:name/tools` - 获取 MCP 工具列表
- `POST /api/mcp/tool` - 手动调用 MCP 工具

### 环境变量

前端环境变量（可选）：
- `VITE_LANGCHAIN_BACKEND_URL` - MCP 服务器地址（默认: http://localhost:3001）

## 故障排除

### 无法连接 MCP 服务

1. 确保 mcp-server 正在运行
2. 检查服务器地址是否正确（默认 http://localhost:3001）
3. 验证 x-mcp-server 已构建（`npm run build`）
4. 查看浏览器控制台错误信息

### 工具调用失败

1. 确保 MCP 服务显示为已连接
2. 检查环境变量是否正确配置
3. 查看 mcp-server 控制台日志
4. 确认 OpenAI API Key 有效

### 状态不同步

- 前端会每 5 秒自动同步
- 可以手动刷新页面强制同步
- 检查网络连接是否正常

## 注意事项

1. **API 限制** - Twitter 免费层级有使用限制
2. **安全性** - API 凭证仅在内存中保存，不会持久化
3. **错误处理** - 如果 MCP 服务断开，系统会降级为普通聊天模式 