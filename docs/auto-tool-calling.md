# 自动工具调用功能说明

## 概述

本项目已实现 LangChain 的自动工具调用功能，无需为每个 MCP 工具手动编写调用逻辑。系统会自动：

1. 发现所有已连接的 MCP 服务器的工具
2. 将 MCP 工具转换为 LangChain 兼容的工具格式
3. 让 LLM 根据用户请求自动选择并调用合适的工具

## 工作原理

### 1. MCP 工具适配器

`MCPToolAdapter` 类负责将 MCP 工具转换为 LangChain 工具：

```typescript
// 自动获取所有已连接 MCP 的工具
const tools = await mcpToolAdapter.getAllTools();
```

### 2. 动态工具绑定

系统会将所有可用工具绑定到 LLM：

```typescript
const llmWithTools = llm.bindTools(tools);
```

### 3. 自动工具调用

LLM 会根据用户的自然语言请求，自动决定：
- 是否需要调用工具
- 调用哪个工具
- 如何提取和传递参数

## 示例

### 连接 MCP 服务器

```bash
# 连接 X (Twitter) MCP
POST /api/mcp/connect
{
  "name": "x-mcp-server",
  "command": "npx",
  "args": ["-y", "@mcp/x-mcp"]
}

# 连接 Base 区块链 MCP
POST /api/mcp/connect
{
  "name": "base-mcp",
  "command": "npx",
  "args": ["-y", "@mcp/base-chain"]
}
```

### 使用示例

连接 MCP 后，你可以直接用自然语言与系统交互：

**示例 1：发推文**
```
用户：发推文：今天天气真好！
系统：[自动调用 x-mcp-server 的 create_tweet 工具]
```

**示例 2：查看钱包余额**
```
用户：查看我的钱包余额
系统：[自动调用 base-mcp 的 list-balances 工具]
```

**示例 3：转账**
```
用户：转账 0.1 ETH 到 0x123...
系统：[自动调用 base-mcp 的 transfer-funds 工具]
```

## 优势

1. **无需手动配置**：不需要为每个工具编写匹配逻辑
2. **自动发现**：新连接的 MCP 工具会自动可用
3. **智能参数提取**：LLM 会从用户输入中提取所需参数
4. **统一接口**：所有 MCP 工具使用相同的调用方式
5. **易于扩展**：添加新的 MCP 服务器无需修改代码

## 技术细节

### 工具转换流程

1. **Schema 转换**：将 MCP 的 JSON Schema 转换为 Zod Schema
2. **工具命名**：使用 `{mcp_name}_{tool_name}` 格式避免冲突
3. **结果处理**：统一处理不同格式的返回结果

### 支持的数据类型

- string
- number/integer  
- boolean
- array
- object

### 错误处理

系统会优雅地处理：
- MCP 连接失败
- 工具调用错误
- 参数验证失败
- 返回结果格式化

## 注意事项

1. 确保使用支持函数调用的 LLM 模型（如 gpt-3.5-turbo 或 gpt-4）
2. MCP 工具的描述信息很重要，会影响 LLM 的选择准确性
3. 复杂的参数可能需要用户提供更详细的信息

## 后续优化

1. 支持工具调用的确认机制
2. 添加工具调用的权限控制
3. 实现工具调用的日志和监控
4. 支持批量工具调用
5. 优化流式响应中的工具调用显示 