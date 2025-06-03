# LangChain MCP 后端服务

## 配置

1. 创建 `.env` 文件：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，添加你的 OpenAI API 密钥：

```
PORT=3001
OPENAI_API_KEY=sk-your-openai-api-key-here
```

## 启动服务

```bash
npm install
npm run dev
```

服务将在 http://localhost:3001 启动。

## API 端点

- `POST /api/chat` - 普通聊天完成
- `POST /api/chat/stream` - 流式聊天
- `POST /api/mcp/connect` - 连接 MCP 服务
- `GET /api/mcp/list` - 获取已连接的 MCP 列表
- `GET /api/mcp/:name/tools` - 获取 MCP 工具列表
- `POST /api/mcp/tool` - 调用 MCP 工具
- `GET /health` - 健康检查 