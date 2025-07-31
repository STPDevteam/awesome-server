# Agent Enhanced Streaming Events Guide

## 📋 **增强的详细流式事件**

基于您的需求，我们在现有事件基础上增强了详细信息，让前端能够清楚了解每一步的执行情况。

### 🔧 **核心改进**
- **保持事件名称兼容**：不改变原有事件名称，只增强data内容
- **原始数据 + 格式化数据**：分别提供MCP/LLM的原始返回和格式化结果
- **详细调用信息**：在现有data中新增toolDetails等字段
- **零前端改动**：完全向后兼容，前端可选择性使用新字段

---

## 🎯 **增强的事件类型**

### 1. **增强的执行事件**

#### **`step_executing`** - 步骤执行开始（增强版）
```json
{
  "event": "step_executing",
  "data": {
    "step": 1,
    "tool": "searchTweets",
    "agentName": "Twitter Assistant", 
    "message": "Twitter Assistant is executing step 1: searchTweets",
    // 🔧 新增详细信息 - 完全向后兼容
    "toolDetails": {
      "toolType": "mcp",
      "toolName": "searchTweets",
      "mcpName": "twitter-client-mcp",
      "args": {
        "query": "from:@username",
        "maxResults": 1
      },
      "expectedOutput": "Most recent tweet from the user",
      "reasoning": "Using Twitter search to get the latest tweet",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

#### **`step_raw_result`** - 步骤原始结果（增强版）
```json
{
  "event": "step_raw_result", 
  "data": {
    "step": 1,
    "success": true,
    "result": {
      "data": [
        {
          "id": "1234567890", 
          "text": "Hello world!",
          "created_at": "2024-01-15T08:30:00.000Z",
          "author_id": "987654321",
          "public_metrics": {
            "retweet_count": 5,
            "like_count": 23
          }
        }
      ],
      "meta": {
        "result_count": 1
      }
    },
    "agentName": "Twitter Assistant",
    // 🔧 新增详细信息 - 完全向后兼容
    "executionDetails": {
      "toolType": "mcp",
      "toolName": "searchTweets", 
      "mcpName": "twitter-client-mcp",
      "rawResult": { /* 同上面的result */ },
      "args": {
        "query": "from:@username",
        "maxResults": 1
      },
      "expectedOutput": "Most recent tweet from the user",
      "timestamp": "2024-01-15T10:30:05.000Z"
    }
  }
}
```

#### **`step_formatted_result`** - 步骤格式化结果（增强版）
```json
{
  "event": "step_formatted_result",
  "data": {
    "step": 1,
    "success": true,
    "formattedResult": "**Latest Tweet from @username:**\n\n\"Hello world!\"\n\n*Posted: 2 hours ago*\n*Engagement: 5 retweets, 23 likes*",
    "agentName": "Twitter Assistant",
    // 🔧 新增详细信息 - 完全向后兼容
    "formattingDetails": {
      "toolType": "mcp",
      "toolName": "searchTweets",
      "mcpName": "twitter-client-mcp", 
      "originalResult": { /* 原始MCP返回数据 */ },
      "formattedResult": "**Latest Tweet from @username:**...",
      "processingInfo": {
        "originalDataSize": 2847,
        "formattedDataSize": 156,
        "processingTime": "2024-01-15T10:30:06.000Z"
      },
      "timestamp": "2024-01-15T10:30:06.000Z"
    }
  }
}
```

### 2. **LLM工具调用示例**

当执行LLM工具时，同样的事件结构，只是`toolDetails`和`executionDetails`中的信息不同：

#### **`step_executing`** - LLM工具执行
```json
{
  "event": "step_executing",
  "data": {
    "step": 2,
    "tool": "analyze_sentiment", 
    "agentName": "Twitter Assistant",
    "message": "Twitter Assistant is executing step 2: analyze_sentiment",
    "toolDetails": {
      "toolType": "llm",
      "toolName": "analyze_sentiment",
      "mcpName": null,
      "args": {
        "text": "Hello world!",
        "context": "social_media_post"
      },
      "expectedOutput": "Sentiment analysis of the tweet",
      "reasoning": "Analyzing the emotional tone of the retrieved tweet",
      "timestamp": "2024-01-15T10:30:07.000Z"
    }
  }
}
```

#### **`step_raw_result`** - LLM原始结果
```json
{
  "event": "step_raw_result",
  "data": {
    "step": 2,
    "success": true,
    "result": "The tweet \"Hello world!\" expresses a positive, welcoming sentiment...",
    "agentName": "Twitter Assistant",
    "executionDetails": {
      "toolType": "llm",
      "toolName": "analyze_sentiment",
      "mcpName": null,
      "rawResult": "The tweet \"Hello world!\" expresses...",
      "args": {
        "text": "Hello world!",
        "context": "social_media_post"
      },
      "expectedOutput": "Sentiment analysis of the tweet",
      "timestamp": "2024-01-15T10:30:10.000Z"
    }
  }
}
```

---

## 🔄 **事件流程序列**

完整的事件流程（MCP和LLM使用相同的事件名称）：

```
1. step_executing        ← 步骤开始，toolDetails中显示调用详情
2. step_raw_result       ← 原始数据，executionDetails中包含工具信息
3. step_result_chunk     ← 流式格式化过程（多个chunk）
4. step_formatted_result ← 完整格式化结果，formattingDetails中包含处理信息
5. step_completed        ← 步骤完成（原有事件）
```

### **MCP vs LLM 的区别**
- **事件名称**: 完全相同
- **区别字段**: 通过 `toolType` 字段区分 (`"mcp"` 或 `"llm"`)
- **MCP特有**: `mcpName` 字段有值
- **LLM特有**: `mcpName` 字段为 `null`

---

## 💻 **前端集成示例**

### **React组件示例**
```typescript
import React, { useState } from 'react';

interface AgentExecution {
  step: number;
  toolCalls: Array<{
    type: 'mcp' | 'llm';
    name: string;
    mcpName?: string;
    args: any;
    status: 'calling' | 'raw_received' | 'formatted';
    rawResult?: any;
    formattedResult?: string;
  }>;
}

const AgentViewer: React.FC = () => {
  const [execution, setExecution] = useState<AgentExecution>({
    step: 0,
    toolCalls: []
  });

  const handleEvent = (event: string, data: any) => {
    switch (event) {
      case 'step_executing':
        // 从toolDetails中获取详细信息
        const toolDetails = data.toolDetails || {};
        setExecution(prev => ({
          ...prev,
          step: data.step,
          toolCalls: [...prev.toolCalls, {
            type: toolDetails.toolType || 'unknown',
            name: toolDetails.toolName || data.tool,
            mcpName: toolDetails.mcpName,
            args: toolDetails.args,
            status: 'calling'
          }]
        }));
        break;

      case 'step_raw_result':
        // 从executionDetails中获取详细信息
        const execDetails = data.executionDetails || {};
        setExecution(prev => ({
          ...prev,
          toolCalls: prev.toolCalls.map((call, idx) => 
            idx === prev.toolCalls.length - 1 
              ? { 
                  ...call, 
                  rawResult: execDetails.rawResult || data.result, 
                  status: 'raw_received' 
                }
              : call
          )
        }));
        break;

      case 'step_formatted_result':
        // 从formattingDetails中获取详细信息
        const formatDetails = data.formattingDetails || {};
        setExecution(prev => ({
          ...prev,
          toolCalls: prev.toolCalls.map((call, idx) => 
            idx === prev.toolCalls.length - 1 
              ? { 
                  ...call, 
                  formattedResult: formatDetails.formattedResult || data.formattedResult, 
                  status: 'formatted' 
                }
              : call
          )
        }));
        break;
    }
  };

  return (
    <div className="agent-viewer">
      <h3>Agent Execution Step {execution.step}</h3>
      {execution.toolCalls.map((call, idx) => (
        <div key={idx} className="tool-call">
          <h4>{call.type.toUpperCase()}: {call.name}</h4>
          {call.mcpName && <p>MCP: {call.mcpName}</p>}
          <p>Status: {call.status}</p>
          {call.rawResult && (
            <details>
              <summary>Raw Result</summary>
              <pre>{JSON.stringify(call.rawResult, null, 2)}</pre>
            </details>
          )}
          {call.formattedResult && (
            <div className="formatted-result">
              {call.formattedResult}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## ✅ **总结**

### **兼容性保证**
- ✅ **事件名称不变**: 完全保持原有事件名称
- ✅ **原有字段保留**: 不影响现有前端代码  
- ✅ **新增字段可选**: 前端可选择性使用新功能
- ✅ **渐进式升级**: 前端可逐步适配新字段

### **新增能力**
- 🔧 **工具调用详情**: `toolDetails` 提供完整调用信息
- 📊 **原始数据访问**: `executionDetails` 包含原始返回数据
- ✨ **格式化信息**: `formattingDetails` 提供处理详情
- 🎯 **统一事件流**: MCP和LLM使用相同事件结构

### **前端集成**
```typescript
// 向后兼容 - 现有代码无需修改
const step = data.step;
const tool = data.tool;
const result = data.result;

// 可选增强 - 需要时使用新字段
const toolType = data.toolDetails?.toolType;
const mcpName = data.toolDetails?.mcpName;
const rawResult = data.executionDetails?.rawResult;
const processingInfo = data.formattingDetails?.processingInfo;
```

这个增强的事件系统在保持完全向后兼容的基础上，提供了完整的执行透明度，让用户能够清楚地了解Agent的每一步操作！🎉

---

## 💾 **消息存储增强**

### **分离式消息存储**

每个执行步骤现在会生成**两条独立的消息**进行存储：

#### **1. 原始结果消息**
```json
{
  "id": "msg-raw-123",
  "conversationId": "conv-456",
  "content": "Step 1 Raw Result: searchTweets\n\n{\n  \"data\": [\n    {\n      \"id\": \"1234567890\",\n      \"text\": \"Hello world!\",\n      \"created_at\": \"2024-01-15T08:30:00.000Z\"\n    }\n  ]\n}",
  "type": "assistant",
  "intent": "task",
  "taskId": "task-789",
  "metadata": {
    "stepType": "execution",
    "stepNumber": 1,
    "stepName": "searchTweets",
    "contentType": "raw_result",
    "toolDetails": {
      "toolType": "mcp",
      "toolName": "searchTweets",
      "mcpName": "twitter-client-mcp",
      "args": {"query": "AI news", "maxResults": 5},
      "expectedOutput": "Recent AI-related tweets",
      "reasoning": "Search for latest AI developments"
    },
    "executionDetails": {
      "rawResult": { /* MCP原始返回数据 */ },
      "success": true,
      "processingInfo": {
        "originalDataSize": 2847,
        "processingTime": "2024-01-15T10:30:05.000Z"
      }
    }
  }
}
```

#### **2. 格式化结果消息（MCP工具）**
```json
{
  "id": "msg-formatted-124",
  "conversationId": "conv-456", 
  "content": "Step 1 Formatted Result: searchTweets\n\n**Latest AI Tweet:**\n\"Hello world!\"\n\n*Posted: 2 hours ago*\n*Engagement: 5 retweets, 23 likes*",
  "type": "assistant",
  "intent": "task",
  "taskId": "task-789",
  "metadata": {
    "stepType": "execution",
    "stepNumber": 1,
    "stepName": "searchTweets",
    "contentType": "formatted_result",
    "toolDetails": {
      "toolType": "mcp",
      "toolName": "searchTweets",
      "mcpName": "twitter-client-mcp",
      "args": {"query": "AI news", "maxResults": 5},
      "expectedOutput": "Recent AI-related tweets",
      "reasoning": "Search for latest AI developments"
    },
    "executionDetails": {
      "formattedResult": "**Latest AI Tweet:**...",
      "success": true,
      "processingInfo": {
        "formattedDataSize": 156,
        "processingTime": "2024-01-15T10:30:06.000Z",
        "needsFormatting": true
      }
    }
  }
}
```

#### **3. LLM工具消息示例**

**LLM原始结果消息:**
```json
{
  "id": "msg-llm-raw-125",
  "conversationId": "conv-456",
  "content": "Step 2 Raw Result: analyze_sentiment\n\n## Sentiment Analysis Report\n\n**Input Text:** \"Hello world!\"\n\n**Analysis Result:**\n- **Sentiment:** Positive 😊\n- **Confidence:** 85%\n- **Key Indicators:** Enthusiastic greeting, exclamation mark\n- **Emotional Tone:** Welcoming and friendly",
  "type": "assistant",
  "intent": "task", 
  "taskId": "task-789",
  "metadata": {
    "stepType": "execution",
    "stepNumber": 2,
    "stepName": "analyze_sentiment",
    "contentType": "raw_result",
    "toolDetails": {
      "toolType": "llm",
      "toolName": "analyze_sentiment",
      "mcpName": null,
      "args": {"text": "Hello world!", "context": "social_media"},
      "expectedOutput": "Sentiment analysis with confidence score",
      "reasoning": "Analyze emotional tone of the retrieved content"
    },
    "executionDetails": {
      "rawResult": "## Sentiment Analysis Report...",
      "success": true,
      "processingInfo": {
        "originalDataSize": 247,
        "processingTime": "2024-01-15T10:30:08.000Z"
      }
    }
  }
}
```

**LLM格式化结果消息（与原始结果相同）:**
```json
{
  "id": "msg-llm-formatted-126",
  "conversationId": "conv-456",
  "content": "Step 2 LLM Result: analyze_sentiment\n\n## Sentiment Analysis Report\n\n**Input Text:** \"Hello world!\"\n\n**Analysis Result:**\n- **Sentiment:** Positive 😊\n- **Confidence:** 85%\n- **Key Indicators:** Enthusiastic greeting, exclamation mark\n- **Emotional Tone:** Welcoming and friendly",
  "type": "assistant",
  "intent": "task",
  "taskId": "task-789", 
  "metadata": {
    "stepType": "execution",
    "stepNumber": 2,
    "stepName": "analyze_sentiment",
    "contentType": "formatted_result",
    "toolDetails": {
      "toolType": "llm",
      "toolName": "analyze_sentiment",
      "mcpName": null,
      "args": {"text": "Hello world!", "context": "social_media"},
      "expectedOutput": "Sentiment analysis with confidence score",
      "reasoning": "Analyze emotional tone of the retrieved content"
    },
    "executionDetails": {
      "formattedResult": "## Sentiment Analysis Report...",
      "success": true,
      "processingInfo": {
        "formattedDataSize": 247,
        "processingTime": "2024-01-15T10:30:09.000Z",
        "needsFormatting": false
      }
    }
  }
}
```

### **ContentType分类**

| ContentType | 用途 | 内容格式 |
|------------|------|---------|
| `raw_result` | 存储MCP/LLM原始返回 | MCP: JSON字符串；LLM: 原始文本 |
| `formatted_result` | 存储格式化后的结果 | MCP: LLM格式化的markdown；LLM: 相同的原始文本 |
| `step_thinking` | 综合思考过程 | 包含推理和结果的混合格式 |

### **MCP vs LLM 工具处理差异**

#### **MCP工具**
- **原始结果**: 结构化JSON数据
- **格式化结果**: 通过LLM格式化成用户友好的markdown
- **需要格式化**: ✅ 是

#### **LLM工具**  
- **原始结果**: 已经是格式化的文本（通常是markdown）
- **格式化结果**: 与原始结果相同，无需再次格式化
- **需要格式化**: ❌ 否

---

## 🔄 **完整事件流程序列（更新版）**

#### **MCP工具事件流程:**
```
1. step_executing        ← 步骤开始，toolDetails中显示调用详情
2. step_raw_result       ← 原始JSON数据，executionDetails中包含工具信息
   ↳ 💾 存储原始结果消息 (contentType: 'raw_result')
3. step_result_chunk     ← 流式格式化过程（多个chunk，将JSON转换为markdown）
4. step_formatted_result ← 完整格式化结果，formattingDetails中包含处理信息
   ↳ 💾 存储格式化结果消息 (contentType: 'formatted_result')
5. step_completed        ← 步骤完成（原有事件）
```

#### **LLM工具事件流程:**
```
1. step_executing        ← 步骤开始，toolDetails中显示调用详情
2. step_raw_result       ← 原始文本数据（已经是markdown格式）
   ↳ 💾 存储原始结果消息 (contentType: 'raw_result')
3. step_result_chunk     ← 跳过（LLM结果无需格式化）
4. step_formatted_result ← 直接使用原始结果作为格式化结果
   ↳ 💾 存储格式化结果消息 (contentType: 'formatted_result', 内容与raw_result相同)
5. step_completed        ← 步骤完成（原有事件）
```

### **存储策略**
- ✅ **实时存储**：每个步骤完成后立即存储两条消息
- ✅ **条件存储**：只有当任务关联到会话时才存储消息
- ✅ **元数据完整**：包含完整的工具调用和执行详情
- ✅ **向后兼容**：保持原有消息结构不变

---

## 📡 **API接口增强**

### **获取会话消息 - 增强版**

**请求:**
```http
GET /api/conversation/:id
```

**响应结构:**
```json
{
  "success": true,
  "data": {
    "conversation": { /* 会话信息 */ },
    "messages": [
      {
        "id": "msg-123",
        "content": "Step 1 Raw Result: searchTweets\n\n{...}",
        "type": "assistant",
        "metadata": {
          "contentType": "raw_result",
          "stepNumber": 1,
          "toolDetails": { /* 工具详情 */ },
          "executionDetails": { /* 执行详情 */ }
        },
        "createdAt": "2024-01-15T10:30:05.000Z"
      },
      {
        "id": "msg-124", 
        "content": "Step 1 Formatted Result: searchTweets\n\n**Latest Tweet:**...",
        "type": "assistant",
        "metadata": {
          "contentType": "formatted_result",
          "stepNumber": 1,
          "toolDetails": { /* 工具详情 */ },
          "executionDetails": { /* 执行详情 */ }
        },
        "createdAt": "2024-01-15T10:30:06.000Z"
      }
    ],
    "lastUsedMcp": [ /* MCP信息 */ ]
  }
}
```

### **按ContentType过滤消息**

前端可以根据`metadata.contentType`字段过滤不同类型的消息：

```typescript
// 获取所有原始结果
const rawResults = messages.filter(msg => 
  msg.metadata?.contentType === 'raw_result'
);

// 获取所有格式化结果
const formattedResults = messages.filter(msg => 
  msg.metadata?.contentType === 'formatted_result'
);

// 按步骤分组
const stepGroups = messages.reduce((acc, msg) => {
  const stepNumber = msg.metadata?.stepNumber;
  if (stepNumber) {
    if (!acc[stepNumber]) acc[stepNumber] = {};
    if (msg.metadata.contentType === 'raw_result') {
      acc[stepNumber].raw = msg;
    } else if (msg.metadata.contentType === 'formatted_result') {
      acc[stepNumber].formatted = msg;
    }
  }
  return acc;
}, {});
```

---

## 🚀 **最佳实践**

### **性能优化**
1. **懒加载**: 大量消息时使用虚拟滚动
2. **缓存策略**: 缓存已解析的步骤数据
3. **分页加载**: 按需加载历史消息xw

### **用户体验**
1. **实时更新**: 使用WebSocket接收流式事件
2. **状态指示**: 显示步骤执行状态（执行中、完成、失败）
3. **数据展示**: 提供原始数据和格式化数据的切换视图

### **错误处理**
1. **数据验证**: 检查消息metadata的完整性
2. **降级显示**: 当数据不完整时提供基础显示
3. **错误边界**: 防止单个步骤错误影响整体显示

---

## 📊 **数据统计**

前端可以基于增强的消息数据提供丰富的统计信息：

```typescript
// 计算执行统计
const getExecutionStats = (messages: Message[]) => {
  const steps = messages.filter(msg => 
    msg.metadata?.contentType === 'raw_result'
  );
  
  const mcpCalls = steps.filter(msg => 
    msg.metadata?.toolDetails?.toolType === 'mcp'
  );
  
  const llmCalls = steps.filter(msg => 
    msg.metadata?.toolDetails?.toolType === 'llm'
  );
  
  const successfulSteps = steps.filter(msg => 
    msg.metadata?.executionDetails?.success
  );
  
  return {
    totalSteps: steps.length,
    mcpCalls: mcpCalls.length,
    llmCalls: llmCalls.length,
    successRate: successfulSteps.length / steps.length,
    averageProcessingTime: calculateAverageTime(steps),
    mcpsUsed: [...new Set(mcpCalls.map(msg => 
      msg.metadata?.toolDetails?.mcpName
    ).filter(Boolean))]
  };
};
```

这个完整的增强系统为Agent执行提供了前所未有的透明度和可观测性！🎯 