# 智能工作流引擎集成说明

## 概述

本项目已成功集成智能工作流引擎，实现了 **LLM ↔ MCP 动态切换** 的能力，同时保持了前端接口的完全兼容性。

## 🎛️ 全局开关控制

### 位置
- **任务分析服务**: `src/services/llmTasks/taskAnalysisService.ts` 第 21 行
- **任务执行服务**: `src/services/taskExecutorService.ts` 第 22 行

```typescript
// 🎛️ 智能工作流全局开关 - 设置为false可快速回退到原有流程
const ENABLE_INTELLIGENT_WORKFLOW = true;
```

### 使用方法
- **启用智能工作流**: 设置 `ENABLE_INTELLIGENT_WORKFLOW = true`
- **禁用智能工作流**: 设置 `ENABLE_INTELLIGENT_WORKFLOW = false`
- 修改后重启服务即可生效

## 🔄 工作流程

### 任务分析流程
1. **传统流程**: 4个固定步骤（需求分析 → MCP选择 → 交付确认 → 工作流构建）
2. **智能流程**: Plan-Act-Observe 微循环，动态决策每一步

### 任务执行流程
1. **传统流程**: 执行预定义的MCP工作流
2. **智能流程**: 没有预定义工作流时，自动使用智能工作流引擎

## 📋 触发条件

### 智能分析触发条件
满足以下任一条件会触发智能工作流分析：
- 包含复杂推理关键词：`分析`、`比较`、`对比`、`评估`、`研究`、`调研`、`总结`、`整理`、`归纳`、`综合`、`深入`、`详细`
- 包含英文关键词：`analyze`、`compare`、`evaluate`、`research`、`summarize`、`comprehensive`、`detailed`、`investigate`
- 任务内容长度 > 100 字符
- 任务包含多个句子（以标点符号分割 > 3）

### 智能执行触发条件
满足以下任一条件会触发智能工作流执行：
- 没有预定义的MCP工作流
- 包含复杂推理关键词（同上）
- 任务内容长度 > 50 字符
- 任务包含多个句子（以标点符号分割 > 2）

## 🔌 前端接口兼容性

### 完全兼容的接口
- ✅ `POST /api/task` - 任务创建
- ✅ `POST /api/task/:id/analyze/stream` - 任务分析
- ✅ `POST /api/task/:id/execute/stream` - 任务执行
- ✅ `GET /api/task/:id` - 任务详情
- ✅ `GET /api/task` - 任务列表

### 返回结构保持不变
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "string",
      "title": "string",
      "content": "string",
      "status": "string",
      "userId": "string",
      "mcpWorkflow": {
        "mcps": [...],
        "workflow": [...]
      }
    },
    "steps": [...]
  }
}
```

### 流式事件格式保持不变
- `analysis_start` - 分析开始
- `status_update` - 状态更新
- `step_start` - 步骤开始
- `step_complete` - 步骤完成
- `analysis_complete` - 分析完成
- `execution_start` - 执行开始
- `workflow_complete` - 工作流完成
- `task_complete` - 任务完成

## 🧠 智能工作流引擎特性

### Plan-Act-Observe 微循环
1. **Planner (LLM)**: 分析当前状态，决定下一步行动
2. **Executor**: 执行计划（调用MCP工具或LLM能力）
3. **Observer (LLM)**: 观察结果，判断是否继续

### 动态能力切换
- **需要外部数据** → 自动选择MCP工具
- **需要分析推理** → 使用LLM能力
- **MCP调用失败** → 智能回退到LLM
- **支持模式**: `llm-mcp-mcp-llm-mcp-mcp-llm`

### LLM内置能力
- `llm.analyze` - 分析推理
- `llm.compare` - 内容比较
- `llm.summarize` - 信息总结
- `llm.format` - 格式化输出
- `llm.translate` - 文本翻译
- `llm.extract` - 信息提取

## 🔧 开发和调试

### 测试脚本
```bash
# 运行集成测试
cd test
node test-intelligent-workflow-integration.js
```

### 日志监控
智能工作流会输出详细的日志：
- `🧠 使用智能工作流引擎进行任务分析`
- `📊 使用传统分析流程`
- `⚡ 智能执行步骤 X`
- `✅ 智能任务执行完成`

### 故障排除
1. **智能工作流失败** → 自动降级到传统流程
2. **MCP连接失败** → 使用LLM替代能力
3. **LLM调用超时** → 重试机制
4. **紧急回退** → 设置 `ENABLE_INTELLIGENT_WORKFLOW = false`

## 📊 性能优化

### 智能缓存
- 相似任务的分析结果会被缓存
- MCP工具列表缓存避免重复获取
- LLM响应缓存减少API调用

### 并发控制
- 最大并发任务数限制
- 智能队列管理
- 资源使用监控

### 超时控制
- 单步执行超时：30秒
- 整体工作流超时：5分钟
- LLM调用超时：15秒

## 🚀 部署注意事项

### 环境变量
确保以下环境变量已配置：
- `OPENAI_API_KEY` - OpenAI API密钥
- `TASK_ANALYSIS_MODEL` - 任务分析模型（默认: gpt-4o）
- `HTTPS_PROXY` - 代理设置（如需要）

### 数据库
智能工作流使用现有的数据库表，无需额外迁移。

### 监控
建议监控以下指标：
- 智能工作流成功率
- 平均执行时间
- LLM API调用次数
- MCP工具使用情况

## 📈 未来扩展

### 计划功能
- [ ] 工作流模板库
- [ ] 用户偏好学习
- [ ] 多模态输入支持
- [ ] 自定义LLM能力
- [ ] 工作流可视化编辑器

### 集成计划
- [ ] 与更多MCP服务集成
- [ ] 支持自定义工具
- [ ] 多语言支持
- [ ] 实时协作功能

---

## 💡 开发者提示

1. **前端开发者**: 无需修改任何代码，所有接口保持兼容
2. **后端开发者**: 可通过全局开关快速启用/禁用智能工作流
3. **运维人员**: 监控日志中的智能工作流标识，确保系统正常运行
4. **产品经理**: 智能工作流提供更好的用户体验，同时保持系统稳定性

**关键优势**: 这是一个真正的零侵入式集成，既提供了强大的智能能力，又保持了系统的稳定性和兼容性。 