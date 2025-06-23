import { MCPInfo } from '../models/mcp.js';
import { logger } from '../utils/logger.js';

/**
 * MCP信息服务
 * 用于管理和提供MCP的元数据信息
 */
export class MCPInfoService {
  // 预定义的MCP列表
  private mcpList: MCPInfo[] = [
    {
      name: 'playwright',
      description: 'Playwright 浏览器自动化工具，可以控制浏览器访问网页',
      capabilities: ['browser', 'web-automation', 'screenshot', 'navigation'],
      authRequired: false,
      category: '自动化工具',
      imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
      githubUrl: 'https://github.com/microsoft/playwright'
    },
    {
      name: 'langchain',
      description: 'LangChain 工具集成，提供文档处理、向量搜索等能力',
      capabilities: ['document-processing', 'vector-search', 'agents'],
      authRequired: true,
      authFields: ['api_key'],
      category: '开发工具',
      imageUrl: 'https://langchain.com/images/logo.svg',
      githubUrl: 'https://github.com/langchain-ai/langchainjs'
    },
    {
      name: 'github',
      description: 'GitHub 工具，提供代码仓库管理、PR创建等功能',
      capabilities: ['repository', 'pull-request', 'issue'],
      authRequired: true,
      authFields: ['token'],
      category: '开发工具',
      imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      githubUrl: 'https://github.com/octokit/octokit.js'
    },
    {
      name: 'WebBrowserTool',
      description: '通用网页浏览工具，可以用于访问网页并获取信息',
      capabilities: ['open-browser', 'visit-webpage', 'get-content'],
      authRequired: false,
      category: '网络工具',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/2985/2985975.png',
      githubUrl: 'https://github.com/puppeteer/puppeteer'
    },
    {
      name: 'FileSystemTool',
      description: '文件系统工具，提供文件读写、查询等功能',
      capabilities: ['read-file', 'write-file', 'list-directory'],
      authRequired: false,
      category: '系统工具',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
      githubUrl: 'https://github.com/nodejs/node'
    },
    {
      name: 'GoogleSearchTool',
      description: 'Google搜索工具，提供网络搜索功能',
      capabilities: ['search', 'web-results'],
      authRequired: true,
      authFields: ['api_key'],
      category: '网络工具',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
      githubUrl: 'https://github.com/googleapis/google-api-nodejs-client'
    }
  ];

  constructor() {
    logger.info(`MCPInfoService 已初始化，加载了 ${this.mcpList.length} 个MCP信息`);
  }

  /**
   * 获取所有MCP信息
   * @returns 所有MCP信息列表
   */
  getAllMCPs(): MCPInfo[] {
    return this.mcpList;
  }

  /**
   * 根据类别获取MCP信息
   * @param category 类别名称
   * @returns 指定类别的MCP信息列表
   */
  getMCPsByCategory(category: string): MCPInfo[] {
    const mcps = this.mcpList.filter(mcp => mcp.category === category);
    logger.info(`获取类别"${category}"的MCP，找到 ${mcps.length} 个`);
    return mcps;
  }

  /**
   * 获取所有可用的MCP类别
   * @returns 类别名称数组
   */
  getAllCategories(): string[] {
    // 获取所有不重复的类别
    const categories = [...new Set(this.mcpList
      .filter(mcp => mcp.category)
      .map(mcp => mcp.category as string))];
    
    logger.info(`获取所有MCP类别，找到 ${categories.length} 个类别`);
    return categories;
  }

  /**
   * 根据MCP ID获取信息
   * @param mcpId MCP的ID（即名称）
   * @returns MCP信息，如果不存在则返回undefined
   */
  getMCPById(mcpId: string): MCPInfo | undefined {
    const mcp = this.mcpList.find(mcp => mcp.name === mcpId);
    if (mcp) {
      logger.info(`获取MCP信息 [ID: ${mcpId}] 成功`);
    } else {
      logger.warn(`获取MCP信息 [ID: ${mcpId}] 失败，未找到相应信息`);
    }
    return mcp;
  }

  /**
   * 添加新的MCP信息
   * @param mcp MCP信息
   * @returns 是否添加成功
   */
  addMCP(mcp: MCPInfo): boolean {
    // 检查是否已存在同名MCP
    if (this.mcpList.some(existingMcp => existingMcp.name === mcp.name)) {
      logger.warn(`添加MCP失败，已存在同名MCP [名称: ${mcp.name}]`);
      return false;
    }
    
    this.mcpList.push(mcp);
    logger.info(`成功添加新MCP [名称: ${mcp.name}]`);
    return true;
  }
}

// 导出服务实例
export const mcpInfoService = new MCPInfoService(); 