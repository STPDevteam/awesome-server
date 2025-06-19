# X MCP Server 集成设置指南

## 概述

本项目已经成功集成了 x-mcp-server，移除了所有默认的 MCP 服务。现在系统只配置了 x-mcp-server 作为唯一的 MCP 服务。

## 系统架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   前端应用       │────▶│  LangChain后端   │────▶│  x-mcp-server   │
│  (React + TS)   │     │  (Node + Express)│     │   (Twitter API) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## 重要更新（必读）

系统现已默认使用 LangChain 后端进行聊天，这样才能正确调用 MCP 工具。前端会自动识别用户意图并调用相应的 Twitter 功能。

## 启动步骤

### 1. 启动后端服务

```bash
cd backend-langchain-mcp
npm install
npm run dev
```

后端服务将运行在 http://localhost:3001

### 2. 启动前端应用

```bash
# 在项目根目录
npm install
npm run dev
```

前端应用将运行在 http://localhost:5173

## 配置 x-mcp-server

1. 在前端应用中，点击菜单中的 "MCP Services" 按钮
2. 你将看到 x-mcp-server 服务卡片
3. 点击 "Connect" 按钮
4. 系统会提示你输入 Twitter API 凭证：
   - TWITTER_API_KEY
   - TWITTER_API_SECRET
   - TWITTER_ACCESS_TOKEN
   - TWITTER_ACCESS_SECRET
5. 输入所有必需的凭证后，点击 "Save & Connect"
6. 成功连接后，服务卡片会显示为绿色，并显示 "Connected"

## 获取 Twitter API 凭证

1. 访问 [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. 创建一个新的项目和应用
3. 在应用设置中配置权限为 "Read and Write"
4. 生成 API Keys 和 Access Tokens
5. 将生成的凭证复制到 MCP 配置界面

## 可用功能

x-mcp-server 提供以下工具：

- **get_home_timeline**: 获取你的 Twitter 时间线
- **create_tweet**: 发布新推文
- **reply_to_tweet**: 回复推文

## 在聊天中使用

配置完成后，你可以在聊天中请求 AI 使用这些工具。系统会自动识别你的意图：

### 查看推文
- "帮我查看最新的推文"
- "显示我的 timeline"
- "获取最新的 tweets"

### 发布推文
- "发布一条推文说：今天天气真好！"
- "发推文：正在测试 MCP 集成"
- "发布 tweet: Hello Twitter!"

### 关于角色选择
- **User**: 选择这个角色来发送普通的用户消息（推荐）
- **Assistant**: AI 助手的回复角色，通常不需要手动选择
- **System**: 系统指令角色，用于设置 AI 的行为准则

通常情况下，你应该始终选择 "User" 角色来发送消息。

## 注意事项

1. 确保 x-mcp-server 已经构建完成（在 x-mcp-server 目录运行 `npm run build`）
2. Twitter API 有速率限制，免费层级每月限制：
   - 500 条发布（用户级别）
   - 500 条发布（应用级别）
   - 100 次读取
3. 所有 API 凭证都会安全地传递给 MCP 服务，不会存储在前端
4. 系统使用 LangChain 后端来处理聊天和 MCP 工具调用

## 故障排除

### 如果无法操作 Twitter：
1. 确保 x-mcp-server 显示为 "Connected" 状态
2. 确保后端服务正在运行（检查 http://localhost:3001/health）
3. 检查浏览器控制台是否有错误信息
4. 确保使用 "User" 角色发送消息

### 如果点击 Connect 后页面变白：
1. 刷新页面
2. 重新打开 MCP Services 面板
3. 检查服务是否已经连接成功

### 查看日志：
- 前端日志：打开浏览器开发者工具的控制台
- 后端日志：查看运行 `npm run dev` 的终端窗口 