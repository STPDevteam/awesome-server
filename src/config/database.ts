import { Pool, PoolConfig, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { types } from 'pg';

dotenv.config();

// 配置PostgreSQL类型解析
// JSONB类型ID为3802
types.setTypeParser(3802, function(val) {
  return val; // 返回原始字符串，让pg自动处理
});

// 配置JSON类型解析
// JSON类型ID为114
types.setTypeParser(114, function(val) {
  return val; // 返回原始字符串，让pg自动处理
});

export interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean; [key: string]: any };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// SSL 配置函数
function getSSLConfig() {
  const nodeEnv = process.env.NODE_ENV;
  const sslMode = process.env.DB_SSL_MODE;
  
  // 如果明确设置为 false，则不使用 SSL
  if (sslMode === 'false' || sslMode === 'disable') {
    return false;
  }
  
  // 如果是测试环境且没有明确要求 SSL，则不使用
  if (nodeEnv === 'test' && !sslMode) {
    return false;
  }
  
  // 如果是生产环境或开发环境，使用 SSL
  if (nodeEnv === 'production' || nodeEnv === 'development' || sslMode === 'require') {
    return {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
  }
  
  return false;
}

export const databaseConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mcp_server',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: getSSLConfig(),
  max: 20, // 最大连接数
  idleTimeoutMillis: 30000, // 空闲超时
  connectionTimeoutMillis: 5000, // 连接超时
};

// 增强的查询结果类型
export interface TypedQueryResult<T = Record<string, any>> extends QueryResult {
  rows: T[];
}

class DatabaseService {
  private pool: Pool;
  
  constructor() {
    this.pool = new Pool(databaseConfig);
    
    // 监听连接错误
    this.pool.on('error', (err: Error) => {
      console.error('PostgreSQL pool error:', err);
    });
    
    // 监听连接事件
    this.pool.on('connect', () => {
      console.log('PostgreSQL connected');
    });
  }

  /**
   * 执行查询
   */
  async query<T = Record<string, any>>(text: string, params?: any[]): Promise<TypedQueryResult<T>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result as TypedQueryResult<T>;
    } finally {
      client.release();
    }
  }

  /**
   * 执行事务
   */
  async transaction<T = Record<string, any>>(queries: Array<{ text: string; params?: any[] }>): Promise<TypedQueryResult<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: TypedQueryResult<T>[] = [];
      
      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result as TypedQueryResult<T>);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 获取连接池状态
   */
  getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * 检查数据库连接
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database connection check failed:', error);
      return false;
    }
  }
}

export const db = new DatabaseService(); 