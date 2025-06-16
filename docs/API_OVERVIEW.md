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