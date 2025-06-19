# 支付流程测试指南

## 概述

本指南介绍如何测试完整的 Coinbase Commerce 支付流程。测试环境已将 Plus 月付费用设置为 1 USDT，方便进行测试。

## 前置准备

1. **启动服务器**
   ```bash
   npm run dev
   ```

2. **确认环境变量**
   - `COINBASE_COMMERCE_API_KEY`: 已配置
   - `COINBASE_COMMERCE_WEBHOOK_SECRET`: 已配置

3. **准备测试工具**
   - Postman 或其他 API 测试工具
   - 钱包（MetaMask 或其他支持签名的钱包）
   - USDT/USDC 测试币（至少 1 USDT）

## 测试流程

### 步骤 1: 获取认证 Token

#### 1.1 获取 Nonce
```bash
POST http://localhost:3001/api/auth/wallet/nonce
Content-Type: application/json

{
  "address": "0x你的钱包地址"
}
```

响应示例：
```json
{
  "nonce": "随机生成的nonce值"
}
```

#### 1.2 使用钱包签名
使用钱包对 SIWE 消息进行签名。消息格式：
```
localhost:3001 wants you to sign in with your Ethereum account:
0x你的钱包地址

Sign in with Ethereum to the app.

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: [上一步获取的nonce]
Issued At: 2024-01-01T00:00:00.000Z
```

#### 1.3 登录获取 Token
```bash
POST http://localhost:3001/api/auth/wallet/login
Content-Type: application/json

{
  "message": "完整的SIWE消息",
  "signature": "0x开头的签名"
}
```

响应示例：
```json
{
  "accessToken": "JWT_TOKEN",
  "user": {
    "id": "用户ID",
    "walletAddress": "0x..."
  }
}
```

### 步骤 2: 创建支付订单

使用获取的 Token 创建支付订单：

```bash
POST http://localhost:3001/api/payment/create-payment
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "membershipType": "plus",
  "subscriptionType": "monthly"
}
```

响应示例：
```json
{
  "success": true,
  "data": {
    "paymentId": "payment_xxx",
    "checkoutUrl": "https://commerce.coinbase.com/checkout/xxx",
    "chargeCode": "XXX",
    "expiresAt": "2024-01-01T01:00:00.000Z"
  }
}
```

### 步骤 3: 完成支付

1. **访问支付链接**
   - 打开返回的 `checkoutUrl`
   - 您会看到 Coinbase Commerce 支付页面

2. **选择支付方式**
   - 选择 USDT 或 USDC
   - 支付金额：1 USDT（测试价格）

3. **完成支付**
   - 使用钱包扫描二维码或复制地址
   - 发送 1 USDT 到指定地址
   - 等待区块链确认

### 步骤 4: 验证 Webhook 回调

支付确认后，Coinbase Commerce 会自动调用 webhook：

1. **Webhook 端点**
   ```
   POST http://localhost:3001/api/payment/webhooks/coinbase
   ```

2. **Webhook 事件类型**
   - `charge:pending` - 支付待处理
   - `charge:confirmed` - 支付已确认
   - `charge:failed` - 支付失败

3. **查看日志**
   ```bash
   # 查看服务器日志确认 webhook 接收
   tail -f logs/app.log
   ```

### 步骤 5: 验证会员状态更新

#### 5.1 检查支付状态
```bash
GET http://localhost:3001/api/payment/payment/{paymentId}
Authorization: Bearer YOUR_JWT_TOKEN
```

响应示例：
```json
{
  "success": true,
  "data": {
    "id": "payment_xxx",
    "status": "confirmed",
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "confirmedAt": "2024-01-01T00:30:00.000Z"
  }
}
```

#### 5.2 检查会员状态
```bash
GET http://localhost:3001/api/payment/membership-status
Authorization: Bearer YOUR_JWT_TOKEN
```

响应示例：
```json
{
  "success": true,
  "data": {
    "isActive": true,
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "expiresAt": "2024-02-01T00:30:00.000Z"
  }
}
```

## 自动化测试脚本

运行完整的测试脚本：

```bash
# 使用 Node.js 运行
node test/test-payment-flow-complete.js

# 或使用 npm 脚本
npm run test:payment-flow
```

脚本功能：
- 自动完成登录认证
- 创建支付订单
- 显示支付链接
- 检查支付和会员状态
- 可选：模拟 webhook 回调

## 测试场景

### 场景 1: 新用户首次购买
1. 使用新钱包地址登录
2. 创建 Plus 月付订单
3. 完成支付
4. 验证会员激活

### 场景 2: 会员续费
1. 使用已有会员的钱包登录
2. 创建续费订单
3. 完成支付
4. 验证到期时间延长

### 场景 3: 升级会员
1. Plus 会员登录
2. 创建 Pro 会员订单
3. 完成支付
4. 验证会员类型更新

### 场景 4: 支付失败处理
1. 创建支付订单
2. 等待订单过期（1小时）
3. 验证订单状态为 expired
4. 会员状态保持不变

## 常见问题

### 1. Webhook 未触发
- 检查 Coinbase Commerce 控制台的 Webhook 设置
- 确认服务器可公网访问（使用 ngrok 等工具）
- 查看 Coinbase Commerce 的 Webhook 日志

### 2. 支付成功但会员未激活
- 检查 webhook 签名验证
- 查看服务器错误日志
- 确认数据库连接正常

### 3. 测试环境支付
- 使用测试网 USDT/USDC
- Coinbase Commerce 不提供沙盒环境
- 建议使用小额真实支付测试

## 生产环境注意事项

1. **价格设置**
   - 恢复正常价格（Plus: $20/月，Pro: $200/月）
   - 更新 `coinbaseCommerceService.ts` 中的价格配置

2. **Webhook 安全**
   - 确保 webhook secret 安全存储
   - 启用 webhook 签名验证
   - 使用 HTTPS 端点

3. **错误处理**
   - 实现支付失败重试机制
   - 记录所有支付事件
   - 设置监控告警

4. **合规要求**
   - 提供退款政策
   - 记录交易凭证
   - 遵守当地法规 