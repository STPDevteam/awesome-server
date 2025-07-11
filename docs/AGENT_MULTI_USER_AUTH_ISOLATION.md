# Agent多用户MCP认证隔离实现

## 概述

本文档详细说明了Agent系统中多用户MCP认证隔离的实现机制，确保不同用户在使用同一个Agent时，使用各自的MCP认证信息，而不是Agent创建者的认证信息。

## 核心原理

### 问题背景
- **Agent创建者** vs **Agent使用者**：Agent由某个用户创建，但可以被其他用户使用
- **认证隔离需求**：每个用户使用Agent时，应该使用自己的MCP认证信息，而不是创建者的认证
- **多用户隔离**：确保不同用户的MCP连接和认证信息完全隔离

### 解决方案

#### 1. 用户认证检查
```typescript
// 获取当前使用者的MCP认证信息（不是创建者的）
const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpInfo.name);
if (!userAuth || !userAuth.isVerified || !userAuth.authData) {
  throw new Error(`User authentication not found or not verified for MCP ${mcpInfo.name}`);
}
```

#### 2. 动态认证注入
```typescript
// 动态注入当前使用者的认证数据
const dynamicEnv = { ...mcpConfig.env };
if (mcpConfig.env) {
  for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
    if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
      dynamicEnv[envKey] = userAuth.authData[envKey];
      logger.info(`Injected authentication for ${envKey} in MCP ${mcpInfo.name} for user ${userId}`);
    }
  }
}
```

#### 3. 多用户连接隔离
```typescript
// 传递userId实现多用户隔离的MCP连接
const connected = await mcpManager.connectPredefined(authenticatedMcpConfig, userId);
```

## 实现细节

### 1. Agent试用时的认证验证

**位置**: `src/services/agentConversationService.ts` - `startAgentTrial`方法

```typescript
// 在Agent试用开始前检查MCP认证状态
const authCheck = await this.checkAgentMCPAuth(agent, userId);
if (authCheck.needsAuth) {
  return {
    success: false,
    needsAuth: true,
    missingAuth: authCheck.missingAuth,
    message: authCheck.message
  };
}
```

**关键特点**：
- 使用当前用户的`userId`进行认证检查
- 返回详细的认证参数信息给前端
- 支持多用户隔离的认证状态检查

### 2. Agent消息处理时的认证验证

**位置**: `src/services/agentConversationService.ts` - `processAgentMessage`和`processAgentMessageStream`方法

```typescript
// 在消息处理前检查MCP认证状态
const authCheck = await this.checkAgentMCPAuth(agent, userId);
if (authCheck.needsAuth) {
  throw new Error(`MCP authentication required: ${authCheck.message}`);
}
```

### 3. Agent任务执行时的MCP连接

**位置**: `src/services/agentConversationService.ts` - `ensureAgentMCPsConnected`方法

```typescript
private async ensureAgentMCPsConnected(agent: Agent, userId: string, taskId: string): Promise<void> {
  // 检查用户特定的MCP连接
  const connectedMCPs = mcpManager.getConnectedMCPs(userId);
  const isConnected = connectedMCPs.some((mcp: any) => mcp.name === mcpInfo.name);
  
  if (!isConnected) {
    // 获取用户认证信息（不是创建者的）
    const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpInfo.name);
    
    // 动态注入认证信息
    const dynamicEnv = { ...mcpConfig.env };
    // ... 注入逻辑
    
    // 连接MCP时传递用户ID
    const connected = await mcpManager.connectPredefined(authenticatedMcpConfig, userId);
  }
}
```

## 多用户隔离机制

### 1. 连接键隔离

**MCPManager中的连接键生成**：
```typescript
private getConnectionKey(name: string, userId?: string): string {
  return userId ? `${name}:${userId}` : name;
}
```

### 2. 认证信息隔离

**用户认证数据独立存储**：
- 每个用户的MCP认证信息独立存储在数据库中
- 通过`userId`和`mcpName`的组合进行索引
- 确保不同用户的认证信息完全隔离

### 3. 环境变量动态注入

**运行时动态注入**：
```typescript
// 为每个用户动态创建独立的环境变量
const dynamicEnv = {
  ...mcpConfig.env,
  [envKey]: userAuth.authData[envKey]  // 使用当前用户的认证信息
};
```

## 测试验证

### 测试场景

创建了完整的测试脚本 `test/test-agent-user-auth-isolation.js` 验证以下场景：

1. **Agent创建者认证**：创建者为MCP进行认证
2. **Agent创建**：创建者创建使用该MCP的Agent
3. **使用者无认证访问**：其他用户尝试使用Agent但没有认证（应该失败）
4. **使用者独立认证**：不同用户使用不同的API Key进行认证
5. **使用者成功访问**：认证后的用户可以成功使用Agent
6. **多用户隔离验证**：确保不同用户使用各自的认证信息

### 验证要点

✅ **Agent创建者的认证不影响使用者**
✅ **每个用户需要独立进行MCP认证**
✅ **不同用户使用不同的API Key**
✅ **用户的MCP认证信息正确隔离**
✅ **Agent任务执行时使用当前用户的认证**

## 错误处理

### 1. 认证缺失错误
```typescript
{
  "success": false,
  "error": "MCP_AUTH_REQUIRED",
  "needsAuth": true,
  "missingAuth": [{
    "mcpName": "coingecko-server",
    "description": "CoinGecko官方MCP服务器",
    "authRequired": true,
    "authVerified": false,
    "authParams": {
      "COINGECKO_API_KEY": {
        "type": "string",
        "description": "CoinGecko API密钥",
        "required": true
      }
    }
  }],
  "message": "请先为以下MCP服务完成认证：coingecko-server"
}
```

### 2. 连接失败错误
```typescript
throw new Error(`Failed to connect required MCP service ${mcpInfo.name}: ${error.message}`);
```

## 日志监控

### 关键日志标识

```typescript
// 认证信息注入日志
logger.info(`Injected authentication for ${envKey} in MCP ${mcpInfo.name} for user ${userId}`);

// 连接成功日志
logger.info(`✅ Successfully connected MCP ${mcpInfo.name} for user ${userId} and Agent task`);

// 多用户隔离日志
logger.info(`Ensuring MCP connections for Agent ${agent.name} (User: ${userId})`);
```

### 调试信息

```typescript
// MCP连接状态调试
console.log(`Connected MCP list for user [${userId}]: ${JSON.stringify(connectedMCPs)}`);

// 认证状态调试
console.log(`User ${userId} auth status for ${mcpName}: ${userAuth ? 'verified' : 'not verified'}`);
```

## 最佳实践

### 1. 前端集成
- 在Agent试用前检查认证状态
- 根据返回的`missingAuth`信息引导用户完成认证
- 支持多个MCP的批量认证流程

### 2. 错误处理
- 优雅处理认证缺失的情况
- 提供清晰的错误信息和认证指引
- 支持认证失败后的重试机制

### 3. 性能优化
- 复用已连接的MCP连接
- 缓存认证状态检查结果
- 异步处理多个MCP的连接

## 安全考虑

### 1. 认证信息保护
- 认证数据加密存储
- 传输过程中的安全保护
- 访问权限控制

### 2. 用户隔离
- 严格的用户ID验证
- 防止跨用户访问
- 连接池的用户隔离

### 3. 审计日志
- 记录所有认证操作
- 监控异常访问行为
- 支持安全审计

## 总结

Agent多用户MCP认证隔离机制确保了：

1. **完全的用户隔离**：每个用户使用自己的认证信息
2. **动态认证注入**：运行时动态注入用户的认证数据
3. **连接池隔离**：不同用户的MCP连接完全隔离
4. **安全可靠**：严格的权限控制和错误处理
5. **易于测试**：完整的测试覆盖和验证机制

这种设计确保了Agent系统在多用户环境下的安全性和可靠性，同时保持了良好的用户体验。 