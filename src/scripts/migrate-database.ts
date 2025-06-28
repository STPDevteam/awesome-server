import { db } from '../config/database.js';

interface Migration {
  version: number;
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

class MigrationService {
  private migrations: Migration[] = [
    {
      version: 1,
      name: 'create_users_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            username VARCHAR(255),
            avatar TEXT,
            wallet_address VARCHAR(255),
            balance VARCHAR(255),
            email VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_login_at TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN DEFAULT true
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_users_wallet_address 
          ON users(wallet_address) 
          WHERE wallet_address IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_users_email 
          ON users(email) 
          WHERE email IS NOT NULL
        `);

        console.log('✅ Created users table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS users CASCADE');
        console.log('✅ Dropped users table');
      }
    },
    {
      version: 2,
      name: 'create_user_login_methods_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS user_login_methods (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            method_type VARCHAR(50) NOT NULL CHECK (method_type IN ('wallet', 'google', 'github')),
            method_data JSONB NOT NULL,
            verified BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, method_type)
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_user_login_methods_user_id 
          ON user_login_methods(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_user_login_methods_type 
          ON user_login_methods(method_type)
        `);

        // 为不同登录方式的特定字段创建表达式索引（BTREE）
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_user_login_methods_wallet_address 
          ON user_login_methods ((method_data->>'address')) 
          WHERE method_type = 'wallet'
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_user_login_methods_google_id 
          ON user_login_methods ((method_data->>'googleId')) 
          WHERE method_type = 'google'
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_user_login_methods_github_id 
          ON user_login_methods ((method_data->>'githubId')) 
          WHERE method_type = 'github'
        `);

        console.log('✅ Created user_login_methods table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS user_login_methods CASCADE');
        console.log('✅ Dropped user_login_methods table');
      }
    },
    {
      version: 3,
      name: 'create_refresh_tokens_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            token_hash VARCHAR(255) NOT NULL UNIQUE,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            revoked_at TIMESTAMP WITH TIME ZONE,
            is_revoked BOOLEAN DEFAULT false
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id 
          ON refresh_tokens(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at 
          ON refresh_tokens(expires_at)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash 
          ON refresh_tokens(token_hash)
        `);

        console.log('✅ Created refresh_tokens table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS refresh_tokens CASCADE');
        console.log('✅ Dropped refresh_tokens table');
      }
    },
    {
      version: 4,
      name: 'create_migrations_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS migrations (
            version INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ Created migrations table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS migrations CASCADE');
        console.log('✅ Dropped migrations table');
      }
    },
    {
      version: 5,
      name: 'add_user_membership_fields',
      up: async () => {
        await db.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS membership_type VARCHAR(10) CHECK (membership_type IN ('plus', 'pro')),
          ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(10) CHECK (subscription_type IN ('monthly', 'yearly')),
          ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMP WITH TIME ZONE
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_users_membership_type 
          ON users(membership_type) 
          WHERE membership_type IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_users_membership_expires_at 
          ON users(membership_expires_at) 
          WHERE membership_expires_at IS NOT NULL
        `);

        console.log('✅ Added membership fields to users table');
      },
      down: async () => {
        await db.query(`
          ALTER TABLE users 
          DROP COLUMN IF EXISTS membership_type,
          DROP COLUMN IF EXISTS subscription_type,
          DROP COLUMN IF EXISTS membership_expires_at
        `);
        console.log('✅ Removed membership fields from users table');
      }
    },
    {
      version: 6,
      name: 'create_payments_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS payments (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            charge_id VARCHAR(255) NOT NULL UNIQUE,
            membership_type VARCHAR(10) NOT NULL CHECK (membership_type IN ('plus', 'pro')),
            subscription_type VARCHAR(10) NOT NULL CHECK (subscription_type IN ('monthly', 'yearly')),
            amount VARCHAR(50) NOT NULL,
            currency VARCHAR(10) NOT NULL CHECK (currency IN ('USDT', 'USDC')),
            status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'expired', 'resolved')),
            expires_at TIMESTAMP WITH TIME ZONE,
            confirmed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_payments_user_id 
          ON payments(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_payments_charge_id 
          ON payments(charge_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_payments_status 
          ON payments(status)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_payments_created_at 
          ON payments(created_at)
        `);

        console.log('✅ Created payments table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS payments CASCADE');
        console.log('✅ Dropped payments table');
      }
    },
    {
      version: 7,
      name: 'create_tasks_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS tasks (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'completed', 'failed')),
            mcp_workflow JSONB, -- 存储MCP工作流配置
            result JSONB, -- 存储任务执行结果
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_tasks_user_id 
          ON tasks(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_tasks_status 
          ON tasks(status)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_tasks_created_at 
          ON tasks(created_at)
        `);

        console.log('✅ Created tasks table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS tasks CASCADE');
        console.log('✅ Dropped tasks table');
      }
    },
    {
      version: 8,
      name: 'create_task_steps_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS task_steps (
            id VARCHAR(255) PRIMARY KEY,
            task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            step_type VARCHAR(100) NOT NULL, -- 步骤类型，如 'analysis', 'mcp_selection', 'deliverables', 'workflow'
            title VARCHAR(255) NOT NULL, -- 步骤标题
            content TEXT, -- 步骤内容
            reasoning TEXT, -- LLM推理过程
            reasoning_time INTEGER, -- 推理用时（毫秒）
            order_index INTEGER NOT NULL, -- 步骤顺序
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_task_steps_task_id 
          ON task_steps(task_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_task_steps_order 
          ON task_steps(order_index)
        `);

        console.log('✅ Created task_steps table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS task_steps CASCADE');
        console.log('✅ Dropped task_steps table');
      }
    },
    {
      version: 9,
      name: 'create_mcp_auth_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS mcp_auth (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mcp_name VARCHAR(100) NOT NULL,
            auth_data JSONB NOT NULL DEFAULT '{}',
            is_verified BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, mcp_name)
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_mcp_auth_user_id 
          ON mcp_auth(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_mcp_auth_mcp_name 
          ON mcp_auth(mcp_name)
        `);

        console.log('✅ Created mcp_auth table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS mcp_auth CASCADE');
        console.log('✅ Dropped mcp_auth table');
      }
    },
    {
      version: 10,
      name: 'create_awe_payments_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS awe_payments (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            membership_type VARCHAR(10) NOT NULL CHECK (membership_type IN ('plus', 'pro')),
            subscription_type VARCHAR(10) NOT NULL CHECK (subscription_type IN ('monthly', 'yearly')),
            amount VARCHAR(50) NOT NULL, -- AWE代币数量
            amount_in_wei VARCHAR(100) NOT NULL, -- Wei单位的数量
            usd_value VARCHAR(50) NOT NULL, -- USD价值
            status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
            transaction_hash VARCHAR(100),
            block_number INTEGER,
            from_address VARCHAR(100),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            confirmed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_payments_user_id 
          ON awe_payments(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_payments_status 
          ON awe_payments(status)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_payments_amount_in_wei 
          ON awe_payments(amount_in_wei)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_payments_transaction_hash 
          ON awe_payments(transaction_hash) 
          WHERE transaction_hash IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_payments_created_at 
          ON awe_payments(created_at)
        `);

        console.log('✅ Created awe_payments table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS awe_payments CASCADE');
        console.log('✅ Dropped awe_payments table');
      }
    },
    {
      version: 11,
      name: 'create_conversations_and_messages_tables',
      up: async () => {
        // 创建对话表
        await db.query(`
          CREATE TABLE IF NOT EXISTS conversations (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            last_message_content TEXT,
            last_message_at TIMESTAMP WITH TIME ZONE,
            task_count INTEGER NOT NULL DEFAULT 0,
            message_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_conversations_user_id 
          ON conversations(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
          ON conversations(last_message_at) 
          WHERE last_message_at IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_conversations_created_at 
          ON conversations(created_at)
        `);

        // 创建消息表
        await db.query(`
          CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(255) PRIMARY KEY,
            conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            type VARCHAR(20) NOT NULL CHECK (type IN ('user', 'assistant', 'system')),
            intent VARCHAR(20) CHECK (intent IN ('chat', 'task', 'unknown')),
            task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
          ON messages(conversation_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_task_id 
          ON messages(task_id) 
          WHERE task_id IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_type 
          ON messages(type)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_intent 
          ON messages(intent) 
          WHERE intent IS NOT NULL
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_created_at 
          ON messages(created_at)
        `);

        console.log('✅ Created conversations and messages tables');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS messages CASCADE');
        await db.query('DROP TABLE IF EXISTS conversations CASCADE');
        console.log('✅ Dropped conversations and messages tables');
      }
    },
    {
      version: 12,
      name: 'add_conversation_id_to_tasks',
      up: async () => {
        // 向任务表添加对话ID字段
        await db.query(`
          ALTER TABLE tasks
          ADD COLUMN conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE SET NULL
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_tasks_conversation_id 
          ON tasks(conversation_id)
          WHERE conversation_id IS NOT NULL
        `);

        console.log('✅ Added conversation_id column to tasks table');
      },
      down: async () => {
        // 删除外键约束和列
        await db.query(`
          ALTER TABLE tasks
          DROP COLUMN IF EXISTS conversation_id
        `);
        console.log('✅ Dropped conversation_id column from tasks table');
      }
    },
    {
      version: 13,
      name: 'create_awe_price_locks_table',
      up: async () => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS awe_price_locks (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            membership_type VARCHAR(10) NOT NULL CHECK (membership_type IN ('plus', 'pro')),
            subscription_type VARCHAR(10) NOT NULL CHECK (subscription_type IN ('monthly', 'yearly')),
            awe_amount VARCHAR(50) NOT NULL,
            awe_amount_in_wei VARCHAR(100) NOT NULL,
            usd_price VARCHAR(50) NOT NULL,
            awe_usd_price DECIMAL(20, 10) NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            used BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_price_locks_user_id 
          ON awe_price_locks(user_id)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_price_locks_expires_at 
          ON awe_price_locks(expires_at)
        `);

        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_awe_price_locks_used 
          ON awe_price_locks(used)
        `);

        console.log('✅ Created awe_price_locks table');
      },
      down: async () => {
        await db.query('DROP TABLE IF EXISTS awe_price_locks CASCADE');
        console.log('✅ Dropped awe_price_locks table');
      }
    },
    {
      version: 14,
      name: 'optimize_messages_for_task_steps',
      up: async () => {
        // 为任务步骤消息优化索引
        // 添加元数据字段的GIN索引，支持高效的JSONB查询
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin 
          ON messages USING GIN (metadata)
        `);

        // 为步骤类型创建表达式索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_step_type 
          ON messages ((metadata->>'stepType'))
          WHERE metadata->>'stepType' IS NOT NULL
        `);

        // 为任务阶段创建表达式索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_task_phase 
          ON messages ((metadata->>'taskPhase'))
          WHERE metadata->>'taskPhase' IS NOT NULL
        `);

        // 为步骤编号创建表达式索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_step_number 
          ON messages (((metadata->>'stepNumber')::INTEGER))
          WHERE metadata->>'stepNumber' IS NOT NULL
        `);

        // 为完成状态创建表达式索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_is_complete 
          ON messages (((metadata->>'isComplete')::BOOLEAN))
          WHERE metadata->>'isComplete' IS NOT NULL
        `);

        // 为流式状态创建表达式索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_is_streaming 
          ON messages (((metadata->>'isStreaming')::BOOLEAN))
          WHERE metadata->>'isStreaming' IS NOT NULL
        `);

        // 复合索引：对话ID + 任务ID + 步骤类型（用于快速查询特定任务的步骤消息）
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_task_step 
          ON messages (conversation_id, task_id, (metadata->>'stepType'))
          WHERE task_id IS NOT NULL AND metadata->>'stepType' IS NOT NULL
        `);

        // 复合索引：对话ID + 任务阶段 + 步骤编号（用于按阶段和顺序查询）
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_phase_step_number 
          ON messages (conversation_id, (metadata->>'taskPhase'), ((metadata->>'stepNumber')::INTEGER))
          WHERE metadata->>'taskPhase' IS NOT NULL AND metadata->>'stepNumber' IS NOT NULL
        `);

        console.log('✅ Optimized messages table for task step storage');
      },
      down: async () => {
        // 删除为任务步骤添加的索引
        await db.query('DROP INDEX IF EXISTS idx_messages_metadata_gin');
        await db.query('DROP INDEX IF EXISTS idx_messages_step_type');
        await db.query('DROP INDEX IF EXISTS idx_messages_task_phase');
        await db.query('DROP INDEX IF EXISTS idx_messages_step_number');
        await db.query('DROP INDEX IF EXISTS idx_messages_is_complete');
        await db.query('DROP INDEX IF EXISTS idx_messages_is_streaming');
        await db.query('DROP INDEX IF EXISTS idx_messages_conversation_task_step');
        await db.query('DROP INDEX IF EXISTS idx_messages_conversation_phase_step_number');
        console.log('✅ Removed task step optimization indexes from messages table');
      }
    },
    {
      version: 15,
      name: 'add_updated_at_to_messages',
      up: async () => {
        // 向消息表添加updated_at字段
        await db.query(`
          ALTER TABLE messages
          ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        `);

        // 创建索引
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_updated_at 
          ON messages(updated_at)
        `);

        console.log('✅ Added updated_at column to messages table');
      },
      down: async () => {
        // 删除updated_at字段
        await db.query(`
          ALTER TABLE messages
          DROP COLUMN IF EXISTS updated_at
        `);
        console.log('✅ Dropped updated_at column from messages table');
      }
    }
  ];

  async getCurrentVersion(): Promise<number> {
    try {
      // 先确保 migrations 表存在
      await db.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const result = await db.query('SELECT MAX(version) as version FROM migrations');
      return result.rows[0]?.version || 0;
    } catch (error) {
      return 0;
    }
  }

  async runMigrations(): Promise<void> {
    console.log('🚀 Starting database migrations...');
    
    const currentVersion = await this.getCurrentVersion();
    console.log(`📊 Current database version: ${currentVersion}`);
    
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date');
      return;
    }

    console.log(`📝 Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      console.log(`⏳ Running migration ${migration.version}: ${migration.name}`);
      
      try {
        await migration.up();
        
        // 记录迁移
        await db.query(
          'INSERT INTO migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
          [migration.version, migration.name]
        );
        
        console.log(`✅ Migration ${migration.version} completed`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully!');
  }

  async rollback(targetVersion: number): Promise<void> {
    console.log(`🔄 Rolling back to version ${targetVersion}...`);
    
    const currentVersion = await this.getCurrentVersion();
    
    if (targetVersion >= currentVersion) {
      console.log('✅ Already at or below target version');
      return;
    }

    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // 降序，从高版本开始回滚

    for (const migration of migrationsToRollback) {
      console.log(`⏳ Rolling back migration ${migration.version}: ${migration.name}`);
      
      try {
        await migration.down();
        
        // 删除迁移记录
        await db.query('DELETE FROM migrations WHERE version = $1', [migration.version]);
        
        console.log(`✅ Migration ${migration.version} rolled back`);
      } catch (error) {
        console.error(`❌ Rollback of migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('🎉 Rollback completed successfully!');
  }
}

export const migrationService = new MigrationService();

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const version = process.argv[3] ? parseInt(process.argv[3]) : undefined;

  switch (command) {
    case 'up':
      migrationService.runMigrations()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Migration failed:', error);
          process.exit(1);
        });
      break;
    
    case 'down':
      if (version === undefined) {
        console.error('Please specify target version for rollback');
        process.exit(1);
      }
      migrationService.rollback(version)
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Rollback failed:', error);
          process.exit(1);
        });
      break;
    
    default:
      console.log('Usage: npm run migrate [up|down] [version]');
      console.log('  up: Run pending migrations');
      console.log('  down <version>: Rollback to specific version');
      process.exit(1);
  }
} 