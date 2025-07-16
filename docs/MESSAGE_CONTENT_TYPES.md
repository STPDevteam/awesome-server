# 消息内容类型标识 (Message Content Types)

在消息的 `metadata.contentType` 字段中，我们使用以下标识来区分不同类型的消息内容：

## 📊 Content Type 分类

### 1. **用户输入类型**
```typescript
contentType: 'user_input'
```
- **含义**：用户发送的输入消息
- **用途**：前端可以识别并以用户消息样式显示

### 2. **聊天回复类型**
```typescript
contentType: 'chat_response'
```
- **含义**：普通聊天回复或Agent聊天回复
- **用途**：前端显示为对话式回复

### 3. **任务执行类型**

#### 3.1 **步骤思考过程**
```typescript
contentType: 'step_thinking'
```
- **含义**：中间步骤的执行消息（思考过程）
- **用途**：前端可以显示为思考步骤，通常可折叠
- **对应事件**：`step_result_chunk`
- **示例**：Agent执行MCP工具的中间步骤

#### 3.2 **最终执行结果**
```typescript
contentType: 'final_result'
```
- **含义**：最后一步的流式格式化结果（最终答案）
- **用途**：前端重点展示的主要结果内容
- **对应事件**：`final_result_chunk`
- **示例**：经过LLM格式化的最终回答

## 🎯 前端展示建议

### 区分思考过程和最终结果
```typescript
// 前端可以根据contentType区分展示
switch (message.metadata?.contentType) {
  case 'step_thinking':
    // 思考过程样式：可折叠，次要显示
    return <ThinkingStep 
      content={message.content}
      stepNumber={message.metadata.stepNumber}
      collapsed={true}  // 默认折叠
    />;
    
  case 'final_result':
    // 最终结果样式：重点展示，主要内容
    return <FinalResult 
      content={message.content}
      highlighted={true}  // 突出显示
    />;
    
  case 'chat_response':
    // 聊天回复样式
    return <ChatResponse content={message.content} />;
    
  case 'user_input':
    // 用户消息样式
    return <UserMessage content={message.content} />;
}
```

### 推荐的用户体验
1. **思考过程** (`step_thinking`)：
   - 默认折叠，用户可选择展开查看
   - 显示步骤编号和名称
   - 使用次要的视觉样式

2. **最终结果** (`final_result`)：
   - 重点展示，用户首先看到的内容
   - 使用主要的视觉样式
   - 突出显示关键信息

## 📝 完整的 Metadata 结构示例

### 思考过程消息
```json
{
  "stepType": "execution",
  "stepNumber": 1,
  "stepName": "Retrieve data from API",
  "totalSteps": 2,
  "taskPhase": "execution",
  "agentName": "DataAgent",
  "contentType": "step_thinking"
}
```

### 最终结果消息
```json
{
  "stepType": "execution",
  "stepNumber": 2,
  "stepName": "Format and present results",
  "totalSteps": 2,
  "taskPhase": "execution", 
  "agentName": "DataAgent",
  "contentType": "final_result"
}
```

通过这种区分，前端可以提供更清晰的用户界面，让用户专注于最终结果，同时保留查看详细思考过程的选项。 