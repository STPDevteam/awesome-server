import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPManager } from './mcpManager.js';

export class MCPToolAdapter {
  constructor(private mcpManager: MCPManager) {}

  /**
   * 生成符合 OpenAI API 限制的工具名称（最大64字符）
   */
  private generateToolName(mcpName: string, toolName: string): string {
  const sanitize = (s: string) =>
    s.replace(/[^a-zA-Z0-9_-]/g, '_'); // 替换非法字符

  // 1. 简化 MCP 名称
  let shortMcpName = mcpName
    .replace('-mcp-server', '')
    .replace('-mcp', '')
    .replace('_server', '')
    .replace('_mcp', '');

  // 清洗
  shortMcpName = sanitize(shortMcpName);
  toolName = sanitize(toolName);

  // 2. 构建名称
  let fullName = `${shortMcpName}_${toolName}`;

  // 3. 若超出长度，截断
  if (fullName.length > 64) {
    const maxMcpLength = 20;
    const maxToolLength = 43;

    if (shortMcpName.length > maxMcpLength) {
      shortMcpName = shortMcpName.substring(0, maxMcpLength);
    }

    if (toolName.length > maxToolLength) {
      toolName = toolName.substring(0, maxToolLength);
    }

    fullName = `${shortMcpName}_${toolName}`;
    return fullName.length > 64 ? fullName.substring(0, 64) : fullName;
  }

  return fullName;
}

  /**
   * 将 MCP 工具转换为 LangChain 工具
   */
  async convertMCPToolToLangChainTool(mcpName: string, mcpTool: any): Promise<DynamicStructuredTool> {
    // 构建 Zod schema
    const schema = this.buildZodSchema(mcpTool.inputSchema || {});
    
    // 使用新的名称生成方法
    const toolName = this.generateToolName(mcpName, mcpTool.name);
    
    console.log(`Generated tool name: "${toolName}" (length: ${toolName.length}) for ${mcpName}:${mcpTool.name}`);
    
    return new DynamicStructuredTool({
      name: toolName,
      description: mcpTool.description || `Tool ${mcpTool.name} from ${mcpName}`,
      schema,
      func: async (input) => {
        try {
          const result = await this.mcpManager.callTool(mcpName, mcpTool.name, input);
          
          // 处理不同类型的返回结果
          if (result.content) {
            if (Array.isArray(result.content)) {
              // 如果是数组，转换为字符串
              return JSON.stringify(result.content, null, 2);
            } else if (typeof result.content === 'object') {
              // 如果是对象，检查是否有 text 字段
              if (result.content.text) {
                return result.content.text;
              }
              return JSON.stringify(result.content, null, 2);
            } else {
              return String(result.content);
            }
          }
          
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error calling tool ${mcpTool.name}: ${error}`;
        }
      },
    });
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
            // 改进数组类型处理
            if (fieldSchema.items) {
              // 如果有 items 定义，根据 items 类型创建数组
              const itemType = this.buildArrayItemType(fieldSchema.items);
              zodType = z.array(itemType);
            } else {
              // 如果没有 items 定义，使用字符串数组作为默认
              zodType = z.array(z.string());
            }
            break;
          case 'object':
            // 改进对象类型处理
            if (fieldSchema.properties) {
              const nestedSchema = this.buildZodSchema(fieldSchema);
              zodType = nestedSchema;
            } else {
              zodType = z.object({}).passthrough(); // 允许任意属性
            }
            break;
          default:
            zodType = z.any();
        }
        
        // 添加描述
        if (fieldSchema.description) {
          zodType = zodType.describe(fieldSchema.description);
        }
        
        // 处理是否必需
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
      return z.string(); // 默认为字符串类型
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
        // 嵌套数组
        const nestedItemType = this.buildArrayItemType(itemSchema.items);
        return z.array(nestedItemType);
      default:
        return z.string(); // 默认为字符串类型
    }
  }

  /**
   * 获取所有已连接 MCP 的所有工具
   */
  async getAllTools(): Promise<DynamicStructuredTool[]> {
    const tools: DynamicStructuredTool[] = [];
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    for (const mcp of connectedMCPs) {
      try {
        const mcpTools = await this.mcpManager.getTools(mcp.name);
        
        console.log(`Processing ${mcpTools.length} tools from ${mcp.name}`);
        
        for (const mcpTool of mcpTools) {
          const langchainTool = await this.convertMCPToolToLangChainTool(mcp.name, mcpTool);
          tools.push(langchainTool);
        }
      } catch (error) {
        console.error(`Failed to get tools from ${mcp.name}:`, error);
      }
    }
    
    console.log(`Total tools prepared: ${tools.length}`);
    return tools;
  }
} 