import { loadMcpTools, type LoadMcpToolsOptions } from '@langchain/mcp-adapters';
import { type StructuredToolInterface } from '@langchain/core/tools';
import { MCPManager } from './mcpManager.js';

export class OfficialMCPAdapter {
  constructor(private mcpManager: MCPManager) {}

  /**
   * 使用官方 LangChain MCP Adapters 获取所有工具
   */
  async getAllTools(): Promise<StructuredToolInterface[]> {
    const tools: StructuredToolInterface[] = [];
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    console.log(`📋 Processing ${connectedMCPs.length} connected MCP servers with official adapters`);
    
    for (const mcp of connectedMCPs) {
      try {
        // 获取 MCP 客户端
        const client = this.mcpManager.getClient(mcp.name);
        if (!client) {
          console.error(`❌ No client found for MCP: ${mcp.name}`);
          continue;
        }

        console.log(`🔧 Loading tools from ${mcp.name} using official LangChain MCP Adapters...`);

        // 配置官方适配器选项
        const options: LoadMcpToolsOptions = {
          throwOnLoadError: false, // 不要因为单个工具加载失败而停止
          prefixToolNameWithServerName: true, // 添加服务器名称前缀避免冲突
          additionalToolNamePrefix: '', // 可以添加额外前缀，比如 'mcp'
          useStandardContentBlocks: true, // 使用标准内容块处理多媒体内容
          outputHandling: {
            text: 'content',
            image: 'content', 
            audio: 'content',
            resource: 'artifact' // 资源放在 artifact 中
          }
        };

        // 使用官方 loadMcpTools 函数 (使用类型断言解决兼容性问题)
        const mcpTools = await loadMcpTools(mcp.name, client as any, options);
        
        console.log(`✅ Successfully loaded ${mcpTools.length} tools from ${mcp.name}`);
        
        // 显示工具详情
        mcpTools.forEach(tool => {
          console.log(`   🛠️  ${tool.name}: ${tool.description}`);
        });

        tools.push(...mcpTools);
        
      } catch (error) {
        console.error(`❌ Failed to load tools from ${mcp.name}:`, error);
        // 继续处理其他 MCP，不要因为一个失败就停止
      }
    }
    
    console.log(`🎯 Total tools loaded: ${tools.length}`);
    return tools;
  }

  /**
   * 获取特定 MCP 的工具
   */
  async getToolsFromMcp(mcpName: string, options?: LoadMcpToolsOptions): Promise<StructuredToolInterface[]> {
    const client = this.mcpManager.getClient(mcpName);
    if (!client) {
      throw new Error(`MCP ${mcpName} is not connected`);
    }

    const defaultOptions: LoadMcpToolsOptions = {
      throwOnLoadError: true, // 单独加载时可以抛出错误
      prefixToolNameWithServerName: true,
      useStandardContentBlocks: true,
      outputHandling: {
        text: 'content',
        image: 'content',
        audio: 'content', 
        resource: 'artifact'
      }
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    console.log(`🔧 Loading tools from ${mcpName} with options:`, finalOptions);
    
    return await loadMcpTools(mcpName, client as any, finalOptions);
  }

  /**
   * 检查适配器状态
   */
  getAdapterInfo() {
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    return {
      adapterType: 'official',
      package: '@langchain/mcp-adapters',
      connectedMcpCount: connectedMCPs.length,
      connectedMcps: connectedMCPs.map(mcp => ({
        name: mcp.name,
        command: mcp.command,
        args: mcp.args
      }))
    };
  }
} 