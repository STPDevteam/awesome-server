import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';
import { MCPConnection, MCPTool, MCPCallResult } from '../models/mcp.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { mcpNameMapping } from './predefinedMCPs.js';

interface MCPClient {
  client: Client;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  userId?: string;
  lastUsed: Date;
  createTime: Date;
  authHash?: string; // 用于检查认证信息是否变化
}

export interface MCPService {
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  connected: boolean;
  tools?: string[];
  toolCount?: number;
  status?: string;
  category?: string;
  imageUrl?: string;
  githubUrl?: string;
  authRequired?: boolean;
  authParams?: Record<string, any>;
  // 🔧 新增：预定义的工具信息
  predefinedTools?: MCPTool[];
}

/**
 * 连接池配置
 */
interface ConnectionPoolConfig {
  maxConnectionsPerUser: number;
  maxTotalConnections: number;
  connectionTimeout: number; // 连接超时时间（毫秒）
  cleanupInterval: number; // 清理间隔（毫秒）
}

/**
 * MCP Manager
 * Responsible for connecting, disconnecting and managing MCP tools
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private connectedMCPs: Map<string, MCPConnection>;
  private cleanupTimer?: NodeJS.Timeout;
  
  // 连接池配置
  private poolConfig: ConnectionPoolConfig = {
    maxConnectionsPerUser: parseInt(process.env.MAX_CONNECTIONS_PER_USER || '10'),
    maxTotalConnections: parseInt(process.env.MAX_TOTAL_CONNECTIONS || '100'),
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '1800000'), // 默认30分钟
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000') // 默认5分钟
  };

  constructor() {
    this.connectedMCPs = new Map();
    // 启动定期清理任务
    this.startCleanupTask();
  }

  /**
   * 生成包含用户ID的连接键
   * @param name MCP名称
   * @param userId 用户ID（可选）
   * @returns 连接键
   */
  private getConnectionKey(name: string, userId?: string): string {
    return userId ? `${userId}:${name}` : name;
  }

  /**
   * 生成认证信息的哈希值
   * @param env 环境变量
   * @returns 哈希值
   */
  private generateAuthHash(env?: Record<string, string>): string {
    if (!env) return '';
    const sortedEnv = Object.keys(env).sort().reduce((acc, key) => {
      acc[key] = env[key];
      return acc;
    }, {} as Record<string, string>);
    return crypto.createHash('sha256').update(JSON.stringify(sortedEnv)).digest('hex');
  }

  /**
   * 获取用户的连接数
   * @param userId 用户ID
   * @returns 连接数
   */
  private getUserConnectionCount(userId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId) {
        count++;
      }
    });
    return count;
  }

  /**
   * 清理用户最旧的连接
   * @param userId 用户ID
   * @param count 要清理的连接数
   */
  private async cleanupOldestUserConnections(userId: string, count: number = 1): Promise<void> {
    const userConnections: Array<[string, MCPClient]> = [];
    
    // 收集用户的所有连接
    this.clients.forEach((client, key) => {
      if (client.userId === userId) {
        userConnections.push([key, client]);
      }
    });
    
    // 按最后使用时间排序（最旧的在前）
    userConnections.sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());
    
    // 清理最旧的连接
    for (let i = 0; i < Math.min(count, userConnections.length); i++) {
      const [key, client] = userConnections[i];
      logger.info(`清理用户 ${userId} 的旧连接: ${client.name}`);
      await this.disconnect(client.name, userId);
    }
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupTimeoutConnections();
    }, this.poolConfig.cleanupInterval);
    
    logger.info(`连接池清理任务已启动，清理间隔: ${this.poolConfig.cleanupInterval}ms`);
  }

  /**
   * 清理超时的连接
   */
  async cleanupTimeoutConnections(): Promise<void> {
    const now = new Date();
    const timeoutConnections: Array<[string, MCPClient]> = [];
    
    this.clients.forEach((client, key) => {
      const idleTime = now.getTime() - client.lastUsed.getTime();
      if (idleTime > this.poolConfig.connectionTimeout) {
        timeoutConnections.push([key, client]);
      }
    });
    
    if (timeoutConnections.length > 0) {
      logger.info(`发现 ${timeoutConnections.length} 个超时连接，开始清理...`);
      
      for (const [key, client] of timeoutConnections) {
        try {
          await client.client.close();
          this.clients.delete(key);
          logger.info(`清理超时连接: ${key} (空闲时间: ${Math.round((now.getTime() - client.lastUsed.getTime()) / 1000 / 60)}分钟)`);
        } catch (error) {
          logger.error(`清理超时连接失败 [${key}]:`, error);
        }
      }
    }
  }

  /**
   * 获取连接池状态
   */
  getPoolStatus(): {
    totalConnections: number;
    userConnectionCounts: Record<string, number>;
    connectionDetails: Array<{
      key: string;
      name: string;
      userId?: string;
      lastUsed: Date;
      createTime: Date;
      idleMinutes: number;
    }>;
  } {
    const userConnectionCounts: Record<string, number> = {};
    const connectionDetails: Array<any> = [];
    const now = new Date();
    
    this.clients.forEach((client, key) => {
      const userId = client.userId || 'anonymous';
      userConnectionCounts[userId] = (userConnectionCounts[userId] || 0) + 1;
      
      connectionDetails.push({
        key,
        name: client.name,
        userId: client.userId,
        lastUsed: client.lastUsed,
        createTime: client.createTime,
        idleMinutes: Math.round((now.getTime() - client.lastUsed.getTime()) / 1000 / 60)
      });
    });
    
    return {
      totalConnections: this.clients.size,
      userConnectionCounts,
      connectionDetails: connectionDetails.sort((a, b) => b.idleMinutes - a.idleMinutes)
    };
  }

  /**
   * Connect to MCP service
   * @param name MCP name
   * @param command MCP command
   * @param args Command arguments
   * @param env Environment variables
   * @param userId User ID for multi-user isolation
   */
  async connect(name: string, command: string, args: string[] = [], env?: Record<string, string>, userId?: string): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.connect() Starting connection to MCP [MCP: ${name}, Command: ${command}, User: ${userId || 'default'}]`);
    logger.info(`【MCP Debug】Connection parameters: ${JSON.stringify(args)}`);
    logger.info(`【MCP Debug】Environment variables: ${env ? Object.keys(env).join(', ') : 'None'}`);
    
    // 检查总连接数是否达到上限
    if (this.clients.size >= this.poolConfig.maxTotalConnections) {
      logger.warn(`总连接数达到上限 (${this.poolConfig.maxTotalConnections})，需要清理旧连接`);
      // 清理最旧的连接
      await this.cleanupOldestConnections(1);
    }
    
    // 检查用户连接数
    if (userId) {
      const userConnectionCount = this.getUserConnectionCount(userId);
      if (userConnectionCount >= this.poolConfig.maxConnectionsPerUser) {
        logger.warn(`用户 ${userId} 连接数达到上限 (${this.poolConfig.maxConnectionsPerUser})，清理最旧连接`);
        await this.cleanupOldestUserConnections(userId, 1);
      }
    }
    
    // Check if command exists
    try {
      if (args[0] && args[0].startsWith('/')) {
        // Check if file exists
        if (fs.existsSync(args[0])) {
          logger.info(`【MCP Debug】File exists: ${args[0]}`);
          // Check file permissions
          try {
            fs.accessSync(args[0], fs.constants.X_OK);
            logger.info(`【MCP Debug】File is executable: ${args[0]}`);
          } catch (error) {
            logger.warn(`【MCP Debug】File is not executable: ${args[0]}, Error: ${error}`);
          }
        } else {
          logger.warn(`【MCP Debug】File does not exist: ${args[0]}`);
        }
      }
    } catch (error) {
      logger.warn(`【MCP Debug】Error checking file: ${error}`);
    }
    
    // Check if already connected (with user isolation)
    const connectionKey = this.getConnectionKey(name, userId);
    const existingClient = this.clients.get(connectionKey);
    
    if (existingClient) {
      // 检查认证信息是否变化
      const newAuthHash = this.generateAuthHash(env);
      if (existingClient.authHash === newAuthHash) {
        logger.info(`【MCP Debug】复用现有连接 [MCP: ${name}, User: ${userId || 'default'}]`);
        existingClient.lastUsed = new Date();
        return;
      } else {
        logger.info(`【MCP Debug】认证信息已变化，断开旧连接 [MCP: ${name}, User: ${userId || 'default'}]`);
        await this.disconnect(name, userId);
      }
    }
    
    try {
      // Create transport layer
      const transport = new StdioClientTransport({
        command,
        args,
        env: env ? { ...process.env, ...env } as Record<string, string> : process.env as Record<string, string>,
      });

      logger.info(`【MCP Debug】StdioClientTransport created, preparing to connect`);

      // Create client
      const client = new Client(
        {
          name: `mcp-client-${name}`,
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
          },
        }
      );

      // Connect
      logger.info(`【MCP Debug】Starting client connection...`);
      await client.connect(transport);
      logger.info(`【MCP Debug】Client connection successful`);

      // Save client with user isolation and metadata
      const now = new Date();
      this.clients.set(connectionKey, {
        client,
        name,
        command,
        args,
        env,
        userId,
        lastUsed: now,
        createTime: now,
        authHash: this.generateAuthHash(env)
      });

      logger.info(`【MCP Debug】MCP connection successful [MCP: ${name}, User: ${userId || 'default'}]`);
      
      // 记录连接池状态
      const poolStatus = this.getPoolStatus();
      logger.info(`连接池状态 - 总连接数: ${poolStatus.totalConnections}, 用户连接分布: ${JSON.stringify(poolStatus.userConnectionCounts)}`);
    } catch (error) {
      logger.error(`【MCP Debug】MCP connection failed [MCP: ${name}, User: ${userId || 'default'}]:`, error);
      throw error;
    }
  }

  /**
   * 清理最旧的连接（全局）
   * @param count 要清理的连接数
   */
  private async cleanupOldestConnections(count: number = 1): Promise<void> {
    const connections: Array<[string, MCPClient]> = Array.from(this.clients.entries());
    
    // 按最后使用时间排序（最旧的在前）
    connections.sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());
    
    // 清理最旧的连接
    for (let i = 0; i < Math.min(count, connections.length); i++) {
      const [key, client] = connections[i];
      logger.info(`清理全局最旧连接: ${key}`);
      try {
        await client.client.close();
        this.clients.delete(key);
      } catch (error) {
        logger.error(`清理连接失败 [${key}]:`, error);
      }
    }
  }

  /**
   * Connect to predefined MCP service
   * @param mcpConfig MCP service configuration
   * @param userId User ID for multi-user isolation
   * @returns 是否连接成功
   */
  async connectPredefined(mcpConfig: MCPService, userId?: string): Promise<boolean> {
    try {
      // Special handling for evm-mcp
      if (mcpConfig.name === 'evm-mcp') {
        // Ensure using correct npm package name
        const args = ['-y', '@mcpdotdirect/evm-mcp-server'];
        
        // Ensure including necessary environment variables
        const env = {
          ...mcpConfig.env,
          WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || mcpConfig.env?.WALLET_PRIVATE_KEY || '',
          RPC_PROVIDER_URL: process.env.RPC_PROVIDER_URL || mcpConfig.env?.RPC_PROVIDER_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
        };
        
        // connect方法返回void，使用try-catch判断是否成功
        try {
          await this.connect(mcpConfig.name, 'npx', args, env, userId);
          return true; // 如果没有抛出异常，则连接成功
        } catch {
          return false; // 连接失败
        }
      }
      
      // Normal MCP handling
      try {
        await this.connect(mcpConfig.name, mcpConfig.command, mcpConfig.args, mcpConfig.env, userId);
        return true; // 如果没有抛出异常，则连接成功
      } catch {
        return false; // 连接失败
      }
    } catch (error) {
      logger.error(`Failed to connect to predefined MCP [${mcpConfig.name}] for user [${userId || 'default'}]:`, error);
      return false;
    }
  }

  /**
   * Disconnect MCP
   * @param name MCP name
   * @param userId User ID for multi-user isolation
   */
  async disconnect(name: string, userId?: string): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.disconnect() Starting to disconnect MCP [MCP: ${name}, User: ${userId || 'default'}]`);
    
    const connectionKey = this.getConnectionKey(name, userId);
    const mcpClient = this.clients.get(connectionKey);
    if (!mcpClient) {
      logger.warn(`【MCP Debug】Attempting to disconnect an MCP that is not connected [MCP: ${name}, User: ${userId || 'default'}]`);
      return;
    }
    
    try {
      await mcpClient.client.close();
      this.clients.delete(connectionKey);
      logger.info(`【MCP Debug】MCP disconnection successful [MCP: ${name}, User: ${userId || 'default'}]`);
    } catch (error) {
      logger.error(`【MCP Debug】MCP disconnection failed [MCP: ${name}, User: ${userId || 'default'}]:`, error);
      throw error;
    }
  }

  /**
   * Disconnect all MCPs for a specific user
   * @param userId User ID (optional, if not provided, disconnect all)
   */
  async disconnectAll(userId?: string): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.disconnectAll() Starting to disconnect MCPs [User: ${userId || 'all'}]`);
    
    const keysToDisconnect = Array.from(this.clients.keys()).filter(key => {
      if (!userId) return true; // Disconnect all if no userId provided
      return key.startsWith(`${userId}:`);
    });
    
    for (const key of keysToDisconnect) {
      const mcpClient = this.clients.get(key);
      if (mcpClient) {
        await this.disconnect(mcpClient.name, mcpClient.userId);
      }
    }
    
    logger.info(`【MCP Debug】MCPs disconnected successfully [User: ${userId || 'all'}]`);
  }

  /**
   * Get list of connected MCPs for a specific user
   * @param userId User ID (optional, if not provided, return all)
   */
  getConnectedMCPs(userId?: string): Array<MCPService> {
    logger.info(`【MCP Debug】MCPManager.getConnectedMCPs() Getting list of connected MCPs [User: ${userId || 'all'}]`);
    
    const result = Array.from(this.clients.entries())
      .filter(([key, client]) => {
        if (!userId) return true; // Return all if no userId provided
        return client.userId === userId;
      })
      .map(([key, { name, command, args, env }]) => {
        // Get extra information based on MCP name
        const extraInfo = this.getMCPExtraInfo(name);
        
        return {
          name,
          description: extraInfo.description || `MCP Service: ${name}`,
          command,
          args,
          env,
          connected: true,
          status: 'connected',
          category: extraInfo.category,
          imageUrl: extraInfo.imageUrl,
          githubUrl: extraInfo.githubUrl,
          authParams: extraInfo.authParams
        };
      });
    
    logger.info(`【MCP Debug】Connected MCP list for user [${userId || 'all'}]: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Get extra information for an MCP
   * Returns preset extra information based on MCP name
   * @param name MCP name
   */
  private getMCPExtraInfo(name: string): {
    description?: string;
    category?: string;
    imageUrl?: string;
    githubUrl?: string;
    authParams?: Record<string, any>;
  } {
    // Handle specific MCPs
    if (name === 'playwright' || name === 'playwright-mcp-service') {
      return {
        description: 'Playwright browser automation tool, can control browsers to access web pages',
        category: 'Automation Tools',
        imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
        githubUrl: 'https://github.com/microsoft/playwright'
      };
    }
    
    // Handle more specific MCPs...
    // Add more mappings if needed
    
    // Default return empty object
    return {};
  }

  /**
   * Get MCP tool list
   * @param name MCP name
   * @param userId User ID for multi-user isolation
   */
  async getTools(name: string, userId?: string): Promise<any[]> {
    logger.info(`【MCP Debug】MCPManager.getTools() Starting to get MCP tool list [MCP: ${name}, User: ${userId || 'default'}]`);
    
    // 标准化MCP名称
    const normalizedName = this.normalizeMCPName(name);
    if (normalizedName !== name) {
      logger.info(`【MCP Debug】MCP name normalized from '${name}' to '${normalizedName}'`);
      name = normalizedName;
    }
    
    const connectionKey = this.getConnectionKey(name, userId);
    const mcpClient = this.clients.get(connectionKey);
    
    // 🔧 如果MCP未连接，尝试返回预定义的工具信息
    if (!mcpClient) {
      logger.warn(`【MCP Debug】MCP not connected, trying to get predefined tools [MCP: ${name}, User: ${userId || 'default'}]`);
      return await this.getPredefinedTools(name);
    }
    
    // 更新最后使用时间
    mcpClient.lastUsed = new Date();
    
    try {
      const toolsResponse = await mcpClient.client.listTools();
      const connectedTools = toolsResponse.tools || [];
      
      // 🔧 优先使用预定义工具的参数定义，但保留连接工具的其他信息
      const predefinedTools = await this.getPredefinedTools(name);
      
      if (predefinedTools.length > 0) {
        logger.info(`【MCP Debug】Using predefined tool schemas for ${name} (${predefinedTools.length} tools)`);
        // 将预定义工具的 schema 与连接工具合并
        return connectedTools.map(connectedTool => {
          const predefinedTool = predefinedTools.find(p => p.name === connectedTool.name);
          if (predefinedTool) {
            logger.info(`【MCP Debug】Applied predefined schema for tool: ${connectedTool.name}`);
            return {
              ...connectedTool,
              inputSchema: predefinedTool.inputSchema
            };
          }
          return connectedTool;
        });
      }
      
      return connectedTools;
    } catch (error) {
      logger.error(`【MCP Debug】Failed to get MCP tool list [MCP: ${name}, User: ${userId || 'default'}]:`, error);
      logger.info(`【MCP Debug】Fallback to predefined tools for [MCP: ${name}]`);
      // 🔧 连接失败时fallback到预定义工具信息
      return await this.getPredefinedTools(name);
    }
  }

  /**
   * 🔧 新增：获取预定义的工具信息
   * @param mcpName MCP名称
   * @returns 预定义的工具列表
   */
  async getPredefinedTools(mcpName: string): Promise<any[]> {
    // 需要导入预定义MCP配置
    const { getPredefinedMCP } = await import('./predefinedMCPs.js');
    const mcpConfig = getPredefinedMCP(mcpName);
    
    if (mcpConfig && mcpConfig.predefinedTools) {
      logger.info(`【MCP Debug】Found ${mcpConfig.predefinedTools.length} predefined tools for ${mcpName}`);
      // 转换为标准的MCP工具格式，使用预定义的参数配置
      return mcpConfig.predefinedTools.map((tool: MCPTool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters || {
          type: 'object',
          properties: {},
          required: []
        }
      }));
    }
    
    logger.warn(`【MCP Debug】No predefined tools found for ${mcpName}`);
    return [];
  }

  /**
   * 映射MCP名称，确保名称一致性
   * @param mcpName 原始MCP名称
   * @returns 标准化的MCP名称
   */
  private normalizeMCPName(mcpName: string): string {
    // 使用全局统一的映射表
    return mcpNameMapping[mcpName] || mcpName;
  }

  /**
   * Call MCP tool
   * @param name MCP name
   * @param tool Tool name
   * @param args Tool arguments
   * @param userId User ID for multi-user isolation
   */
  async callTool(name: string, tool: string, args: any, userId?: string): Promise<any> {
    // 🔧 新增：记录MCP调用前的内存使用情况
    const memUsageBefore = process.memoryUsage();
    const argsSize = JSON.stringify(args).length;

    
    // 标准化MCP名称
    const normalizedName = this.normalizeMCPName(name);
    if (normalizedName !== name) {
      logger.info(`【MCP Debug】MCP name normalized from '${name}' to '${normalizedName}'`);
      name = normalizedName;
    }
    
    // 处理工具名称 - 处理中文工具名称的情况
    let actualTool = tool;
    
    const connectionKey = this.getConnectionKey(name, userId);
    const mcpClient = this.clients.get(connectionKey);
    if (!mcpClient) {
      logger.error(`【MCP Debug】MCP not connected [MCP: ${name}, User: ${userId || 'default'}]`);
      throw new Error(`MCP ${name} not connected for user ${userId || 'default'}`);
    }
    
    // 更新最后使用时间
    mcpClient.lastUsed = new Date();
    
    try {
      // 🔧 新增：记录客户端调用前的内存状态
      const memBeforeClientCall = process.memoryUsage();

      
      const result = await mcpClient.client.callTool({
        name: actualTool,
        arguments: args,
      });
      
      console.log(`✅ MCP CLIENT CALL COMPLETED`);
      
      // 🔧 新增：记录客户端调用后的内存状态和结果分析
      const memAfterClientCall = process.memoryUsage();
      const resultSize = JSON.stringify(result).length;
      
      
      if (result && typeof result === 'object') {
        console.log(`  Result keys: ${Object.keys(result)}`);
        if (result.content) {
          console.log(`  Has content field: true`);
          console.log(`  Content type: ${typeof result.content}`);
          if (Array.isArray(result.content)) {
            console.log(`  Content is array with ${result.content.length} items`);
            console.log(`  First content item: ${JSON.stringify(result.content[0]).substring(0, 200)}...`);
            
            // 🔧 分析内容项的大小和类型
            result.content.forEach((item, index) => {
              const itemSize = JSON.stringify(item).length;
              console.log(`  Content[${index}] size: ${itemSize} bytes (${(itemSize / 1024).toFixed(2)} KB)`);
              console.log(`  Content[${index}] type: ${typeof item}`);
              if (item && typeof item === 'object') {
                console.log(`  Content[${index}] keys: ${Object.keys(item)}`);
                if (item.text && typeof item.text === 'string') {
                  console.log(`  Content[${index}].text length: ${item.text.length} chars`);
                  console.log(`  Content[${index}].text preview: ${item.text.substring(0, 100)}...`);
                }
              }
            });
          } else {
            console.log(`  Content size: ${JSON.stringify(result.content).length} bytes`);
            console.log(`  Content preview: ${JSON.stringify(result.content).substring(0, 200)}...`);
          }
        } else {
          console.log(`  Has content field: false`);
        }
      } else {
        console.log(`  Result is not an object`);
        console.log(`  Result preview: ${String(result).substring(0, 200)}...`);
      }
      
      
      return result;
    } catch (error) {
      // 🔧 新增：记录错误时的内存状态
      const memUsageOnError = process.memoryUsage();
      console.log(`\n==== ❌ MCPManager Memory Debug - ERROR STATE ====`);
      console.log(`Memory on Error (MB):`);
      console.log(`  RSS: ${(memUsageOnError.rss / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Used: ${(memUsageOnError.heapUsed / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Total: ${(memUsageOnError.heapTotal / 1024 / 1024).toFixed(2)}`);
      console.log(`Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.log(`Error Message: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Error Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      
      logger.error(`【MCP Debug】MCP tool call failed [MCP: ${name}, Tool: ${actualTool}, User: ${userId || 'default'}]:`, error);
      throw error;
    }
  }

  getClient(name: string, userId?: string): Client | undefined {
    const connectionKey = this.getConnectionKey(name, userId);
    const mcpClient = this.clients.get(connectionKey);
    if (mcpClient) {
      // 更新最后使用时间
      mcpClient.lastUsed = new Date();
      return mcpClient.client;
    }
    return undefined;
  }

  /**
   * 销毁管理器，清理所有资源
   */
  async destroy(): Promise<void> {
    // 停止清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    // 断开所有连接
    await this.disconnectAll();
    
    logger.info('MCPManager已销毁');
  }
} 