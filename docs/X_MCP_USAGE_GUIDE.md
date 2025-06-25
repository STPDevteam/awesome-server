# X MCP Server 使用指南

## 概述

X MCP Server 是一个专为X (Twitter)集成设计的Model Context Protocol实现，提供读取时间线和与推文互动的工具。专为Claude桌面版设计，支持免费API层级的内置速率限制处理。

## 功能特性

### 🔥 核心功能
- ✅ **获取主页时间线** - 从您的主页时间线获取最新推文
- ✅ **创建新推文** - 发布新的推文内容
- ✅ **回复推文** - 回复特定的推文
- ✅ **内置速率限制处理** - 为免费API层级提供智能速率限制管理
- ✅ **TypeScript实现** - 完整的类型安全支持
- ✅ **月度使用跟踪** - 跟踪API使用量避免超限

### 📊 可用工具
1. **get_home_timeline** - 获取主页时间线推文
2. **create_tweet** - 创建新推文
3. **reply_to_tweet** - 回复推文

### 🎯 速率限制管理
- **月度限制跟踪**: 500条推文/月（用户级别）
- **智能退避**: 指数退避算法处理速率限制错误
- **清晰错误信息**: 当达到限制时提供明确的错误消息
- **自动重试**: 速率限制窗口过期后自动重试

## Twitter API 免费层级

### 📈 免费层级功能
**发布限制:**
- 用户级别：500条推文/月
- 应用级别：500条推文/月

**读取限制:**
- 100次读取/月

**功能:**
- 访问v2推文发布端点
- 媒体上传端点
- 访问广告API
- 限制为1个应用ID
- 使用X登录功能

**速率限制:**
- 所有端点的速率限制访问
- 限制定期重置

### 💰 付费层级（可选）
- **基础层级** ($100/月): 50,000条推文/月，额外端点
- **专业层级** ($5000/月): 更高限制和企业功能

## 在项目中的配置

### ✅ 1. 预定义MCP配置 (predefinedMCPs.ts)
```typescript
{
  name: 'x-mcp',
  description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Features: get home timeline, create tweets, reply to tweets with built-in rate limiting',
  command: 'npx',
  args: ['-y', 'x-mcp-server'],
  env: {
    TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || '',
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
    TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || ''
  },
  connected: false,
  category: 'Social',
  imageUrl: 'https://x.com/favicon.ico',
  githubUrl: 'https://github.com/datawhisker/x-mcp-server'
}
```

### ✅ 2. MCP信息服务配置 (mcpInfoService.ts)
```typescript
{
  name: 'x-mcp-server',
  description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Built-in rate limit handling for free API tier',
  capabilities: [
    'get-home-timeline', 'create-tweet', 'reply-to-tweet', 
    'rate-limit-handling', 'timeline-reading', 'tweet-engagement',
    'free-tier-support', 'monthly-usage-tracking', 'exponential-backoff'
  ],
  authRequired: true,
  authFields: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
  category: 'Social',
  imageUrl: 'https://x.com/favicon.ico',
  githubUrl: 'https://github.com/datawhisker/x-mcp-server'
}
```

## 环境变量配置

### 必需环境变量
```bash
# Twitter API 认证信息
TWITTER_API_KEY=your_twitter_api_key_here
TWITTER_API_SECRET=your_twitter_api_secret_here
TWITTER_ACCESS_TOKEN=your_twitter_access_token_here
TWITTER_ACCESS_SECRET=your_twitter_access_secret_here
```

## 获取Twitter API凭证

### 步骤1: 创建Twitter开发者账户
1. 访问 [Twitter开发者门户](https://developer.x.com/en/portal/products/free)
2. 使用您的X (Twitter)账户登录
3. 如果没有开发者账户，系统会提示您创建一个

### 步骤2: 访问免费层级
1. 访问 https://developer.x.com/en/portal/products/free
2. 点击"订阅"免费访问层级
3. 完成注册流程

### 步骤3: 创建新项目
1. 点击"创建项目"按钮
2. 输入项目名称（例如："MCP集成"）
3. 选择"免费"作为您的设置
4. 选择您的用例
5. 点击"下一步"

### 步骤4: 在项目中创建新应用
1. 点击"创建应用"
2. 输入应用名称
3. 点击"完成设置"

### 步骤5: 配置应用设置
1. 在应用仪表板中，点击"应用设置"
2. 在"用户认证设置"下：
   - 点击"设置"
   - 启用OAuth 1.0a
   - 选择"Web应用"或"原生应用"
   - 输入回调URL（例如：https://example.com/callback）
   - 输入网站URL（例如：https://example.com）
   - 点击"保存"

### 步骤6: 设置应用权限
1. 在应用设置中，找到"应用权限"
2. 更改为"读取和写入"
3. 点击"保存"

### 步骤7: 生成API密钥和令牌
1. 转到"密钥和令牌"选项卡
2. 在"消费者密钥"下：
   - 点击"查看密钥"或"重新生成"
   - 保存您的API密钥和API密钥秘密
3. 在"访问令牌和秘密"下：
   - 点击"生成"
   - 确保选择具有"读取和写入"权限的令牌
   - 保存您的访问令牌和访问令牌秘密

### ⚠️ 重要提醒
- 保持您的密钥和令牌安全，切勿公开分享
- 您需要所有四个值：
  - API密钥（也称为消费者密钥）
  - API密钥秘密（也称为消费者秘密）
  - 访问令牌
  - 访问令牌秘密

## 使用示例

### 1. 获取主页时间线
```javascript
const result = await mcpClient.callTool('x-mcp', 'get_home_timeline', {
  limit: 20  // 可选，默认20，最大100
});
```

### 2. 创建新推文
```javascript
const result = await mcpClient.callTool('x-mcp', 'create_tweet', {
  text: "Hello from MCP! 🤖"  // 最大280字符
});
```

### 3. 回复推文
```javascript
const result = await mcpClient.callTool('x-mcp', 'reply_to_tweet', {
  tweet_id: "1234567890",
  text: "Great tweet! 👍"  // 最大280字符
});
```

## API测试

### 测试连接
```bash
# 测试X MCP连接
curl -X POST http://localhost:3001/api/task/test-x-mcp \
  -H "Content-Type: application/json"
```

### 预期响应
```json
{
  "success": true,
  "message": "X MCP test successful",
  "tools": [
    {
      "name": "get_home_timeline",
      "description": "Get the most recent tweets from your home timeline"
    },
    {
      "name": "create_tweet", 
      "description": "Create a new tweet"
    },
    {
      "name": "reply_to_tweet",
      "description": "Reply to a tweet"
    }
  ],
  "toolCount": 3
}
```

## 速率限制详情

### 免费层级限制
- **发布限制**: 500条推文/月（用户和应用级别）
- **读取限制**: 100次读取/月
- **速率限制**: 所有端点都有速率限制

### 内置处理机制
1. **月度使用跟踪** - 自动跟踪每月使用量
2. **指数退避** - 智能处理速率限制错误
3. **清晰错误消息** - 当达到限制时提供明确反馈
4. **自动重试** - 速率限制窗口过期后自动重试

## 错误处理

### 常见错误类型
1. **速率限制超出** - 当达到API速率限制时
2. **月度限制达到** - 当达到500条推文/月限制时
3. **认证失败** - API凭证无效或过期
4. **网络错误** - 连接问题或超时

### 错误响应格式
```json
{
  "error": true,
  "message": "Rate limit exceeded",
  "details": "Monthly limit of 500 tweets reached",
  "retryAfter": 3600
}
```

## 最佳实践

### 1. 认证管理
- 定期轮换API密钥
- 使用环境变量存储凭证
- 不要在代码中硬编码API密钥
- 监控API使用情况

### 2. 速率限制管理
- 监控月度使用量
- 实现适当的错误处理
- 使用指数退避策略
- 考虑升级到付费层级以获得更高限制

### 3. 内容策略
- 遵守Twitter的使用条款
- 避免垃圾内容
- 尊重用户隐私
- 提供有价值的内容

### 4. 监控和日志
- 记录API调用和响应
- 监控错误率
- 跟踪使用模式
- 设置使用量警报

## 故障排除

### Q: 为什么连接失败？
A: 检查以下几点：
- API凭证是否正确
- 环境变量是否正确设置
- 网络连接是否正常
- 应用权限是否设置为"读取和写入"

### Q: 为什么无法发布推文？
A: 可能的原因：
- 已达到月度500条推文限制
- API凭证权限不足
- 推文内容违反Twitter政策
- 速率限制正在生效

### Q: 如何增加API限制？
A: 考虑升级到付费层级：
- 基础层级：$100/月，50,000条推文
- 专业层级：$5000/月，更高限制

## 安全考虑

### 🔒 安全最佳实践
1. **凭证保护**
   - 使用环境变量存储API密钥
   - 定期轮换访问令牌
   - 限制API密钥权限

2. **访问控制**
   - 实现适当的用户认证
   - 限制API访问权限
   - 监控异常活动

3. **数据隐私**
   - 不记录敏感用户数据
   - 遵守数据保护法规
   - 实现数据最小化原则

## 总结

X MCP Server为您的项目提供了强大的Twitter集成能力：

- **✅ 完整功能** - 时间线读取、推文创建、回复功能
- **✅ 智能限制管理** - 内置速率限制和使用量跟踪
- **✅ 免费层级支持** - 专为Twitter免费API设计
- **✅ 类型安全** - TypeScript实现确保代码质量
- **✅ 易于集成** - 简单的MCP协议接口

这个集成为您提供了可靠、高效的Twitter自动化能力！🐦 