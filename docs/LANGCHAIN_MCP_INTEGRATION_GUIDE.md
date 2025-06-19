# LangChain + MCP 集成方案指南

## 项目概述

本指南将帮助您在现有的 Better ChatGPT 前端项目基础上，集成 LangChain 框架并接入各种 MCP（Model Context Protocol）服务。

## 架构设计

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   前端应用       │────▶│  LangChain后端   │────▶│   MCP服务器     │
│  (React + TS)   │     │  (Node + Express)│     │   (Various)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## 实施步骤

### 1. 创建 LangChain 后端服务

#### 1.1 初始化后端项目

```bash
# 在项目根目录创建后端文件夹
mkdir backend-langchain-mcp
cd backend-langchain-mcp

# 复制之前创建的 package.json 或初始化新项目
npm init -y

# 安装依赖
npm install express cors dotenv langchain @langchain/openai @langchain/community @modelcontextprotocol/sdk winston zod
npm install -D typescript @types/node @types/express @types/cors nodemon ts-node
```

#### 1.2 创建 TypeScript 配置

创建 `backend-langchain-mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 1.3 创建环境变量配置

创建 `backend-langchain-mcp/.env`:

```env
PORT=3001
OPENAI_API_KEY=your_openai_api_key
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langchain_api_key
```

### 2. 实现后端核心功能

#### 2.1 主服务器文件

创建 `backend-langchain-mcp/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat';
import { mcpRouter } from './routes/mcp';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api/chat', chatRouter);
app.use('/api/mcp', mcpRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
```

#### 2.2 LangChain 聊天路由

创建 `backend-langchain-mcp/src/routes/chat.ts`:

```typescript
import { Router } from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';

const router = Router();

const model = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7,
});

// 普通聊天完成
router.post('/', async (req, res) => {
  try {
    const { messages, config } = req.body;
    
    // 转换消息格式
    const langchainMessages = messages.map((msg: any) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });

    const response = await model.invoke(langchainMessages);
    
    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: response.content
        }
      }]
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 流式聊天
router.post('/stream', async (req, res) => {
  try {
    const { messages } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const langchainMessages = messages.map((msg: any) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });

    const stream = await model.stream(langchainMessages);
    
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as chatRouter };
```

#### 2.3 MCP 管理路由

创建 `backend-langchain-mcp/src/routes/mcp.ts`:

```typescript
import { Router } from 'express';
import { MCPManager } from '../services/mcpManager';

const router = Router();
const mcpManager = new MCPManager();

// 连接 MCP
router.post('/connect', async (req, res) => {
  try {
    const { name, command, args } = req.body;
    await mcpManager.connect(name, command, args);
    res.json({ success: true, message: `Connected to ${name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取 MCP 列表
router.get('/list', async (req, res) => {
  try {
    const list = mcpManager.getConnectedMCPs();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取 MCP 工具
router.get('/:name/tools', async (req, res) => {
  try {
    const tools = await mcpManager.getTools(req.params.name);
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 调用 MCP 工具
router.post('/tool', async (req, res) => {
  try {
    const { mcpName, toolName, arguments: args } = req.body;
    const result = await mcpManager.callTool(mcpName, toolName, args);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as mcpRouter };
```

### 3. 前端集成

#### 3.1 更新前端 API 服务

已创建的 `src/api/langchain-api.ts` 提供了与后端通信的接口。

#### 3.2 创建 MCP 管理界面

创建 `src/components/MCPManager.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { connectMCP, getAvailableMCPs, getMCPTools } from '@api/langchain-api';

// ... 组件实现已在前面创建
```

#### 3.3 集成到主应用

更新 `src/App.tsx` 添加 MCP 管理入口:

```typescript
import MCPManager from '@components/MCPManager';

// 在合适的位置添加 MCP 管理组件
// 例如在设置菜单中添加一个选项
```

### 4. 运行和测试

#### 4.1 启动后端服务

```bash
cd backend-langchain-mcp
npm run dev
```

#### 4.2 启动前端应用

```bash
# 在项目根目录
npm run dev
```

#### 4.3 配置环境变量

在前端项目根目录创建 `.env.local`:

```env
VITE_LANGCHAIN_BACKEND_URL=http://localhost:3001
```

### 5. 支持的 MCP 服务

可以接入的 MCP 服务包括：

1. **文件系统 MCP** - 文件操作
2. **GitHub MCP** - GitHub 仓库访问
3. **PostgreSQL MCP** - 数据库操作
4. **Slack MCP** - Slack 集成
5. **Memory MCP** - 知识图谱存储
6. **自定义 MCP** - 可以开发自己的 MCP 服务

### 6. 高级功能

#### 6.1 LangChain Agent 集成

```typescript
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { MCPTool } from './tools/mcpTool';

const tools = [
  new MCPTool({ mcpName: 'filesystem', toolName: 'read_file' }),
  new MCPTool({ mcpName: 'github', toolName: 'search_code' }),
];

const agent = await initializeAgentExecutorWithOptions(tools, model, {
  agentType: 'openai-functions',
});
```

#### 6.2 向量存储集成

```typescript
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';

const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  new OpenAIEmbeddings()
);
```

### 7. 注意事项

1. **安全性**：确保 API 密钥安全存储
2. **错误处理**：实现完善的错误处理机制
3. **性能优化**：考虑缓存和连接池
4. **监控**：添加日志和监控
5. **测试**：编写单元测试和集成测试

### 8. 下一步

1. 实现更多 LangChain 特性（RAG、Agent、Memory）
2. 添加更多 MCP 服务支持
3. 优化用户界面和体验
4. 实现权限管理和多用户支持
5. 部署到生产环境 