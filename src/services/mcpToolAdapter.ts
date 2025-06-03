import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPManager } from './mcpManager.js';

export class MCPToolAdapter {
  constructor(private mcpManager: MCPManager) {}

  /**
   * 将 MCP 工具转换为 LangChain 工具
   */
  async convertMCPToolToLangChainTool(mcpName: string, mcpTool: any): Promise<DynamicStructuredTool> {
    // 构建 Zod schema
    const schema = this.buildZodSchema(mcpTool.inputSchema || {});
    
    return new DynamicStructuredTool({
      name: `${mcpName}_${mcpTool.name}`,
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
            zodType = z.array(z.any());
            break;
          case 'object':
            zodType = z.object({});
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
   * 获取所有已连接 MCP 的所有工具
   */
  async getAllTools(): Promise<DynamicStructuredTool[]> {
    const tools: DynamicStructuredTool[] = [];
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    for (const mcp of connectedMCPs) {
      try {
        const mcpTools = await this.mcpManager.getTools(mcp.name);
        
        for (const mcpTool of mcpTools) {
          const langchainTool = await this.convertMCPToolToLangChainTool(mcp.name, mcpTool);
          tools.push(langchainTool);
        }
      } catch (error) {
        console.error(`Failed to get tools from ${mcp.name}:`, error);
      }
    }
    
    return tools;
  }
} 