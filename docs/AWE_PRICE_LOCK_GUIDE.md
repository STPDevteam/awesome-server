# AWE 支付价格锁定功能指南

## 概述

AWE支付价格锁定功能解决了由于加密货币价格波动导致的支付金额不一致问题。该功能允许用户在获取价格时锁定当前的币价，在15分钟内完成支付，期间价格不会因市场波动而变化。

**重要更新**: 为了提高用户体验和避免精度问题，所有AWE数量现在统一保留2位小数，而不是之前的6位小数。

## 问题背景

在原有的支付流程中：
1. 用户调用 `/api/payment/calculate-awe-price` 获取当前需要支付的AWE数量
2. 用户基于该价格进行支付
3. 用户调用 `/api/payment/confirm-awe-payment` 确认支付
4. 由于步骤1和步骤3之间存在时间差，币价可能发生变化，导致系统重新计算的价格与用户支付时的价格不一致，产生 "Insufficient payment amount" 错误

**精度问题**: 之前系统返回的AWE数量保留6位小数（如0.174799），但用户通常只支付2位小数（如0.17），导致支付金额不足的错误。

## 解决方案

### 1. 价格锁定机制

- **创建价格锁定**：当用户获取价格时，系统会创建一个价格锁定记录，包含：
  - 当前的AWE/USD价格
  - 计算出的AWE支付数量（保留2位小数）
  - 用户ID和会员类型信息
  - 15分钟的有效期

- **使用价格锁定**：用户在确认支付时提供价格锁定ID，系统使用锁定的价格进行验证，而不是重新计算

### 2. 精度标准化

- **AWE数量计算**: 所有AWE数量都使用`Math.round(amount * 100) / 100`进行四舍五入到2位小数
- **错误信息格式**: 支付验证错误信息中的AWE数量也统一显示为2位小数
- **Wei值计算**: 基于2位小数的AWE数量计算对应的Wei值

### 3. 技术实现

#### 数据库表结构
```sql
CREATE TABLE awe_price_locks (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    membership_type VARCHAR(10) NOT NULL,
    subscription_type VARCHAR(10) NOT NULL,
    awe_amount VARCHAR(50) NOT NULL,  -- 保留2位小数的AWE数量
    awe_amount_in_wei VARCHAR(100) NOT NULL,
    usd_price VARCHAR(50) NOT NULL,
    awe_usd_price DECIMAL(20, 10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### API 接口更新

**获取价格（带价格锁定）**
```
GET /api/payment/calculate-awe-price?membershipType=plus&subscriptionType=monthly
Authorization: Bearer {token}

Response:
{
    "success": true,
    "data": {
        "usdPrice": "4.99",
        "aweUsdPrice": "0.1234",
        "aweAmount": "40.45",  // 保留2位小数
        "aweAmountInWei": "40450000000000000000",
        "tokenAddress": "0x1B4617734C43F6159F3a70b7E06d883647512778",
        "receiverAddress": "0x1cAb57bDD051613214D761Ce1429f94975dD0116",
        "chainId": 8453,
        "chainName": "Base",
        "priceLockId": "abc123-def456-..."
    }
}
```

**确认支付（使用价格锁定）**
```
POST /api/payment/confirm-awe-payment
Authorization: Bearer {token}
Content-Type: application/json

{
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "transactionHash": "0x...",
    "priceLockId": "abc123-def456-..."
}
```

**错误信息示例**:
```
Insufficient payment amount. Expected: 40.45 AWE, Received: 40.00 AWE
```

### 4. 前端集成

前端需要做以下调整：

1. **获取价格时保存价格锁定ID**
```javascript
const priceResponse = await fetch('/api/payment/calculate-awe-price?membershipType=plus&subscriptionType=monthly');
const priceData = await priceResponse.json();
const priceLockId = priceData.data.priceLockId; // 保存价格锁定ID
const aweAmount = priceData.data.aweAmount; // 现在是2位小数，如 "40.45"
```

2. **确认支付时传递价格锁定ID**
```javascript
const confirmResponse = await fetch('/api/payment/confirm-awe-payment', {
    method: 'POST',
    body: JSON.stringify({
        membershipType: 'plus',
        subscriptionType: 'monthly',
        transactionHash: tx.hash,
        priceLockId: priceLockId
    })
});
```

3. **显示倒计时提示**
建议在UI上显示价格锁定的剩余时间，提醒用户在有效期内完成支付。

4. **精度处理**
前端在显示AWE数量时，可以直接使用接口返回的值，无需额外的精度处理。

### 5. 自动维护

系统包含自动维护机制：
- 每5分钟清理过期的价格锁定记录
- 每5分钟清理已使用的价格锁定记录

## 使用示例

查看 `examples/awe-payment-with-price-lock.html` 获取完整的前端实现示例。

## 注意事项

1. **有效期**：价格锁定有效期为15分钟，过期后需要重新获取价格
2. **一次性使用**：每个价格锁定ID只能使用一次
3. **用户绑定**：价格锁定与创建它的用户绑定，其他用户无法使用
4. **向后兼容**：如果不提供价格锁定ID，系统会使用实时价格（保持向后兼容）
5. **精度统一**：所有AWE数量现在统一保留2位小数，避免精度不一致问题

## 精度变更影响

- **前端显示**：AWE数量从最多6位小数改为最多2位小数
- **支付验证**：错误信息更友好，数量更容易理解
- **用户体验**：用户支付时更容易输入正确的金额

## 测试

运行测试脚本验证精度修改：
```bash
node test/test-awe-precision.js
```

## 迁移步骤

1. 运行数据库迁移：
```bash
npm run migrate up
```

2. 重启服务器以应用更改

3. 更新前端代码以支持价格锁定功能

4. 测试新的精度处理逻辑

## 注意事项

1. **有效期**：价格锁定有效期为15分钟，过期后需要重新获取价格
2. **一次性使用**：每个价格锁定ID只能使用一次
3. **用户绑定**：价格锁定与创建它的用户绑定，其他用户无法使用
4. **向后兼容**：如果不提供价格锁定ID，系统会使用实时价格（保持向后兼容）
5. **精度统一**：所有AWE数量现在统一保留2位小数，避免精度不一致问题

## 测试

运行测试脚本验证价格锁定功能：
```bash
node test/test-awe-price-lock.js
```

## 迁移步骤

1. 运行数据库迁移：
```bash
npm run migrate up
```

2. 重启服务器以应用更改

3. 更新前端代码以支持价格锁定功能 