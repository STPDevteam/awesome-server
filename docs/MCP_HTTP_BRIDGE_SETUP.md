# MCP HTTP 桥接设置指南

本文档描述了如何设置MCP服务器，使其既支持HTTP模式，又能通过桥接工具支持STDIO客户端。

## 架构概述

我们的架构采用了以下组件：

1. **MCP服务器** - 核心服务，以HTTP模式运行
2. **HTTP MCP工具服务** - 如cook-mcp-service，原生支持HTTP模式
3. **STDIO MCP工具服务** - 如github-mcp-service，只支持STDIO模式
4. **MCP-HTTP-Bridge** - 将STDIO服务转换为HTTP端点
5. **MCP-Remote** - 将HTTP端点转换为STDIO接口，供客户端使用

```
┌─────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│                 │     │                   │     │                   │
│  MCP 客户端     │────►│  mcp-remote       │────►│  MCP 服务器       │
│  (STDIO)        │     │  (桥接器)         │     │  (HTTP)           │
│                 │     │                   │     │                   │
└─────────────────┘     └───────────────────┘     └───────────────────┘
                                                         │
                                                         ├─────────────────────┐
                                                         │                     │
                                                         ▼                     ▼
                                           ┌───────────────────┐   ┌───────────────────┐
                                           │                   │   │                   │
                                           │  HTTP MCP 工具服务 │   │ mcp-http-bridge  │
                                           │  (cook-mcp-service)│   │ (HTTP桥接器)     │
                                           │                   │   │                   │
                                           └───────────────────┘   └───────────────────┘
                                                                           │
                                                                           │
                                                                           ▼
                                                               ┌───────────────────┐
                                                               │                   │
                                                               │  STDIO MCP 工具服务│
                                                               │  (github-mcp)     │
                                                               │                   │
                                                               └───────────────────┘
```

## 设置步骤

### 1. 配置MCP服务器为HTTP模式

确保`docker-compose.yml`中的MCP服务器配置了`MCP_ADAPTER_TYPE=http`环境变量：

```yaml
mcp-server:
  environment:
    - MCP_ADAPTER_TYPE=http
```

### 2. 配置支持HTTP的MCP工具服务

对于支持HTTP模式的MCP工具服务（如cook-mcp-service），配置`MCP_MODE=http`环境变量：

```yaml
cook-mcp-service:
  environment:
    MCP_MODE: http
```

### 3. 为STDIO服务设置HTTP桥接器

对于只支持STDIO模式的服务（如github-mcp-service），需要设置mcp-http-bridge：

```yaml
github-mcp-bridge:
  image: node:18-alpine
  container_name: github-mcp-bridge
  command: sh -c "npm install -g mcp-http-bridge && mcp-http-bridge --port 3012"
  environment:
    MCP_SERVER_COMMAND: "npx"
    MCP_SERVER_ARGS: "-y,@modelcontextprotocol/server-github"
    MCP_SERVER_ENV: "GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here"
  ports:
    - "3012:3012"
  networks: [mcp-network]
```

### 4. 配置HTTPMCPAdapter指向正确的服务

在`src/services/httpMcpAdapter.ts`中，确保服务端点指向正确的地址：

```typescript
const services: MCPServiceEndpoint[] = [
  {
    name: 'github-mcp-service',
    baseUrl: process.env.GITHUB_MCP_SERVICE_URL || 'http://github-mcp-bridge:3012',
    timeout: 30000,
    retries: 3
  },
  {
    name: 'cook-mcp-service',
    baseUrl: process.env.COOK_MCP_SERVICE_URL || 'http://cook-mcp-service:3010',
    timeout: 30000,
    retries: 3
  }
];
```

### 5. 设置客户端访问

如果需要让客户端（如Claude、Cursor等）通过STDIO访问HTTP服务，可以使用mcp-remote：

```bash
# 安装mcp-remote
npm install -g mcp-remote

# 启动桥接
mcp-remote http://localhost:3001/mcp
```

或者创建配置文件`mcp-remote-config.json`：

```json
{
  "mcpServers": {
    "evm-http-bridge": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "http://localhost:3001/mcp"
      ]
    }
  }
}
```

## 工作原理

1. MCP服务器以HTTP模式运行，使用HTTPMCPAdapter与工具服务通信
2. 对于支持HTTP的工具服务（如cook-mcp-service），直接通过HTTP通信
3. 对于只支持STDIO的工具服务（如github-mcp-service），通过mcp-http-bridge转换为HTTP端点
4. 客户端可以通过HTTP直接访问MCP服务器，或通过mcp-remote以STDIO方式访问

这种架构既保留了HTTP的优势（简单的网络通信、跨平台支持），又支持只能使用STDIO的服务和客户端。

## 故障排除

如果遇到连接问题，请检查：

1. 所有HTTP服务是否都正确配置并运行
2. mcp-http-bridge是否正确启动并连接到STDIO服务
3. 端口映射是否正确
4. 网络连接是否正常

可以通过以下命令查看日志：

```bash
docker logs mcp-server
docker logs github-mcp-bridge
docker logs cook-mcp-service
``` 