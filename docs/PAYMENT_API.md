# 支付 API 使用指南

本文档介绍如何使用 Coinbase Commerce 集成的支付功能。

## 概述

系统支持两种会员类型和两种订阅方式：

### 会员类型
- **Plus**: 基础会员
- **Pro**: 高级会员

### 订阅方式  
- **Monthly**: 月付
- **Yearly**: 年付

### 定价
- Plus 月付: 20 USDT
- Plus 年付: 200 USDT  
- Pro 月付: 200 USDT
- Pro 年付: 2000 USDT

## API 端点

### 1. 获取定价信息
```
GET /api/payment/pricing
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "plus": {
      "monthly": {
        "amount": "4.99",
        "currency": "USD",
        "features": ["基础功能", "100个请求/月", "邮件支持"]
      },
      "yearly": {
        "amount": "47.99",
        "currency": "USD",
        "features": ["基础功能", "100个请求/月", "邮件支持", "节省20%"]
      }
    },
    "pro": {
      "monthly": {
        "amount": "14.99",
        "currency": "USD",
        "features": ["高级功能", "无限请求", "优先支持", "API访问"]
      },
      "yearly": {
        "amount": "143.99",
        "currency": "USD",
        "features": ["高级功能", "无限请求", "优先支持", "API访问", "节省20%"]
      }
    },
    "aweAmountForPlusMonthlyInWei": "40453200000000000000",
    "aweAmountForPlusYearlyInWei": "388950700000000000000",
    "aweAmountForProMonthlyInWei": "121459700000000000000",
    "aweAmountForProYearlyInWei": "1167852200000000000000"
  }
}
```

**新增字段说明**
- `aweAmountForPlusMonthlyInWei`: Plus月付所需的AWE数量（以Wei为单位）
- `aweAmountForPlusYearlyInWei`: Plus年付所需的AWE数量（以Wei为单位）
- `aweAmountForProMonthlyInWei`: Pro月付所需的AWE数量（以Wei为单位）
- `aweAmountForProYearlyInWei`: Pro年付所需的AWE数量（以Wei为单位）

注意：这些Wei值是基于当前AWE/USD汇率计算的，会随着币价波动而变化。1 AWE = 10^18 Wei。

### 2. 创建支付订单
```
POST /api/payment/create-payment
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体：**
```json
{
  "membershipType": "plus",
  "subscriptionType": "monthly"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "paymentId": "uuid-here",
    "checkoutUrl": "https://commerce.coinbase.com/checkout/...",
    "amount": "20",
    "currency": "USDT",
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "expiresAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### 3. 获取支付状态
```
GET /api/payment/payment/:paymentId
Authorization: Bearer <token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "userId": "user-id",
    "chargeId": "coinbase-charge-id",
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "amount": "20",
    "currency": "USDT",
    "status": "confirmed",
    "expiresAt": "2024-01-01T12:00:00.000Z",
    "confirmedAt": "2024-01-01T11:30:00.000Z",
    "createdAt": "2024-01-01T11:00:00.000Z",
    "updatedAt": "2024-01-01T11:30:00.000Z"
  }
}
```

### 4. 获取用户支付历史
```
GET /api/payment/payments
Authorization: Bearer <token>
```

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "userId": "user-id",
      "chargeId": "coinbase-charge-id",
      "membershipType": "plus",
      "subscriptionType": "monthly",
      "amount": "20",
      "currency": "USDT",
      "status": "confirmed",
      "expiresAt": "2024-01-01T12:00:00.000Z",
      "confirmedAt": "2024-01-01T11:30:00.000Z",
      "createdAt": "2024-01-01T11:00:00.000Z",
      "updatedAt": "2024-01-01T11:30:00.000Z"
    }
  ]
}
```

### 5. 获取用户会员状态
```
GET /api/payment/membership-status
Authorization: Bearer <token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "isActive": true,
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "expiresAt": "2024-02-01T11:30:00.000Z"
  }
}
```

### 6. 清除用户会员状态
```
DELETE /api/payment/membership
Authorization: Bearer <token>
```

**描述：** 清除当前用户的会员状态，将用户的会员类型、订阅类型和过期时间重置为空。

**响应示例：**
```json
{
  "success": true,
  "message": "会员状态已成功清除"
}
```

**错误响应：**
- `401 Unauthorized`: 未授权（需要登录）
- `500 Internal Server Error`: 服务器内部错误

### 7. Webhook 端点
```
POST /api/payment/webhooks/coinbase
Content-Type: application/json
X-CC-Webhook-Signature: <signature>
```

这个端点由 Coinbase Commerce 自动调用，用于处理支付状态变更。

## 支付状态

- `pending`: 等待支付
- `confirmed`: 支付已确认
- `failed`: 支付失败
- `expired`: 支付过期
- `resolved`: 支付已解决（最终状态）

## 使用流程

1. 用户登录并获取 JWT token
2. 调用 `/api/payment/pricing` 获取定价信息
3. 调用 `/api/payment/create-payment` 创建支付订单
4. 重定向用户到返回的 `checkoutUrl` 进行支付
5. 支付完成后，Coinbase Commerce 会调用 webhook 更新支付状态
6. 用户可以通过 `/api/payment/membership-status` 查询会员状态

## 环境配置

确保在 `.env` 文件中设置了以下环境变量：

```
COINBASE_COMMERCE_API_KEY=your_api_key_here
COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret_here
```

## 在 Coinbase Commerce 中设置 Webhook

1. 登录 Coinbase Commerce 控制台
2. 进入 Settings > Webhooks
3. 添加新的 webhook 端点：`https://yourdomain.com/api/payment/webhooks/coinbase`
4. 选择要监听的事件：`charge:confirmed`, `charge:failed`, `charge:resolved`
5. 复制生成的 webhook secret 到环境变量中

## 错误处理

所有 API 端点都会返回统一的错误格式：

```json
{
  "success": false,
  "error": "错误消息"
}
```

常见错误码：
- `400`: 请求参数错误
- `401`: 未授权（需要登录）
- `403`: 禁止访问（如尝试访问他人的支付记录）
- `404`: 资源不存在
- `500`: 服务器内部错误 