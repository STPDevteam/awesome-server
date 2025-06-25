import { MCPService } from './mcpManager.js';
import { logger } from '../utils/logger.js';
import { mcpInfoService } from './mcpInfoService.js';

/**
 * 预定义的MCP服务列表
 * 这些服务将在应用启动时自动连接
 */
export const predefinedMCPs: MCPService[] = [
    // 现有服务
    {
        name: 'playwright',
        description: 'Playwright Tools for MCP.',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
        env: {},
        connected: false,
        category: '自动化工具',
        imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
        githubUrl: 'https://github.com/microsoft/playwright'
    },
    {
        name: '12306-mcp',
        description: '12306 火车票查询和预订工具',
        command: 'npx',
        args: ['-y', '12306-mcp'],
        env: {},
        connected: false,
        category: '交通工具',
        imageUrl: 'https://www.12306.cn/index/images/logo.jpg',
        githubUrl: 'https://github.com/12306-mcp'
    },
    
    // Chain RPC 服务
    {
        name: 'base-mcp',
        description: 'Base Chain RPC integration for blockchain operations',
        command: 'npx',
        args: ['-y', 'base-mcp'],
        env: {},
        connected: false,
        category: 'Chain PRC',
        imageUrl: 'https://base.org/favicon.ico',
        githubUrl: 'https://github.com/base/base-mcp'
    },
    {
        name: 'evm-mcp',
        description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
        command: 'npx',
        args: ['-y', '@mcpdotdirect/evm-mcp-server'],
        env: {},
        connected: false,
        category: 'Chain PRC',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
        githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server'
    },

    {
        name: 'coingecko-mcp',
        description: 'CoinGecko official MCP server for cryptocurrency market data, historical prices, and OHLC candlestick data',
        command: 'npx',
        args: ['-y', '@coingecko/coingecko-mcp'],
        env: {
            COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || ''
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://www.coingecko.com/favicon.ico',
        githubUrl: 'https://docs.coingecko.com/reference/mcp-server'
    },
    {
        name: 'coinmarketcap-mcp',
        description: 'CoinMarketCap cryptocurrency market data and analytics',
        command: 'npx',
        args: ['-y', 'coinmarketcap-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://coinmarketcap.com/favicon.ico',
        githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp'
    },
    {
        name: 'defillama-mcp',
        description: 'DeFiLlama DeFi protocol data and TVL analytics',
        command: 'npx',
        args: ['-y', 'mcp-server-defillama'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://defillama.com/favicon.ico',
        githubUrl: 'https://github.com/dcSpark/mcp-server-defillama'
    },
    {
        name: 'dune-mcp',
        description: 'Dune Analytics blockchain data queries and dashboards',
        command: 'npx',
        args: ['-y', 'dune-mcp-server'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://dune.com/favicon.ico',
        githubUrl: 'https://github.com/ekailabs/dune-mcp-server'
    },
    {
        name: 'rugcheck-mcp',
        description: 'Rug Check token security and risk analysis',
        command: 'npx',
        args: ['-y', 'rug-check-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://rugcheck.xyz/favicon.ico',
        githubUrl: 'https://github.com/kukapay/rug-check-mcp'
    },
    {
        name: 'chainlink-mcp',
        description: 'ChainLink price feeds and oracle data',
        command: 'npx',
        args: ['-y', 'chainlink-feeds-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://chain.link/favicon.ico',
        githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp'
    },
    {
        name: 'feargreed-mcp',
        description: 'Fear & Greed Index cryptocurrency market sentiment',
        command: 'npx',
        args: ['-y', 'crypto-feargreed-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://alternative.me/favicon.ico',
        githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp'
    },
    {
        name: 'whaletracker-mcp',
        description: 'Whale Tracker large transaction monitoring',
        command: 'npx',
        args: ['-y', 'whale-tracker-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://whalealert.io/favicon.ico',
        githubUrl: 'https://github.com/kukapay/whale-tracker-mcp'
    },
    
    // Development Tools 服务
    {
        name: 'github-mcp',
        description: 'GitHub repository management and operations',
        command: 'npx',
        args: ['-y', 'github-mcp-server'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
        githubUrl: 'https://github.com/github/github-mcp-server'
    },
    {
        name: 'langchain-mcp',
        description: 'LangChain framework integration for AI applications',
        command: 'npx',
        args: ['-y', 'langchain-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://python.langchain.com/favicon.ico',
        githubUrl: 'https://github.com/langchain-ai/langchain'
    },
    {
        name: 'mindsdb-mcp',
        description: 'MindsDB machine learning database integration',
        command: 'npx',
        args: ['-y', 'minds-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mindsdb.com/favicon.ico',
        githubUrl: 'https://github.com/mindsdb/minds-mcp'
    },
    {
        name: 'playwright-mcp',
        description: 'Playwright browser automation and testing',
        command: 'npx',
        args: ['-y', 'playwright-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
        githubUrl: 'https://github.com/microsoft/playwright-mcp'
    },
    {
        name: 'blender-mcp',
        description: 'Blender 3D modeling and animation integration',
        command: 'npx',
        args: ['-y', 'blender-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://www.blender.org/favicon.ico',
        githubUrl: 'https://github.com/ahujasid/blender-mcp'
    },
    {
        name: 'unity-mcp',
        description: 'Unity game engine development tools',
        command: 'npx',
        args: ['-y', 'unity-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://unity.com/favicon.ico',
        githubUrl: 'https://github.com/justinpbarnett/unity-mcp'
    },
    {
        name: 'unreal-mcp',
        description: 'Unreal Engine game development integration',
        command: 'npx',
        args: ['-y', 'unreal-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://www.unrealengine.com/favicon.ico',
        githubUrl: 'https://github.com/chongdashu/unreal-mcp'
    },
    {
        name: 'figma-mcp',
        description: 'Figma design tool integration and context',
        command: 'npx',
        args: ['-y', 'figma-context-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://www.figma.com/favicon.ico',
        githubUrl: 'https://github.com/GLips/Figma-Context-MCP'
    },
    {
        name: 'aws-mcp',
        description: 'AWS cloud services integration',
        command: 'npx',
        args: ['-y', 'aws-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://aws.amazon.com/favicon.ico',
        githubUrl: 'https://awslabs.github.io/mcp/'
    },
    {
        name: 'convex-mcp',
        description: 'Convex backend development platform',
        command: 'npx',
        args: ['-y', 'convex-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://convex.dev/favicon.ico',
        githubUrl: 'https://github.com/get-convex/convex-backend/blob/main/npm-packages/convex/src/cli/mcp.ts'
    },
    {
        name: 'cloudflare-mcp',
        description: 'Cloudflare edge computing and CDN services',
        command: 'npx',
        args: ['-y', 'mcp-server-cloudflare'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://www.cloudflare.com/favicon.ico',
        githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare'
    },
    {
        name: 'supabase-mcp',
        description: 'Supabase backend-as-a-service integration',
        command: 'npx',
        args: ['-y', 'supabase-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://supabase.com/favicon.ico',
        githubUrl: 'https://github.com/supabase-community/supabase-mcp'
    },
    
    // Trading 服务
    {
        name: 'binance-mcp',
        description: 'Binance cryptocurrency exchange trading',
        command: 'npx',
        args: ['-y', 'binance-mcp'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://www.binance.com/favicon.ico',
        githubUrl: 'https://github.com/TermiX-official/binance-mcp'
    },
    {
        name: 'uniswap-mcp',
        description: 'Uniswap DEX trading and liquidity management',
        command: 'npx',
        args: ['-y', 'uniswap-trader-mcp'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://uniswap.org/favicon.ico',
        githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp'
    },
    {
        name: 'hyperliquid-mcp',
        description: 'Hyperliquid decentralized perpetuals trading',
        command: 'npx',
        args: ['-y', 'server-hyperliquid'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://hyperliquid.xyz/favicon.ico',
        githubUrl: 'https://github.com/mektigboy/server-hyperliquid'
    },
    {
        name: 'pumpfun-mcp',
        description: 'Pump.fun meme token trading platform',
        command: 'npx',
        args: ['-y', 'pumpfun-mcp-server'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://pump.fun/favicon.ico',
        githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server'
    },
    
    // Social 服务
    {
        name: 'discord-mcp',
        description: 'Discord social platform integration',
        command: 'npx',
        args: ['-y', 'mcp-discord'],
        env: {},
        connected: false,
        category: 'Social',
        imageUrl: 'https://discord.com/favicon.ico',
        githubUrl: 'https://github.com/hanweg/mcp-discord'
    },
    {
        name: 'telegram-mcp',
        description: 'Telegram messaging platform integration',
        command: 'npx',
        args: ['-y', 'mcp-telegram'],
        env: {},
        connected: false,
        category: 'Social',
        imageUrl: 'https://telegram.org/favicon.ico',
        githubUrl: 'https://github.com/sparfenyuk/mcp-telegram'
    },
    {
        name: 'x-mcp',
        description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Features: get home timeline, create tweets, reply to tweets with built-in rate limiting',
        command: 'npx',
        args: ['-y', 'x-mcp-server'],
        env: {
            TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
            TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || '',
            TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
            TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://x.com/favicon.ico',
        githubUrl: 'https://github.com/datawhisker/x-mcp-server'
    },
    {
        name: 'notion-mcp',
        description: 'Notion workspace and documentation integration',
        command: 'npx',
        args: ['-y', 'notion-mcp-server'],
        env: {},
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
        githubUrl: 'https://github.com/makenotion/notion-mcp-server'
    },
    
    // 官方MCP服务 (ModelContextProtocol)
    {
        name: 'filesystem-mcp',
        description: 'File system operations and management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: {},
        connected: false,
        category: 'System Tools',
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
        githubUrl: 'https://github.com/modelcontextprotocol/servers'
    },
    {
        name: 'sqlite-mcp',
        description: 'SQLite database operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite'],
        env: {},
        connected: false,
        category: 'Database Tools',
        imageUrl: 'https://www.sqlite.org/images/sqlite370_banner.gif',
        githubUrl: 'https://github.com/modelcontextprotocol/servers'
    },
    {
        name: 'brave-search-mcp',
        description: 'Brave Search API integration',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {},
        connected: false,
        category: 'Search Tools',
        imageUrl: 'https://brave.com/favicon.ico',
        githubUrl: 'https://github.com/modelcontextprotocol/servers'
    },
    {
        name: 'memory-mcp',
        description: 'Memory and knowledge management',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {},
        connected: false,
        category: 'AI Tools',
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/3659/3659899.png',
        githubUrl: 'https://github.com/modelcontextprotocol/servers'
    },
    {
        name: 'postgres-mcp',
        description: 'PostgreSQL database operations',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {},
        connected: false,
        category: 'Database Tools',
        imageUrl: 'https://www.postgresql.org/favicon.ico',
        githubUrl: 'https://github.com/modelcontextprotocol/servers'
    }
];

/**
 * 获取预定义的MCP服务
 * @param name MCP名称
 * @returns MCP服务配置
 */
export function getPredefinedMCP(name: string): MCPService | undefined {
    // 标准化MCP名称
    const mcpNameMap: Record<string, string> = {
        'playwright-mcp-service': 'playwright',
        'coingecko-server': 'coingecko-mcp',
        'coingecko-mcp-service': 'coingecko-mcp',
        'x-mcp-server': 'x-mcp',
        'github-mcp-server': 'github',
        'evm-mcp-server': 'evm-mcp',
        'evm-mcp-service': 'evm-mcp',
        'dune-mcp-server': 'dune-mcp',
        'coinmarketcap-mcp-service': 'coinmarketcap-mcp',
        'defillama-mcp-service': 'mcp-server-defillama',
        'rug-check-mcp-service': 'rug-check-mcp',
        'chainlink-feeds-mcp-service': 'chainlink-feeds-mcp',
        'crypto-feargreed-mcp-service': 'crypto-feargreed-mcp',
        'whale-tracker-mcp-service': 'whale-tracker-mcp',
        'discord-mcp-service': 'mcp-discord',
        'telegram-mcp-service': 'mcp-telegram',
        'notion-mcp-service': 'notion-mcp-server',
        '12306-mcp-service': '12306-mcp'
    };
    
    // 标准化名称
    const normalizedName = mcpNameMap[name] || name;
    
    // 特殊处理 playwright
    if (normalizedName === 'playwright' || name === 'playwright-mcp-service') {
        // 记录更多调试信息
        logger.info(`【MCP调试】获取Playwright MCP配置，请求名称: ${name}`);
        
        // 使用npx直接运行，这在Docker中应该更可靠
        return {
            name: 'playwright',
            description: 'Playwright Tools for MCP (Direct npx).',
            command: 'npx',
            args: ['@playwright/mcp@latest'],
            env: {},
            connected: false,
            category: '自动化工具',
            imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
            githubUrl: 'https://github.com/microsoft/playwright'
        };
    }
    
    // 特殊处理 12306-mcp
    if (normalizedName === '12306-mcp' || name === '12306-mcp-service') {
        // 记录更多调试信息
        logger.info(`【MCP调试】获取12306 MCP配置，请求名称: ${name}`);
        
        return {
            name: '12306-mcp',
            description: '12306 火车票查询和预订工具',
            command: 'npx',
            args: ['-y', '12306-mcp'],
            env: {},
            connected: false,
            category: '交通工具',
            imageUrl: 'https://www.12306.cn/index/images/logo.jpg',
            githubUrl: 'https://github.com/12306-mcp'
        };
    }
    
    // 尝试从mcpInfoService中获取MCP信息
    const mcpInfo = mcpInfoService.getMCPById(normalizedName);
    if (mcpInfo) {
        logger.info(`【MCP调试】从mcpInfoService获取到MCP配置 [${normalizedName}]`);
        
        // 根据MCP信息构建MCP服务配置
        const mcpService: MCPService = {
            name: mcpInfo.name,
            description: mcpInfo.description || `MCP Service: ${mcpInfo.name}`,
            command: 'npx',
            args: ['-y', mcpInfo.name],
            env: {},
            connected: false,
            category: mcpInfo.category,
            imageUrl: mcpInfo.imageUrl,
            githubUrl: mcpInfo.githubUrl,
            authParams: mcpInfo.authParams
        };
        
        return mcpService;
    }
    
    // 如果没有找到，则从预定义列表中查找
    return predefinedMCPs.find(mcp => mcp.name === normalizedName);
}

/**
 * 获取所有预定义的MCP服务
 * @returns MCP服务配置列表
 */
export function getAllPredefinedMCPs(): MCPService[] {
    return [...predefinedMCPs];
}

/**
 * 根据类别获取MCP服务
 * @param category 类别名称
 * @returns 该类别的MCP服务列表
 */
export function getMCPsByCategory(category: string): MCPService[] {
    return predefinedMCPs.filter(mcp => mcp.category === category);
}

/**
 * 获取所有MCP类别
 * @returns 所有类别名称列表
 */
export function getAllMCPCategories(): string[] {
    const categories = new Set(predefinedMCPs.map(mcp => mcp.category).filter(category => category !== undefined));
    return Array.from(categories);
} 