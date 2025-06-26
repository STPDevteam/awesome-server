import { MCPInfo } from '../models/mcp.js';
import { logger } from '../utils/logger.js';

/**
 * MCP Information Service
 * Used to manage and provide metadata information for MCPs
 */
export class MCPInfoService {
  // Predefined MCP list
  private mcpList: MCPInfo[] = [
    {
      name: '12306-mcp',
      description: '12306 Train ticket inquiry and booking tools',
      authRequired: false,
      category: 'Others',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/12306.png',
      githubUrl: 'https://github.com/12306-mcp'
    },
    {
      name: 'langchain',
      description: 'LangChain tool integration, provides document processing, vector search and other capabilities',
      authRequired: true,
      authFields: ['api_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/langchain.png',
      githubUrl: 'https://github.com/langchain-ai/langchainjs'
    },
    {
      name: 'github',
      description: 'GitHub tool, provides repository management, PR creation and other features',
      authRequired: true,
      authFields: ['token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
      githubUrl: 'https://github.com/octokit/octokit.js'
    },
    {
      name: 'WebBrowserTool',
      description: 'General web browsing tool, can be used to access websites and retrieve information',
      authRequired: false,
      category: 'Network Tools',
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/2985/2985975.png',
      githubUrl: 'https://github.com/puppeteer/puppeteer'
    },
    {
      name: 'FileSystemTool',
      description: 'File system tool, provides file reading, writing, querying and other functions',
      authRequired: false,
      category: 'System Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-file-100.png',
      githubUrl: 'https://github.com/nodejs/node'
    },
    {
      name: 'GoogleSearchTool',
      description: 'Google search tool, provides web search functionality',
      authRequired: true,
      authFields: ['api_key'],
      category: 'Network Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-google-100.png',
      githubUrl: 'https://github.com/googleapis/google-api-nodejs-client'
    },
    
    // Chain PRC 类别
    {
      name: 'base-mcp',
      description: 'Base Chain Protocol integration for blockchain operations',
      authRequired: false,
      category: 'Chain PRC',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/base.ico',
      githubUrl: 'https://github.com/base/base-mcp'
    },
    {
      name: 'evm-mcp',
      description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
      authRequired: true, // 需要RPC URL和钱包私钥
      authFields: ['RPC_PROVIDER_URL', 'WALLET_PRIVATE_KEY'], // 连接需要的环境变量
      category: 'Chain PRC',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
      githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server'
    },
    

    {
      name: 'coingecko-server',
      description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data, historical prices, and OHLC candlestick data',
      authRequired: true,
      authFields: ['COINGECKO_API_KEY'],
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
      githubUrl: 'https://docs.coingecko.com/reference/mcp-server'
    },
    {
      name: 'coinmarketcap-mcp',
      description: 'CoinMarketCap market data integration',
      authRequired: true,
      authFields: ['api_key'],
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
      githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp'
    },
    {
      name: 'mcp-server-defillama',
      description: 'DeFiLlama protocol data and analytics',
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-defillama.png',
      githubUrl: 'https://github.com/dcSpark/mcp-server-defillama'
    },
    {
      name: 'dune-mcp-server',
      description: 'Dune Analytics blockchain data queries',
      
      authRequired: true,
      authFields: ['api_key'],
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dune.png',
      githubUrl: 'https://github.com/ekailabs/dune-mcp-server'
    },
    {
      name: 'rug-check-mcp',
      description: 'Rug Check security analysis for tokens',
      
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-rug-100.png',
      githubUrl: 'https://github.com/kukapay/rug-check-mcp'
    },
    {
      name: 'chainlink-feeds-mcp',
      description: 'ChainLink price feeds and oracle data',
      
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-chainlink-100.png',
      githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp'
    },
    {
      name: 'crypto-feargreed-mcp',
      description: 'Fear & Greed Index for cryptocurrency market sentiment',
      
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
      githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp'
    },
    {
      name: 'whale-tracker-mcp',
      description: 'Whale Tracker for large cryptocurrency transactions',
      
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
      githubUrl: 'https://github.com/kukapay/whale-tracker-mcp'
    },
    
    // Dev Tool 类别
    {
      name: 'github-mcp-server',
      description: 'GitHub repository management and operations',
      
      authRequired: true,
      authFields: ['github_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
      githubUrl: 'https://github.com/github/github-mcp-server'
    },
    {
      name: 'langchain-mcp',
      description: 'LangChain integration for AI workflows',
      
      authRequired: true,
      authFields: ['openai_api_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/langchain.png',
      githubUrl: 'https://github.com/langchain-ai/langchain'
    },
    {
      name: 'minds-mcp',
      description: 'MindsDB machine learning database integration',
      
      authRequired: true,
      authFields: ['mindsdb_api_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-money-minded-68.png',
      githubUrl: 'https://github.com/mindsdb/minds-mcp'
    },
    {
      name: 'playwright-mcp',
      description: 'Playwright browser automation for testing',
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
      githubUrl: 'https://github.com/microsoft/playwright-mcp'
    },
    {
      name: 'blender-mcp',
      description: 'Blender 3D modeling and animation integration',
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-blender-100.png',
      githubUrl: 'https://github.com/ahujasid/blender-mcp'
    },
    {
      name: 'unity-mcp',
      description: 'Unity game engine integration',
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unity-100.png',
      githubUrl: 'https://github.com/justinpbarnett/unity-mcp'
    },
    {
      name: 'unreal-mcp',
      description: 'Unreal Engine integration',
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unreal-engine-100.png',
      githubUrl: 'https://github.com/chongdashu/unreal-mcp'
    },
    {
      name: 'figma-context-mcp',
      description: 'Figma design tool integration',
      authRequired: true,
      authFields: ['figma_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-figma-96.png',
      githubUrl: 'https://github.com/GLips/Figma-Context-MCP'
    },
    {
      name: 'aws-mcp',
      description: 'AWS cloud services integration',
      authRequired: true,
      authFields: ['aws_access_key', 'aws_secret_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
      githubUrl: 'https://awslabs.github.io/mcp/'
    },
    {
      name: 'convex-mcp',
      description: 'Convex backend platform integration',
      authRequired: true,
      authFields: ['convex_deploy_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-convex-66.png',
      githubUrl: 'https://github.com/get-convex/convex-backend'
    },
    {
      name: 'cloudflare-mcp',
      description: 'Cloudflare services integration',
      authRequired: true,
      authFields: ['cloudflare_api_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
      githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare'
    },
    {
      name: 'supabase-mcp',
      description: 'Supabase backend-as-a-service integration',
      authRequired: true,
      authFields: ['supabase_url', 'supabase_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-supabase-100.png',
      githubUrl: 'https://github.com/supabase-community/supabase-mcp'
    },
    
    // Trading 类别
    {
      name: 'binance-mcp',
      description: 'Binance cryptocurrency exchange integration',
      authRequired: true,
      authFields: ['api_key', 'secret_key'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
      githubUrl: 'https://github.com/TermiX-official/binance-mcp'
    },
    {
      name: 'uniswap-trader-mcp',
      description: 'Uniswap decentralized exchange trading',
      authRequired: true,
      authFields: ['private_key', 'rpc_url'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-uniswap-100.png',
      githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp'
    },
    {
      name: 'server-hyperliquid',
      description: 'Hyperliquid perpetual trading platform',
      authRequired: true,
      authFields: ['api_key', 'secret'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.jpego',
      githubUrl: 'https://github.com/mektigboy/server-hyperliquid'
    },
    {
      name: 'pumpfun-mcp-server',
      description: 'Pump.fun meme token trading platform',
      authRequired: true,
      authFields: ['wallet_private_key'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-pumpkin-96.png',
      githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server'
    },
    
    // Social 类别
    {
      name: 'mcp-discord',
      description: 'Discord social platform integration',
      authRequired: true,
      authFields: ['bot_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
      githubUrl: 'https://github.com/hanweg/mcp-discord'
    },
    {
      name: 'mcp-telegram',
      description: 'Telegram messaging platform integration',
      authRequired: true,
      authFields: ['bot_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
      githubUrl: 'https://github.com/sparfenyuk/mcp-telegram'
    },
    {
      name: 'x-mcp-server',
      description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Built-in rate limit handling for free API tier',
      authRequired: true,
      authFields: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
      githubUrl: 'https://github.com/datawhisker/x-mcp-server'
    },
    {
      name: 'notion-mcp-server',
      description: 'Notion workspace and documentation integration',
      authRequired: true,
      authFields: ['notion_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
      githubUrl: 'https://github.com/makenotion/notion-mcp-server'
    },
  ];

  constructor() {
    logger.info(`MCPInfoService initialized, loaded ${this.mcpList.length} MCP information records`);
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
    
    this.mcpList.push(mcp);
    logger.info(`Successfully added new MCP [Name: ${mcp.name}]`);
    return true;
  }
  

}

// Export service instance
export const mcpInfoService = new MCPInfoService(); 