# AWE支付Pending状态修复说明

## 问题描述

原有的 `/confirm-awe-payment` 接口存在以下问题：
- 当前端调用时，如果区块确认数不足3个，接口会返回错误："Insufficient confirmations. Please wait for 3 confirmations"
- 这导致用户已完成支付但无法被记录，用户体验不佳

## 解决方案

### 1. 支持Pending状态

修改了 `verifyAndCreatePayment` 方法，当确认数不足时：
- 不再抛出错误，而是创建 `pending` 状态的支付记录
- 返回支付信息，让前端知道支付已被接收，正在等待确认

### 2. 自动状态更新

添加了 `updatePaymentStatus` 方法：
- 检查 pending 状态的支付是否已达到3个确认
- 达到后自动更新为 `confirmed` 状态
- 更新用户会员信息

### 3. 定时检查任务

在 `AwePaymentService` 构造函数中添加了定时任务：
- 每30秒自动检查所有 pending 状态的支付
- 对于达到3个确认的支付，自动更新状态
- 确保即使用户不再调用API，支付也能被正确确认

## 主要代码修改

### 1. `verifyAndCreatePayment` 方法
```typescript
// 检查确认数
const currentBlock = await this.provider.getBlockNumber();
const confirmations = currentBlock - receipt.blockNumber;
const isConfirmed = confirmations >= 3;

// 创建支付记录
const payment: AwePayment = {
  // ...
  status: isConfirmed ? 'confirmed' : 'pending',
  confirmedAt: isConfirmed ? now : undefined,
  // ...
};

// 只有在确认后才更新用户会员信息
if (isConfirmed) {
  await this.updateUserMembership(userId, membershipType, subscriptionType);
}
```

### 2. 新增 `updatePaymentStatus` 方法
```typescript
async updatePaymentStatus(payment: AwePayment): Promise<AwePayment> {
  if (payment.status !== 'pending' || !payment.transactionHash || !payment.blockNumber) {
    return payment;
  }

  const currentBlock = await this.provider.getBlockNumber();
  const confirmations = currentBlock - payment.blockNumber;
  
  if (confirmations >= 3) {
    // 更新为已确认状态
    await db.query(
      `UPDATE awe_payments 
       SET status = 'confirmed', confirmed_at = $1, expires_at = $2, updated_at = $3 
       WHERE id = $4`,
      [now, expiresAt, now, payment.id]
    );

    // 更新用户会员信息
    await this.updateUserMembership(
      payment.userId, 
      payment.membershipType, 
      payment.subscriptionType
    );
  }

  return payment;
}
```

### 3. 定时检查任务
```typescript
private startPendingPaymentChecker(): void {
  // 每30秒检查一次
  this.checkInterval = setInterval(async () => {
    try {
      await this.checkPendingPayments();
    } catch (error) {
      logger.error('Error in pending payment checker:', error);
    }
  }, 30000);
}

private async checkPendingPayments(): Promise<void> {
  const query = `
    SELECT * FROM awe_payments 
    WHERE status = 'pending' 
    AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at ASC
  `;
  
  const result = await db.query(query);
  const pendingPayments = result.rows.map(row => this.mapRowToPayment(row));

  for (const payment of pendingPayments) {
    await this.updatePaymentStatus(payment);
  }
}
```

## 优势

1. **更好的用户体验**：用户提交交易后立即得到反馈，不会因为确认数不足而报错
2. **可靠性保证**：通过定时任务确保所有支付最终都会被正确处理
3. **状态可查询**：前端可以通过支付ID查询当前状态，实时了解确认进度
4. **向后兼容**：对于已存在的pending支付，会自动检查并更新状态

## 注意事项

1. 定时任务每30秒执行一次，确保及时更新支付状态
2. 只检查24小时内创建的pending支付，避免处理过期数据
3. 数据库已支持pending状态，无需额外的数据库迁移
4. 日志记录详细的状态变化，便于问题排查 