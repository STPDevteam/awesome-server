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
      name: 'playwright',
      description: 'Playwright browser automation tool, can control browsers to access web pages',
      capabilities: ['browser', 'web-automation', 'screenshot', 'navigation'],
      authRequired: false,
      category: 'Automation Tools',
      imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
      githubUrl: 'https://github.com/microsoft/playwright'
    },
    {
      name: '12306-mcp',
      description: '12306 Train ticket inquiry and booking tools',
      capabilities: ['train-ticket-query', 'station-search', 'schedule-check'],
      authRequired: false,
      category: 'others',
      imageUrl: 'https://www.12306.cn/index/images/logo.jpg',
      githubUrl: 'https://github.com/12306-mcp'
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
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
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
    },
    
    // Chain PRC 类别
    {
      name: 'base-mcp',
      description: 'Base Chain Protocol integration for blockchain operations',
      capabilities: ['blockchain-query', 'transaction-tracking', 'smart-contract'],
      authRequired: false,
      category: 'Chain PRC',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/base.ico',
      githubUrl: 'https://github.com/base/base-mcp'
    },
    {
      name: 'evm-mcp-server',
      description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
      capabilities: [
        'multi-chain-support', 'blockchain-data-access', 'token-services', 
        'nft-operations', 'smart-contract-interactions', 'transaction-support',
        'ens-resolution', 'balance-queries', 'token-transfers', 'contract-verification',
        'gas-estimation', 'event-logs', 'block-data', 'transaction-receipts',
        'ethereum', 'optimism', 'arbitrum', 'base', 'polygon', 'avalanche', 'bsc'
      ],
      authRequired: false, // 基础查询不需要认证，但交易操作需要私钥
      authFields: ['private_key'], // 仅在需要发送交易时需要
      category: 'Chain PRC',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
      githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server'
    },
    

    {
      name: 'coingecko-server',
      description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data, historical prices, and OHLC candlestick data',
      capabilities: [
        'get-coins', 'find-coin-ids', 'get-historical-data', 'get-ohlc-data', 
        'refresh-cache', 'crypto-prices', 'market-data', 'coin-info',
        'price-history', 'market-cap-data', 'volume-data', 'candlestick-data'
      ],
      authRequired: true,
      authFields: ['COINGECKO_API_KEY'],
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
      githubUrl: 'https://docs.coingecko.com/reference/mcp-server'
    },
    {
      name: 'coinmarketcap-mcp',
      description: 'CoinMarketCap market data integration',
      capabilities: ['crypto-prices', 'market-cap', 'trading-volume'],
      authRequired: true,
      authFields: ['api_key'],
      category: 'Market Data',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
      githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp'
    },
    {
      name: 'mcp-server-defillama',
      description: 'DeFiLlama protocol data and analytics',
      capabilities: ['defi-protocols', 'tvl-data', 'yield-farming'],
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://defillama.com/favicon.ico',
      githubUrl: 'https://github.com/dcSpark/mcp-server-defillama'
    },
    {
      name: 'dune-mcp-server',
      description: 'Dune Analytics blockchain data queries',
      capabilities: ['sql-queries', 'blockchain-analytics', 'data-visualization'],
      authRequired: true,
      authFields: ['api_key'],
      category: 'Market Data',
      imageUrl: 'https://dune.com/favicon.ico',
      githubUrl: 'https://github.com/ekailabs/dune-mcp-server'
    },
    {
      name: 'rug-check-mcp',
      description: 'Rug Check security analysis for tokens',
      capabilities: ['token-security', 'rug-detection', 'contract-analysis'],
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://rugcheck.xyz/favicon.ico',
      githubUrl: 'https://github.com/kukapay/rug-check-mcp'
    },
    {
      name: 'chainlink-feeds-mcp',
      description: 'ChainLink price feeds and oracle data',
      capabilities: ['price-feeds', 'oracle-data', 'real-time-prices'],
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://chain.link/favicon.ico',
      githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp'
    },
    {
      name: 'crypto-feargreed-mcp',
      description: 'Fear & Greed Index for cryptocurrency market sentiment',
      capabilities: ['sentiment-analysis', 'market-psychology', 'fear-greed-index'],
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://alternative.me/favicon.ico',
      githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp'
    },
    {
      name: 'whale-tracker-mcp',
      description: 'Whale Tracker for large cryptocurrency transactions',
      capabilities: ['whale-tracking', 'large-transactions', 'wallet-monitoring'],
      authRequired: false,
      category: 'Market Data',
      imageUrl: 'https://whale-alert.io/favicon.ico',
      githubUrl: 'https://github.com/kukapay/whale-tracker-mcp'
    },
    
    // Dev Tool 类别
    {
      name: 'github-mcp-server',
      description: 'GitHub repository management and operations',
      capabilities: ['repository-management', 'pull-requests', 'issues', 'code-review'],
      authRequired: true,
      authFields: ['github_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
      githubUrl: 'https://github.com/github/github-mcp-server'
    },
    {
      name: 'langchain-mcp',
      description: 'LangChain integration for AI workflows',
      capabilities: ['ai-workflows', 'document-processing', 'embeddings'],
      authRequired: true,
      authFields: ['openai_api_key'],
      category: 'Development Tools',
      imageUrl: 'https://langchain.com/images/logo.svg',
      githubUrl: 'https://github.com/langchain-ai/langchain'
    },
    {
      name: 'minds-mcp',
      description: 'MindsDB machine learning database integration',
      capabilities: ['ml-models', 'predictive-analytics', 'data-processing'],
      authRequired: true,
      authFields: ['mindsdb_api_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-money-minded-68.png',
      githubUrl: 'https://github.com/mindsdb/minds-mcp'
    },
    {
      name: 'playwright-mcp',
      description: 'Playwright browser automation for testing',
      capabilities: ['browser-automation', 'testing', 'scraping'],
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
      githubUrl: 'https://github.com/microsoft/playwright-mcp'
    },
    {
      name: 'blender-mcp',
      description: 'Blender 3D modeling and animation integration',
      capabilities: ['3d-modeling', 'animation', 'rendering'],
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-blender-100.png',
      githubUrl: 'https://github.com/ahujasid/blender-mcp'
    },
    {
      name: 'unity-mcp',
      description: 'Unity game engine integration',
      capabilities: ['game-development', 'unity-scripting', 'asset-management'],
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unity-100.png',
      githubUrl: 'https://github.com/justinpbarnett/unity-mcp'
    },
    {
      name: 'unreal-mcp',
      description: 'Unreal Engine integration',
      capabilities: ['game-development', 'blueprints', 'level-design'],
      authRequired: false,
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unreal-engine-100.png',
      githubUrl: 'https://github.com/chongdashu/unreal-mcp'
    },
    {
      name: 'figma-context-mcp',
      description: 'Figma design tool integration',
      capabilities: ['design-tools', 'prototyping', 'collaboration'],
      authRequired: true,
      authFields: ['figma_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-figma-96.png',
      githubUrl: 'https://github.com/GLips/Figma-Context-MCP'
    },
    {
      name: 'aws-mcp',
      description: 'AWS cloud services integration',
      capabilities: ['cloud-services', 'ec2', 's3', 'lambda'],
      authRequired: true,
      authFields: ['aws_access_key', 'aws_secret_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
      githubUrl: 'https://awslabs.github.io/mcp/'
    },
    {
      name: 'convex-mcp',
      description: 'Convex backend platform integration',
      capabilities: ['backend-services', 'database', 'real-time'],
      authRequired: true,
      authFields: ['convex_deploy_key'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-convex-66.png',
      githubUrl: 'https://github.com/get-convex/convex-backend'
    },
    {
      name: 'cloudflare-mcp',
      description: 'Cloudflare services integration',
      capabilities: ['cdn', 'dns', 'workers', 'pages'],
      authRequired: true,
      authFields: ['cloudflare_api_token'],
      category: 'Development Tools',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
      githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare'
    },
    {
      name: 'supabase-mcp',
      description: 'Supabase backend-as-a-service integration',
      capabilities: ['database', 'auth', 'storage', 'edge-functions'],
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
      capabilities: ['spot-trading', 'futures-trading', 'market-data'],
      authRequired: true,
      authFields: ['api_key', 'secret_key'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
      githubUrl: 'https://github.com/TermiX-official/binance-mcp'
    },
    {
      name: 'uniswap-trader-mcp',
      description: 'Uniswap decentralized exchange trading',
      capabilities: ['dex-trading', 'liquidity-pools', 'token-swaps'],
      authRequired: true,
      authFields: ['private_key', 'rpc_url'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-uniswap-100.png',
      githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp'
    },
    {
      name: 'server-hyperliquid',
      description: 'Hyperliquid perpetual trading platform',
      capabilities: ['perpetual-trading', 'derivatives', 'leverage'],
      authRequired: true,
      authFields: ['api_key', 'secret'],
      category: 'Trading',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.jpego',
      githubUrl: 'https://github.com/mektigboy/server-hyperliquid'
    },
    {
      name: 'pumpfun-mcp-server',
      description: 'Pump.fun meme token trading platform',
      capabilities: ['meme-tokens', 'token-creation', 'trading'],
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
      capabilities: ['messaging', 'server-management', 'bot-integration'],
      authRequired: true,
      authFields: ['bot_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
      githubUrl: 'https://github.com/hanweg/mcp-discord'
    },
    {
      name: 'mcp-telegram',
      description: 'Telegram messaging platform integration',
      capabilities: ['messaging', 'bot-creation', 'channel-management'],
      authRequired: true,
      authFields: ['bot_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
      githubUrl: 'https://github.com/sparfenyuk/mcp-telegram'
    },
    {
      name: 'x-mcp-server',
      description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Built-in rate limit handling for free API tier',
      capabilities: [
        'get-home-timeline', 'create-tweet', 'reply-to-tweet', 
        'rate-limit-handling', 'timeline-reading', 'tweet-engagement',
        'free-tier-support', 'monthly-usage-tracking', 'exponential-backoff'
      ],
      authRequired: true,
      authFields: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
      githubUrl: 'https://github.com/datawhisker/x-mcp-server'
    },
    {
      name: 'notion-mcp-server',
      description: 'Notion workspace and documentation integration',
      capabilities: ['page-creation', 'database-management', 'content-editing'],
      authRequired: true,
      authFields: ['notion_token'],
      category: 'Social',
      imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
      githubUrl: 'https://github.com/makenotion/notion-mcp-server'
    }
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