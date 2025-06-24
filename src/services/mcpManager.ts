import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';
import { MCPConnection, MCPTool, MCPCallResult } from '../models/mcp.js';
import fs from 'fs';
import path from 'path';

interface MCPClient {
  client: Client;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
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
   * Connect to MCP service
   * @param name MCP name
   * @param command MCP command
   * @param args Command arguments
   * @param env Environment variables
   */
  async connect(name: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.connect() Starting connection to MCP [MCP: ${name}, Command: ${command}]`);
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
    
    // Check if already connected
    if (this.clients.has(name)) {
      logger.info(`【MCP Debug】MCP already connected, disconnecting existing connection first [MCP: ${name}]`);
      await this.disconnect(name);
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

      // Save client
      this.clients.set(name, {
        client,
        name,
        command,
        args,
        env,
      });

      logger.info(`【MCP Debug】MCP connection successful [MCP: ${name}]`);
    } catch (error) {
      logger.error(`【MCP Debug】MCP connection failed [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * Connect to predefined MCP service
   * @param mcpService Predefined MCP service configuration
   */
  async connectPredefined(mcpService: MCPService): Promise<boolean> {
    try {
      await this.connect(
        mcpService.name,
        mcpService.command,
        mcpService.args || [],
        mcpService.env
      );
      return true;
    } catch (error) {
      logger.error(`Failed to connect to predefined MCP [${mcpService.name}]:`, error);
      return false;
    }
  }

  /**
   * Disconnect MCP
   * @param name MCP name
   */
  async disconnect(name: string): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.disconnect() Starting to disconnect MCP [MCP: ${name}]`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.warn(`【MCP Debug】Attempting to disconnect an MCP that is not connected [MCP: ${name}]`);
      return;
    }
    
    try {
      await mcpClient.client.close();
      this.clients.delete(name);
      logger.info(`【MCP Debug】MCP disconnection successful [MCP: ${name}]`);
    } catch (error) {
      logger.error(`【MCP Debug】MCP disconnection failed [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * Disconnect all MCPs
   */
  async disconnectAll(): Promise<void> {
    logger.info(`【MCP Debug】MCPManager.disconnectAll() Starting to disconnect all MCPs`);
    
    const names = Array.from(this.clients.keys());
    for (const name of names) {
      await this.disconnect(name);
    }
    
    logger.info(`【MCP Debug】All MCPs disconnected successfully`);
  }

  /**
   * Get list of connected MCPs
   */
  getConnectedMCPs(): Array<MCPService> {
    logger.info(`【MCP Debug】MCPManager.getConnectedMCPs() Getting list of connected MCPs`);
    
    const result = Array.from(this.clients.values()).map(({ name, command, args, env }) => {
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
    
    logger.info(`【MCP Debug】Connected MCP list: ${JSON.stringify(result)}`);
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
   */
  async getTools(name: string): Promise<any[]> {
    logger.info(`【MCP Debug】MCPManager.getTools() Starting to get MCP tool list [MCP: ${name}]`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.error(`【MCP Debug】MCP not connected [MCP: ${name}]`);
      throw new Error(`MCP ${name} not connected`);
    }
    
    try {
      const toolsResponse = await mcpClient.client.listTools();
      const tools = toolsResponse.tools || [];
      logger.info(`【MCP Debug】Retrieved MCP tool list [MCP: ${name}, Tool count: ${tools.length}]`);
      return tools;
    } catch (error) {
      logger.error(`【MCP Debug】Failed to get MCP tool list [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * Call MCP tool
   * @param name MCP name
   * @param tool Tool name
   * @param args Tool arguments
   */
  async callTool(name: string, tool: string, args: any): Promise<any> {
    logger.info(`【MCP Debug】MCPManager.callTool() Starting to call MCP tool [MCP: ${name}, Tool: ${tool}]`);
    logger.info(`【MCP Debug】Call arguments: ${JSON.stringify(args)}`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.error(`【MCP Debug】MCP not connected [MCP: ${name}]`);
      throw new Error(`MCP ${name} not connected`);
    }
    
    try {
      const result = await mcpClient.client.callTool({
        name: tool,
        arguments: args,
      });
      logger.info(`【MCP Debug】MCP tool call successful [MCP: ${name}, Tool: ${tool}]`);
      logger.info(`【MCP Debug】Call result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`【MCP Debug】MCP tool call failed [MCP: ${name}, Tool: ${tool}]:`, error);
      throw error;
    }
  }

  getClient(name: string): Client | undefined {
    return this.clients.get(name)?.client;
  }
} 