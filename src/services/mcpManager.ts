import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';
import { MCPConnection, MCPTool, MCPCallResult } from '../models/mcp.js';
import fs from 'fs';
import path from 'path';

import { mcpNameMapping } from './predefinedMCPs.js';

interface MCPClient {
  client: Client;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  userId?: string;
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
}

/**
 * MCP Manager
 * Responsible for connecting, disconnecting and managing MCP tools
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private connectedMCPs: Map<string, MCPConnection>;

  constructor() {
    this.connectedMCPs = new Map();
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
    if (this.clients.has(connectionKey)) {
      logger.info(`【MCP Debug】MCP already connected for user, disconnecting existing connection first [MCP: ${name}, User: ${userId || 'default'}]`);
      await this.disconnect(name, userId);
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

      // Save client with user isolation
      this.clients.set(connectionKey, {
        client,
        name,
        command,
        args,
        env,
        userId,
      });

      logger.info(`【MCP Debug】MCP connection successful [MCP: ${name}, User: ${userId || 'default'}]`);
    } catch (error) {
      logger.error(`【MCP Debug】MCP connection failed [MCP: ${name}, User: ${userId || 'default'}]:`, error);
      throw error;
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
    if (!mcpClient) {
      logger.error(`【MCP Debug】MCP not connected [MCP: ${name}, User: ${userId || 'default'}]`);
      throw new Error(`MCP ${name} not connected for user ${userId || 'default'}`);
    }
    
    try {
      const toolsResponse = await mcpClient.client.listTools();
      const tools = toolsResponse.tools || [];
      logger.info(`【MCP Debug】Retrieved MCP tool list [MCP: ${name}, User: ${userId || 'default'}, Tool count: ${tools.length}]`);
      return tools;
    } catch (error) {
      logger.error(`【MCP Debug】Failed to get MCP tool list [MCP: ${name}, User: ${userId || 'default'}]:`, error);
      throw error;
    }
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
    logger.info(`【MCP Debug】MCPManager.callTool() Starting to call MCP tool [MCP: ${name}, Tool: ${tool}, User: ${userId || 'default'}]`);
    logger.info(`【MCP Debug】Call arguments: ${JSON.stringify(args)}`);
    
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
    
    try {
      const result = await mcpClient.client.callTool({
        name: actualTool,
        arguments: args,
      });
      logger.info(`【MCP Debug】MCP tool call successful [MCP: ${name}, Tool: ${actualTool}, User: ${userId || 'default'}]`);
      logger.info(`【MCP Debug】Call result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`【MCP Debug】MCP tool call failed [MCP: ${name}, Tool: ${actualTool}, User: ${userId || 'default'}]:`, error);
      throw error;
    }
  }

  getClient(name: string, userId?: string): Client | undefined {
    const connectionKey = this.getConnectionKey(name, userId);
    return this.clients.get(connectionKey)?.client;
  }
} 