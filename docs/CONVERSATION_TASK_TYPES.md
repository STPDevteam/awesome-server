# 会话类型和任务标签功能

## 概述

为了更好地区分不同类型的会话和任务，系统现在支持：

1. **会话类型区分**：区分正常会话和Agent会话
2. **任务标签**：在任务标题前自动添加类型标签

## 1. 会话类型 (ConversationType)

### 类型定义
```typescript
enum ConversationType {
  NORMAL = 'normal',   // 正常会话
  AGENT = 'agent'      // Agent会话
}
```

### 数据库字段
```sql
-- conversations表新增字段
ALTER TABLE conversations ADD COLUMN type VARCHAR(50) DEFAULT 'normal';
ALTER TABLE conversations ADD COLUMN agent_id VARCHAR(255);
```

### 会话对象结构
```typescript
interface Conversation {
  id: string;
  userId: string;
  title: string;
  type: ConversationType;  // 新增：会话类型
  agentId?: string;        // 新增：Agent ID（如果是Agent会话）
  // ... 其他字段
}
```

## 2. 任务标签

### 标签规则
- **MCP任务**：标题前添加 `【流程】` 标签
- **Agent任务**：标题前添加 `【机器人】` 标签

### 示例
```
原始标题: "Analyze cryptocurrency prices"
MCP任务: "【流程】Analyze cryptocurrency prices"
Agent任务: "【机器人】Analyze cryptocurrency prices"
```

## 3. 前端识别方法

### 识别会话类型
```javascript
// 方法1：通过type字段
const isAgentConversation = conversation.type === 'agent';

// 方法2：通过agentId字段
const isAgentConversation = !!conversation.agentId;
```

### 识别任务类型
```javascript
// 方法1：通过taskType字段
const isAgentTask = task.taskType === 'agent';

// 方法2：通过标题标签
const isAgentTask = task.title.startsWith('【机器人】');
const isMcpTask = task.title.startsWith('【流程】');
```

## 4. API接口更新

### 获取会话列表
```
GET /api/conversation?type=normal  // 获取正常会话
GET /api/conversation?type=agent   // 获取Agent会话
GET /api/conversation              // 获取所有会话
```

### 会话响应示例
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv-123",
        "title": "Regular Chat",
        "type": "normal",
        "agentId": null
      },
      {
        "id": "conv-456",
        "title": "Crypto Analysis Discussion", 
        "type": "agent",
        "agentId": "agent-789"
      }
    ]
  }
}
```

### 任务响应示例
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "task-123",
        "title": "【流程】Analyze market trends",
        "taskType": "mcp",
        "agentId": null
      },
      {
        "id": "task-456", 
        "title": "【机器人】Generate crypto report",
        "taskType": "agent",
        "agentId": "agent-789"
      }
    ]
  }
}
```

## 5. 迁移说明

### 数据库迁移
运行迁移脚本以添加新字段：
```bash
npm run migrate
```

### 向后兼容
- 现有会话默认类型为 `normal`
- 现有任务会根据 `taskType` 字段自动添加相应标签
- 支持从旧的标题格式中提取Agent ID（向后兼容）

## 6. 前端集成示例

### 会话列表显示
```javascript
function renderConversation(conversation) {
  const icon = conversation.type === 'agent' ? '🤖' : '💬';
  const typeLabel = conversation.type === 'agent' ? 'Agent' : 'Chat';
  
  return `
    <div class="conversation-item">
      <span class="icon">${icon}</span>
      <span class="title">${conversation.title}</span>
      <span class="type">${typeLabel}</span>
    </div>
  `;
}
```

### 任务列表显示
```javascript
function renderTask(task) {
  const isAgent = task.taskType === 'agent';
  const className = isAgent ? 'agent-task' : 'mcp-task';
  
  return `
    <div class="task-item ${className}">
      <span class="title">${task.title}</span>
      <span class="type">${task.taskType}</span>
    </div>
  `;
}
```

## 7. 测试

运行测试以验证功能：
```bash
node test/test-conversation-task-types.js
```

这将测试：
- 会话类型区分
- 任务标签正确性
- 前端识别逻辑 