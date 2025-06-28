import { MCPService } from './mcpManager.js';
import { logger } from '../utils/logger.js';

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
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
        githubUrl: 'https://github.com/microsoft/playwright',
        authRequired: false,
        authParams: {}
    },
    // Chain RPC 服务
    {
        name: 'base-mcp',
        description: 'Base Chain RPC integration for blockchain operations (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/base-mcp/build/index.js`],
        env: {
            COINBASE_API_KEY_NAME: process.env.COINBASE_API_KEY_NAME || '',
            COINBASE_API_PRIVATE_KEY: process.env.COINBASE_API_PRIVATE_KEY || '',
            SEED_PHRASE: process.env.SEED_PHRASE || '',
            COINBASE_PROJECT_ID: process.env.COINBASE_PROJECT_ID || '',
            ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || '',
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
            CHAIN_ID: process.env.CHAIN_ID || '',
        },
        connected: false,
        category: 'Chain RPC',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/base.ico',
        githubUrl: 'https://github.com/base/base-mcp',
        authRequired: true,
        authParams: {
            COINBASE_API_KEY_NAME: "COINBASE_API_KEY_NAME",
            COINBASE_API_PRIVATE_KEY: "COINBASE_API_PRIVATE_KEY",
            SEED_PHRASE: "SEED_PHRASE",
            COINBASE_PROJECT_ID: "COINBASE_PROJECT_ID",
            ALCHEMY_API_KEY: "ALCHEMY_API_KEY",
            OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
            CHAIN_ID: "CHAIN_ID"
        }
    },
    {
        name: 'evm-mcp',
        description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
        command: 'npx',
        args: ['-y', '@mcpdotdirect/evm-mcp-server'],
        env: {
        },
        connected: false,
        category: 'Chain RPC',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
        githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-serverr',
        authRequired: false,
        authParams: {}
    },

    {
        name: 'coingecko-mcp',
        description: 'CoinGecko official MCP server for cryptocurrency market data, historical prices, and OHLC candlestick data (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/mcp-coingecko-server/build/index.js`],
        env: {
            COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || ''
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
        githubUrl: 'https://docs.coingecko.com/reference/mcp-server',
        authRequired: true,
        authParams: {
            COINGECKO_API_KEY: "COINGECKO_API_KEY"
        }
    },
    {
        name: 'coinmarketcap-mcp',
        description: 'CoinMarketCap cryptocurrency market data and analytics',
        command: 'npx',
        args: ['@shinzolabs/coinmarketcap-mcp'],
        env: {
            COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY || '',
            SUBSCRIPTION_LEVEL: "Basic",
            PORT: "3002"
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coinmarket.png',
        githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp',
        authRequired: true,
        authParams: {
            COINMARKETCAP_API_KEY: "COINMARKETCAP_API_KEY"
        }
    },
    {
        name: 'defillama-mcp',
        description: 'DeFiLlama DeFi protocol data and TVL analytics',
        command: 'npx',
        args: ['-y', 'mcp-server-defillama'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-defillama.png',
        githubUrl: 'https://github.com/dcSpark/mcp-server-defillama',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'dune-mcp',
        description: 'Dune Analytics blockchain data queries and dashboards',
        command: 'bun',
        args: [`/home/ubuntu/mcp-tools/dune-mcp-server/build/index.js`],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dune.png',
        githubUrl: 'https://github.com/ekailabs/dune-mcp-server',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'rugcheck-mcp',
        description: 'Rug Check token security and risk analysis',
        command: 'npx',
        args: ['-y', 'rug-check-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-rug-100.png',
        githubUrl: 'https://github.com/kukapay/rug-check-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'chainlink-mcp',
        description: 'ChainLink price feeds and oracle data',
        command: 'npx',
        args: ['-y', 'chainlink-feeds-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-chainlink-100.png',
        githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'feargreed-mcp',
        description: 'Fear & Greed Index cryptocurrency market sentiment',
        command: 'npx',
        args: ['-y', 'crypto-feargreed-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
        githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'whaletracker-mcp',
        description: 'Whale Tracker large transaction monitoring',
        command: 'npx',
        args: ['-y', 'whale-tracker-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
        githubUrl: 'https://github.com/kukapay/whale-tracker-mcp',
        authRequired: false,
        authParams: {}
    },

    // Development Tools 服务
    {
        name: 'github-mcp',
        description: 'GitHub repository management and operations with comprehensive API access including repos, issues, PRs, actions, and code security',
        command: 'docker',
        args: [
            'run',
            '-i',
            '--rm',
            '-e',
            'GITHUB_PERSONAL_ACCESS_TOKEN',
            '-e',
            'GITHUB_TOOLSETS',
            '-e',
            'GITHUB_READ_ONLY',
            'ghcr.io/github/github-mcp-server'
        ],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
        },
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
        githubUrl: 'https://github.com/github/github-mcp-server',
        authRequired: true,
        authParams: {
            GITHUB_PERSONAL_ACCESS_TOKEN: "GITHUB_PERSONAL_ACCESS_TOKEN",
        }
    },
    {
        name: 'mindsdb-mcp',
        description: 'MindsDB machine learning database integration',
        command: 'npx',
        args: ['-y', 'minds-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-money-minded-68.png',
        githubUrl: 'https://github.com/mindsdb/minds-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'playwright-mcp',
        description: 'Playwright browser automation and testing',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
        githubUrl: 'https://github.com/microsoft/playwright-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'blender-mcp',
        description: 'Blender 3D modeling and animation integration',
        command: 'npx',
        args: ['-y', 'blender-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-blender-100.png',
        githubUrl: 'https://github.com/ahujasid/blender-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'unity-mcp',
        description: 'Unity game engine development tools',
        command: 'npx',
        args: ['-y', 'unity-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unity-100.png',
        githubUrl: 'https://github.com/justinpbarnett/unity-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'unreal-mcp',
        description: 'Unreal Engine game development integration',
        command: 'npx',
        args: ['-y', 'unreal-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unreal-engine-100.png',
        githubUrl: 'https://github.com/chongdashu/unreal-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'figma-mcp',
        description: 'Figma design tool integration and context',
        command: 'npx',
        args: ['-y', 'figma-developer-mcp',`--figma-api-key=${process.env.FIGMA_API_KEY || ''}`, "--stdio"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-figma-96.png',
        githubUrl: 'https://github.com/GLips/Figma-Context-MCP',
        authRequired: true,
        authParams: {
            FIGMA_API_KEY: "FIGMA_API_KEY"
        }
    },
    {
        name: 'aws-mcp',
        description: 'AWS cloud services integration',
        command: 'npx',
        args: ['-y', 'aws-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
        githubUrl: 'https://awslabs.github.io/mcp/',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'convex-mcp',
        description: 'Convex backend development platform',
        command: 'npx',
        args: ["-y", "convex@latest", "mcp", "start"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-convex-66.png',
        githubUrl: 'https://github.com/get-convex/convex-backend/blob/main/npm-packages/convex/src/cli/mcp.ts',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'cloudflare-mcp',
        description: 'Cloudflare edge computing and CDN services',
        command: 'npx',
        args: ["mcp-remote", "https://docs.mcp.cloudflare.com/sse"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
        githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'supabase-mcp',
        description: 'Supabase backend-as-a-service integration',
        command: 'npx',
        args: ["-y",
            "@supabase/mcp-server-supabase@latest",
            "--access-token",
            process.env.SUPABASE_ACCESS_TOKEN || ''],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-supabase-100.png',
        githubUrl: 'https://github.com/supabase-community/supabase-mcp',
        authRequired: true,
        authParams: {
            SUPABASE_ACCESS_TOKEN: "SUPABASE_ACCESS_TOKEN"
        }
    },

    // Trading 服务
    {
        name: 'binance-mcp',
        description: 'Binance cryptocurrency exchange trading (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/binance-mcp/build/index.js`],
        env: {
            BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
            BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
        githubUrl: 'https://github.com/TermiX-official/binance-mcp',
        authRequired: true,
        authParams: {
            BINANCE_API_KEY: "BINANCE_API_KEY",
            BINANCE_API_SECRET: "BINANCE_API_SECRET"
        }
    },
    {
        name: 'uniswap-mcp',
        description: 'Uniswap DEX trading and liquidity management (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/uniswap-trader-mcp/index.js`],
        env: {
            INFURA_KEY: process.env.UNISWAP_INFURA_KEY || '',
            WALLET_PRIVATE_KEY: process.env.UNISWAP_WALLET_PRIVATE_KEY || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/uniswap.jpeg',
        githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp',
        authRequired: true,
        authParams: {
            INFURA_KEY: "INFURA_KEY",
            WALLET_PRIVATE_KEY: "WALLET_PRIVATE_KEY"
        }
    },
    {
        name: 'hyperliquid-mcp',
        description: 'Hyperliquid decentralized perpetuals trading',
        command: 'npx',
        args: ['-y', '@mektigboy/server-hyperliquid'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.png',
        githubUrl: 'https://github.com/mektigboy/server-hyperliquid',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'pumpfun-mcp',
        description: 'Pump.fun meme token trading platform (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/pumpfun-mcp-server/build/index.js`],
        env: {
            HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-pumpkin-96.png',
        githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server',
        authRequired: true,
        authParams: {
            HELIUS_RPC_URL: "HELIUS_RPC_URL"
        }
    },

    // Social 服务
    {
        name: 'discord-mcp',
        description: 'Discord social platform integration',
        command: 'uv',
        args: ["--directory",
            `/home/ubuntu/mcp-tools/mcp-discord`,
            "run",
            "mcp-discord"],
        env: {
            DISCORD_TOKEN: process.env.DISCORD_TOKEN || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
        githubUrl: 'https://github.com/hanweg/mcp-discord',
        authRequired: true,
        authParams: {
            DISCORD_TOKEN: "DISCORD_TOKEN"
        }
    },
    {
        name: 'telegram-mcp',
        description: 'Telegram messaging platform integration',
        command: 'npx',
        args: ['-y', 'mcp-telegram'],
        env: {},
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
        githubUrl: 'https://github.com/sparfenyuk/mcp-telegram',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'x-mcp',
        description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Features: get_home_timeline, create_tweet, reply_to_tweet with built-in rate limiting (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/x-mcp-server/build/index.js`],
        env: {
            TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
            TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || '',
            TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
            TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
        githubUrl: 'https://github.com/datawhisker/x-mcp-server',
        authRequired: true,
        authParams: {
            TWITTER_API_KEY: "TWITTER_API_KEY",
            TWITTER_API_SECRET: "TWITTER_API_SECRET",
            TWITTER_ACCESS_TOKEN: "TWITTER_ACCESS_TOKEN",
            TWITTER_ACCESS_SECRET: "TWITTER_ACCESS_SECRET"
        }
    },
    {
        name: 'notion-mcp',
        description: 'Notion workspace and documentation integration',
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {"OPENAPI_MCP_HEADERS": `{\"Authorization\": \"Bearer ${process.env.OPENAPI_MCP_HEADERS}\", \"Notion-Version\": \"2022-06-28\" }`},
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
        githubUrl: 'https://github.com/makenotion/notion-mcp-server',
        authRequired: true,
        authParams: {
            OPENAPI_MCP_HEADERS: "OPENAPI_MCP_HEADERS"
        }
    },
    {
        name: 'dexscreener-mcp',
        description: 'DexScreener real-time DEX pair data, token information, and market statistics across multiple blockchains (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/dexscreener-mcp-server/build/index.js`],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dexscreener.ico',
        githubUrl: 'https://github.com/opensvm/dexscreener-mcp-server',
        authRequired: false,
        authParams: {}
    }

];

export const mcpNameMapping: Record<string, string> = {
    'x-mcp-server': 'x-mcp',
    'github-mcp-server': 'github-mcp',
    'playwright-mcp-server': 'playwright',
    'cook-mcp-server': 'cook-mcp',
    'dexscreener-mcp-server': 'dexscreener-mcp',
    'mcp-coingecko-server': 'coingecko-mcp',
    'pumpfun-mcp-server': 'pumpfun-mcp',
    'uniswap-trader-mcp': 'uniswap-mcp',
    'playwright-mcp-service': 'playwright',
    'coingecko-server': 'coingecko-mcp',
    'coingecko-mcp-service': 'coingecko-mcp',
    'evm-mcp-server': 'evm-mcp',
    'evm-mcp-service': 'evm-mcp',
    'dune-mcp-server': 'dune-mcp',
    'binance-mcp-server': 'binance-mcp',
    'base-mcp-server': 'base-mcp',
    'coinmarketcap-mcp-service': 'coinmarketcap-mcp',
    'coinmarketcap_mcp_service': 'coinmarketcap-mcp',
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

/**
 * 获取预定义的MCP服务
 * @param name MCP名称
 * @returns MCP服务配置
 */
export function getPredefinedMCP(name: string): MCPService | undefined {
    // 使用全局映射进行标准化
    const normalizedName = mcpNameMapping[name] || name;

    // 从预定义列表中查找
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