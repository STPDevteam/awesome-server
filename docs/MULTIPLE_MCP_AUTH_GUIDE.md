# 多MCP批量认证功能指南

## 概述

本功能支持对任务中的多个MCP进行批量认证验证，提高用户体验和系统效率。

## 功能特性

### 🚀 新增功能
- **批量认证**: 一次性验证多个MCP的认证信息
- **并行处理**: 多个MCP认证同时处理，提升效率
- **状态跟踪**: 详细的认证结果和状态跟踪
- **部分成功**: 支持部分MCP认证成功的情况

### 🔧 API端点

#### 1. 单个MCP认证 (现有)
```
POST /api/task/:id/verify-auth
```

#### 2. 批量MCP认证 (新增)
```
POST /api/task/:id/verify-multiple-auth
```

## API使用说明

### 批量认证请求格式

```json
{
  "mcpAuths": [
    {
      "mcpName": "coingecko-mcp",
      "authData": {
        "COINGECKO_API_KEY": "your-api-key"
      }
    },
    {
      "mcpName": "x-mcp", 
      "authData": {
        "TWITTER_API_KEY": "your-twitter-key",
        "TWITTER_API_SECRET": "your-twitter-secret",
        "TWITTER_ACCESS_TOKEN": "your-access-token",
        "TWITTER_ACCESS_SECRET": "your-access-secret"
      }
    }
  ],
  "userId": "user-id"
}
```

### 批量认证响应格式

#### 成功响应
```json
{
  "success": true,
  "message": "All MCP authorizations verified successfully",
  "data": {
    "results": [
      {
        "mcpName": "coingecko-mcp",
        "success": true,
        "message": "认证信息已保存"
      },
      {
        "mcpName": "x-mcp",
        "success": true,
        "message": "Twitter/X认证信息已保存"
      }
    ],
    "summary": {
      "total": 2,
      "successful": 2,
      "failed": 0
    }
  }
}
```

#### 部分成功响应
```json
{
  "success": false,
  "message": "1/2 MCP authorizations verified successfully",
  "data": {
    "results": [
      {
        "mcpName": "coingecko-mcp",
        "success": true,
        "message": "认证信息已保存"
      },
      {
        "mcpName": "x-mcp",
        "success": false,
        "message": "缺少必需的认证信息",
        "details": "请提供: Twitter Access Token"
      }
    ],
    "summary": {
      "total": 2,
      "successful": 1,
      "failed": 1
    }
  }
}
```

## 代码示例

### JavaScript/Node.js

```javascript
// 批量验证MCP认证
async function verifyMultipleAuth(taskId, mcpAuths) {
  const response = await fetch(`${BASE_URL}/api/task/${taskId}/verify-multiple-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      mcpAuths,
      userId: 'your-user-id'
    })
  });
  
  const result = await response.json();
  return result;
}

// 使用示例
const mcpAuths = [
  {
    mcpName: 'coingecko-mcp',
    authData: {
      COINGECKO_API_KEY: 'your-api-key'
    }
  },
  {
    mcpName: 'github-mcp-server',
    authData: {
      GITHUB_TOKEN: 'your-github-token'
    }
  }
];

const result = await verifyMultipleAuth('task-id', mcpAuths);
console.log(`认证结果: ${result.success ? '成功' : '部分成功'}`);
console.log(`统计: ${result.data.summary.successful}/${result.data.summary.total} 成功`);
```

### cURL

```bash
curl -X POST "http://localhost:3001/api/task/TASK_ID/verify-multiple-auth" \
  -H "Content-Type: application/json" \
  -d '{
    "mcpAuths": [
      {
        "mcpName": "coingecko-mcp",
        "authData": {
          "COINGECKO_API_KEY": "your-api-key"
        }
      },
      {
        "mcpName": "x-mcp",
        "authData": {
          "TWITTER_API_KEY": "your-twitter-key",
          "TWITTER_API_SECRET": "your-twitter-secret",
          "TWITTER_ACCESS_TOKEN": "your-access-token",
          "TWITTER_ACCESS_SECRET": "your-access-secret"
        }
      }
    ],
    "userId": "your-user-id"
  }'
```

## 常见MCP认证参数

### CoinGecko MCP
```json
{
  "mcpName": "coingecko-mcp",
  "authData": {
    "COINGECKO_API_KEY": "your-api-key"
  }
}
```

### Twitter/X MCP
```json
{
  "mcpName": "x-mcp",
  "authData": {
    "TWITTER_API_KEY": "your-twitter-key",
    "TWITTER_API_SECRET": "your-twitter-secret", 
    "TWITTER_ACCESS_TOKEN": "your-access-token",
    "TWITTER_ACCESS_SECRET": "your-access-secret"
  }
}
```

### GitHub MCP
```json
{
  "mcpName": "github-mcp-server",
  "authData": {
    "GITHUB_TOKEN": "your-github-token"
  }
}
```

### Binance MCP
```json
{
  "mcpName": "binance-mcp-service",
  "authData": {
    "BINANCE_API_KEY": "your-binance-key",
    "BINANCE_SECRET_KEY": "your-binance-secret"
  }
}
```

## 实现细节

### 服务层架构

1. **MCPAuthService.verifyMultipleAuth()**: 批量验证核心方法
2. **MCPAuthService.updateMultipleTaskMCPAuthStatus()**: 批量更新认证状态
3. **并行处理**: 所有MCP认证并行执行，提升性能
4. **事务安全**: 每个MCP认证独立处理，避免相互影响

### 错误处理

- **部分失败**: 某些MCP认证失败不影响其他MCP
- **详细错误**: 每个MCP都有独立的错误信息
- **状态回滚**: 认证失败的MCP不会更新任务状态

### 性能优化

- **并行验证**: 多个MCP同时验证，而非串行
- **批量更新**: 一次性更新所有成功的MCP状态
- **内存优化**: 流式处理，避免大量数据积累

## 测试

运行批量认证测试：

```bash
node test/test-multiple-mcp-auth.js
```

测试覆盖场景：
- ✅ 全部成功认证
- ✅ 部分成功认证  
- ✅ 全部失败认证
- ✅ 任务状态更新
- ✅ 错误处理

## 最佳实践

### 1. 认证数据准备
```javascript
// 推荐：根据任务需求动态准备认证数据
const mcpsNeedAuth = analysis.mcpWorkflow.mcps.filter(
  mcp => mcp.authRequired && !mcp.authVerified
);

const mcpAuths = mcpsNeedAuth.map(mcp => ({
  mcpName: mcp.name,
  authData: getAuthDataForMCP(mcp.name)
}));
```

### 2. 错误处理
```javascript
// 推荐：检查部分成功的情况
if (!result.success && result.data.summary.successful > 0) {
  console.log(`部分认证成功: ${result.data.summary.successful}/${result.data.summary.total}`);
  
  // 处理失败的MCP
  const failedMcps = result.data.results.filter(r => !r.success);
  failedMcps.forEach(mcp => {
    console.error(`${mcp.mcpName} 认证失败: ${mcp.message}`);
  });
}
```

### 3. 重试机制
```javascript
// 推荐：对失败的MCP进行重试
const failedMcps = result.data.results
  .filter(r => !r.success)
  .map(r => ({ mcpName: r.mcpName, authData: getAuthDataForMCP(r.mcpName) }));

if (failedMcps.length > 0) {
  const retryResult = await verifyMultipleAuth(taskId, failedMcps);
}
```

## 注意事项

- 🔒 **安全**: 认证信息加密存储，不会在日志中暴露
- ⚡ **性能**: 批量认证比单个认证更高效
- 🔄 **重试**: 支持对失败的MCP单独重试
- 📊 **监控**: 详细的认证统计信息便于监控

## 版本兼容性

- ✅ 向前兼容：原有单个MCP认证API保持不变
- ✅ 新功能：批量认证作为新增功能
- ✅ 数据库：使用现有认证表结构，无需迁移 