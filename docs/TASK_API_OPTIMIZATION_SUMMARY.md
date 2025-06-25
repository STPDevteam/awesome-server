# 任务API优化总结

## 问题描述

用户反馈 `/api/task/${id}/analyze` 接口在相同的 prompt 下有时会调用 MCP，有时不会，导致结果不一致。

## 问题分析

经过代码审查，发现问题主要集中在 `TaskAnalysisService` 的 `identifyRelevantMCPs` 方法中：

1. **完全依赖 LLM 选择**：MCP 的选择完全依赖 LLM 的输出，即使温度设置为 0.2，仍然可能有一定的随机性
2. **缺少规则引擎**：没有基于关键词的预筛选机制
3. **错误处理不够健壮**：LLM 响应解析失败时，直接返回空列表，而不是使用备选方案

## 优化方案

### 1. 增加基于关键词的预筛选机制

在 `TaskAnalysisService` 中添加了 `preselectMCPsByKeywords` 方法，实现了完整的关键词映射规则：

```typescript
private preselectMCPsByKeywords(taskContent: string, availableMCPs: MCPInfo[]): MCPInfo[] {
  // 定义关键词映射规则
  const keywordMappings = [
    {
      keywords: ['twitter', 'tweet', 'x平台', '推特'],
      mcpNames: ['x-mcp']
    },
    {
      keywords: ['github', '仓库', '代码库', 'repository'],
      mcpNames: ['github-mcp-server']
    },
    // ... 更多映射规则
  ];
  
  // 基于关键词匹配选择MCP
  // ...
}
```

### 2. 改进 LLM 提示词

强化了 LLM 提示词中的规则，明确要求：
- **优先考虑关键词匹配**
- **列出预选的 MCP 并说明原因**
- **如果不选择预选的 MCP，必须给出充分理由**

### 3. 增加重试机制

- 添加了最多 2 次的重试机制
- 如果 LLM 响应解析失败，会等待 1 秒后重试

### 4. 强化备选方案

- 如果 LLM 分析完全失败，使用基于关键词的备选方案
- 确保预选的 MCP 被包含在最终结果中（除非 LLM 有充分理由排除）

## 改进后的执行流程

1. **关键词预筛选**：首先基于任务内容中的关键词预选相关的 MCP
2. **LLM 智能分析**：将预选结果提供给 LLM，让 LLM 进行更深入的分析和选择
3. **结果校验**：检查 LLM 的选择结果，确保预选的 MCP 被包含
4. **容错处理**：如果 LLM 分析失败，使用基于关键词的备选方案

## 测试验证

创建了专门的测试脚本 `test/test-analyze-consistency.js` 来验证优化效果：

```javascript
// 测试用例示例
const testCases = [
  {
    name: 'Twitter/X任务',
    content: '使用X平台发送一条推文，内容是"Hello from MCP test"',
    expectedMcp: 'x-mcp'
  },
  // ... 更多测试用例
];

// 每个用例运行3次，验证一致性
```

## 预期效果

1. **提高一致性**：相同的任务内容应该始终选择相同的 MCP
2. **降低随机性**：通过关键词预筛选，减少对 LLM 的完全依赖
3. **增强鲁棒性**：即使 LLM 出现问题，仍能基于规则选择合适的 MCP

## 其他接口的稳定性

- **`/api/task/:id/analyze/stream`**：流式分析接口内部调用了优化后的 `identifyRelevantMCPs` 方法，自动受益于优化
- **`/api/task/:id/execute`** 和 **`/api/task/:id/execute/stream`**：执行接口依赖于分析阶段生成的工作流，分析的稳定性提升也会带来执行的稳定性

## 后续建议

1. **监控和日志**：增加更详细的监控，记录每次 MCP 选择的过程和结果
2. **缓存机制**：考虑对相同内容的分析结果进行短期缓存
3. **A/B 测试**：可以同时运行新旧逻辑，比较结果的一致性
4. **扩展关键词库**：根据实际使用情况，持续优化和扩展关键词映射规则

## 总结

通过引入基于规则的预筛选机制，结合 LLM 的智能分析，我们显著提高了任务分析的稳定性和一致性。这种混合方法既保留了 LLM 的灵活性，又通过规则引擎保证了基本的一致性，是一个平衡的解决方案。 