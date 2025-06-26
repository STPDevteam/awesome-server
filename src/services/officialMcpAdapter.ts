import { loadMcpTools, type LoadMcpToolsOptions } from '@langchain/mcp-adapters';
import { type StructuredToolInterface } from '@langchain/core/tools';
import { MCPManager } from './mcpManager.js';

export class OfficialMCPAdapter {
  constructor(private mcpManager: MCPManager) {}

  /**
   * 验证并确保MCP客户端连接正常
   * @param mcpName MCP名称
   * @param mcpConfig MCP配置信息
   * @returns 验证过的客户端实例
   */
  private async ensureClientConnection(mcpName: string, mcpConfig: any): Promise<any> {
    let client = this.mcpManager.getClient(mcpName);
    if (!client) {
      throw new Error(`No client found for MCP: ${mcpName}`);
    }

    // 检查客户端连接状态
    try {
      // 通过尝试列出工具来验证连接状态
      await client.listTools();
      console.log(`✅ Client connection verified for ${mcpName}`);
      return client;
    } catch (connectionError) {
      console.error(`❌ Client connection failed for ${mcpName}:`, connectionError);
      console.log(`🔄 Attempting to reconnect ${mcpName}...`);
      
      try {
        // 尝试重新连接
        await this.mcpManager.disconnect(mcpName);
        await this.mcpManager.connect(mcpName, mcpConfig.command, mcpConfig.args, mcpConfig.env);
        
        // 重新获取客户端
        const reconnectedClient = this.mcpManager.getClient(mcpName);
        if (!reconnectedClient) {
          throw new Error(`Failed to get reconnected client for ${mcpName}`);
        }
        
        // 验证重连后的连接
        await reconnectedClient.listTools();
        console.log(`✅ Successfully reconnected ${mcpName}`);
        
        return reconnectedClient;
      } catch (reconnectError) {
        console.error(`❌ Failed to reconnect ${mcpName}:`, reconnectError);
        throw new Error(`MCP ${mcpName} connection failed and reconnection failed: ${reconnectError}`);
      }
    }
  }

  /**
   * 使用官方 LangChain MCP Adapters 获取所有工具
   */
  async getAllTools(): Promise<StructuredToolInterface[]> {
    const tools: StructuredToolInterface[] = [];
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    console.log(`📋 Processing ${connectedMCPs.length} connected MCP servers with official adapters`);
    
    for (const mcp of connectedMCPs) {
      try {
        // 验证并确保客户端连接
        const client = await this.ensureClientConnection(mcp.name, mcp);

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
    // 获取 MCP 配置信息
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    const mcpConfig = connectedMCPs.find(mcp => mcp.name === mcpName);
    
    if (!mcpConfig) {
      throw new Error(`MCP ${mcpName} configuration not found`);
    }

    // 验证并确保客户端连接
    const client = await this.ensureClientConnection(mcpName, mcpConfig);

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