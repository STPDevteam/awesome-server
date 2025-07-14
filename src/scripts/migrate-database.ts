import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

async function migrateDatabase() {
  try {
    logger.info('Starting database migration...');

    // 创建表的SQL语句
    const createTablesSQL = `
      -- 创建用户表
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        avatar TEXT,
        wallet_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
      );

      -- 创建对话表
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        last_message_content TEXT,
        last_message_at TIMESTAMP,
        task_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- 创建任务表
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'created',
        task_type VARCHAR(50) DEFAULT 'mcp', -- 新增：任务类型字段
        agent_id VARCHAR(255), -- 新增：Agent ID字段
        mcp_workflow JSONB,
        result JSONB,
        conversation_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      -- 创建任务步骤表
      CREATE TABLE IF NOT EXISTS task_steps (
        id VARCHAR(255) PRIMARY KEY,
        task_id VARCHAR(255) NOT NULL,
        step_type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        reasoning TEXT,
        reasoning_time INTEGER,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- 创建消息表
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        conversation_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        intent VARCHAR(50),
        task_id VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      -- 创建MCP认证表
      CREATE TABLE IF NOT EXISTS mcp_auth (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        mcp_name VARCHAR(255) NOT NULL,
        auth_data JSONB NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, mcp_name),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- 创建Agent表
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255),
        avatar TEXT,
        agent_avatar TEXT,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'private',
        task_id VARCHAR(255),
        categories JSONB DEFAULT '["General"]',
        mcp_workflow JSONB,
        metadata JSONB,
        related_questions JSONB,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP,
        deleted_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      -- 创建Agent使用记录表
      CREATE TABLE IF NOT EXISTS agent_usage (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        task_id VARCHAR(255),
        conversation_id VARCHAR(255),
        execution_result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      -- 创建Agent收藏表
      CREATE TABLE IF NOT EXISTS agent_favorites (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, agent_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type); -- 新增：任务类型索引
      CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id); -- 新增：Agent ID索引
      CREATE INDEX IF NOT EXISTS idx_tasks_conversation_id ON tasks(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_steps_order_index ON task_steps(order_index);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_mcp_auth_user_id ON mcp_auth(user_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_auth_mcp_name ON mcp_auth(mcp_name);
      CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_categories ON agents USING GIN(categories);
      CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_id ON agent_usage(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_usage_user_id ON agent_usage(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_favorites_user_id ON agent_favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_favorites_agent_id ON agent_favorites(agent_id);
    `;

    // 执行迁移
    await db.query(createTablesSQL);

    // 检查并添加新字段（如果表已存在但字段不存在）
    const addNewFieldsSQL = `
      -- 添加task_type字段（如果不存在）
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'task_type') THEN
          ALTER TABLE tasks ADD COLUMN task_type VARCHAR(50) DEFAULT 'mcp';
        END IF;
      END $$;

      -- 添加agent_id字段（如果不存在）
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'agent_id') THEN
          ALTER TABLE tasks ADD COLUMN agent_id VARCHAR(255);
        END IF;
      END $$;

      -- 添加外键约束（如果不存在）
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_agent_id_fkey') THEN
          ALTER TABLE tasks ADD CONSTRAINT tasks_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
        END IF;
      END $$;

      -- 添加索引（如果不存在）
      CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
    `;

    await db.query(addNewFieldsSQL);

    logger.info('Database migration completed successfully!');
  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  }
}

// 如果直接运行此脚本，则执行迁移
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      logger.info('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateDatabase }; 