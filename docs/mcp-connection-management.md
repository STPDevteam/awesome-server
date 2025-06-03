# MCP 连接管理

## 概述

本系统提供了完善的 MCP（Model Context Protocol）连接管理功能，支持连接、断开连接、查看连接状态等操作。

## API 端点

### 1. 连接 MCP 服务器

**端点**: `POST /api/mcp/connect`

**请求体**:
```json
{
  "name": "x-mcp-server",
  "command": "npx",
  "args": ["-y", "@mcp/x-mcp"],
  "env": {}  // 可选，环境变量
}
```

**响应**:
```json
{
  "success": true,
  "message": "Successfully connected to MCP: x-mcp-server",
  "alreadyConnected": false  // 表示是否已经连接
}
```

**特性**:
- 幂等操作：重复连接同一个 MCP 不会报错
- 返回连接状态，告知是新连接还是已存在的连接

### 2. 断开 MCP 连接

**端点**: `POST /api/mcp/disconnect`

**请求体**:
```json
{
  "name": "x-mcp-server"
}
```

**响应**:
```json
{
  "success": true,
  "message": "Disconnected from MCP: x-mcp-server",
  "wasConnected": true  // 表示断开前是否已连接
}
```

### 3. 获取已连接的 MCP 列表

**端点**: `GET /api/mcp/list`

**响应**:
```json
[
  {
    "name": "x-mcp-server",
    "command": "npx",
    "args": ["-y", "@mcp/x-mcp"],
    "toolCount": 5,  // 可用工具数量
    "status": "connected"
  },
  {
    "name": "base-mcp",
    "command": "npx",
    "args": ["-y", "@mcp/base-chain"],
    "toolCount": 8,
    "status": "connected"
  }
]
```

### 4. 获取特定 MCP 的工具列表

**端点**: `GET /api/mcp/{name}/tools`

**响应**:
```json
{
  "tools": [
    {
      "name": "create_tweet",
      "description": "Create a new tweet",
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string",
            "description": "The text content of the tweet"
          }
        },
        "required": ["text"]
      }
    },
    // ... 更多工具
  ]
}
```

## 使用示例

### 连接多个 MCP 服务器

```javascript
// 连接 X (Twitter) MCP
await fetch('http://localhost:3001/api/mcp/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'x-mcp-server',
    command: 'npx',
    args: ['-y', '@mcp/x-mcp']
  })
});

// 连接 Base 区块链 MCP
await fetch('http://localhost:3001/api/mcp/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'base-mcp',
    command: 'npx',
    args: ['-y', '@mcp/base-chain']
  })
});
```

### 检查连接状态

```javascript
const response = await fetch('http://localhost:3001/api/mcp/list');
const mcpList = await response.json();

mcpList.forEach(mcp => {
  console.log(`${mcp.name}: ${mcp.status} (${mcp.toolCount} tools)`);
});
```

## 错误处理

系统会优雅地处理以下情况：

1. **重复连接**: 不会报错，返回 `alreadyConnected: true`
2. **断开未连接的 MCP**: 不会报错，返回 `wasConnected: false`
3. **连接失败**: 返回详细的错误信息
4. **工具获取失败**: 在列表中显示错误状态

## 最佳实践

1. **启动时连接**: 可以在应用启动时自动连接常用的 MCP
2. **健康检查**: 定期调用 `/api/mcp/list` 检查连接状态
3. **错误恢复**: 如果 MCP 连接失败，可以尝试重新连接
4. **资源清理**: 在应用关闭前断开所有 MCP 连接

## 注意事项

1. MCP 进程会在后台运行，确保系统有足够的资源
2. 某些 MCP 可能需要特定的环境变量或配置
3. 断开连接会终止对应的 MCP 进程 