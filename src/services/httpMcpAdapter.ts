import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

export interface MCPServiceEndpoint {
  name: string;
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

export interface MCPToolCall {
  toolName: string;
  arguments: Record<string, any>;
}

export interface MCPToolResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export class HTTPMCPAdapter {
  private serviceEndpoints: Map<string, MCPServiceEndpoint> = new Map();
  private toolCache: Map<string, DynamicStructuredTool[]> = new Map();
  private requestCount = 0;
  private errorCount = 0;

  constructor() {
    this.initializeServices();
  }

  private initializeServices(): void {
    // Load service endpoints from environment variables
    const services: MCPServiceEndpoint[] = [
      {
        name: 'x-mcp-service',
        baseUrl: process.env.X_MCP_SERVICE_URL || 'http://x-mcp-service:3010',
        timeout: 30000,
        retries: 3
      },
      {
        name: 'github-mcp-service',
        baseUrl: process.env.GITHUB_MCP_SERVICE_URL || 'http://github-mcp-service:3011',
        timeout: 30000,
        retries: 3
      },
      {
        name: 'base-mcp-service',
        baseUrl: process.env.BASE_MCP_SERVICE_URL || 'http://base-mcp-service:3012',
        timeout: 30000,
        retries: 3
      },
      {
        name: 'coingecko-mcp-service',
        baseUrl: process.env.COINGECKO_MCP_SERVICE_URL || 'http://coingecko-mcp-service:3013',
        timeout: 30000,
        retries: 3
      }
    ];

    for (const service of services) {
      this.serviceEndpoints.set(service.name, service);
    }

    logger.info('HTTP MCP Adapter initialized with services:', {
      services: Array.from(this.serviceEndpoints.keys())
    });
  }

  /**
   * 获取所有可用的工具
   */
  async getAllTools(): Promise<DynamicStructuredTool[]> {
    const allTools: DynamicStructuredTool[] = [];

    for (const [serviceName, endpoint] of this.serviceEndpoints) {
      try {
        const tools = await this.getToolsFromService(serviceName, endpoint);
        allTools.push(...tools);
      } catch (error) {
        logger.error(`Failed to get tools from service ${serviceName}:`, error);
        this.errorCount++;
      }
    }

    logger.info(`Total tools loaded: ${allTools.length}`);
    return allTools;
  }

  /**
   * 从特定服务获取工具列表
   */
  private async getToolsFromService(serviceName: string, endpoint: MCPServiceEndpoint): Promise<DynamicStructuredTool[]> {
    // Check cache first
    if (this.toolCache.has(serviceName)) {
      return this.toolCache.get(serviceName)!;
    }

    try {
      const response = await this.makeRequest(endpoint, '/api/tools', 'GET');
      const toolDefinitions = response.data.tools || [];

      const tools: DynamicStructuredTool[] = [];

      for (const toolDef of toolDefinitions) {
        const tool = await this.createLangChainTool(serviceName, endpoint, toolDef);
        tools.push(tool);
      }

      // Cache the tools
      this.toolCache.set(serviceName, tools);
      
      logger.info(`Loaded ${tools.length} tools from ${serviceName}`);
      return tools;
    } catch (error) {
      logger.error(`Failed to fetch tools from ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * 创建LangChain工具
   */
  private async createLangChainTool(
    serviceName: string,
    endpoint: MCPServiceEndpoint,
    toolDef: any
  ): Promise<DynamicStructuredTool> {
    const toolName = this.generateToolName(serviceName, toolDef.name);
    const schema = this.buildZodSchema(toolDef.inputSchema || {});

    return new DynamicStructuredTool({
      name: toolName,
      description: toolDef.description || `Tool ${toolDef.name} from ${serviceName}`,
      schema,
      func: async (input) => {
        try {
          const result = await this.callTool(serviceName, toolDef.name, input);
          return this.formatToolResult(result);
        } catch (error) {
          const errorMessage = `Error calling tool ${toolDef.name} on ${serviceName}: ${error}`;
          logger.error(errorMessage);
          return errorMessage;
        }
      },
    });
  }

  /**
   * 调用工具
   */
  async callTool(serviceName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const endpoint = this.serviceEndpoints.get(serviceName);
    if (!endpoint) {
      throw new Error(`Service ${serviceName} not found`);
    }

    try {
      const payload: MCPToolCall = {
        toolName,
        arguments: args
      };

      const response = await this.makeRequest(endpoint, '/api/call-tool', 'POST', payload);
      this.requestCount++;

      if (response.data.success) {
        return response.data.result;
      } else {
        throw new Error(response.data.error || 'Tool call failed');
      }
    } catch (error) {
      this.errorCount++;
      logger.error(`Tool call failed for ${serviceName}:${toolName}:`, error);
      throw error;
    }
  }

  /**
   * 发起HTTP请求
   */
  private async makeRequest(
    endpoint: MCPServiceEndpoint,
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any
  ): Promise<{ data: any; status: number }> {
    const url = `${endpoint.baseUrl}${path}`;
    const retries = endpoint.retries || 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout || 30000);

        const response = await fetch(url, {
          method,
          body: data ? JSON.stringify(data) : undefined,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MCP-Server-HTTP-Adapter/1.0'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();
        return { data: responseData, status: response.status };
      } catch (error) {
        logger.warn(`Request attempt ${attempt} failed for ${url}:`, {
          error: error instanceof Error ? error.message : String(error)
        });

        if (attempt === retries) {
          throw error;
        }

        // Exponential backoff
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * 生成工具名称
   */
  private generateToolName(serviceName: string, toolName: string): string {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

    let shortServiceName = serviceName
      .replace('-mcp-service', '')
      .replace('-service', '')
      .replace('_service', '');

    shortServiceName = sanitize(shortServiceName);
    const sanitizedToolName = sanitize(toolName);

    const fullName = `${shortServiceName}_${sanitizedToolName}`;

    // Ensure the name is within OpenAI's 64-character limit
    return fullName.length > 64 ? fullName.substring(0, 64) : fullName;
  }

  /**
   * 构建Zod Schema
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
   * 检查服务健康状态
   */
  async checkServiceHealth(serviceName: string): Promise<boolean> {
    const endpoint = this.serviceEndpoints.get(serviceName);
    if (!endpoint) {
      return false;
    }

    try {
      const response = await this.makeRequest(endpoint, '/health', 'GET');
      return response.status === 200;
    } catch (error) {
      logger.warn(`Health check failed for ${serviceName}:`, error);
      return false;
    }
  }

  /**
   * 获取所有服务的健康状态
   */
  async getAllServiceHealth(): Promise<{ [serviceName: string]: boolean }> {
    const healthStatus: { [serviceName: string]: boolean } = {};

    const healthChecks = Array.from(this.serviceEndpoints.keys()).map(async (serviceName) => {
      healthStatus[serviceName] = await this.checkServiceHealth(serviceName);
    });

    await Promise.all(healthChecks);
    return healthStatus;
  }

  /**
   * 获取统计信息
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * 清除工具缓存
   */
  clearCache(): void {
    this.toolCache.clear();
    logger.info('Tool cache cleared');
  }

  /**
   * 添加新服务端点
   */
  addServiceEndpoint(endpoint: MCPServiceEndpoint): void {
    this.serviceEndpoints.set(endpoint.name, endpoint);
    logger.info(`Added service endpoint: ${endpoint.name} -> ${endpoint.baseUrl}`);
  }

  /**
   * 移除服务端点
   */
  removeServiceEndpoint(serviceName: string): void {
    this.serviceEndpoints.delete(serviceName);
    this.toolCache.delete(serviceName);
    logger.info(`Removed service endpoint: ${serviceName}`);
  }

  /**
   * 工具函数：睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 