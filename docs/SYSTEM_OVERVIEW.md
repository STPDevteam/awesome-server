# MCP-LangChain系统概述

## 1. 系统介绍

MCP-LangChain系统是一个基于Model Context Protocol (MCP)和LangChain的智能任务处理平台。该系统允许用户提交自然语言任务，由AI进行分析并通过各种MCP工具来完成任务，最终向用户交付结果。

系统的核心价值在于：
- 智能理解用户的自然语言需求
- 自动选择最合适的MCP工具组合
- 构建高效的工作流程执行任务
- 提供流式响应，实时返回处理结果

## 2. 系统架构

### 2.1 核心组件

MCP-LangChain系统由以下核心组件构成：

1. **API服务层**：处理HTTP请求，提供RESTful接口
2. **业务逻辑层**：
   - 任务管理（TaskService）
   - MCP工具适配（MCPManager, MCPToolAdapter）
   - 认证服务（AuthService）
3. **AI处理层**：
   - 任务分析服务（TaskAnalysisService）
   - 标题生成服务（TitleGeneratorService）
   - 任务执行服务（TaskExecutorService）
4. **数据存取层**：
   - 任务数据访问（TaskDAO）
   - MCP认证数据访问（MCPAuthDAO）
   - 任务执行数据访问（TaskExecutorDAO）
5. **数据库**：PostgreSQL

### 2.2 技术栈

- 后端：Node.js, Express.js, TypeScript
- 数据库：PostgreSQL
- AI接口：LangChain, OpenAI
- 认证：JWT
- 实时通讯：Server-Sent Events (SSE)

## 3. 功能模块

### 3.1 任务管理模块

- 任务创建：接收用户输入的任务内容，自动生成标题，创建任务记录
- 任务列表：获取用户的所有任务，支持分页、筛选和排序
- 任务详情：获取任务的详细信息和执行步骤

### 3.2 任务分析模块

- 需求分析：拆解任务需求，理解用户意图
- MCP选择：识别并推荐最适合的MCP工具
- 可交付确认：确认系统可以完成的内容范围
- 工作流构建：创建MCP调用顺序的工作流

### 3.3 MCP管理模块

- MCP授权：验证用户对各个MCP的访问权限
- MCP替代：当用户无法访问推荐的MCP时，提供替代选项
- MCP执行：调用各个MCP API，处理输入输出

### 3.4 任务执行模块

- 工作流执行：按照工作流顺序调用MCP
- 结果汇总：整合各MCP的输出结果
- 流式响应：实时返回处理过程和结果

### 3.5 用户认证模块

- JWT认证：基于令牌的用户认证
- 钱包认证：支持Web3钱包登录
- 权限控制：确保用户只能访问自己的资源

## 4. 数据模型

### 4.1 Task（任务）

- id: 唯一标识符
- userId: 用户ID
- title: 任务标题
- content: 任务内容
- status: 任务状态（created, analyzing, in_progress, completed, failed）
- mcpWorkflow: MCP工作流配置（JSON格式）
- result: 任务结果（JSON格式）
- createdAt: 创建时间
- updatedAt: 更新时间
- completedAt: 完成时间

### 4.2 TaskStep（任务步骤）

- id: 唯一标识符
- taskId: 任务ID
- stepType: 步骤类型（analysis, mcp_selection, deliverables, workflow, execution）
- title: 步骤标题
- content: 步骤内容
- reasoning: 推理过程
- reasoningTime: 推理时间（毫秒）
- orderIndex: 步骤顺序索引
- createdAt: 创建时间
- updatedAt: 更新时间

### 4.3 MCPAuth（MCP认证）

- id: 唯一标识符
- userId: 用户ID
- mcpName: MCP名称
- authData: 认证数据（加密存储）
- verified: 是否验证通过
- createdAt: 创建时间
- updatedAt: 更新时间

### 4.4 TaskExecution（任务执行）

- id: 唯一标识符
- taskId: 任务ID
- mcpName: MCP名称
- status: 执行状态
- input: 输入内容
- output: 输出内容
- startTime: 开始时间
- endTime: 结束时间
- error: 错误信息

## 5. 工作流程

### 5.1 任务创建流程

1. 用户提交任务内容
2. 系统生成任务标题（可选，用户可提供）
3. 创建任务记录，状态为"created"
4. 返回任务ID和信息

### 5.2 任务分析流程

1. 用户请求分析任务
2. 系统启动分析过程，更新状态为"analyzing"
3. 执行需求分析，拆解任务需求
4. 识别最相关的MCP工具
5. 确认可交付内容范围
6. 构建MCP工作流
7. 更新任务状态为"in_progress"

### 5.3 MCP授权流程

1. 系统展示需要授权的MCP列表
2. 用户提供MCP的授权信息
3. 系统验证授权有效性
4. 用户可选择保存授权信息供后续使用

### 5.4 任务执行流程

1. 用户请求执行任务
2. 系统检查所有必要MCP是否已授权
3. 按照工作流顺序调用各个MCP
4. 实时返回执行进度和结果
5. 完成后更新任务状态为"completed"
6. 保存最终结果

### 5.5 错误处理流程

1. 任务执行过程中发生错误
2. 系统记录错误信息
3. 尝试恢复或提供替代方案
4. 若无法恢复，标记任务状态为"failed"
5. 通知用户错误原因

## 6. 接口规范

### 6.1 API响应格式

成功响应：
```json
{
  "success": true,
  "data": {
    // 响应数据
  }
}
```

错误响应：
```json
{
  "success": false,
  "error": "错误类型",
  "message": "错误描述",
  "details": {
    // 详细错误信息（可选）
  }
}
```

### 6.2 流式响应格式

使用Server-Sent Events (SSE)，每个事件的数据格式：
```json
{
  "event": "事件类型",
  "data": {
    // 事件数据
  }
}
```

结束标记：
```
data: [DONE]
```

## 7. 扩展性设计

系统设计具有良好的扩展性：

1. **MCP插件化**：可以方便地添加新的MCP工具
2. **分层架构**：明确的职责分离，便于功能扩展
3. **服务化设计**：各模块可独立扩展或替换
4. **API兼容性**：保持稳定的API接口，兼容前端变化 