import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';

interface MCPClient {
  client: Client;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();

  async connect(name: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    try {
      // 检查是否已连接
      if (this.clients.has(name)) {
        logger.info(`MCP ${name} is already connected, skipping connection`);
        return; // 已经连接，直接返回成功
      }

      // 创建传输层
      const transport = new StdioClientTransport({
        command,
        args,
        env: env ? { ...process.env, ...env } as Record<string, string> : process.env as Record<string, string>,
      });

      // 创建客户端
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

      // 连接
      await client.connect(transport);

      // 保存客户端
      this.clients.set(name, {
        client,
        name,
        command,
        args,
        env,
      });

      logger.info(`Successfully connected to MCP: ${name}`);
    } catch (error) {
      logger.error(`Failed to connect to MCP ${name}:`, error);
      throw error;
    }
  }

  async disconnect(name: string): Promise<void> {
    const mcpClient = this.clients.get(name);
    if (mcpClient) {
      await mcpClient.client.close();
      this.clients.delete(name);
      logger.info(`Disconnected from MCP: ${name}`);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [name, mcpClient] of this.clients) {
      await mcpClient.client.close();
    }
    this.clients.clear();
    logger.info('Disconnected from all MCPs');
  }

  getConnectedMCPs(): Array<{ name: string; command: string; args: string[]; env?: Record<string, string> }> {
    return Array.from(this.clients.values()).map(({ name, command, args, env }) => ({
      name,
      command,
      args,
      env,
    }));
  }

  async getTools(name: string): Promise<any[]> {
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      throw new Error(`MCP ${name} is not connected`);
    }

    try {
      const tools = await mcpClient.client.listTools();
      return tools.tools || [];
    } catch (error) {
      logger.error(`Failed to get tools from MCP ${name}:`, error);
      throw error;
    }
  }

  async callTool(mcpName: string, toolName: string, args: any): Promise<any> {
    const mcpClient = this.clients.get(mcpName);
    if (!mcpClient) {
      throw new Error(`MCP ${mcpName} is not connected`);
    }
    try {
      const result = await mcpClient.client.callTool({
        name: toolName,
        arguments: args,
      });
      return result;
    } catch (error) {
      logger.error(`Failed to call tool ${toolName} on MCP ${mcpName}:`, error);
      throw error;
    }
  }

  getClient(name: string): Client | undefined {
    return this.clients.get(name)?.client;
  }
} 