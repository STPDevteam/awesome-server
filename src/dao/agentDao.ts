import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { 
  Agent, 
  CreateAgentRequest, 
  UpdateAgentRequest, 
  GetAgentsQuery, 
  AgentMarketplaceQuery,
  AgentStats,
  AgentUsage,
  AgentStatus,
  AgentFavorite,
  FavoriteAgentRequest 
} from '../models/agent.js';

/**
 * 数据库行记录接口
 */
export interface AgentDbRow {
  id: string;
  user_id: string;
  username: string | null;
  avatar: string | null;
  agent_avatar: string | null; // Agent专用头像
  name: string;
  description: string;
  status: AgentStatus;
  task_id: string | null;
  categories: any; // JSONB数组，存储MCP类别
  mcp_workflow: any;
  metadata: any;
  related_questions: any;
  usage_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
}

/**
 * Agent使用记录数据库行接口
 */
export interface AgentUsageDbRow {
  id: string;
  agent_id: string;
  user_id: string;
  task_id: string | null;
  conversation_id: string | null;
  execution_result: any;
  created_at: string;
}

/**
 * Agent收藏记录数据库行接口
 */
export interface AgentFavoriteDbRow {
  id: string;
  user_id: string;
  agent_id: string;
  created_at: string;
}

export class AgentDao {
  
  /**
   * 创建新的Agent
   */
  async createAgent(request: CreateAgentRequest): Promise<Agent> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      const query = `
        INSERT INTO agents (
          id, user_id, username, avatar, agent_avatar, name, description, status, task_id, categories,
          mcp_workflow, metadata, related_questions, usage_count, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      
      const values = [
        id,
        request.userId,
        request.username || null,
        request.avatar || null,
        request.agentAvatar || null,
        request.name,
        request.description,
        request.status,
        request.taskId || null,
        JSON.stringify(request.categories || ['General']),
        request.mcpWorkflow ? JSON.stringify(request.mcpWorkflow) : null,
        request.metadata ? JSON.stringify(request.metadata) : null,
        request.relatedQuestions ? JSON.stringify(request.relatedQuestions) : null,
        0, // 初始使用次数为0
        now,
        now
      ];
      
      const result = await db.query<AgentDbRow>(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('创建Agent失败');
      }
      
      const agent = this.mapDbRowToAgent(result.rows[0]);
      logger.info(`Agent已创建: ${agent.id} (${agent.name})`);
      
      return agent;
    } catch (error) {
      logger.error('创建Agent失败:', error);
      throw error;
    }
  }
  
  /**
   * 根据ID获取Agent
   */
  async getAgentById(agentId: string): Promise<Agent | null> {
    try {
      const query = `
        SELECT * FROM agents 
        WHERE id = $1 AND is_deleted = FALSE
      `;
      
      const result = await db.query<AgentDbRow>(query, [agentId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapDbRowToAgent(result.rows[0]);
    } catch (error) {
      logger.error(`获取Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 更新Agent
   */
  async updateAgent(agentId: string, request: UpdateAgentRequest): Promise<Agent | null> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (request.name !== undefined) {
        setParts.push(`name = $${paramIndex++}`);
        values.push(request.name);
      }
      
      if (request.description !== undefined) {
        setParts.push(`description = $${paramIndex++}`);
        values.push(request.description);
      }
      
      if (request.status !== undefined) {
        setParts.push(`status = $${paramIndex++}`);
        values.push(request.status);
        
        // 如果状态改为public，设置发布时间
        if (request.status === 'public') {
          setParts.push(`published_at = $${paramIndex++}`);
          values.push(new Date());
        }
      }
      
      if (request.metadata !== undefined) {
        setParts.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(request.metadata));
      }
      
      if (request.relatedQuestions !== undefined) {
        setParts.push(`related_questions = $${paramIndex++}`);
        values.push(JSON.stringify(request.relatedQuestions));
      }
      
      if (setParts.length === 0) {
        // 没有字段需要更新
        return this.getAgentById(agentId);
      }
      
      setParts.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      
      values.push(agentId);
      
      const query = `
        UPDATE agents 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex} AND is_deleted = FALSE
        RETURNING *
      `;
      
      const result = await db.query<AgentDbRow>(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const agent = this.mapDbRowToAgent(result.rows[0]);
      logger.info(`Agent已更新: ${agent.id} (${agent.name})`);
      
      return agent;
    } catch (error) {
      logger.error(`更新Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 软删除Agent
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE agents 
        SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
      `;
      
      const result = await db.query(query, [agentId]);
      
      if (result.rowCount === 0) {
        return false;
      }
      
      logger.info(`Agent已删除: ${agentId}`);
      return true;
    } catch (error) {
      logger.error(`删除Agent失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 获取Agent列表
   */
  async getAgents(query: GetAgentsQuery): Promise<{ agents: Agent[]; total: number }> {
    try {
      let baseQuery = '';
      let conditions: string[] = ['a.is_deleted = FALSE'];
      const values: any[] = [];
      let paramIndex = 1;
      
      // 根据查询类型构建不同的查询
      switch (query.queryType) {
        case 'public':
          // 公开的Agent
          conditions.push(`a.status = 'public'`);
          if (query.userId) {
            baseQuery = `
              SELECT a.*, 
                     CASE WHEN f.id IS NOT NULL THEN TRUE ELSE FALSE END as is_favorited
              FROM agents a
              LEFT JOIN agent_favorites f ON a.id = f.agent_id AND f.user_id = $${paramIndex++}
            `;
            values.push(query.userId);
          } else {
            baseQuery = `
              SELECT a.*, FALSE as is_favorited
              FROM agents a
            `;
          }
          break;
          
        case 'my-private':
          // 我的私有Agent
          if (!query.userId) {
            throw new Error('用户ID是必需的');
          }
          conditions.push(`a.user_id = $${paramIndex++}`);
          conditions.push(`a.status = 'private'`);
          baseQuery = `
            SELECT a.*, FALSE as is_favorited
            FROM agents a
          `;
          values.push(query.userId);
          break;
          
        case 'my-saved':
          // 我收藏的Agent
          if (!query.userId) {
            throw new Error('用户ID是必需的');
          }
          conditions.push(`f.user_id = $${paramIndex++}`);
          conditions.push(`a.status = 'public'`);
          baseQuery = `
            SELECT a.*, TRUE as is_favorited
            FROM agents a
            INNER JOIN agent_favorites f ON a.id = f.agent_id
          `;
          values.push(query.userId);
          break;
          
        case 'all':
        default:
          // 所有可见的Agent（我的私有 + 公开的）
          if (query.userId) {
            conditions.push(`(a.user_id = $${paramIndex++} OR a.status = 'public')`);
            baseQuery = `
              SELECT a.*, 
                     CASE WHEN f.id IS NOT NULL THEN TRUE ELSE FALSE END as is_favorited
              FROM agents a
              LEFT JOIN agent_favorites f ON a.id = f.agent_id AND f.user_id = $${paramIndex++}
            `;
            values.push(query.userId, query.userId);
          } else {
            // 如果没有用户ID，只返回公开的Agent
            conditions.push(`a.status = 'public'`);
            baseQuery = `
              SELECT a.*, FALSE as is_favorited
              FROM agents a
            `;
          }
          break;
      }
      
      // 其他过滤条件
      // 只有在没有预设状态条件时才添加状态过滤
      if (query.status && query.queryType !== 'public' && query.queryType !== 'my-private') {
        // 检查是否已经有状态条件（避免重复）
        const hasStatusCondition = conditions.some(condition => condition.includes('a.status'));
        if (!hasStatusCondition) {
          conditions.push(`a.status = $${paramIndex++}`);
          values.push(query.status);
        }
      }
      
      if (query.search) {
        conditions.push(`(a.name ILIKE $${paramIndex++} OR a.description ILIKE $${paramIndex++})`);
        values.push(`%${query.search}%`, `%${query.search}%`);
      }
      
      if (query.category) {
        conditions.push(`a.metadata->>'category' = $${paramIndex++}`);
        values.push(query.category);
      }
      
      // 构建排序
      const orderBy = query.orderBy || 'created_at';
      const order = query.order || 'desc';
      
      // 为count查询单独构建参数和条件
      let countFromClause = 'FROM agents a';
      let countConditions: string[] = ['a.is_deleted = FALSE'];
      let countValues: any[] = [];
      let countParamIndex = 1;
      
      // 根据查询类型构建count查询的条件
      switch (query.queryType) {
        case 'public':
          countConditions.push(`a.status = 'public'`);
          break;
          
        case 'my-private':
          if (!query.userId) {
            throw new Error('用户ID是必需的');
          }
          countConditions.push(`a.user_id = $${countParamIndex++}`);
          countConditions.push(`a.status = 'private'`);
          countValues.push(query.userId);
          break;
          
        case 'my-saved':
          if (!query.userId) {
            throw new Error('用户ID是必需的');
          }
          countFromClause = 'FROM agents a INNER JOIN agent_favorites f ON a.id = f.agent_id';
          countConditions.push(`f.user_id = $${countParamIndex++}`);
          countConditions.push(`a.status = 'public'`);
          countValues.push(query.userId);
          break;
          
        case 'all':
        default:
          if (query.userId) {
            countConditions.push(`(a.user_id = $${countParamIndex++} OR a.status = 'public')`);
            countValues.push(query.userId);
          } else {
            countConditions.push(`a.status = 'public'`);
          }
          break;
      }
      
      // 添加其他过滤条件到count查询
      if (query.status && query.queryType !== 'public' && query.queryType !== 'my-private') {
        const hasStatusCondition = countConditions.some(condition => condition.includes('a.status'));
        if (!hasStatusCondition) {
          countConditions.push(`a.status = $${countParamIndex++}`);
          countValues.push(query.status);
        }
      }
      
      if (query.search) {
        countConditions.push(`(a.name ILIKE $${countParamIndex++} OR a.description ILIKE $${countParamIndex++})`);
        countValues.push(`%${query.search}%`, `%${query.search}%`);
      }
      
      if (query.category) {
        countConditions.push(`a.metadata->>'category' = $${countParamIndex++}`);
        countValues.push(query.category);
      }
      
      // 获取总数
      const countQuery = `
        SELECT COUNT(*) as total 
        ${countFromClause}
        WHERE ${countConditions.join(' AND ')}
      `;
      
      const countResult = await db.query<{ total: string }>(countQuery, countValues);
      const total = parseInt(countResult.rows[0].total);
      
      // 获取分页数据
      const offset = query.offset || 0;
      const limit = query.limit || 20;
      
      // 为data查询创建新的values数组副本并添加分页参数
      const dataValues = [...values, limit, offset];
      
      const dataQuery = `
        ${baseQuery}
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.${orderBy} ${order}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      const result = await db.query<AgentDbRow & { is_favorited: boolean }>(dataQuery, dataValues);
      
      const agents = result.rows.map(row => {
        const agent = this.mapDbRowToAgent(row);
        agent.isFavorited = row.is_favorited;
        return agent;
      });
      
      return { agents, total };
    } catch (error) {
      logger.error('获取Agent列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取Agent市场数据（仅公开Agent）
   */
  async getAgentMarketplace(query: AgentMarketplaceQuery): Promise<{ agents: Agent[]; total: number }> {
    const marketplaceQuery: GetAgentsQuery = {
      ...query,
      status: 'public'
    };
    
    return this.getAgents(marketplaceQuery);
  }
  
  /**
   * 增加Agent使用次数
   */
  async incrementUsageCount(agentId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE agents 
        SET usage_count = usage_count + 1, updated_at = NOW()
        WHERE id = $1 AND is_deleted = FALSE
      `;
      
      const result = await db.query(query, [agentId]);
      
      if (result.rowCount === 0) {
        return false;
      }
      
      logger.info(`Agent使用次数已增加: ${agentId}`);
      return true;
    } catch (error) {
      logger.error(`增加Agent使用次数失败 [ID: ${agentId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 记录Agent使用
   */
  async recordAgentUsage(agentId: string, userId: string, taskId?: string, conversationId?: string, executionResult?: any): Promise<AgentUsage> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      const query = `
        INSERT INTO agent_usage (
          id, agent_id, user_id, task_id, conversation_id, execution_result, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        id,
        agentId,
        userId,
        taskId || null,
        conversationId || null,
        executionResult ? JSON.stringify(executionResult) : null,
        now
      ];
      
      const result = await db.query<AgentUsageDbRow>(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('记录Agent使用失败');
      }
      
      // 同时增加使用次数
      await this.incrementUsageCount(agentId);
      
      return this.mapDbRowToAgentUsage(result.rows[0]);
    } catch (error) {
      logger.error('记录Agent使用失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取Agent统计信息
   */
  async getAgentStats(userId?: string): Promise<AgentStats> {
    try {
      const conditions = ['is_deleted = FALSE'];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(userId);
      }
      
      const whereClause = conditions.join(' AND ');
      
      // 获取基础统计
      const statsQuery = `
        SELECT 
          COUNT(*) as total_agents,
          COUNT(CASE WHEN status = 'private' THEN 1 END) as private_agents,
          COUNT(CASE WHEN status = 'public' THEN 1 END) as public_agents,
          COALESCE(SUM(usage_count), 0) as total_usage
        FROM agents 
        WHERE ${whereClause}
      `;
      
      const statsResult = await db.query<{
        total_agents: string;
        private_agents: string;
        public_agents: string;
        total_usage: string;
      }>(statsQuery, values);
      
      const stats = statsResult.rows[0];
      
      // 获取分类统计
      const categoriesQuery = `
        SELECT 
          category,
          COUNT(*) as count
        FROM agents, 
             jsonb_array_elements_text(categories) as category
        WHERE ${whereClause} 
        GROUP BY category
        ORDER BY count DESC
        LIMIT 10
      `;
      
      const categoriesResult = await db.query<{
        category: string;
        count: string;
      }>(categoriesQuery, values);
      
      const topCategories = categoriesResult.rows.map(row => ({
        category: row.category,
        count: parseInt(row.count)
      }));
      
      return {
        totalAgents: parseInt(stats.total_agents),
        privateAgents: parseInt(stats.private_agents),
        publicAgents: parseInt(stats.public_agents),
        totalUsage: parseInt(stats.total_usage),
        topCategories
      };
    } catch (error) {
      logger.error('获取Agent统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有分类及其数量统计
   */
  async getAllCategories(): Promise<Array<{ name: string; count: number }>> {
    try {
      // 只统计公开的Agent分类
      const categoriesQuery = `
        SELECT 
          category as name,
          COUNT(*) as count
        FROM agents, 
             jsonb_array_elements_text(categories) as category
        WHERE is_deleted = FALSE AND status = 'public'
        GROUP BY category
        ORDER BY count DESC, category ASC
      `;
      
      const categoriesResult = await db.query<{
        name: string;
        count: string;
      }>(categoriesQuery);
      
      return categoriesResult.rows.map(row => ({
        name: row.name,
        count: parseInt(row.count)
      }));
    } catch (error) {
      logger.error('获取所有分类失败:', error);
      throw error;
    }
  }
  
  /**
   * 检查Agent名称是否已存在（同一用户）
   */
  async isAgentNameExists(userId: string, name: string, excludeId?: string): Promise<boolean> {
    try {
      const conditions = ['user_id = $1', 'name = $2', 'is_deleted = FALSE'];
      const values = [userId, name];
      
      if (excludeId) {
        conditions.push('id != $3');
        values.push(excludeId);
      }
      
      const query = `
        SELECT COUNT(*) as count 
        FROM agents 
        WHERE ${conditions.join(' AND ')}
      `;
      
      const result = await db.query<{ count: string }>(query, values);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('检查Agent名称是否存在失败:', error);
      throw error;
    }
  }
  
  /**
   * 根据任务ID获取Agent
   */
  async getAgentsByTaskId(taskId: string): Promise<Agent[]> {
    try {
      const query = `
        SELECT * FROM agents 
        WHERE task_id = $1 AND is_deleted = FALSE
        ORDER BY created_at DESC
      `;
      
      const result = await db.query<AgentDbRow>(query, [taskId]);
      return result.rows.map(row => this.mapDbRowToAgent(row));
    } catch (error) {
      logger.error(`根据任务ID获取Agent失败 [TaskID: ${taskId}]:`, error);
      throw error;
    }
  }
  
  /**
   * 添加收藏
   */
  async addFavorite(userId: string, agentId: string): Promise<AgentFavorite> {
    try {
      const id = uuidv4();
      const now = new Date();
      
      const query = `
        INSERT INTO agent_favorites (id, user_id, agent_id, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, agent_id) DO NOTHING
        RETURNING *
      `;
      
      const result = await db.query<AgentFavoriteDbRow>(query, [id, userId, agentId, now]);
      
      if (result.rows.length === 0) {
        // 已经收藏过了，获取现有记录
        const existingQuery = `
          SELECT * FROM agent_favorites 
          WHERE user_id = $1 AND agent_id = $2
        `;
        const existingResult = await db.query<AgentFavoriteDbRow>(existingQuery, [userId, agentId]);
        
        if (existingResult.rows.length > 0) {
          return this.mapDbRowToAgentFavorite(existingResult.rows[0]);
        } else {
          throw new Error('收藏失败');
        }
      }
      
      const favorite = this.mapDbRowToAgentFavorite(result.rows[0]);
      logger.info(`Agent收藏成功: ${agentId} by ${userId}`);
      
      return favorite;
    } catch (error) {
      logger.error('添加收藏失败:', error);
      throw error;
    }
  }

  /**
   * 取消收藏
   */
  async removeFavorite(userId: string, agentId: string): Promise<boolean> {
    try {
      const query = `
        DELETE FROM agent_favorites 
        WHERE user_id = $1 AND agent_id = $2
      `;
      
      const result = await db.query(query, [userId, agentId]);
      
      if (result.rowCount === 0) {
        return false;
      }
      
      logger.info(`Agent取消收藏成功: ${agentId} by ${userId}`);
      return true;
    } catch (error) {
      logger.error('取消收藏失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否已收藏
   */
  async isFavorited(userId: string, agentId: string): Promise<boolean> {
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM agent_favorites 
        WHERE user_id = $1 AND agent_id = $2
      `;
      
      const result = await db.query<{ count: string }>(query, [userId, agentId]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('检查收藏状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户收藏的Agent列表
   */
  async getFavoriteAgents(userId: string, offset: number = 0, limit: number = 20): Promise<{ agents: Agent[]; total: number }> {
    try {
      // 获取总数
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM agent_favorites f
        INNER JOIN agents a ON f.agent_id = a.id
        WHERE f.user_id = $1 AND a.is_deleted = FALSE
      `;
      
      const countResult = await db.query<{ total: string }>(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].total);
      
      // 获取分页数据
      const dataQuery = `
        SELECT a.*, TRUE as is_favorited
        FROM agent_favorites f
        INNER JOIN agents a ON f.agent_id = a.id
        WHERE f.user_id = $1 AND a.is_deleted = FALSE
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query<AgentDbRow & { is_favorited: boolean }>(dataQuery, [userId, limit, offset]);
      
      const agents = result.rows.map(row => {
        const agent = this.mapDbRowToAgent(row);
        agent.isFavorited = row.is_favorited;
        return agent;
      });
      
      return { agents, total };
    } catch (error) {
      logger.error('获取收藏Agent列表失败:', error);
      throw error;
    }
  }

  /**
   * 将数据库行映射为AgentFavorite对象
   */
  private mapDbRowToAgentFavorite(row: AgentFavoriteDbRow): AgentFavorite {
    return {
      id: row.id,
      userId: row.user_id,
      agentId: row.agent_id,
      createdAt: new Date(row.created_at)
    };
  }

  /**
   * 将数据库行映射为Agent对象
   */
  private mapDbRowToAgent(row: AgentDbRow): Agent {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username || undefined,
      avatar: row.avatar || undefined,
      agentAvatar: row.agent_avatar || undefined,
      name: row.name,
      description: row.description,
      status: row.status,
      taskId: row.task_id || undefined,
      categories: row.categories ? JSON.parse(row.categories) : ['General'],
      mcpWorkflow: row.mcp_workflow ? JSON.parse(row.mcp_workflow) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      relatedQuestions: row.related_questions ? JSON.parse(row.related_questions) : undefined,
      usageCount: row.usage_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      isDeleted: row.is_deleted
    };
  }
  
  /**
   * 将数据库行映射为AgentUsage对象
   */
  private mapDbRowToAgentUsage(row: AgentUsageDbRow): AgentUsage {
    return {
      id: row.id,
      agentId: row.agent_id,
      userId: row.user_id,
      taskId: row.task_id || undefined,
      conversationId: row.conversation_id || undefined,
      executionResult: row.execution_result ? JSON.parse(row.execution_result) : undefined,
      createdAt: new Date(row.created_at)
    };
  }
}

export const agentDao = new AgentDao(); 