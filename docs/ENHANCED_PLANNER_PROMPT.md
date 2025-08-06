# 增强版Agent规划提示词优化

## 🎯 优化目标

优化Agent智能引擎的规划提示词(`buildEnhancedAgentPlannerPrompt`)，使其更加简洁、清晰、高效，同时保持JSON返回格式不变。

## 🔧 核心改进

### **1. 结构化清晰**

**优化前**: 信息散乱，重复描述
**优化后**: 清晰的分段结构

```markdown
## 🎯 Agent Profile          # Agent身份和使命
## 📊 Current Status         # 当前执行状态  
## ✅ Last Success / ⚠️ Failed  # 上次结果分析
## 🔧 Failure Recovery       # 失败恢复策略
## 🛠️ Available Tools        # 可用工具简览
## 🧠 Intelligent Decision   # 决策框架
## 📋 Decision Rules         # 决策规则
## 🎯 Output Format          # 输出格式
```

### **2. 信息密度优化**

**压缩冗余信息**:
```markdown
# 优化前 (冗长)
**AVAILABLE MCP SERVICES FOR AGENT_NAME**:
- MCP Service: twitter-client-mcp
  Description: General purpose tool
  Available Tools: getUserTweets, sendTweet, searchTweets
  Tool Details:
    * getUserTweets: Get user tweets
    * sendTweet: Send a tweet
    * searchTweets: Search tweets

# 优化后 (简洁)
## 🛠️ Available Tools
**twitter-client-mcp**: getUserTweets, sendTweet, searchTweets
**github-mcp**: getRepo, createIssue, searchCode
```

### **3. 智能决策框架**

**优化前**: 分散的决策逻辑
**优化后**: 结构化的三步决策框架

```markdown
## 🧠 Intelligent Decision Framework

**Step 1: Assess Current State**
- Is the user's request already satisfied with existing data?
- What specific information or action is still needed?

**Step 2: Choose Optimal Tool**  
- 🚨 NEVER repeat the same tool if last step succeeded
- Select the most direct tool for the remaining need
- Consider alternative tools if primary tool failed

**Step 3: Plan Execution**
- Use existing data from dataStore when applicable
- Ensure parameters match the tool's requirements
- Focus on completing the user's core request
```

### **4. 精简决策规则**

**5条核心决策规则**:
1. **Success → Progress**: 成功则推进
2. **Failure → Alternative**: 失败则替代
3. **Data Available → Analysis**: 有数据则分析
4. **Missing Data → Collection**: 缺数据则收集
5. **Request Complete → Conclude**: 完成则结束

### **5. 动态状态感知**

**智能状态判断**:
```typescript
${lastStepResult?.success ? `
## ✅ Last Success
**Tool**: ${lastStepResult.plan.tool}
**Result**: Data successfully obtained
**Next**: Build on this result (DO NOT repeat same tool)
` : lastStepResult ? `
## ⚠️ Last Attempt Failed
**Tool**: ${lastStepResult.plan.tool}
**Error**: ${lastStepResult.error}
**Strategy**: Try alternative approach
` : ''}
```

## 📊 优化效果对比

| 维度 | 优化前 | 优化后 |
|------|--------|--------|
| **提示词长度** | ~1200 tokens | ~800 tokens |
| **信息密度** | 低，重复多 | 高，精炼 |
| **决策清晰度** | 分散，模糊 | 结构化，明确 |
| **视觉组织** | 混乱 | 清晰分段 |
| **Agent身份** | 弱化 | 强化专业性 |
| **错误处理** | 冗长描述 | 简洁策略 |

## 🎯 关键保留特性

### **1. JSON格式完全保持**
```json
{
  "tool": "exact-function-name",
  "toolType": "mcp" or "llm", 
  "mcpName": "service-name-from-above",
  "args": {},
  "expectedOutput": "What this accomplishes",
  "reasoning": "Why this is the optimal next step",
  "agentContext": "How this advances the mission"
}
```

### **2. 关键约束保持**
- 🚨 避免重复相同工具（如果上次成功）
- 🔑 tool/mcpName 格式规则严格执行
- 🎯 基于实际状态的智能判断

### **3. Agent身份强化**
- 突出Agent的专业性和使命
- 强调Agent作为决策者的主体性
- 保持Agent上下文的连续性

## 🚀 预期改进效果

### **1. 更快决策**
- 简洁的信息呈现减少LLM处理时间
- 清晰的决策框架提高判断效率

### **2. 更准确规划**
- 结构化的状态信息减少混淆
- 明确的规则减少错误决策

### **3. 更强一致性** 
- 标准化的决策流程提高可预测性
- 清晰的Agent身份保持角色一致性

### **4. 更好维护性**
- 模块化的提示词结构便于调整
- 清晰的逻辑分层便于debug

## 💡 设计原则

1. **简洁性**: 每个信息都有明确目的，无冗余
2. **清晰性**: 视觉层次分明，逻辑结构清晰
3. **一致性**: 术语和格式统一，Agent身份突出
4. **实用性**: 专注于实际决策需要的信息
5. **可维护性**: 模块化结构，便于后续优化

这次优化将Agent的规划能力从"信息堆积"提升为"智能决策"，让Agent能够更高效、更准确地进行下一步规划！ 