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
 * MCP管理器
 * 负责连接、断开和管理MCP工具
 */
export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private connectedMCPs: Map<string, MCPConnection>;

  constructor() {
    this.connectedMCPs = new Map();
  }

  /**
   * 连接到MCP服务
   * @param name MCP名称
   * @param command MCP命令
   * @param args 命令参数
   * @param env 环境变量
   */
  async connect(name: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    logger.info(`【MCP调试】MCPManager.connect() 开始连接MCP [MCP: ${name}, 命令: ${command}]`);
    logger.info(`【MCP调试】连接参数: ${JSON.stringify(args)}`);
    logger.info(`【MCP调试】环境变量: ${env ? Object.keys(env).join(', ') : '无'}`);
    
    // 检查命令是否存在
    try {
      if (args[0] && args[0].startsWith('/')) {
        // 检查文件是否存在
        if (fs.existsSync(args[0])) {
          logger.info(`【MCP调试】文件存在: ${args[0]}`);
          // 检查文件权限
          try {
            fs.accessSync(args[0], fs.constants.X_OK);
            logger.info(`【MCP调试】文件可执行: ${args[0]}`);
          } catch (error) {
            logger.warn(`【MCP调试】文件不可执行: ${args[0]}, 错误: ${error}`);
          }
        } else {
          logger.warn(`【MCP调试】文件不存在: ${args[0]}`);
        }
      }
    } catch (error) {
      logger.warn(`【MCP调试】检查文件时出错: ${error}`);
    }
    
    // 检查是否已连接
    if (this.clients.has(name)) {
      logger.info(`【MCP调试】MCP已经连接，先断开现有连接 [MCP: ${name}]`);
      await this.disconnect(name);
    }
    
    try {
      // 创建传输层
      const transport = new StdioClientTransport({
        command,
        args,
        env: env ? { ...process.env, ...env } as Record<string, string> : process.env as Record<string, string>,
      });

      logger.info(`【MCP调试】已创建StdioClientTransport，准备连接`);

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
      logger.info(`【MCP调试】开始连接客户端...`);
      await client.connect(transport);
      logger.info(`【MCP调试】客户端连接成功`);

      // 保存客户端
      this.clients.set(name, {
        client,
        name,
        command,
        args,
        env,
      });

      logger.info(`【MCP调试】MCP连接成功 [MCP: ${name}]`);
    } catch (error) {
      logger.error(`【MCP调试】MCP连接失败 [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * 连接预定义的MCP服务
   * @param mcpService 预定义的MCP服务配置
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
      logger.error(`连接预定义MCP失败 [${mcpService.name}]:`, error);
      return false;
    }
  }

  /**
   * 断开MCP连接
   * @param name MCP名称
   */
  async disconnect(name: string): Promise<void> {
    logger.info(`【MCP调试】MCPManager.disconnect() 开始断开MCP连接 [MCP: ${name}]`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.warn(`【MCP调试】尝试断开未连接的MCP [MCP: ${name}]`);
      return;
    }
    
    try {
      await mcpClient.client.close();
      this.clients.delete(name);
      logger.info(`【MCP调试】MCP断开连接成功 [MCP: ${name}]`);
    } catch (error) {
      logger.error(`【MCP调试】MCP断开连接失败 [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * 断开所有MCP连接
   */
  async disconnectAll(): Promise<void> {
    logger.info(`【MCP调试】MCPManager.disconnectAll() 开始断开所有MCP连接`);
    
    const names = Array.from(this.clients.keys());
    for (const name of names) {
      await this.disconnect(name);
    }
    
    logger.info(`【MCP调试】所有MCP断开连接成功`);
  }

  /**
   * 获取已连接的MCP列表
   */
  getConnectedMCPs(): Array<MCPService> {
    logger.info(`【MCP调试】MCPManager.getConnectedMCPs() 获取已连接的MCP列表`);
    
    const result = Array.from(this.clients.values()).map(({ name, command, args, env }) => {
      // 根据MCP名称获取额外信息
      const extraInfo = this.getMCPExtraInfo(name);
      
      return {
        name,
        description: extraInfo.description || `MCP服务: ${name}`,
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
    
    logger.info(`【MCP调试】已连接的MCP列表: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * 获取MCP的额外信息
   * 根据MCP名称返回预设的额外信息
   * @param name MCP名称
   */
  private getMCPExtraInfo(name: string): {
    description?: string;
    category?: string;
    imageUrl?: string;
    githubUrl?: string;
    authParams?: Record<string, any>;
  } {
    // 处理特定的MCP
    if (name === 'playwright' || name === 'playwright-mcp-service') {
      return {
        description: 'Playwright 浏览器自动化工具，可以控制浏览器访问网页',
        category: '自动化工具',
        imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
        githubUrl: 'https://github.com/microsoft/playwright'
      };
    }
    
    // 处理更多特定MCP...
    // 如果需要可以添加更多映射
    
    // 默认返回空对象
    return {};
  }

  /**
   * 获取MCP工具列表
   * @param name MCP名称
   */
  async getTools(name: string): Promise<any[]> {
    logger.info(`【MCP调试】MCPManager.getTools() 开始获取MCP工具列表 [MCP: ${name}]`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.error(`【MCP调试】MCP未连接 [MCP: ${name}]`);
      throw new Error(`MCP ${name} 未连接`);
    }
    
    try {
      const toolsResponse = await mcpClient.client.listTools();
      const tools = toolsResponse.tools || [];
      logger.info(`【MCP调试】获取到MCP工具列表 [MCP: ${name}, 工具数量: ${tools.length}]`);
      return tools;
    } catch (error) {
      logger.error(`【MCP调试】获取MCP工具列表失败 [MCP: ${name}]:`, error);
      throw error;
    }
  }

  /**
   * 调用MCP工具
   * @param name MCP名称
   * @param tool 工具名称
   * @param args 工具参数
   */
  async callTool(name: string, tool: string, args: any): Promise<any> {
    logger.info(`【MCP调试】MCPManager.callTool() 开始调用MCP工具 [MCP: ${name}, 工具: ${tool}]`);
    logger.info(`【MCP调试】调用参数: ${JSON.stringify(args)}`);
    
    const mcpClient = this.clients.get(name);
    if (!mcpClient) {
      logger.error(`【MCP调试】MCP未连接 [MCP: ${name}]`);
      throw new Error(`MCP ${name} 未连接`);
    }
    
    try {
      const result = await mcpClient.client.callTool({
        name: tool,
        arguments: args,
      });
      logger.info(`【MCP调试】MCP工具调用成功 [MCP: ${name}, 工具: ${tool}]`);
      logger.info(`【MCP调试】调用结果: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`【MCP调试】MCP工具调用失败 [MCP: ${name}, 工具: ${tool}]:`, error);
      throw error;
    }
  }

  getClient(name: string): Client | undefined {
    return this.clients.get(name)?.client;
  }
} 