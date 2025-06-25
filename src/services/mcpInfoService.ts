import { MCPInfo } from '../models/mcp.js';
import { logger } from '../utils/logger.js';
import { getMCPLogoService } from './mcpLogoService.js';

/**
 * MCP Information Service
 * Used to manage and provide metadata information for MCPs
 */
export class MCPInfoService {
  // Predefined MCP list
  private mcpList: MCPInfo[] = [
    {
      name: 'playwright',
      description: 'Playwright browser automation tool, can control browsers to access web pages',
      capabilities: ['browser', 'web-automation', 'screenshot', 'navigation'],
      authRequired: false,
      category: 'Automation Tools',
      imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
      githubUrl: 'https://github.com/microsoft/playwright'
    },
    {
      name: 'langchain',
      description: 'LangChain tool integration, provides document processing, vector search and other capabilities',
      capabilities: ['document-processing', 'vector-search', 'agents'],
      authRequired: true,
      authFields: ['api_key'],
      category: 'Development Tools',
      imageUrl: 'https://langchain.com/images/logo.svg',
      githubUrl: 'https://github.com/langchain-ai/langchainjs'
    },
    {
      name: 'github',
      description: 'GitHub tool, provides repository management, PR creation and other features',
      capabilities: ['repository', 'pull-request', 'issue'],
      authRequired: true,
      authFields: ['token'],
      category: 'Development Tools',
      imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      githubUrl: 'https://github.com/octokit/octokit.js'
    },
    {
      name: 'WebBrowserTool',
      description: 'General web browsing tool, can be used to access websites and retrieve information',
      capabilities: ['open-browser', 'visit-webpage', 'get-content'],
      authRequired: false,
      category: 'Network Tools',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/2985/2985975.png',
      githubUrl: 'https://github.com/puppeteer/puppeteer'
    },
    {
      name: 'FileSystemTool',
      description: 'File system tool, provides file reading, writing, querying and other functions',
      capabilities: ['read-file', 'write-file', 'list-directory'],
      authRequired: false,
      category: 'System Tools',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
      githubUrl: 'https://github.com/nodejs/node'
    },
    {
      name: 'GoogleSearchTool',
      description: 'Google search tool, provides web search functionality',
      capabilities: ['search', 'web-results'],
      authRequired: true,
      authFields: ['api_key'],
      category: 'Network Tools',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
      githubUrl: 'https://github.com/googleapis/google-api-nodejs-client'
    }
  ];

  constructor() {
    // Update logo URLs to use our S3/CloudFront URLs
    this.updateLogoUrls();
    
    logger.info(`MCPInfoService initialized, loaded ${this.mcpList.length} MCP information records`);
  }
  
  /**
   * Update logo URLs to use S3/CloudFront URLs
   * This ensures all MCP logos are served from the same domain
   */
  private updateLogoUrls(): void {
    const logoService = getMCPLogoService();
    
    // Skip if S3 is not configured
    if (!logoService.isConfigured()) {
      logger.warn('S3 not configured for MCP logos, using original URLs');
      return;
    }
    
    // Update each MCP's logo URL
    for (const mcp of this.mcpList) {
      try {
        // Extract file extension from original URL if possible
        let extension = '.png'; // Default extension
        if (mcp.imageUrl) {
          const urlPath = new URL(mcp.imageUrl).pathname;
          const filename = urlPath.split('/').pop() || '';
          const extMatch = filename.match(/\.[a-zA-Z0-9]+$/);
          if (extMatch) {
            extension = extMatch[0];
          }
        }
        
        // Get logo URL from our service
        const logoUrl = logoService.getLogoUrl(mcp.name, extension);
        logger.info(`Updated logo URL for ${mcp.name}: ${mcp.imageUrl} -> ${logoUrl}`);
        
        // Update the MCP info
        mcp.imageUrl = logoUrl;
      } catch (error) {
        logger.error(`Failed to update logo URL for ${mcp.name}:`, error);
      }
    }
  }

  /**
   * Get all MCP information
   * @returns List of all MCP information
   */
  getAllMCPs(): MCPInfo[] {
    return this.mcpList;
  }

  /**
   * Get MCP information by category
   * @param category Category name
   * @returns List of MCP information for the specified category
   */
  getMCPsByCategory(category: string): MCPInfo[] {
    const mcps = this.mcpList.filter(mcp => mcp.category === category);
    logger.info(`Getting MCPs for category "${category}", found ${mcps.length}`);
    return mcps;
  }

  /**
   * Get all available MCP categories
   * @returns Array of objects containing category name and corresponding MCP count
   */
  getAllCategories(): Array<{name: string; count: number}> {
    // Get all categories and their corresponding MCP counts
    const categoryMap = new Map<string, number>();
    
    // Count MCPs for each category
    this.mcpList.forEach(mcp => {
      if (mcp.category) {
        const category = mcp.category;
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      }
    });
    
    // Convert to array of objects
    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({
      name,
      count
    }));
    
    logger.info(`Getting all MCP categories, found ${categories.length} categories`);
    return categories;
  }

  /**
   * Get MCP information by ID
   * @param mcpId MCP ID (i.e., name)
   * @returns MCP information, or undefined if not found
   */
  getMCPById(mcpId: string): MCPInfo | undefined {
    const mcp = this.mcpList.find(mcp => mcp.name === mcpId);
    if (mcp) {
      logger.info(`Successfully retrieved MCP information [ID: ${mcpId}]`);
    } else {
      logger.warn(`Failed to get MCP information [ID: ${mcpId}], not found`);
    }
    return mcp;
  }

  /**
   * Add new MCP information
   * @param mcp MCP information
   * @returns Whether the addition was successful
   */
  addMCP(mcp: MCPInfo): boolean {
    // Check if MCP with the same name already exists
    if (this.mcpList.some(existingMcp => existingMcp.name === mcp.name)) {
      logger.warn(`Failed to add MCP, MCP with the same name already exists [Name: ${mcp.name}]`);
      return false;
    }
    
    // Update logo URL to use our S3/CloudFront URL if possible
    const logoService = getMCPLogoService();
    if (logoService.isConfigured()) {
      try {
        // Extract extension from original URL or use default
        let extension = '.png';
        if (mcp.imageUrl) {
          const urlPath = new URL(mcp.imageUrl).pathname;
          const filename = urlPath.split('/').pop() || '';
          const extMatch = filename.match(/\.[a-zA-Z0-9]+$/);
          if (extMatch) {
            extension = extMatch[0];
          }
        }
        
        // Update the logo URL
        mcp.imageUrl = logoService.getLogoUrl(mcp.name, extension);
        logger.info(`Set logo URL for new MCP ${mcp.name}: ${mcp.imageUrl}`);
      } catch (error) {
        logger.error(`Failed to update logo URL for new MCP ${mcp.name}:`, error);
      }
    } else if (!mcp.imageUrl) {
      // If no imageUrl is provided and S3 is not configured, use a fallback
      mcp.imageUrl = logoService.getFallbackLogoUrl(mcp.name);
    }
    
    this.mcpList.push(mcp);
    logger.info(`Successfully added new MCP [Name: ${mcp.name}]`);
    return true;
  }
  
  /**
   * Get logo URL for an MCP
   * @param mcpName Name of the MCP
   * @param extension File extension (optional)
   * @returns Logo URL
   */
  getLogoUrl(mcpName: string, extension?: string): string {
    const logoService = getMCPLogoService();
    
    if (logoService.isConfigured()) {
      return logoService.getLogoUrl(mcpName, extension);
    } else {
      return logoService.getFallbackLogoUrl(mcpName);
    }
  }
}

// Export service instance
export const mcpInfoService = new MCPInfoService(); 