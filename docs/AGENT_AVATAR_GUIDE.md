# Agent头像功能使用指南

## 概述

为了提升用户体验，我们为每个Agent添加了自动生成头像的功能。使用[DiceBear API](https://www.dicebear.com/how-to-use/http-api/)的Bottts样式，为Agent创建独特且一致的头像。

## 功能特性

### 🎨 自动头像生成
- 基于Agent名称自动生成唯一头像
- 使用DiceBear API的多种样式（默认：bottts-neutral）
- 根据Agent类别智能选择头像样式

### 🔄 智能种子生成
- 自动清理特殊字符，确保URL安全
- 支持中英文名称
- 处理空格、连字符、下划线等字符

### 🎭 样式推荐系统
- 根据Agent类别推荐合适的头像样式
- 支持多种预定义样式

## 技术实现

### 1. 数据库变更

为`agents`表添加了新字段：
```sql
ALTER TABLE agents ADD COLUMN agent_avatar TEXT;
```

### 2. 模型更新

在`Agent`接口中添加了头像字段：
```typescript
export interface Agent {
  // ... 其他字段
  agentAvatar?: string; // Agent专用头像URL
}
```

### 3. 头像生成工具

创建了`src/utils/avatarGenerator.ts`工具文件，包含：
- `generateAgentAvatarUrl()` - 生成基本头像URL
- `generateAvatarSeed()` - 生成头像种子值
- `getRecommendedAvatarStyle()` - 根据类别推荐样式

### 4. 服务层集成

在`AgentService.createAgent()`中自动调用头像生成逻辑：
```typescript
// 自动生成Agent头像（如果没有提供）
if (!request.agentAvatar) {
  const avatarStyle = getRecommendedAvatarStyle(categories);
  const avatarSeed = generateAvatarSeed(request.name);
  request.agentAvatar = generateAgentAvatarUrl(avatarSeed, avatarStyle);
}
```

## 使用方法

### 1. 创建Agent时

系统会自动为新创建的Agent生成头像：

```typescript
const agent = await agentService.createAgent({
  userId: 'user123',
  name: 'GitHub代码分析专家',
  description: '专门分析GitHub代码的AI助手',
  categories: ['Development Tools']
  // agentAvatar 会自动生成
});

// 生成的头像URL类似：
// https://api.dicebear.com/9.x/bottts-neutral/svg?seed=github-mcp-ai
```

### 2. 手动指定头像

也可以手动指定头像URL：

```typescript
const agent = await agentService.createAgent({
  userId: 'user123',
  name: 'GitHub代码分析专家',
  description: '专门分析GitHub代码的AI助手',
  agentAvatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=custom-seed'
});
```

### 3. 根据类别自动选择样式

系统会根据Agent的类别自动选择合适的头像样式：

| 类别 | 推荐样式 |
|------|----------|
| Development Tools | bottts-neutral |
| Market Data | avataaars-neutral |
| Social | adventurer-neutral |
| 其他 | bottts-neutral (默认) |

## 头像样式

### 支持的样式
- `bottts-neutral` - 默认机器人风格
- `bottts` - 彩色机器人风格
- `avataaars-neutral` - 中性人物风格
- `avataaars` - 彩色人物风格
- `adventurer-neutral` - 冒险者风格
- `adventurer` - 彩色冒险者风格
- `personas` - 个性化风格

### 样例头像

```
机器人助手: https://api.dicebear.com/9.x/bottts-neutral/svg?seed=robot-assistant
数据分析师: https://api.dicebear.com/9.x/avataaars-neutral/svg?seed=data-analyst
社交媒体管理员: https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=social-manager
```

## 数据库迁移

### 修复现有数据

运行以下SQL脚本来修复现有的Agent数据：

```sql
-- 运行 fix-agents-table.sql 脚本
psql -h <host> -U <user> -d mcp_server -f fix-agents-table.sql
```

该脚本会：
1. 添加`categories`字段（如果缺失）
2. 添加`agent_avatar`字段
3. 为现有Agent生成头像
4. 创建必要的索引

## 测试

运行头像生成功能测试：

```bash
cd mcp-server
npm run build
node test/test-agent-avatar.js
```

测试内容包括：
- 基本头像生成
- 类别样式推荐
- 特殊字符处理
- URL格式验证

## API 示例

### 获取Agent信息

```json
{
  "id": "agent123",
  "name": "GitHub代码分析专家",
  "description": "专门分析GitHub代码的AI助手",
  "agentAvatar": "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=github",
  "categories": ["Development Tools"],
  "status": "public",
  "usageCount": 42,
  "createdAt": "2025-01-10T08:00:00.000Z"
}
```

### 前端显示

```html
<!-- 在前端显示Agent头像 -->
<img src="https://api.dicebear.com/9.x/bottts-neutral/svg?seed=github" 
     alt="GitHub代码分析专家" 
     width="64" 
     height="64" />
```

## 最佳实践

1. **头像缓存**：由于DiceBear API是免费的，但为了更好的性能，建议前端缓存头像
2. **样式一致性**：保持同类别Agent使用相同的头像样式
3. **种子值唯一性**：确保Agent名称的唯一性来避免头像重复
4. **错误处理**：对头像加载失败提供默认图片

## 故障排除

### 头像不显示
1. 检查URL是否正确
2. 确认网络连接正常
3. 验证DiceBear API状态

### 头像相同
1. 检查Agent名称是否重复
2. 确认种子值生成是否正确
3. 可以手动指定不同的种子值

## 相关文件

- `src/utils/avatarGenerator.ts` - 头像生成工具
- `src/models/agent.ts` - Agent模型定义
- `src/services/agentService.ts` - Agent服务
- `src/dao/agentDao.ts` - 数据库操作
- `fix-agents-table.sql` - 数据库修复脚本
- `test/test-agent-avatar.js` - 功能测试

## 更新日志

- **2025-01-10**: 初始版本发布
  - 支持基于Agent名称自动生成头像
  - 集成DiceBear API的多种样式
  - 根据类别智能推荐头像样式
  - 添加数据库迁移脚本 