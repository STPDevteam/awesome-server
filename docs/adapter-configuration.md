# MCP 适配器配置指南

## 概述

你的项目现在支持两种 MCP 适配器：

1. **官方 LangChain MCP Adapters** - 使用 `@langchain/mcp-adapters` 包
2. **自定义 MCP 适配器** - 项目中的自定义实现

## 配置方式

通过环境变量 `USE_OFFICIAL_MCP_ADAPTER` 来选择使用哪个适配器：

### 使用官方适配器
```bash
# 在 .env 文件中添加
USE_OFFICIAL_MCP_ADAPTER=true
```

### 使用自定义适配器（默认）
```bash
# 在 .env 文件中添加（或不设置，默认为 false）
USE_OFFICIAL_MCP_ADAPTER=false
```

## 适配器对比

| 特性 | 官方适配器 | 自定义适配器 |
|------|------------|--------------|
| **维护方** | LangChain 官方团队 | 项目自维护 |
| **包名** | `@langchain/mcp-adapters` | 项目内置 |
| **工具名称前缀** | 自动添加服务器名称前缀 | 手动控制前缀规则 |
| **多媒体支持** | 原生支持标准内容块 | 基础 JSON 处理 |
| **错误处理** | 标准化错误处理 | 自定义错误处理 |
| **输出处理** | 支持 content/artifact 分离 | 统一内容处理 |
| **更新频率** | 跟随 LangChain 更新 | 手动维护 |

## 官方适配器的优势

### 1. 标准化工具命名
```typescript
// 官方适配器自动生成
"github-mcp-server__create_issue"  // 带服务器前缀，避免冲突
```

### 2. 高级输出处理
```typescript
// 支持将不同类型内容分别处理
outputHandling: {
  text: 'content',      // 文本放在消息内容中
  image: 'content',     // 图片也放在内容中  
  audio: 'content',     // 音频内容
  resource: 'artifact'  // 资源文件放在 artifact 中
}
```

### 3. 标准内容块
```typescript
// 自动处理多媒体内容为 LangChain 标准格式
useStandardContentBlocks: true
```

### 4. 灵活的错误处理
```typescript
// 可以选择是否在单个工具失败时继续
throwOnLoadError: false
```

## 自定义适配器的优势

### 1. 完全控制
- 可以自定义工具名称生成规则
- 可以添加特定的日志和调试信息
- 可以实现项目特定的错误处理逻辑

### 2. 轻量级
- 没有额外的依赖
- 更简单的实现逻辑

### 3. 定制化
- 可以针对特定 MCP 做优化
- 可以添加项目特定的功能

## 测试配置

### 测试官方适配器
```bash
# 1. 设置环境变量
echo "USE_OFFICIAL_MCP_ADAPTER=true" >> .env

# 2. 重启服务器
npm run dev

# 3. 观察日志输出
# 应该看到: "🔧 Using Official MCP Adapter"
```

### 测试自定义适配器
```bash
# 1. 设置环境变量
echo "USE_OFFICIAL_MCP_ADAPTER=false" >> .env

# 2. 重启服务器  
npm run dev

# 3. 观察日志输出
# 应该看到: "🔧 Using Custom MCP Adapter"
```

## 日志差异

### 官方适配器日志
```
🔧 Using Official MCP Adapter
📋 Processing 1 connected MCP servers with official adapters
🔧 Loading tools from github-mcp-server using official LangChain MCP Adapters...
✅ Successfully loaded 51 tools from github-mcp-server
   🛠️  github-mcp-server__create_issue: Create a new issue
   🛠️  github-mcp-server__list_issues: List repository issues
🎯 Total tools loaded: 51
```

### 自定义适配器日志
```
🔧 Using Custom MCP Adapter  
Processing 51 tools from github-mcp-server
Generated tool name: "github_create_issue" (length: 19) for github-mcp-server:create_issue
Generated tool name: "github_list_issues" (length: 18) for github-mcp-server:list_issues
Total tools prepared: 51
```

## 推荐设置

### 生产环境
```bash
USE_OFFICIAL_MCP_ADAPTER=true
```
- 使用官方适配器获得最佳兼容性和维护支持

### 开发/测试环境
```bash
USE_OFFICIAL_MCP_ADAPTER=false
```
- 使用自定义适配器便于调试和自定义

## 故障排除

### 官方适配器连接失败
如果官方适配器出现兼容性问题：
1. 检查 `@langchain/mcp-adapters` 版本
2. 更新到最新版本：`npm update @langchain/mcp-adapters`
3. 或回退到自定义适配器：`USE_OFFICIAL_MCP_ADAPTER=false`

### 工具名称冲突
如果不同 MCP 有同名工具：
- 官方适配器：自动添加服务器前缀
- 自定义适配器：可能需要手动处理冲突

## 迁移指南

### 从自定义迁移到官方
1. 设置 `USE_OFFICIAL_MCP_ADAPTER=true`
2. 重启服务器
3. 测试所有工具调用
4. 检查工具名称是否有变化

### 从官方回退到自定义
1. 设置 `USE_OFFICIAL_MCP_ADAPTER=false`  
2. 重启服务器
3. 验证功能正常

这样你就可以灵活选择最适合的适配器了！ 