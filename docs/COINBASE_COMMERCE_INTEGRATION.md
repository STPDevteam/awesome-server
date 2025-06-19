# Coinbase Commerce 官方接入指南

本文档基于 [Coinbase Commerce Node.js SDK](https://github.com/coinbase/coinbase-commerce-node) 官方文档实现支付功能。

## 概述

Coinbase Commerce 是一个加密货币支付解决方案，支持多种加密货币支付，包括 Bitcoin、Ethereum、USDC、USDT 等。

## 安装

```bash
npm install coinbase-commerce-node --save
npm install @types/coinbase-commerce-node --save-dev  # TypeScript 支持
```

## 环境配置

在 `.env` 文件中设置以下环境变量：

```env
COINBASE_COMMERCE_API_KEY=your_api_key_here
COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret_here
```

### 获取 API Key

1. 登录 [Coinbase Commerce](https://commerce.coinbase.com/)
2. 进入 Settings > API keys
3. 创建新的 API key 并保存

### 获取 Webhook Secret

1. 在 Settings > Webhooks
2. 添加新的 webhook 端点
3. 复制生成的 shared secret

## 实现架构

### 1. 服务层实现 (`src/services/coinbaseCommerceService.ts`)

```typescript
import coinbase from 'coinbase-commerce-node';
const { Client, resources, Webhook } = coinbase;

// 初始化客户端
const clientInstance = Client.init(process.env.COINBASE_COMMERCE_API_KEY!);
```

### 2. 创建支付 (Charge)

根据官方文档，创建 Charge 的标准方法：

```typescript
const chargeData = {
  name: 'Product Name',
  description: 'Product Description',
  local_price: {
    amount: '100.00',
    currency: 'USD'
  },
  pricing_type: 'fixed_price',
  metadata: {
    // 自定义元数据
  }
};

const charge = await resources.Charge.create(chargeData);
```

### 3. Webhook 处理

官方推荐的 webhook 验证方法：

```typescript
// Express 中间件配置
app.use('/webhooks/coinbase', express.raw({ type: 'application/json' }));

// 处理 webhook
try {
  const event = Webhook.verifySigHeader(
    rawBody,
    signature,
    webhookSecret
  );
  
  // 处理不同的事件类型
  switch (event.type) {
    case 'charge:confirmed':
      // 支付确认
      break;
    case 'charge:failed':
      // 支付失败
      break;
    case 'charge:resolved':
      // 支付最终状态
      break;
  }
} catch (error) {
  // 签名验证失败
}
```

## 支付流程

### 1. 用户发起支付

```
POST /api/payment/create-payment
{
  "membershipType": "plus",
  "subscriptionType": "monthly"
}
```

### 2. 系统创建 Charge

- 调用 `resources.Charge.create()` 创建支付订单
- 保存支付记录到数据库
- 返回 `hosted_url` 给前端

### 3. 用户完成支付

- 用户跳转到 Coinbase Commerce 托管页面
- 选择加密货币并完成支付

### 4. Webhook 回调处理

- Coinbase Commerce 发送 webhook 到配置的端点
- 验证签名确保请求合法
- 更新支付状态和用户会员信息

## 安全考虑

### 1. API Key 安全

- 不要在客户端暴露 API key
- 使用环境变量管理敏感信息
- 定期轮换 API key

### 2. Webhook 验证

- 始终验证 webhook 签名
- 使用 HTTPS 端点
- 实现幂等性处理

### 3. 错误处理

- 合理处理 API 限流
- 实现重试机制
- 记录详细的错误日志

## 测试环境

Coinbase Commerce 不提供测试环境，但可以：

1. 使用小额支付进行测试
2. 在开发环境跳过签名验证（仅用于开发）
3. 模拟 webhook 事件进行集成测试

## API 限制

- Rate Limit: 10,000 requests per hour
- Webhook timeout: 20 seconds
- Charge 过期时间: 默认 1 小时

## 常见问题

### 1. 支付未确认

- 检查区块链确认数
- Bitcoin: 需要 1 个确认
- Ethereum: 需要 10 个确认

### 2. Webhook 未收到

- 确保 webhook URL 可公开访问
- 检查防火墙设置
- 验证 SSL 证书有效

### 3. 签名验证失败

- 确保使用原始请求体
- 检查 webhook secret 是否正确
- 注意时间戳差异

## 参考资源

- [官方 API 文档](https://commerce.coinbase.com/docs/api/)
- [Node.js SDK GitHub](https://github.com/coinbase/coinbase-commerce-node)
- [Webhook 事件类型](https://commerce.coinbase.com/docs/api/#webhooks)

## 支持的加密货币

- Bitcoin (BTC)
- Ethereum (ETH)
- USD Coin (USDC)
- Tether (USDT)
- Litecoin (LTC)
- Bitcoin Cash (BCH)
- Dogecoin (DOGE)
- 等更多... 