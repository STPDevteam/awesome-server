# 🔧 预定义工具功能 (Predefined Tools Feature)

## 📝 功能概述

新增了MCP预定义工具信息功能，允许在MCP未连接时也能向前端展示该MCP包含的工具列表，提升用户体验。

## 🎯 解决的问题

- **MCP未连接时无工具信息**：之前只有在MCP成功连接后才能获取工具列表
- **用户无法预览MCP功能**：用户不知道某个MCP提供什么工具和功能
- **任务分析缺乏工具详情**：任务分析结果中没有具体的工具信息

## 🚀 新增功能

### 1. 预定义工具配置
在 `src/services/predefinedMCPs.ts` 中为MCP添加 `predefinedTools` 字段：

```typescript
{
  name: 'twitter-client-mcp',
  description: '...',
  // ... 其他配置
  predefinedTools: [
    {
      name: 'profileByUsername',
      description: 'Get detailed Twitter profile information for a specific username'
    },
    {
      name: 'sendTweet',
      description: 'Post a new tweet or reply to existing tweet'
    }
    // ... 更多工具
  ]
}
```

### 2. API返回增强

#### 任务分析接口 (`POST /api/task/:id/analyze/stream`)
现在返回的MCP信息包含预定义工具：

```json
{
  "event": "step_complete",
  "data": {
    "stepType": "mcp_selection",
    "mcps": [
      {
        "name": "twitter-client-mcp",
        "description": "Advanced Twitter Client MCP...",
        "predefinedTools": [
          {
            "name": "profileByUsername",
            "description": "Get detailed Twitter profile information..."
          }
        ]
      }
    ]
  }
}
```

#### 对话详情接口 (`GET /api/conversation/:id`)
lastUsedMcp 字段现在包含预定义工具信息：

```json
{
  "lastUsedMcp": [
    {
      "name": "twitter-client-mcp",
      "description": "Advanced Twitter Client MCP...",
      "predefinedTools": [
        {
          "name": "sendTweet",
          "description": "Post a new tweet or reply to existing tweet"
        }
      ]
    }
  ]
}
```

### 3. 后端增强

#### MCPManager 增强
- 新增 `getPredefinedTools(mcpName)` 方法
- `getTools()` 方法现在支持fallback到预定义工具

#### 类型定义增强
- `MCPService` 接口新增 `predefinedTools` 字段
- `MCPInfo` 接口新增 `predefinedTools` 字段
- `MCPWorkflow` 和 `AlternativeMCP` 支持预定义工具

## 📋 示例配置

### Twitter MCP完整配置示例
```typescript
{
  name: 'twitter-client-mcp',
  description: 'Advanced Twitter Client MCP with comprehensive functionality...',
  command: 'node',
  args: [`/home/ubuntu/mcp-tools/twitter-client-mcp/dist/index.js`],
  env: { /* 环境变量配置 */ },
  connected: false,
  category: 'Social',
  imageUrl: 'https://...',
  githubUrl: 'https://github.com/...',
  authRequired: true,
  authParams: { /* 认证参数 */ },
  predefinedTools: [
    {
      name: 'profileByUsername',
      description: 'Get detailed Twitter profile information for a specific username'
    },
    {
      name: 'getUserTweets',
      description: 'Get recent tweets from a specific user\'s timeline'
    },
    {
      name: 'sendTweet',
      description: 'Post a new tweet or reply to existing tweet'
    },
    {
      name: 'searchTweets',
      description: 'Search for tweets using keywords and filters'
    }
    // ... 共20个工具
  ]
}
```

## 🧪 测试

运行测试验证功能：

```bash
node test-predefined-tools.js
```

## 💡 使用建议

### 为新MCP添加预定义工具信息

1. 查看MCP的源码或文档，了解提供的工具
2. 在 `predefinedMCPs.ts` 中添加 `predefinedTools` 配置
3. 确保工具名称和描述准确
4. 运行测试验证配置正确

### 前端使用

前端现在可以：
- 在MCP列表中显示每个MCP的工具数量
- 在MCP详情页面展示工具列表
- 在任务分析结果中显示将使用的具体工具
- 提供更好的MCP选择和替换体验

## 🔄 向后兼容

- 现有MCP配置无需修改，`predefinedTools` 是可选字段
- 现有API响应保持兼容，只是新增了字段
- MCP连接逻辑保持不变

## 📈 未来扩展

- 可以添加工具的参数信息 (`parameters`)
- 可以添加工具的返回类型 (`returnType`)
- 可以根据工具使用频率进行排序
- 可以添加工具的使用示例

## 🔧 技术实现

### 核心文件修改
1. `src/services/mcpManager.ts` - 新增预定义工具获取方法
2. `src/services/predefinedMCPs.ts` - 添加工具配置
3. `src/models/mcp.ts` - 更新类型定义
4. `src/models/task.ts` - 更新工作流类型
5. `src/services/llmTasks/taskAnalysisService.ts` - 分析结果包含工具信息
6. `src/routes/conversation.ts` - 对话API包含工具信息

### 工作流程
1. MCP配置时定义预定义工具
2. 任务分析时获取并返回工具信息
3. 前端显示工具列表和描述
4. MCP未连接时fallback到预定义工具
5. 用户可以基于工具信息做出更好的选择 