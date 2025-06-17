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

    logger.info(`SimpleMCPAdapter initialized in ${this.useHttpMode ? 'HTTP' : 'stdio'} mode`);
  }

  /**
   * 获取所有可用的工具
   */
  async getAllTools(): Promise<DynamicStructuredTool[]> {
    try {
      if (this.useHttpMode && this.httpAdapter) {
        // HTTP 模式：调用外部 MCP 微服务
        return await this.httpAdapter.getAllTools();
      } else {
        // stdio 模式：使用传统的 MCPManager
        return await this.getStdioTools();
      }
    } catch (error) {
      logger.error('Failed to get tools:', error);
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
   * 连接 MCP 服务 (仅 stdio 模式使用)
   */
  async connectMCP(name: string, command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    if (!this.useHttpMode) {
      await this.mcpManager.connect(name, command, args, env);
    } else {
      logger.warn('connectMCP called in HTTP mode - ignoring');
    }
  }

  /**
   * 断开 MCP 服务 (仅 stdio 模式使用)
   */
  async disconnectMCP(name: string): Promise<void> {
    if (!this.useHttpMode) {
      await this.mcpManager.disconnect(name);
    } else {
      logger.warn('disconnectMCP called in HTTP mode - ignoring');
    }
  }

  /**
   * 获取已连接的 MCP 列表
   */
  getConnectedMCPs(): Array<{ name: string; command: string; args: string[]; env?: Record<string, string> }> {
    if (this.useHttpMode) {
      // HTTP 模式：返回配置的服务列表
      return [
        { name: 'x-mcp-service', command: 'http', args: [] },
        { name: 'github-mcp-service', command: 'http', args: [] },
        { name: 'base-mcp-service', command: 'http', args: [] },
      ];
    } else {
      return this.mcpManager.getConnectedMCPs();
    }
  }

  /**
   * 获取 MCP 工具列表
   */
  async getMCPTools(name: string): Promise<any[]> {
    if (this.useHttpMode && this.httpAdapter) {
      // HTTP 模式：通过 HTTP 适配器获取
      try {
        // 这里需要实现获取特定服务工具的方法
        return [];
      } catch (error) {
        logger.error(`Failed to get tools from ${name} in HTTP mode:`, error);
        return [];
      }
    } else {
      return await this.mcpManager.getTools(name);
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callMCPTool(mcpName: string, toolName: string, args: any): Promise<any> {
    if (this.useHttpMode && this.httpAdapter) {
      return await this.httpAdapter.callTool(mcpName, toolName, args);
    } else {
      return await this.mcpManager.callTool(mcpName, toolName, args);
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