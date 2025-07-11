# Agent能力快速参考

## 🎯 核心能力概览

### 1. 多轮对话 💬
- **智能意图识别**: 自动识别用户是想聊天还是执行任务
- **上下文记忆**: 维护对话历史，支持连续对话
- **个性化响应**: 基于Agent特性的个性化对话体验

### 2. 任务执行 ⚡
- **真实执行**: 真正执行Agent配置的MCP工作流
- **工作流引擎**: 支持多步骤、链式工具调用
- **智能错误处理**: 完善的错误处理和恢复机制

### 3. 流式响应 🌊
- **实时反馈**: 流式返回处理进度和结果
- **低延迟**: 实时响应用户交互
- **渐进式加载**: 逐步呈现执行结果

## 🔧 关键实现位置

| 功能 | 文件位置 | 核心方法 |
|------|----------|----------|
| 多轮对话 | `src/services/conversationService.ts` | `handleAgentTrialConversation()` |
| 流式对话 | `src/services/conversationService.ts` | `handleAgentTrialConversationStream()` |
| 任务执行 | `src/services/agentService.ts` | `executeAgentTask()` |
| 流式任务执行 | `src/services/conversationService.ts` | `executeAgentTaskStream()` |
| 意图识别 | `src/services/conversationService.ts` | `analyzeAgentUserIntent()` |

## 🎭 关键流式事件

### Agent处理事件
```typescript
// Agent加载
'agent_loading' | 'agent_loaded'

// 意图分析
'agent_intent_analysis'

// 任务执行
'task_creation_start' | 'task_created' | 'workflow_applying' | 'workflow_applied'
'task_execution_start' | 'task_execution_progress' | 'task_execution_complete'

// 聊天响应
'agent_chat_response'

// 完成
'agent_processing_complete'
```

## 🌐 API端点

### Agent试用
```bash
POST /api/agent/trial
{
  "agentId": "agent-id",
  "content": "用户消息"
}
```

### 流式对话
```bash
POST /api/conversation/:id/message/stream
{
  "content": "用户消息"
}
```

## 🔄 典型工作流程

### 1. Agent试用流程
```
用户请求 → Agent加载 → 意图分析 → 聊天/任务分流 → 执行处理 → 返回结果
```

### 2. 流式对话流程
```
建立SSE连接 → 接收消息 → 流式处理 → 实时反馈 → 完成响应
```

### 3. 任务执行流程
```
创建任务 → 应用工作流 → 调用TaskExecutorService → 执行MCP工具 → 返回结果
```

## ✅ 已修复的关键问题

- **Agent真正执行任务**: 不再返回静态文本，而是真正执行工作流
- **流式任务执行**: 支持实时任务执行反馈
- **意图识别优化**: 基于Agent特性的智能意图分析

## 🎯 使用场景

1. **Agent试用**: 用户可以试用Agent的能力
2. **多轮对话**: 与Agent进行连续对话
3. **任务执行**: Agent执行具体的工作流任务
4. **流式交互**: 实时获取处理进度和结果

这个Agent系统现在是一个完整的、生产就绪的智能对话和任务执行平台！ 