# MCP 连接池配置指南

## 概述

为了优化资源管理，MCP 服务器实现了智能连接池管理系统。该系统可以自动管理 MCP 连接的生命周期，避免资源浪费，并确保多用户环境下的稳定性。

## 连接池架构

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Manager                             │
├─────────────────────────────────────────────────────────────┤
│  Connection Pool                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Key: userId:mcpName                                   │  │
│  │ Value: {                                              │  │
│  │   client: MCP Client Instance                         │  │
│  │   lastUsed: Date                                      │  │
│  │   createTime: Date                                    │  │
│  │   authHash: string                                    │  │
│  │ }                                                      │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Features:                                                   │
│  • 用户级别隔离                                              │
│  • 连接复用                                                  │
│  • 自动超时清理                                              │
│  • 连接数限制                                                │
└─────────────────────────────────────────────────────────────┘
```

## 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# 每个用户的最大连接数（默认：10）
MAX_CONNECTIONS_PER_USER=10

# 系统总的最大连接数（默认：100）
MAX_TOTAL_CONNECTIONS=100

# 连接超时时间，单位：毫秒（默认：1800000，即30分钟）
CONNECTION_TIMEOUT=1800000

# 清理任务执行间隔，单位：毫秒（默认：300000，即5分钟）
CLEANUP_INTERVAL=300000
```

## 功能特性

### 1. 多用户隔离

- 每个用户的 MCP 连接都是独立的
- 连接键格式：`userId:mcpName`
- 不同用户使用各自的认证信息

### 2. 连接复用

- 相同用户、相同 MCP、相同认证信息时复用现有连接
- 认证信息变化时自动重连
- 每次使用连接时更新最后使用时间

### 3. 自动清理机制

- 定期扫描并清理超时连接
- 超时连接定义：空闲时间超过 `CONNECTION_TIMEOUT`
- 清理频率由 `CLEANUP_INTERVAL` 控制

### 4. 连接数限制

- 用户级别：每个用户最多 `MAX_CONNECTIONS_PER_USER` 个连接
- 系统级别：总连接数不超过 `MAX_TOTAL_CONNECTIONS`
- 达到上限时自动清理最旧的连接

## API 端点

### 查看连接池状态

```bash
GET /api/mcp/pool-status
Authorization: Bearer <token>
```

响应示例：
```json
{
  "success": true,
  "data": {
    "totalConnections": 5,
    "userConnectionCounts": {
      "user1": 2,
      "user2": 3
    },
    "connectionDetails": [
      {
        "key": "user1:github-mcp",
        "name": "github-mcp",
        "userId": "user1",
        "lastUsed": "2024-01-01T10:00:00.000Z",
        "createTime": "2024-01-01T09:00:00.000Z",
        "idleMinutes": 30
      }
    ],
    "config": {
      "maxConnectionsPerUser": 10,
      "maxTotalConnections": 100,
      "connectionTimeout": 1800000,
      "cleanupInterval": 300000
    }
  }
}
```

### 手动清理超时连接

```bash
POST /api/mcp/cleanup-connections
Authorization: Bearer <token>
```

响应示例：
```json
{
  "success": true,
  "data": {
    "message": "Cleanup completed",
    "before": {
      "totalConnections": 10,
      "userConnectionCounts": {"user1": 5, "user2": 5}
    },
    "after": {
      "totalConnections": 6,
      "userConnectionCounts": {"user1": 3, "user2": 3}
    },
    "cleanedConnections": 4
  }
}
```

## 最佳实践

### 1. 合理设置超时时间

```bash
# 开发环境：较短的超时时间
CONNECTION_TIMEOUT=600000  # 10分钟

# 生产环境：根据使用模式调整
CONNECTION_TIMEOUT=1800000  # 30分钟
```

### 2. 监控连接池状态

定期检查连接池状态，关注：
- 总连接数趋势
- 各用户连接分布
- 空闲连接比例

### 3. 优化清理策略

```bash
# 高并发场景：更频繁的清理
CLEANUP_INTERVAL=60000  # 1分钟

# 低并发场景：减少清理频率
CLEANUP_INTERVAL=600000  # 10分钟
```

### 4. 连接数限制建议

```bash
# 小型部署
MAX_CONNECTIONS_PER_USER=5
MAX_TOTAL_CONNECTIONS=50

# 中型部署
MAX_CONNECTIONS_PER_USER=10
MAX_TOTAL_CONNECTIONS=200

# 大型部署
MAX_CONNECTIONS_PER_USER=20
MAX_TOTAL_CONNECTIONS=500
```

## 故障排查

### 1. 连接频繁断开

检查：
- `CONNECTION_TIMEOUT` 是否设置过短
- MCP 服务本身是否稳定
- 网络连接是否正常

### 2. 连接数达到上限

解决方案：
- 增加 `MAX_CONNECTIONS_PER_USER` 或 `MAX_TOTAL_CONNECTIONS`
- 减少 `CONNECTION_TIMEOUT` 以更快释放空闲连接
- 优化业务逻辑，减少并发连接需求

### 3. 内存使用过高

调整：
- 降低 `MAX_TOTAL_CONNECTIONS`
- 缩短 `CONNECTION_TIMEOUT`
- 增加 `CLEANUP_INTERVAL` 频率

## 监控建议

1. **关键指标**
   - 连接池总大小
   - 各用户连接数
   - 连接创建/销毁频率
   - 平均连接空闲时间

2. **告警设置**
   - 连接数接近上限（>80%）
   - 大量连接超时
   - 连接创建失败率过高

3. **性能优化**
   - 定期分析连接使用模式
   - 根据实际使用情况调整配置
   - 考虑实现连接预热机制

## 示例配置

### 开发环境
```bash
MAX_CONNECTIONS_PER_USER=5
MAX_TOTAL_CONNECTIONS=20
CONNECTION_TIMEOUT=300000    # 5分钟
CLEANUP_INTERVAL=60000       # 1分钟
```

### 测试环境
```bash
MAX_CONNECTIONS_PER_USER=10
MAX_TOTAL_CONNECTIONS=50
CONNECTION_TIMEOUT=900000    # 15分钟
CLEANUP_INTERVAL=180000      # 3分钟
```

### 生产环境
```bash
MAX_CONNECTIONS_PER_USER=20
MAX_TOTAL_CONNECTIONS=200
CONNECTION_TIMEOUT=1800000   # 30分钟
CLEANUP_INTERVAL=300000      # 5分钟
```

## 未来优化方向

1. **连接预热**：预先建立常用 MCP 的连接
2. **智能清理**：基于使用模式的动态清理策略
3. **连接池分片**：支持多实例部署
4. **健康检查**：定期验证连接可用性
5. **性能指标**：详细的连接池性能监控

## 相关文档

- [MCP 集成指南](./MCP_INTEGRATION_GUIDE.md)
- [系统架构概览](./SYSTEM_OVERVIEW.md)
- [环境配置说明](./ENVIRONMENT_SETUP.md) 