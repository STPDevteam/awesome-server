# API 概览

## 基础信息
- **基础URL**: `http://localhost:3001`
- **认证方式**: JWT Bearer Token
- **响应格式**: JSON

## 端点列表

### 认证相关 API

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/wallet/nonce` | 获取钱包登录随机数 | ❌ |
| POST | `/api/auth/wallet/login` | 钱包登录 | ❌ |
| POST | `/api/auth/refresh` | 刷新访问令牌 | ❌ |
| POST | `/api/auth/logout` | 登出 | ✅ |
| GET | `/api/auth/me` | 获取用户信息 | ✅ |
| PUT | `/api/auth/me` | 更新用户信息 | ✅ |
| POST | `/api/auth/revoke-all` | 撤销所有令牌 | ✅ |

### 聊天相关 API

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/chat` | AI 聊天 | ✅ |
| POST | `/api/chat/stream` | 流式聊天 | ✅ |

### MCP相关 API

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/mcp` | 获取所有MCP信息 | ❌* |
| GET | `/api/mcp/categories` | 获取所有MCP类别 | ❌* |
| GET | `/api/mcp/category/:category` | 获取指定类别的MCP | ❌* |
| GET | `/api/mcp/:id` | 获取指定ID的MCP详情 | ❌* |
| GET | `/api/mcp/list` | 获取已连接的MCP列表 | ✅ |
| GET | `/api/mcp/:name/tools` | 获取指定MCP的工具列表 | ✅ |
| POST | `/api/mcp/connect` | 连接MCP服务 | ✅ |
| POST | `/api/mcp/disconnect` | 断开MCP连接 | ✅ |
| POST | `/api/mcp/tool` | 调用MCP工具 | ✅ |

_* 标记为❌的接口支持可选认证，可以使用userId参数跳过认证_

### 任务管理相关 API

| 方法 | 端点 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/task/title` | 生成任务标题 | ✅ |
| POST | `/api/task` | 创建任务 | ❌* |
| POST | `/api/task/:id` | 更新任务 | ❌* |
| GET | `/api/task` | 获取任务列表 | ❌* |
| GET | `/api/task/:id` | 获取任务详情 | ❌* |
| POST | `/api/task/:id/analyze` | 分析任务 | ❌* |
| POST | `/api/task/:id/analyze/stream` | 流式分析任务 | ❌* |
| POST | `/api/task/:id/verify-auth` | 验证MCP授权 | ✅ |
| GET | `/api/task/:id/mcp-alternatives/:mcpName` | 获取MCP替代选项 | ❌* |
| POST | `/api/task/:id/replace-mcp` | 替换MCP | ✅ |
| POST | `/api/task/:id/execute` | 执行任务 | ❌* |
| POST | `/api/task/:id/execute/stream` | 流式执行任务 | ❌* |
| POST | `/api/task/test-playwright-mcp` | 测试Playwright MCP | ❌* |

_* 标记为❌的接口支持可选认证，可以使用userId参数跳过认证_

## 快速开始

### 1. 钱包登录流程

```bash
# 1. 获取nonce
curl -X POST http://localhost:3001/api/auth/wallet/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_WALLET_ADDRESS"}'

# 2. 使用钱包签名返回的message

# 3. 登录
curl -X POST http://localhost:3001/api/auth/wallet/login \
  -H "Content-Type: application/json" \
  -d '{
    "message": "SIWE_MESSAGE",
    "signature": "WALLET_SIGNATURE"
  }'
```

### 2. 使用API

```bash
# 获取用户信息
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# AI聊天
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'

# 获取所有MCP信息
curl -X GET http://localhost:3001/api/mcp \
  -H "Content-Type: application/json"

# 获取MCP类别
curl -X GET http://localhost:3001/api/mcp/categories \
  -H "Content-Type: application/json"

# 测试Playwright MCP
curl -X POST http://localhost:3001/api/task/test-playwright-mcp \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.baidu.com","searchText":"MCP协议"}'
```

### 3. MCP使用流程

```bash
# 1. 获取所有可用MCP
curl -X GET http://localhost:3001/api/mcp \
  -H "Content-Type: application/json"

# 2. 获取指定MCP详情
curl -X GET http://localhost:3001/api/mcp/playwright \
  -H "Content-Type: application/json"

# 3. 创建任务
curl -X POST http://localhost:3001/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "content": "使用Playwright访问百度并搜索MCP协议",
    "title": "Playwright百度搜索测试",
    "userId": "your_user_id"
  }'

# 4. 分析任务
curl -X POST "http://localhost:3001/api/task/{task_id}/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id"
  }'

# 5. 执行任务
curl -X POST "http://localhost:3001/api/task/{task_id}/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id"
  }'

# 6. 获取任务执行结果
curl -X GET "http://localhost:3001/api/task/{task_id}?userId=your_user_id" \
  -H "Content-Type: application/json"
```

## 状态码

- `200` - 成功
- `400` - 请求错误
- `401` - 认证失败
- `403` - 权限不足
- `404` - 资源不存在
- `429` - 请求频率超限
- `500` - 服务器错误

## 速率限制

- 登录端点: 5次/15分钟
- 其他端点: 100次/15分钟

详细文档请参考 [API.md](./API.md) 