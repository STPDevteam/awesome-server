# 刷新令牌重复键错误修复方案

## 问题描述

应用程序中出现了大量的刷新令牌存储错误：
```
error: duplicate key value violates unique constraint "refresh_tokens_token_hash_key"
```

这个错误表明在数据库中尝试插入重复的令牌哈希值，违反了唯一约束。

## 根本原因

1. **JWT令牌生成缺乏随机性**：原始的刷新令牌生成只基于 `userId`，在相同时间戳下可能生成相同的令牌
2. **并发请求冲突**：多个并发登录请求可能生成相同的令牌哈希
3. **缺乏重复处理机制**：存储令牌时没有处理重复键的情况

## 修复方案

### 1. 增加令牌随机性

在 `src/services/auth/jwtService.ts` 中为刷新令牌添加了随机性：

```typescript
const refreshTokenPayload = {
  userId: user.id,
  jti: crypto.randomUUID(), // 添加唯一标识符
  nonce: crypto.randomBytes(16).toString('hex') // 添加随机数
};
```

### 2. 数据库插入冲突处理

使用 PostgreSQL 的 `ON CONFLICT DO NOTHING` 来优雅处理重复键：

```sql
INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
VALUES ($1, $2, $3)
ON CONFLICT (token_hash) DO NOTHING
```

### 3. 令牌冲突检测和重试

- 检测令牌是否属于不同用户（真正的冲突）
- 如果发生冲突，抛出 `TOKEN_COLLISION` 错误
- 实现重试机制，最多重试3次，每次间隔递增

### 4. 内置重试机制

重构了 `generateTokenPair` 方法，内置重试逻辑：

```typescript
async generateTokenPair(user: User, revokeOldTokens: boolean = false): Promise<TokenPair>
```

- 最多重试3次
- 递增延迟（50ms, 75ms, 100ms）
- 自动处理令牌冲突

## 新功能

### 撤销旧令牌选项

可以在生成新令牌时撤销用户的所有旧令牌：

```typescript
const tokenPair = await jwtService.generateTokenPair(user, true);
```

这可以确保每个用户只有一个有效的刷新令牌。

### 清理脚本

创建了数据库清理脚本 `src/scripts/cleanup-duplicate-tokens.ts`：

- 清理重复的刷新令牌
- 为每个用户只保留最新的令牌
- 清理过期的令牌
- 提供详细的统计信息

## 使用方法

### 运行清理脚本

清理现有的重复令牌：

```bash
npm run cleanup:tokens
```

### 监控令牌统计

在代码中获取令牌统计信息：

```typescript
const stats = await jwtService.getTokenStats();
console.log('活跃刷新令牌数:', stats.activeRefreshTokens);
```

### 定期清理

系统已配置自动清理过期令牌（每小时一次）。

## 最佳实践

1. **新用户登录时撤销旧令牌**：
   ```typescript
   const tokenPair = await jwtService.generateTokenPair(user, true);
   ```

2. **定期运行清理脚本**：
   ```bash
   # 添加到 cron 任务
   0 2 * * * cd /path/to/app && npm run cleanup:tokens
   ```

3. **监控令牌数量**：定期检查活跃令牌数量，如果异常增长则调查原因

## 验证修复

修复后应该不再出现以下错误：
- `duplicate key value violates unique constraint "refresh_tokens_token_hash_key"`
- 令牌生成失败
- 用户登录问题

## 数据库注意事项

确保 `refresh_tokens` 表有正确的约束：

```sql
-- 检查约束是否存在
\d refresh_tokens

-- 应该有以下约束：
-- "refresh_tokens_token_hash_key" UNIQUE, btree (token_hash)
```

## 监控建议

1. 监控错误日志中是否还有重复键错误
2. 监控活跃令牌数量的增长趋势
3. 定期检查令牌清理脚本的执行日志
4. 监控用户登录成功率

通过这些修复，应该能够彻底解决刷新令牌重复键错误的问题。 