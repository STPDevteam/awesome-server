# Agent任务标题生成修复

## 问题描述

在Agent执行任务时，任务标题是通过简单截取用户消息内容的前50个字符生成的，导致侧边栏展示的任务名称不够准确和用户友好。

### 原有问题
```typescript
// 之前的实现
title: content.length > 50 ? content.substring(0, 50) + '...' : content,
```

**问题**:
- 标题可能被截断在不合适的位置
- 缺乏语义理解，标题不够描述性
- 用户在侧边栏看到的任务名称不够清晰

## 解决方案

### 1. 添加智能任务标题生成

在 `AgentConversationService` 和 `AgentService` 中添加了 `generateTaskTitle` 方法，使用LLM根据以下信息生成合适的任务标题：

- 用户请求内容
- Agent名称和描述
- Agent的MCP能力

### 2. 标题生成规则

```typescript
private async generateTaskTitle(content: string, agent: Agent): Promise<string> {
  // 使用LLM生成标题，要求：
  // - 最大60个字符
  // - 清晰描述性
  // - 反映主要动作或目标
  // - 专业语调
  // - 无引号或特殊格式
}
```

### 3. 降级策略

如果LLM生成失败，会自动降级到截取内容的方式，确保系统稳定性。

## 修改的文件

### 1. `src/services/agentConversationService.ts`
- 添加 `generateTaskTitle` 方法
- 修改 `executeAgentTask` 方法使用智能标题生成
- 修改 `executeAgentTaskStream` 方法使用智能标题生成

### 2. `src/services/agentService.ts`
- 添加 `generateTaskTitle` 方法
- 修改 `executeAgentTask` 方法使用智能标题生成

## 效果对比

### 修复前
```
原始消息: "请帮我查找前3个meme币的信息，包括价格、市值和最新动态"
任务标题: "请帮我查找前3个meme币的信息，包括价格、市值和最新..."
```

### 修复后
```
原始消息: "请帮我查找前3个meme币的信息，包括价格、市值和最新动态"
任务标题: "查找前3个meme币信息" (由LLM智能生成)
```

## 测试验证

创建了 `test/test-agent-task-title-generation.js` 测试文件来验证：

1. **长消息测试** - 应该生成简洁的标题
2. **短消息测试** - 应该保持原意
3. **英文消息测试** - 应该截取关键信息
4. **特定领域测试** - 应该反映Agent能力

### 测试指标
- ✅ 标题是否生成
- ✅ 长度是否合适 (≤60字符)
- ✅ 是否包含关键词
- ✅ 是否不是简单截断

## 用户体验改进

1. **侧边栏显示** - 任务列表中显示更有意义的名称
2. **任务识别** - 用户可以更容易识别不同的任务
3. **专业性** - 标题更加专业和规范
4. **语义化** - 标题反映实际的任务目标

## 兼容性

- 保持向后兼容
- 如果LLM服务不可用，自动降级到原有方式
- 不影响现有任务的功能

## 配置要求

需要配置 `OPENAI_API_KEY` 环境变量以使用LLM生成功能。如果未配置，系统会自动使用降级策略。 