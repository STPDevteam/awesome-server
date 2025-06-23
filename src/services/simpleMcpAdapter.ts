import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPManager } from './mcpManager.js';
import { HTTPMCPAdapter } from './httpMcpAdapter.js';
import { logger } from '../utils/logger.js';

/**
 * 简化的 MCP 适配器
 * 根据环境自动选择 stdio (local) 或 HTTP (test/production) 模式
 */
export class SimpleMCPAdapter {
  private mcpManager: MCPManager;
  private httpAdapter: HTTPMCPAdapter | null = null;
  private useHttpMode: boolean;

  constructor() {
    this.mcpManager = new MCPManager();
    this.useHttpMode = process.env.MCP_MODE === 'http';
    
    if (this.useHttpMode) {
      this.httpAdapter = new HTTPMCPAdapter();
    }

    logger.info(`【MCP调试】SimpleMCPAdapter初始化完成，使用${this.useHttpMode ? 'HTTP' : 'stdio'}模式`);
  }

  /**
   * 获取所有可用的工具
   */
  async getAllTools(): Promise<DynamicStructuredTool[]> {
    try {
      logger.info(`【MCP调试】SimpleMCPAdapter.getAllTools() 开始获取所有工具`);
      
      if (this.useHttpMode && this.httpAdapter) {
        // HTTP 模式：调用外部 MCP 微服务
        logger.info(`【MCP调试】使用HTTP模式获取所有工具`);
        const tools = await this.httpAdapter.getAllTools();
        logger.info(`【MCP调试】HTTP模式获取到${tools.length}个工具`);
        return tools;
      } else {
        // stdio 模式：使用传统的 MCPManager
        logger.info(`【MCP调试】使用stdio模式获取所有工具`);
        const tools = await this.getStdioTools();
        logger.info(`【MCP调试】stdio模式获取到${tools.length}个工具`);
        return tools;
      }
    } catch (error) {
      logger.error('【MCP调试】获取所有工具失败:', error);
      return [];
    }
  }

  /**
   * stdio 模式获取工具
   */
  private async getStdioTools(): Promise<DynamicStructuredTool[]> {
    const tools: DynamicStructuredTool[] = [];
    const connectedMCPs = this.mcpManager.getConnectedMCPs();

    for (const mcp of connectedMCPs) {
      try {
        const mcpTools = await this.mcpManager.getTools(mcp.name);
        
        for (const mcpTool of mcpTools) {
          const tool = await this.convertMCPToolToLangChainTool(mcp.name, mcpTool);
          tools.push(tool);
        }
      } catch (error) {
        logger.error(`Failed to get tools from ${mcp.name}:`, error);
      }
    }

    return tools;
  }

  /**
   * 将 MCP 工具转换为 LangChain 工具 (stdio 模式)
   */
  private async convertMCPToolToLangChainTool(mcpName: string, mcpTool: any): Promise<DynamicStructuredTool> {
    const toolName = this.generateToolName(mcpName, mcpTool.name);
    const schema = this.buildZodSchema(mcpTool.inputSchema || {});

    return new DynamicStructuredTool({
      name: toolName,
      description: mcpTool.description || `Tool ${mcpTool.name} from ${mcpName}`,
      schema,
      func: async (input) => {
        try {
          const result = await this.mcpManager.callTool(mcpName, mcpTool.name, input);
          return this.formatToolResult(result);
        } catch (error) {
          const errorMessage = `Error calling tool ${mcpTool.name} on ${mcpName}: ${error}`;
          logger.error(errorMessage);
          return errorMessage;
        }
      },
    });
  }

  /**
   * 生成工具名称
   */
  private generateToolName(mcpName: string, toolName: string): string {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

    let shortMcpName = mcpName
      .replace('-mcp-server', '')
      .replace('-mcp', '')
      .replace('_server', '');

    shortMcpName = sanitize(shortMcpName);
    const sanitizedToolName = sanitize(toolName);

    const fullName = `${shortMcpName}_${sanitizedToolName}`;
    return fullName.length > 64 ? fullName.substring(0, 64) : fullName;
  }

  /**
   * 构建 Zod schema
   */
  private buildZodSchema(inputSchema: any): z.ZodObject<any> {
    const schemaFields: Record<string, z.ZodTypeAny> = {};

    if (inputSchema.properties) {
      for (const [key, value] of Object.entries(inputSchema.properties)) {
        const fieldSchema = value as any;
        let zodType: z.ZodTypeAny;

        switch (fieldSchema.type) {
          case 'string':
            zodType = z.string();
            break;
          case 'number':
            zodType = z.number();
            break;
          case 'integer':
            zodType = z.number().int();
            break;
          case 'boolean':
            zodType = z.boolean();
            break;
          case 'array':
            if (fieldSchema.items) {
              const itemType = this.buildArrayItemType(fieldSchema.items);
              zodType = z.array(itemType);
            } else {
              zodType = z.array(z.string());
            }
            break;
          case 'object':
            if (fieldSchema.properties) {
              const nestedSchema = this.buildZodSchema(fieldSchema);
              zodType = nestedSchema;
            } else {
              zodType = z.object({}).passthrough();
            }
            break;
          default:
            zodType = z.any();
        }

        if (fieldSchema.description) {
          zodType = zodType.describe(fieldSchema.description);
        }

        if (!inputSchema.required?.includes(key)) {
          zodType = zodType.optional();
        }

        schemaFields[key] = zodType;
      }
    }

    return z.object(schemaFields);
  }

  /**
   * 构建数组项类型
   */
  private buildArrayItemType(itemSchema: any): z.ZodTypeAny {
    if (!itemSchema || !itemSchema.type) {
      return z.string();
    }

    switch (itemSchema.type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'object':
        if (itemSchema.properties) {
          return this.buildZodSchema(itemSchema);
        }
        return z.object({}).passthrough();
      case 'array':
        const nestedItemType = this.buildArrayItemType(itemSchema.items);
        return z.array(nestedItemType);
      default:
        return z.string();
    }
  }

  /**
   * 格式化工具结果
   */
  private formatToolResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      if (result.content) {
        if (Array.isArray(result.content)) {
          return result.content
            .map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.type === 'text' && item.text) return item.text;
              return JSON.stringify(item);
            })
            .join('\n');
        } else if (typeof result.content === 'string') {
          return result.content;
        }
      }
      return JSON.stringify(result, null, 2);
    }

    return String(result);
  }

  /**
   * 获取已连接的 MCP 列表
   */
  // getConnectedMCPs(): Array<{ name: string; command: string; args: string[]; env?: Record<string, string> }> {
  //   if (this.useHttpMode) {
  //     // HTTP 模式：返回配置的服务列表
  //     logger.info(`【MCP调试】SimpleMCPAdapter.getConnectedMCPs() HTTP模式返回预配置的MCP列表`);
  //     const mcps = [
  //       { name: 'x-mcp-service', command: 'http', args: [] },
  //       { name: 'github-mcp-service', command: 'http', args: [] },
  //       { name: 'base-mcp-service', command: 'http', args: [] },
  //     ];
  //     logger.info(`【MCP调试】HTTP模式返回的MCP列表: ${JSON.stringify(mcps)}`);
  //     return mcps;
  //   } else {
  //     logger.info(`【MCP调试】SimpleMCPAdapter.getConnectedMCPs() stdio模式从MCPManager获取MCP列表`);
  //     const mcps = this.mcpManager.getConnectedMCPs();
  //     logger.info(`【MCP调试】stdio模式从MCPManager获取到的MCP列表: ${JSON.stringify(mcps)}`);
  //     return mcps;
  //   }
  // }

  /**
   * 获取 MCP 工具列表
   */
  async getMCPTools(name: string): Promise<any[]> {
    logger.info(`【MCP调试】SimpleMCPAdapter.getMCPTools() 开始获取MCP工具 [MCP: ${name}]`);
    
    if (this.useHttpMode && this.httpAdapter) {
      // HTTP 模式：通过 HTTP 适配器获取
      try {
        logger.info(`【MCP调试】HTTP模式: 尝试获取MCP工具 [MCP: ${name}]`);
        // 这里需要实现获取特定服务工具的方法
        logger.warn(`【MCP调试】HTTP模式: 获取特定MCP工具的方法未实现，返回空数组 [MCP: ${name}]`);
        return [];
      } catch (error) {
        logger.error(`【MCP调试】HTTP模式: 获取MCP工具失败 [MCP: ${name}]:`, error);
        return [];
      }
    } else {
      logger.info(`【MCP调试】stdio模式: 从MCPManager获取MCP工具 [MCP: ${name}]`);
      try {
        const tools = await this.mcpManager.getTools(name);
        logger.info(`【MCP调试】stdio模式: 成功获取到${tools.length}个工具 [MCP: ${name}]`);
        return tools;
      } catch (error) {
        logger.error(`【MCP调试】stdio模式: 获取MCP工具失败 [MCP: ${name}]:`, error);
        return [];
      }
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callMCPTool(mcpName: string, toolName: string, args: any): Promise<any> {
    logger.info(`【MCP调试】SimpleMCPAdapter.callMCPTool() 开始调用MCP工具 [MCP: ${mcpName}, 工具: ${toolName}]`);
    logger.info(`【MCP调试】调用参数: ${JSON.stringify(args)}`);
    
    try {
      if (this.useHttpMode && this.httpAdapter) {
        logger.info(`【MCP调试】HTTP模式: 使用HttpAdapter调用MCP工具 [MCP: ${mcpName}, 工具: ${toolName}]`);
        const result = await this.httpAdapter.callTool(mcpName, toolName, args);
        logger.info(`【MCP调试】HTTP模式: 调用成功 [MCP: ${mcpName}, 工具: ${toolName}]`);
        logger.info(`【MCP调试】调用结果: ${JSON.stringify(result)}`);
        return result;
      } else {
        logger.info(`【MCP调试】stdio模式: 使用MCPManager调用MCP工具 [MCP: ${mcpName}, 工具: ${toolName}]`);
        const result = await this.mcpManager.callTool(mcpName, toolName, args);
        logger.info(`【MCP调试】stdio模式: 调用成功 [MCP: ${mcpName}, 工具: ${toolName}]`);
        logger.info(`【MCP调试】调用结果: ${JSON.stringify(result)}`);
        return result;
      }
    } catch (error) {
      logger.error(`【MCP调试】调用MCP工具失败 [MCP: ${mcpName}, 工具: ${toolName}]:`, error);
      throw error;
    }
  }

  /**
   * 连接 MCP 服务 (仅 stdio 模式使用)
   */
  async connectMCP(name: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    logger.info(`【MCP调试】SimpleMCPAdapter.connectMCP() 开始连接MCP [MCP: ${name}, 命令: ${command}]`);
    logger.info(`【MCP调试】连接参数: ${JSON.stringify(args)}`);
    logger.info(`【MCP调试】环境变量: ${env ? Object.keys(env).join(', ') : '无'}`);
    
    if (!this.useHttpMode) {
      try {
        logger.info(`【MCP调试】stdio模式: 使用MCPManager连接MCP [MCP: ${name}]`);
        await this.mcpManager.connect(name, command, args, env);
        logger.info(`【MCP调试】stdio模式: MCP连接成功 [MCP: ${name}]`);
      } catch (error) {
        logger.error(`【MCP调试】stdio模式: MCP连接失败 [MCP: ${name}]:`, error);
        throw error;
      }
    } else {
      logger.warn(`【MCP调试】HTTP模式下调用了connectMCP方法，此操作被忽略 [MCP: ${name}]`);
    }
  }

  /**
   * 断开 MCP 服务 (仅 stdio 模式使用)
   */
  async disconnectMCP(name: string): Promise<void> {
    logger.info(`【MCP调试】SimpleMCPAdapter.disconnectMCP() 开始断开MCP连接 [MCP: ${name}]`);
    
    if (!this.useHttpMode) {
      try {
        logger.info(`【MCP调试】stdio模式: 使用MCPManager断开MCP连接 [MCP: ${name}]`);
        await this.mcpManager.disconnect(name);
        logger.info(`【MCP调试】stdio模式: MCP断开连接成功 [MCP: ${name}]`);
      } catch (error) {
        logger.error(`【MCP调试】stdio模式: MCP断开连接失败 [MCP: ${name}]:`, error);
        throw error;
      }
    } else {
      logger.warn(`【MCP调试】HTTP模式下调用了disconnectMCP方法，此操作被忽略 [MCP: ${name}]`);
    }
  }

  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    if (!this.useHttpMode) {
      await this.mcpManager.disconnectAll();
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { mode: string; requestCount?: number; errorCount?: number } {
    const stats = { mode: this.useHttpMode ? 'http' : 'stdio' };
    
    if (this.useHttpMode && this.httpAdapter) {
      return {
        ...stats,
        requestCount: this.httpAdapter.getRequestCount(),
        errorCount: this.httpAdapter.getErrorCount()
      };
    }
    
    return stats;
  }
} 