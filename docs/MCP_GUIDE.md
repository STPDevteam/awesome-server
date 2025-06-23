# MCP 接口指南

## 什么是MCP

MCP (Model Control Protocol) 是一个用于管理和连接各种工具和服务的协议框架。它允许应用程序连接到不同的工具服务，并通过统一的接口调用这些服务提供的功能。MCP系统的核心思想是将复杂的工具功能抽象为简单的接口，让AI系统能够更容易地使用这些工具。

## MCP的主要组成部分

1. **MCP信息(MCPInfo)**: 描述MCP服务的元数据，包括名称、描述、支持的功能、认证需求等
2. **MCP工具(MCPTool)**: MCP服务提供的具体工具功能，包括工具名称、描述、参数和返回类型
3. **MCP连接(MCPConnection)**: 描述如何连接到MCP服务的配置信息
4. **任务工作流(Workflow)**: 使用MCP完成特定任务的步骤序列

## MCP类别

本系统目前支持以下类别的MCP:

- **自动化工具**: 如Playwright，用于浏览器自动化
- **开发工具**: 如LangChain、GitHub，用于开发相关任务
- **网络工具**: 如WebBrowserTool、GoogleSearchTool，用于网络搜索和访问
- **系统工具**: 如FileSystemTool，用于文件系统操作

## 如何使用MCP API

### 1. 浏览可用的MCP

首先，您可以通过以下接口获取所有可用的MCP:

```bash
curl -X GET "http://localhost:3001/api/mcp" -H "Content-Type: application/json"
```

或者按类别查看:

```bash
curl -X GET "http://localhost:3001/api/mcp/categories" -H "Content-Type: application/json"
curl -X GET "http://localhost:3001/api/mcp/category/自动化工具" -H "Content-Type: application/json"
```

### 2. 获取特定MCP的详细信息

要了解特定MCP的详细信息:

```bash
curl -X GET "http://localhost:3001/api/mcp/playwright" -H "Content-Type: application/json"
```

### 3. 在任务中使用MCP

MCP主要通过任务系统来使用。一个典型的流程如下:

#### 3.1 创建任务

```bash
curl -X POST "http://localhost:3001/api/task" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "使用Playwright访问百度并搜索MCP协议",
    "title": "Playwright百度搜索测试",
    "userId": "your_user_id"
  }'
```

#### 3.2 分析任务

系统会分析任务内容，识别需要使用的MCP和工具:

```bash
curl -X POST "http://localhost:3001/api/task/{task_id}/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id"
  }'
```

#### 3.3 执行任务

```bash
curl -X POST "http://localhost:3001/api/task/{task_id}/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id"
  }'
```

## MCP授权

某些MCP需要授权才能使用。授权流程如下:

1. 创建并分析任务后，系统会识别任务所需的MCP
2. 如果MCP需要授权，您需要提供相应的授权信息
3. 授权信息会被安全地存储，并用于后续对该MCP的调用

提供授权信息的接口:

```bash
curl -X POST "http://localhost:3001/api/task/{task_id}/verify-auth" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mcpName": "github",
    "authData": {
      "token": "your_github_token"
    }
  }'
```

## MCP替代方案

如果某个MCP不可用或者您不想使用它，系统可以推荐替代方案:

```bash
curl -X GET "http://localhost:3001/api/task/{task_id}/mcp-alternatives/playwright?userId=your_user_id" \
  -H "Content-Type: application/json"
```

然后，您可以替换为推荐的替代MCP:

```bash
curl -X POST "http://localhost:3001/api/task/{task_id}/replace-mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your_user_id",
    "originalMcp": "playwright",
    "newMcp": "WebBrowserTool"
  }'
```

## 测试MCP功能

对于Playwright MCP，我们提供了一个专门的测试接口:

```bash
curl -X POST "http://localhost:3001/api/task/test-playwright-mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.baidu.com",
    "searchText": "MCP协议"
  }'
```

## 故障排除

1. **MCP连接失败**: 检查MCP服务是否正在运行，网络连接是否正常
2. **授权错误**: 确保提供了正确的授权信息，并且授权未过期
3. **工具调用失败**: 检查工具参数是否正确，MCP服务是否支持该工具

## 开发自定义MCP

如果您想开发自己的MCP，需要实现以下接口:

1. **MCP信息接口**: 提供MCP的元数据
2. **工具接口**: 定义MCP提供的工具功能
3. **连接接口**: 描述如何连接到MCP服务

详细的开发指南请参考[MCP开发文档](./mcp-development-guide.md)。 