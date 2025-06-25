import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';
import { getTaskService } from '../taskService.js';
import { TaskStep, TaskStepType } from '../../models/task.js';
import { HTTPMCPAdapter } from '../httpMcpAdapter.js';
import { MCPInfo } from '../../models/mcp.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * 可用MCP列表
 * 注意: 在实际应用中，这应该从数据库或配置文件中加载
 * todo 代码兜底后续调整
 */
export const AVAILABLE_MCPS: MCPInfo[] = [
  {
    name: 'github-mcp-service',
    description: 'GitHub 代码仓库操作工具，可以访问和管理GitHub仓库',
    capabilities: ['查看仓库信息', '获取文件内容', '创建Issue', '提交PR', '查看提交历史'],
    authRequired: true,
    authFields: ['GITHUB_TOKEN'],
    category: '开发工具',
    imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    githubUrl: 'https://github.com/features/actions',
    authParams: {
      tokenName: 'GITHUB_TOKEN',
      tokenDescription: 'GitHub个人访问令牌，需要repo权限'
    }
  },
  {
    name: 'GoogleSearchTool',
    description: '谷歌搜索工具，可以执行网络搜索并获取结果',
    capabilities: ['执行网络搜索', '获取最新信息', '回答常识问题'],
    authRequired: true,
    authFields: ['GOOGLE_API_KEY', 'CUSTOM_SEARCH_ENGINE_ID'],
    category: '搜索工具',
    imageUrl: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png',
    githubUrl: 'https://github.com/googleapis/google-api-nodejs-client',
    authParams: {
      apiKeyName: 'GOOGLE_API_KEY',
      engineIdName: 'CUSTOM_SEARCH_ENGINE_ID'
    }
  },
  {
    name: 'FileSystemTool',
    description: '本地文件系统操作工具',
    capabilities: ['读取文件', '写入文件', '列出目录内容', '创建目录'],
    authRequired: false,
    category: '系统工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
    githubUrl: 'https://github.com/nodejs/node'
  },
  {
    name: 'WebBrowserTool',
    description: '网页浏览和信息抓取工具',
    capabilities: ['访问网页', '抓取网页内容', '提取结构化数据'],
    authRequired: false,
    category: '网络工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2985/2985975.png',
    githubUrl: 'https://github.com/puppeteer/puppeteer'
  },
  {
    name: 'DatabaseQueryTool',
    description: '数据库查询工具，支持各种SQL和NoSQL数据库',
    capabilities: ['执行SQL查询', '获取数据统计', '数据可视化'],
    authRequired: true,
    authFields: ['DB_CONNECTION_STRING'],
    category: '数据工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2772/2772128.png',
    githubUrl: 'https://github.com/sequelize/sequelize',
    authParams: {
      connectionStringName: 'DB_CONNECTION_STRING',
      connectionStringDescription: '数据库连接字符串'
    }
  },
  {
    name: 'ImageAnalysisTool',
    description: '图像分析工具，可以分析和处理图像',
    capabilities: ['对象识别', '场景描述', '文字识别', '图像分类'],
    authRequired: true,
    authFields: ['VISION_API_KEY'],
    category: '媒体工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/2659/2659360.png',
    githubUrl: 'https://github.com/googleapis/nodejs-vision',
    authParams: {
      apiKeyName: 'VISION_API_KEY',
      apiKeyDescription: '视觉API访问密钥'
    }
  },
  {
    name: 'TextAnalysisTool',
    description: '文本分析工具，可以分析文本内容和情感',
    capabilities: ['情感分析', '关键词提取', '实体识别', '文本分类'],
    authRequired: false,
    category: '媒体工具',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1950/1950715.png',
    githubUrl: 'https://github.com/NaturalNode/natural'
  },
  {
    name: 'WeatherTool',
    description: '天气信息工具，提供全球天气数据',
    capabilities: ['获取当前天气', '天气预报', '历史天气数据'],
    authRequired: true,
    authFields: ['WEATHER_API_KEY'],
    category: '信息服务',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1163/1163763.png',
    githubUrl: 'https://github.com/chubin/wttr.in',
    authParams: {
      apiKeyName: 'WEATHER_API_KEY',
      apiKeyDescription: '天气API访问密钥'
    }
  },
  {
    name: 'cook-mcp-service',
    description: '多功能工具集合，包含浏览器自动化、烹饪指导和网页访问功能',
    capabilities: ['打开浏览器', '访问网页', '填写表单', '点击元素', '获取页面内容', '查找烹饪食谱', '获取食材信息'],
    authRequired: false,
    category: '生活服务',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/1830/1830839.png',
    githubUrl: 'https://github.com/cook-mcp/cook-mcp'
  },
  {
    name: 'playwright-mcp-service',
    description: 'Playwright 浏览器自动化工具，可以控制浏览器访问网页',
    capabilities: ['打开浏览器', '访问网页', '填写表单', '点击元素', '获取页面内容'],
    authRequired: false,
    category: '自动化工具',
    imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
    githubUrl: 'https://github.com/microsoft/playwright'
  },
  {
    name: '12306-mcp-service',
    description: '12306 火车票查询和预订工具',
    capabilities: ['查询车站信息', '查询余票信息', '查询中转余票', '查询列车时刻表', '获取当前日期'],
    authRequired: false,
    category: '交通工具',
    imageUrl: 'https://www.12306.cn/index/images/logo.jpg',
    githubUrl: 'https://github.com/12306-mcp'
  },
  
  // Chain PRC 类别
  {
    name: 'base-mcp-service',
    description: 'Base Chain Protocol integration for blockchain operations',
    capabilities: ['blockchain-query', 'transaction-tracking', 'smart-contract'],
    authRequired: false,
    category: 'Chain PRC',
    imageUrl: 'https://base.org/favicon.ico',
    githubUrl: 'https://github.com/base/base-mcp'
  },
  {
    name: 'evm-mcp-service',
    description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
    capabilities: [
      'multi-chain-support', 'blockchain-data-access', 'token-services', 
      'nft-operations', 'smart-contract-interactions', 'transaction-support',
      'ens-resolution', 'balance-queries', 'token-transfers', 'contract-verification',
      'gas-estimation', 'event-logs', 'block-data', 'transaction-receipts',
      'ethereum', 'optimism', 'arbitrum', 'base', 'polygon', 'avalanche', 'bsc'
    ],
    authRequired: false, // 基础查询不需要认证，但交易操作需要私钥
    authFields: ['PRIVATE_KEY'], // 仅在需要发送交易时需要
    category: 'Chain PRC',
    imageUrl: 'https://ethereum.org/favicon.ico',
    githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server',
    authParams: {
      privateKeyName: 'PRIVATE_KEY',
      privateKeyDescription: '用于签名交易的以太坊私钥（仅在需要发送交易时使用）'
    }
  },
  

  {
    name: 'coingecko-mcp',
    description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data with 46 tools including prices, NFTs, DEX data, and market analysis',
    capabilities: [
      'get-simple-price', 'get-coins-list', 'get-coins-markets', 'get-coins-top-gainers-losers',
      'get-range-coins-market-chart', 'get-range-coins-ohlc', 'get-global', 'get-list-nfts',
      'get-onchain-networks', 'get-networks-onchain-trending-pools', 'get-search', 'get-search-trending',
      'crypto-prices', 'market-data', 'nft-data', 'dex-data', 'historical-data', 'trending-analysis'
    ],
    authRequired: true,
    authFields: ['COINGECKO_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://www.coingecko.com/favicon.ico',
    githubUrl: 'https://docs.coingecko.com/reference/mcp-server',
    authParams: {
      apiKeyName: 'COINGECKO_API_KEY',
      apiKeyDescription: 'CoinGecko Pro API密钥，用于获取更高速率限制'
    }
  },
  {
    name: 'coinmarketcap-mcp-service',
    description: 'CoinMarketCap market data integration',
    capabilities: ['crypto-prices', 'market-cap', 'trading-volume'],
    authRequired: true,
    authFields: ['CMC_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://coinmarketcap.com/favicon.ico',
    githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp',
    authParams: {
      apiKeyName: 'CMC_API_KEY',
      apiKeyDescription: 'CoinMarketCap API密钥'
    }
  },
  {
    name: 'defillama-mcp-service',
    description: 'DeFiLlama protocol data and analytics',
    capabilities: ['defi-protocols', 'tvl-data', 'yield-farming'],
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://defillama.com/favicon.ico',
    githubUrl: 'https://github.com/dcSpark/mcp-server-defillama'
  },
  {
    name: 'dune-mcp-service',
    description: 'Dune Analytics blockchain data queries',
    capabilities: ['sql-queries', 'blockchain-analytics', 'data-visualization'],
    authRequired: true,
    authFields: ['DUNE_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://dune.com/favicon.ico',
    githubUrl: 'https://github.com/ekailabs/dune-mcp-server',
    authParams: {
      apiKeyName: 'DUNE_API_KEY',
      apiKeyDescription: 'Dune Analytics API密钥'
    }
  },
  {
    name: 'rug-check-mcp-service',
    description: 'Rug Check security analysis for tokens',
    capabilities: ['token-security', 'rug-detection', 'contract-analysis'],
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://rugcheck.xyz/favicon.ico',
    githubUrl: 'https://github.com/kukapay/rug-check-mcp'
  },
  {
    name: 'chainlink-feeds-mcp-service',
    description: 'ChainLink price feeds and oracle data',
    capabilities: ['price-feeds', 'oracle-data', 'real-time-prices'],
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://chain.link/favicon.ico',
    githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp'
  },
  {
    name: 'crypto-feargreed-mcp-service',
    description: 'Fear & Greed Index for cryptocurrency market sentiment',
    capabilities: ['sentiment-analysis', 'market-psychology', 'fear-greed-index'],
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://alternative.me/favicon.ico',
    githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp'
  },
  {
    name: 'whale-tracker-mcp-service',
    description: 'Whale Tracker for large cryptocurrency transactions',
    capabilities: ['whale-tracking', 'large-transactions', 'wallet-monitoring'],
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://whale-alert.io/favicon.ico',
    githubUrl: 'https://github.com/kukapay/whale-tracker-mcp'
  },
  
  // Dev Tool 类别
  {
    name: 'github-mcp-server-service',
    description: 'GitHub repository management and operations',
    capabilities: ['repository-management', 'pull-requests', 'issues', 'code-review'],
    authRequired: true,
    authFields: ['GITHUB_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    githubUrl: 'https://github.com/github/github-mcp-server',
    authParams: {
      tokenName: 'GITHUB_TOKEN',
      tokenDescription: 'GitHub个人访问令牌'
    }
  },
  {
    name: 'langchain-mcp-service',
    description: 'LangChain integration for AI workflows',
    capabilities: ['ai-workflows', 'document-processing', 'embeddings'],
    authRequired: true,
    authFields: ['OPENAI_API_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://langchain.com/images/logo.svg',
    githubUrl: 'https://github.com/langchain-ai/langchain',
    authParams: {
      apiKeyName: 'OPENAI_API_KEY',
      apiKeyDescription: 'OpenAI API密钥'
    }
  },
  {
    name: 'minds-mcp-service',
    description: 'MindsDB machine learning database integration',
    capabilities: ['ml-models', 'predictive-analytics', 'data-processing'],
    authRequired: true,
    authFields: ['MINDSDB_API_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mindsdb.com/favicon.ico',
    githubUrl: 'https://github.com/mindsdb/minds-mcp',
    authParams: {
      apiKeyName: 'MINDSDB_API_KEY',
      apiKeyDescription: 'MindsDB API密钥'
    }
  },
  {
    name: 'blender-mcp-service',
    description: 'Blender 3D modeling and animation integration',
    capabilities: ['3d-modeling', 'animation', 'rendering'],
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'https://www.blender.org/favicon.ico',
    githubUrl: 'https://github.com/ahujasid/blender-mcp'
  },
  {
    name: 'unity-mcp-service',
    description: 'Unity game engine integration',
    capabilities: ['game-development', 'unity-scripting', 'asset-management'],
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'https://unity.com/favicon.ico',
    githubUrl: 'https://github.com/justinpbarnett/unity-mcp'
  },
  {
    name: 'unreal-mcp-service',
    description: 'Unreal Engine integration',
    capabilities: ['game-development', 'blueprints', 'level-design'],
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'https://www.unrealengine.com/favicon.ico',
    githubUrl: 'https://github.com/chongdashu/unreal-mcp'
  },
  {
    name: 'figma-context-mcp-service',
    description: 'Figma design tool integration',
    capabilities: ['design-tools', 'prototyping', 'collaboration'],
    authRequired: true,
    authFields: ['FIGMA_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://www.figma.com/favicon.ico',
    githubUrl: 'https://github.com/GLips/Figma-Context-MCP',
    authParams: {
      tokenName: 'FIGMA_TOKEN',
      tokenDescription: 'Figma个人访问令牌'
    }
  },
  {
    name: 'aws-mcp-service',
    description: 'AWS cloud services integration',
    capabilities: ['cloud-services', 'ec2', 's3', 'lambda'],
    authRequired: true,
    authFields: ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://aws.amazon.com/favicon.ico',
    githubUrl: 'https://awslabs.github.io/mcp/',
    authParams: {
      accessKeyName: 'AWS_ACCESS_KEY',
      secretKeyName: 'AWS_SECRET_KEY',
      accessKeyDescription: 'AWS访问密钥ID',
      secretKeyDescription: 'AWS秘密访问密钥'
    }
  },
  {
    name: 'convex-mcp-service',
    description: 'Convex backend platform integration',
    capabilities: ['backend-services', 'database', 'real-time'],
    authRequired: true,
    authFields: ['CONVEX_DEPLOY_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://convex.dev/favicon.ico',
    githubUrl: 'https://github.com/get-convex/convex-backend',
    authParams: {
      deployKeyName: 'CONVEX_DEPLOY_KEY',
      deployKeyDescription: 'Convex部署密钥'
    }
  },
  {
    name: 'cloudflare-mcp-service',
    description: 'Cloudflare services integration',
    capabilities: ['cdn', 'dns', 'workers', 'pages'],
    authRequired: true,
    authFields: ['CLOUDFLARE_API_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://www.cloudflare.com/favicon.ico',
    githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
    authParams: {
      apiTokenName: 'CLOUDFLARE_API_TOKEN',
      apiTokenDescription: 'Cloudflare API令牌'
    }
  },
  {
    name: 'supabase-mcp-service',
    description: 'Supabase backend-as-a-service integration',
    capabilities: ['database', 'auth', 'storage', 'edge-functions'],
    authRequired: true,
    authFields: ['SUPABASE_URL', 'SUPABASE_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://supabase.com/favicon.ico',
    githubUrl: 'https://github.com/supabase-community/supabase-mcp',
    authParams: {
      urlName: 'SUPABASE_URL',
      keyName: 'SUPABASE_KEY',
      urlDescription: 'Supabase项目URL',
      keyDescription: 'Supabase匿名密钥'
    }
  },
  
  // Trading 类别
  {
    name: 'binance-mcp-service',
    description: 'Binance cryptocurrency exchange integration',
    capabilities: ['spot-trading', 'futures-trading', 'market-data'],
    authRequired: true,
    authFields: ['BINANCE_API_KEY', 'BINANCE_SECRET_KEY'],
    category: 'Trading',
    imageUrl: 'https://www.binance.com/favicon.ico',
    githubUrl: 'https://github.com/TermiX-official/binance-mcp',
    authParams: {
      apiKeyName: 'BINANCE_API_KEY',
      secretKeyName: 'BINANCE_SECRET_KEY',
      apiKeyDescription: 'Binance API密钥',
      secretKeyDescription: 'Binance秘密密钥'
    }
  },
  {
    name: 'uniswap-trader-mcp-service',
    description: 'Uniswap decentralized exchange trading',
    capabilities: ['dex-trading', 'liquidity-pools', 'token-swaps'],
    authRequired: true,
    authFields: ['PRIVATE_KEY', 'RPC_URL'],
    category: 'Trading',
    imageUrl: 'https://uniswap.org/favicon.ico',
    githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp',
    authParams: {
      privateKeyName: 'PRIVATE_KEY',
      rpcUrlName: 'RPC_URL',
      privateKeyDescription: '以太坊钱包私钥',
      rpcUrlDescription: '以太坊RPC节点URL'
    }
  },
  {
    name: 'hyperliquid-mcp-service',
    description: 'Hyperliquid perpetual trading platform',
    capabilities: ['perpetual-trading', 'derivatives', 'leverage'],
    authRequired: true,
    authFields: ['HYPERLIQUID_API_KEY', 'HYPERLIQUID_SECRET'],
    category: 'Trading',
    imageUrl: 'https://hyperliquid.xyz/favicon.ico',
    githubUrl: 'https://github.com/mektigboy/server-hyperliquid',
    authParams: {
      apiKeyName: 'HYPERLIQUID_API_KEY',
      secretName: 'HYPERLIQUID_SECRET',
      apiKeyDescription: 'Hyperliquid API密钥',
      secretDescription: 'Hyperliquid秘密密钥'
    }
  },
  {
    name: 'pumpfun-mcp-service',
    description: 'Pump.fun meme token trading platform',
    capabilities: ['meme-tokens', 'token-creation', 'trading'],
    authRequired: true,
    authFields: ['WALLET_PRIVATE_KEY'],
    category: 'Trading',
    imageUrl: 'https://pump.fun/favicon.ico',
    githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server',
    authParams: {
      privateKeyName: 'WALLET_PRIVATE_KEY',
      privateKeyDescription: 'Solana钱包私钥'
    }
  },
  
  // Social 类别
  {
    name: 'discord-mcp-service',
    description: 'Discord social platform integration',
    capabilities: ['messaging', 'server-management', 'bot-integration'],
    authRequired: true,
    authFields: ['DISCORD_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://discord.com/favicon.ico',
    githubUrl: 'https://github.com/hanweg/mcp-discord',
    authParams: {
      botTokenName: 'DISCORD_BOT_TOKEN',
      botTokenDescription: 'Discord机器人令牌'
    }
  },
  {
    name: 'telegram-mcp-service',
    description: 'Telegram messaging platform integration',
    capabilities: ['messaging', 'bot-creation', 'channel-management'],
    authRequired: true,
    authFields: ['TELEGRAM_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://telegram.org/favicon.ico',
    githubUrl: 'https://github.com/sparfenyuk/mcp-telegram',
    authParams: {
      botTokenName: 'TELEGRAM_BOT_TOKEN',
      botTokenDescription: 'Telegram机器人令牌'
    }
  },
  {
    name: 'x-mcp',
    description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Built-in rate limit handling for free API tier',
    capabilities: [
      'get-home-timeline', 'create-tweet', 'reply-to-tweet', 
      'rate-limit-handling', 'timeline-reading', 'tweet-engagement',
      'free-tier-support', 'monthly-usage-tracking', 'exponential-backoff'
    ],
    authRequired: true,
    authFields: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
    category: 'Social',
    imageUrl: 'https://x.com/favicon.ico',
    githubUrl: 'https://github.com/datawhisker/x-mcp-server',
    authParams: {
      apiKeyName: 'TWITTER_API_KEY',
      apiSecretName: 'TWITTER_API_SECRET',
      accessTokenName: 'TWITTER_ACCESS_TOKEN',
      accessTokenSecretName: 'TWITTER_ACCESS_SECRET',
      apiKeyDescription: 'Twitter API密钥（Consumer Key）',
      apiSecretDescription: 'Twitter API秘密密钥（Consumer Secret）',
      accessTokenDescription: 'Twitter访问令牌',
      accessTokenSecretDescription: 'Twitter访问令牌秘密'
    }
  },
  {
    name: 'notion-mcp',
    description: 'Notion workspace and documentation integration',
    capabilities: ['page-creation', 'database-management', 'content-editing'],
    authRequired: true,
    authFields: ['NOTION_TOKEN'],
    category: 'Productivity',
    imageUrl: 'https://www.notion.so/favicon.ico',
    githubUrl: 'https://github.com/makenotion/notion-mcp-server',
    authParams: {
      tokenName: 'NOTION_TOKEN',
      tokenDescription: 'Notion集成令牌'
    }
  },

  // Additional integrated MCPs
  {
    name: 'discord-mcp',
    description: 'Discord social platform integration for server management and messaging',
    capabilities: ['server-management', 'channel-operations', 'message-handling', 'user-management'],
    authRequired: true,
    authFields: ['DISCORD_TOKEN'],
    category: 'Social',
    imageUrl: 'https://discord.com/favicon.ico',
    githubUrl: 'https://github.com/hanweg/mcp-discord'
  },
  {
    name: 'telegram-mcp',
    description: 'Telegram messaging platform integration for bot operations',
    capabilities: ['send-messages', 'manage-chats', 'file-handling', 'bot-commands'],
    authRequired: true,
    authFields: ['TELEGRAM_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://telegram.org/favicon.ico',
    githubUrl: 'https://github.com/sparfenyuk/mcp-telegram'
  },
  {
    name: 'binance-mcp',
    description: 'Binance cryptocurrency exchange integration',
    capabilities: ['market-data', 'trading-operations', 'account-info', 'order-management'],
    authRequired: true,
    authFields: ['BINANCE_API_KEY', 'BINANCE_SECRET'],
    category: 'Trading',
    imageUrl: 'https://www.binance.com/favicon.ico',
    githubUrl: 'https://github.com/binance/binance-mcp'
  },
  {
    name: 'uniswap-trader-mcp',
    description: 'Uniswap decentralized exchange trading platform',
    capabilities: ['dex-trading', 'liquidity-management', 'token-swaps', 'pool-operations'],
    authRequired: true,
    authFields: ['PRIVATE_KEY', 'INFURA_API_KEY'],
    category: 'Trading',
    imageUrl: 'https://uniswap.org/favicon.ico',
    githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp'
  },
  {
    name: 'hyperliquid-mcp',
    description: 'Hyperliquid decentralized perpetuals trading',
    capabilities: ['perpetual-trading', 'margin-management', 'order-execution', 'portfolio-tracking'],
    authRequired: true,
    authFields: ['HYPERLIQUID_PRIVATE_KEY'],
    category: 'Trading',
    imageUrl: 'https://hyperliquid.xyz/favicon.ico',
    githubUrl: 'https://github.com/mektigboy/server-hyperliquid'
  },
  {
    name: 'pumpfun-mcp',
    description: 'Pump.fun meme token trading platform',
    capabilities: ['meme-token-trading', 'token-creation', 'market-analysis', 'community-features'],
    authRequired: true,
    authFields: ['PUMPFUN_API_KEY'],
    category: 'Trading',
    imageUrl: 'https://pump.fun/favicon.ico',
    githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server'
  },
  {
    name: 'aws-mcp',
    description: 'Amazon Web Services cloud platform integration',
    capabilities: ['ec2-management', 's3-operations', 'lambda-functions', 'cloudformation'],
    authRequired: true,
    authFields: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    category: 'Cloud Services',
    imageUrl: 'https://aws.amazon.com/favicon.ico',
    githubUrl: 'https://github.com/aws/aws-mcp'
  },
  {
    name: 'cloudflare-mcp',
    description: 'Cloudflare CDN and security services integration',
    capabilities: ['dns-management', 'cdn-operations', 'security-settings', 'analytics'],
    authRequired: true,
    authFields: ['CLOUDFLARE_API_TOKEN'],
    category: 'Cloud Services',
    imageUrl: 'https://www.cloudflare.com/favicon.ico',
    githubUrl: 'https://github.com/cloudflare/cloudflare-mcp'
  },
  {
    name: 'supabase-mcp',
    description: 'Supabase backend-as-a-service platform integration',
    capabilities: ['database-operations', 'auth-management', 'storage-handling', 'realtime-features'],
    authRequired: true,
    authFields: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    category: 'Database Tools',
    imageUrl: 'https://supabase.com/favicon.ico',
    githubUrl: 'https://github.com/supabase/supabase-mcp'
  },
  {
    name: 'filesystem-mcp',
    description: 'File system operations and management',
    capabilities: ['file-read', 'file-write', 'directory-operations', 'file-search'],
    authRequired: false,
    category: 'System Tools',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    name: 'sqlite-mcp',
    description: 'SQLite database operations',
    capabilities: ['sql-queries', 'database-management', 'data-analysis', 'schema-operations'],
    authRequired: false,
    category: 'Database Tools',
    imageUrl: 'https://www.sqlite.org/images/sqlite370_banner.gif',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    name: 'brave-search-mcp',
    description: 'Brave Search API integration',
    capabilities: ['web-search', 'search-results', 'content-discovery', 'privacy-focused-search'],
    authRequired: true,
    authFields: ['BRAVE_SEARCH_API_KEY'],
    category: 'Search Tools',
    imageUrl: 'https://brave.com/favicon.ico',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    name: 'memory-mcp',
    description: 'Memory and knowledge management',
    capabilities: ['knowledge-storage', 'memory-retrieval', 'context-management', 'learning-assistance'],
    authRequired: false,
    category: 'AI Tools',
    imageUrl: 'https://cdn-icons-png.flaticon.com/512/3659/3659899.png',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    name: 'postgres-mcp',
    description: 'PostgreSQL database operations',
    capabilities: ['sql-queries', 'database-management', 'data-analysis', 'advanced-queries'],
    authRequired: true,
    authFields: ['POSTGRES_CONNECTION_STRING'],
    category: 'Database Tools',
    imageUrl: 'https://www.postgresql.org/favicon.ico',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  }
];

/**
 * 任务分析服务
 * 负责对任务进行分析、推荐合适的MCP、确认可交付内容并构建工作流
 */
export class TaskAnalysisService {
  private llm: ChatOpenAI;
  private httpAdapter: HTTPMCPAdapter;

  constructor(httpAdapter: HTTPMCPAdapter) {
    this.httpAdapter = httpAdapter;
    
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.TASK_ANALYSIS_MODEL || 'gpt-4o',
      temperature: 0.2, // 较低温度，保证推理的准确性
      // configuration: {
      //   httpAgent: agent, // ✅ 使用代理关键设置
      // },
    });
  }
  
  /**
   * 执行任务的流式分析流程
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送分析结果
   * @returns 分析是否成功
   */
  async analyzeTaskStream(taskId: string, stream: (data: any) => void): Promise<boolean> {
    try {
      // 发送分析开始信息
      stream({ 
        event: 'analysis_start', 
        data: { taskId, timestamp: new Date().toISOString() } 
      });
      
      // 获取任务内容
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`Task not found [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }
      
      // 更新任务状态为处理中
      await taskService.updateTask(taskId, { status: 'in_progress' });
      stream({ event: 'status_update', data: { status: 'in_progress' } });
      
      // 步骤1: 分析任务需求
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'analysis',
          stepName: 'Analyze Task Requirements',
          stepNumber: 1,
          totalSteps: 4
        } 
      });
      
      // 这里使用常规的analyzeRequirements方法，而不是流式方法
      // 因为我们需要确保后续步骤能正常使用结构化的结果
      const requirementsResult = await this.analyzeRequirements(task.content);
      
      // 向前端发送分析结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'analysis',
          content: requirementsResult.content,
          reasoning: requirementsResult.reasoning
        } 
      });
      
      // 记录步骤1结果
      const step1 = await taskService.createTaskStep({
        taskId,
        stepType: 'analysis',
        title: 'Analyze Task Requirements',
        content: requirementsResult.content,
        reasoning: requirementsResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 1
      });
      
      // 步骤2: 识别最相关的MCP
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'mcp_selection',
          stepName: 'Identify Relevant MCP Tools',
          stepNumber: 2,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const mcpResult = await this.identifyRelevantMCPs(
        task.content, 
        requirementsResult.content
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'mcp_selection',
          content: mcpResult.content,
          reasoning: mcpResult.reasoning,
          mcps: mcpResult.recommendedMCPs.map(mcp => ({
            name: mcp.name,
            description: mcp.description
          }))
        } 
      });
      
      // 记录步骤2结果
      const step2 = await taskService.createTaskStep({
        taskId,
        stepType: 'mcp_selection',
        title: 'Identify Relevant MCP Tools',
        content: mcpResult.content,
        reasoning: mcpResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 2
      });
      
      // 步骤3: 确认可交付内容
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'deliverables',
          stepName: 'Confirm Deliverables',
          stepNumber: 3,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const deliverablesResult = await this.confirmDeliverables(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'deliverables',
          content: deliverablesResult.content,
          reasoning: deliverablesResult.reasoning,
          canBeFulfilled: deliverablesResult.canBeFulfilled,
          deliverables: deliverablesResult.deliverables
        } 
      });
      
      // 记录步骤3结果
      const step3 = await taskService.createTaskStep({
        taskId,
        stepType: 'deliverables',
        title: 'Confirm Deliverables',
        content: deliverablesResult.content,
        reasoning: deliverablesResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 3
      });
      
      // 步骤4: 构建MCP工作流
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'workflow',
          stepName: 'Build MCP Workflow',
          stepNumber: 4,
          totalSteps: 4
        } 
      });
      
      // 常规处理，不是流式方法
      const workflowResult = await this.buildMCPWorkflow(
        task.content,
        requirementsResult.content,
        mcpResult.recommendedMCPs,
        deliverablesResult.canBeFulfilled,
        deliverablesResult.deliverables
      );
      
      // 向前端发送结果
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'workflow',
          content: workflowResult.content,
          reasoning: workflowResult.reasoning,
          workflow: workflowResult.workflow
        } 
      });
      
      // 记录步骤4结果
      const step4 = await taskService.createTaskStep({
        taskId,
        stepType: 'workflow',
        title: 'Build MCP Workflow',
        content: workflowResult.content,
        reasoning: workflowResult.reasoning,
        reasoningTime: 0, // Simplified handling
        orderIndex: 4
      });
      
      // 更新任务的MCP工作流信息
      const mcpWorkflow = {
        mcps: mcpResult.recommendedMCPs.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          authRequired: mcp.authRequired,
          authVerified: false // 初始状态未验证
        })),
        workflow: workflowResult.workflow
      };
      
      await taskService.updateTask(taskId, { mcpWorkflow });
      
      // 发送分析完成信息
      stream({ 
        event: 'analysis_complete', 
        data: { 
          taskId,
          mcpWorkflow
        } 
      });
      
      logger.info(`Task streaming analysis completed [Task ID: ${taskId}]`);
      return true;
    } catch (error) {
      logger.error(`Task streaming analysis failed [ID: ${taskId}]:`, error);
      
      // Update task status to failed
      await taskService.updateTask(taskId, { status: 'failed' });
      
      // Send error info
      stream({ 
        event: 'error', 
        data: { 
          message: 'Task analysis failed', 
          details: error instanceof Error ? error.message : String(error)
        } 
      });
      
      return false;
    }
  }
  
  /**
   * Execute the complete task analysis process
   * @param taskId Task ID
   * @returns Analysis result, including recommended MCP workflow
   */
  async analyzeTask(taskId: string): Promise<boolean> {
    try {
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`Task analysis failed: Task not found [ID: ${taskId}]`);
        return false;
      }
      
      // First update status to in_progress
      await taskService.updateTask(taskId, { status: 'in_progress' });

      logger.info(`Starting task analysis [Task ID: ${taskId}, Content: ${task.content}]`);
      
      // Use intelligent LLM analysis to select the most appropriate MCP tools
      
      // Step 1: Analyze task requirements
      const requirementsAnalysis = await this.analyzeRequirements(task.content);
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'analysis',
        title: 'Analyze Task Requirements',
        content: requirementsAnalysis.content,
        reasoning: requirementsAnalysis.reasoning,
        orderIndex: 1
      });
      
      // Step 2: Identify relevant MCPs
      const mcpSelection = await this.identifyRelevantMCPs(task.content, requirementsAnalysis.content);
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'mcp_selection',
        title: 'Identify Most Relevant MCP Tools',
        content: mcpSelection.content,
        reasoning: mcpSelection.reasoning,
        orderIndex: 2
      });
      
      // Step 3: Confirm deliverables
      const deliverables = await this.confirmDeliverables(
        task.content,
        requirementsAnalysis.content,
        mcpSelection.recommendedMCPs
      );
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'deliverables',
        title: 'Confirm Deliverables',
        content: deliverables.content,
        reasoning: deliverables.reasoning,
        orderIndex: 3
      });
      
      // Step 4: Build MCP workflow
      const workflowResult = await this.buildMCPWorkflow(
        task.content,
        requirementsAnalysis.content,
        mcpSelection.recommendedMCPs,
        deliverables.canBeFulfilled,
        deliverables.deliverables
      );
      
      await taskService.createTaskStep({
        taskId,
        stepType: 'workflow',
        title: 'Build MCP Workflow',
        content: workflowResult.content,
        reasoning: workflowResult.reasoning,
        orderIndex: 4
      });

      // Build MCP workflow object
      const mcpWorkflow = {
        mcps: mcpSelection.recommendedMCPs.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          authRequired: mcp.authRequired,
          authVerified: !mcp.authRequired, // 如果不需要认证则标记为已验证
          category: mcp.category,
          imageUrl: mcp.imageUrl,
          githubUrl: mcp.githubUrl,
          authParams: mcp.authParams
        })),
        workflow: workflowResult.workflow
      };

      // Update task's MCP workflow
      await taskService.updateTask(taskId, {
        mcpWorkflow: mcpWorkflow
      });
      
      // After completion, update status to completed in a separate update operation
      await taskService.updateTask(taskId, {
        status: 'completed'
      });
      
      logger.info(`✅ Task analysis completed, workflow saved [Task ID: ${taskId}]`);
      return true;

    } catch (error) {
      logger.error(`Task analysis failed [ID: ${taskId}]:`, error);
      // Update task status to failed
      await taskService.updateTask(taskId, { status: 'failed' });
      return false;
    }
  }
  
  /**
   * Step 1: Analyze task requirements
   * @param taskContent Task content
   * @returns Requirements analysis result
   */
  public async analyzeRequirements(taskContent: string): Promise<{
    content: string;
    reasoning: string;
  }> {
    try {
      logger.info('Starting task requirements analysis');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional task analyst responsible for analyzing user task requirements.
Please analyze the following task content in detail, deconstructing and identifying:
1. Core goals and sub-goals
2. Key constraints
3. Necessary inputs and expected outputs
4. Potential challenges and risk points

Output format:
{
  "analysis": "This is the task analysis summary visible to the user, clearly and concisely explaining the core requirements and goals of the task",
  "detailed_reasoning": "This is your detailed reasoning process, including how you understand the task, your approach to identifying key requirements, and possible solution directions"
}

Please ensure the analysis is accurate and comprehensive while remaining concise.`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        return {
          content: parsedResponse.analysis || "Unable to generate task analysis",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning"
        };
      } catch (parseError) {
        logger.error('Failed to parse task requirements analysis result:', parseError);
        // If parsing fails, try to extract useful parts
        const contentMatch = responseText.match(/["']analysis["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: contentMatch ? contentMatch[1].trim() : "Unable to parse task analysis",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText
        };
      }
    } catch (error) {
      logger.error('Task requirements analysis failed:', error);
      throw error;
    }
  }
  
  /**
   * 步骤2: 识别最相关的MCP
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @returns 推荐的MCP列表
   */
  public async identifyRelevantMCPs(
    taskContent: string,
    requirementsAnalysis: string
  ): Promise<{
    content: string;
    reasoning: string;
    recommendedMCPs: MCPInfo[];
  }> {
    try {
      logger.info('Starting identification of relevant MCP tools');
      
      // Dynamically get available MCP list instead of using static list
      const availableMCPs = await this.getAvailableMCPs();
      logger.info(`[MCP Debug] Available MCP tools list: ${JSON.stringify(availableMCPs.map(mcp => ({ name: mcp.name, description: mcp.description })))}`);
      
      // Group MCPs by category for better LLM understanding and selection
      const mcpsByCategory = availableMCPs.reduce((acc, mcp) => {
        const category = mcp.category || 'Other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push({
          name: mcp.name,
          description: mcp.description,
          capabilities: mcp.capabilities
        });
        return acc;
      }, {} as Record<string, any[]>);

      const response = await this.llm.invoke([
        new SystemMessage(`You are an MCP (Model Context Protocol) expert responsible for selecting the most appropriate tools based on user task requirements.

Please carefully analyze the user's task content and select the most suitable tools (maximum 4) from the following available MCP tools:

Available MCP tools (grouped by category):
${JSON.stringify(mcpsByCategory, null, 2)}

Selection criteria:
1. **Keyword matching**: Prioritize tools whose names or descriptions contain task keywords
   - If the user mentions "Twitter", "tweet", or "X", select x-mcp
   - If the user mentions "GitHub", select github-mcp-server
   - If the user mentions "cryptocurrency" or "coin price", select coingecko-mcp, etc.
2. **Functionality match**: Whether the tool's capabilities can meet the task requirements
3. **Category relevance**: Tools from the same or related categories should be prioritized
4. **Usability**: Whether the tool is easy to use and stable

Output format (must be valid JSON):
{
  "selected_mcps": [
    "Tool1Name",
    "Tool2Name"
  ],
  "selection_explanation": "Explain to the user why these tools were selected",
  "detailed_reasoning": "Detailed explanation of your selection process, factors considered, and why this tool combination is most suitable for the task requirements"
}

Important: Make sure the returned tool names exactly match the name field in the available tools list.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(`User task: ${taskContent}`)
      ]);
      
      logger.info(`[MCP Debug] LLM response successful, starting to parse MCP selection results`);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      logger.info(`[MCP Debug] LLM original response: ${responseText}`);
      
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        const selectedMCPNames: string[] = parsedResponse.selected_mcps || [];
        
        logger.info(`[MCP Debug] LLM selected MCPs: ${JSON.stringify(selectedMCPNames)}`);
        
        // Get recommended MCP detailed information
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedMCPNames.includes(mcp.name)
        );
        
        logger.info(`[MCP Debug] Successfully matched ${recommendedMCPs.length} recommended MCPs: ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        return {
          content: parsedResponse.selection_explanation || "Failed to provide tool selection explanation",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      } catch (parseError) {
        logger.info(`[MCP Debug] Attempting to extract MCP names from unstructured text`);
        
        // Try to extract MCP names from text
        const mcpNamesMatch = responseText.match(/["']selected_mcps["']\s*:\s*\[(.*?)\]/s);
        let selectedNames: string[] = [];
        
        if (mcpNamesMatch) {
          const namesText = mcpNamesMatch[1];
          selectedNames = namesText
            .split(',')
            .map(name => name.trim().replace(/["']/g, ''))
            .filter(name => name.length > 0);
          
          logger.info(`[MCP Debug] MCP names extracted from text: ${JSON.stringify(selectedNames)}`);
        }
        
        const recommendedMCPs = availableMCPs.filter(mcp => 
          selectedNames.includes(mcp.name)
        );
        
        logger.info(`[MCP Debug] Successfully matched ${recommendedMCPs.length} recommended MCPs (from text extraction): ${JSON.stringify(recommendedMCPs.map(mcp => mcp.name))}`);
        
        // Extract explanation parts
        const explanationMatch = responseText.match(/["']selection_explanation["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: explanationMatch ? explanationMatch[1].trim() : "Unable to parse tool selection explanation",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          recommendedMCPs: recommendedMCPs.length > 0 ? recommendedMCPs : []
        };
      }
    } catch (error) {
      logger.error('Failed to identify relevant MCPs:', error);
      throw error;
    }
  }
  
  /**
   * 步骤3: 确认可交付内容
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @param recommendedMCPs 推荐的MCP列表
   * @returns 可交付内容确认结果
   */
  public async confirmDeliverables(
    taskContent: string,
    requirementsAnalysis: string,
    recommendedMCPs: MCPInfo[]
  ): Promise<{
    content: string;
    reasoning: string;
    canBeFulfilled: boolean;
    deliverables: string[];
  }> {
    try {
      logger.info('Starting confirmation of deliverables');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional project planner who needs to confirm the specific deliverables based on available MCP tools.
Please assess based on the user's task requirements and selected MCP tools:
1. Whether the user's requirements can be fully met
2. If they cannot be fully met, which parts can be implemented
3. A specific list of deliverables

Please consider the following available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

Output format:
{
  "can_be_fulfilled": true/false,
  "deliverables": [
    "Specific deliverable 1",
    "Specific deliverable 2",
    ...
  ],
  "limitations": "If there are requirements that cannot be met, please explain",
  "conclusion": "Summary explanation for the user, explaining what can be accomplished and possible limitations",
  "detailed_reasoning": "Detailed reasoning process, analyzing why requirements can/cannot be met, and how to plan delivery"
}

Please remain professional and objective, and do not over-promise features that cannot be implemented.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned deliverables response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        return {
          content: parsedResponse.conclusion || "Unable to determine deliverables",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          canBeFulfilled: parsedResponse.can_be_fulfilled === true,
          deliverables: parsedResponse.deliverables || []
        };
      } catch (parseError) {
        logger.error('Failed to parse deliverables confirmation result:', parseError);
        
        // Try to extract key information
        const canBeFulfilledMatch = responseText.match(/["']can_be_fulfilled["']\s*:\s*(true|false)/i);
        const deliverablesMatch = responseText.match(/["']deliverables["']\s*:\s*\[(.*?)\]/s);
        const conclusionMatch = responseText.match(/["']conclusion["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        let deliverables: string[] = [];
        if (deliverablesMatch) {
          deliverables = deliverablesMatch[1]
            .split(',')
            .map(item => item.trim().replace(/^["']|["']$/g, ''))
            .filter(item => item.length > 0);
        }
        
        return {
          content: conclusionMatch ? conclusionMatch[1].trim() : "Unable to parse deliverables summary",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          canBeFulfilled: canBeFulfilledMatch ? canBeFulfilledMatch[1].toLowerCase() === 'true' : false,
          deliverables
        };
      }
    } catch (error) {
      logger.error('Failed to confirm deliverables:', error);
      throw error;
    }
  }
  
  /**
   * 步骤4: 构建MCP工作流
   * @param taskContent 任务内容
   * @param requirementsAnalysis 需求分析结果
   * @param recommendedMCPs 推荐的MCP列表
   * @param canBeFulfilled 是否能满足需求
   * @param deliverables 可交付内容列表
   * @returns MCP工作流
   */
  public async buildMCPWorkflow(
    taskContent: string,
    requirementsAnalysis: string,
    recommendedMCPs: MCPInfo[],
    canBeFulfilled: boolean,
    deliverables: string[]
  ): Promise<{
    content: string;
    reasoning: string;
    workflow: Array<{
      step: number;
      mcp: string;
      action: string;
      input?: string;
      output?: string;
    }>;
  }> {
    try {
      logger.info('Starting MCP workflow construction');
      
      // Debug mode: If test content, return a hardcoded workflow
      if (taskContent.includes('list all repositories')) {
        logger.info('[Debug Mode] Test task content detected, returning hardcoded GitHub workflow');
        return {
          content: 'Hardcoded workflow built for test task',
          reasoning: 'This is debug mode, skipping LLM analysis and using predefined workflow.',
          workflow: [
            {
              step: 1,
              mcp: 'github-mcp-service',
              action: 'list_repositories',
              input: '{"affiliation": "owner"}'
            }
          ]
        };
      }
      
      // If requirements cannot be met, return empty workflow
      if (!canBeFulfilled || recommendedMCPs.length === 0) {
        return {
          content: "Unable to build an effective workflow due to inability to meet requirements or lack of appropriate tool selection.",
          reasoning: "Based on previous analysis, current requirements cannot be fully met through selected tools, or no appropriate tools were selected.",
          workflow: []
        };
      }
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional workflow designer who needs to design an execution process based on MCP tools.
Please design a detailed workflow based on the user's task requirements, selected MCP tools, and determined deliverables.

Available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

Deliverables:
${deliverables.join('\n')}

Please design an ordered step process, specifying for each step:
1. Which MCP tool to use
2. What specific action to perform
3. What the input is
4. What the expected output is

Output format:
{
  "workflow": [
    {
      "step": 1,
      "mcp": "Tool name",
      "action": "Specific action",
      "input": "Input content",
      "output": "Expected output"
    },
    ...
  ],
  "workflow_summary": "Workflow summary explaining to the user how the workflow runs",
  "detailed_reasoning": "Detailed design thinking, explaining why the workflow is designed this way and the purpose of each step"
}

Please ensure the workflow logic is reasonable, with clear data flow between steps, and can effectively complete the user's requirements.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        logger.info(`[MCP Debug] Cleaned workflow response: ${cleanedText}`);
        
        const parsedResponse = JSON.parse(cleanedText);
        
        const workflow = parsedResponse.workflow || [];
        
        logger.info(`📋 Workflow step count: ${workflow.length}`);
        workflow.forEach((step: any, index: number) => {
          logger.info(`📝 Workflow step ${index + 1}: MCP=${step.mcp}, Action=${step.action}`);
        });
        
        return {
          content: parsedResponse.workflow_summary || "No workflow summary provided",
          reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning",
          workflow: workflow
        };
      } catch (parseError) {
        logger.error('Failed to parse MCP workflow construction result:', parseError);
        
        // Try to extract workflow information from text
        const workflowMatch = responseText.match(/["']workflow["']\s*:\s*\[(.*?)\]/s);
        let workflow: Array<{
          step: number;
          mcp: string;
          action: string;
          input?: string;
          output?: string;
        }> = [];
        
        // If unable to extract formatted workflow, create a simple default workflow
        if (!workflowMatch) {
          workflow = recommendedMCPs.map((mcp, index) => ({
            step: index + 1,
            mcp: mcp.name,
            action: `Use ${mcp.name} to perform related operations`,
            input: "Task content",
            output: "Processing result"
          }));
        }
        
        // Extract summary and reasoning
        const summaryMatch = responseText.match(/["']workflow_summary["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: summaryMatch ? summaryMatch[1].trim() : "Unable to parse workflow summary",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText,
          workflow
        };
      }
    } catch (error) {
      logger.error('Failed to build MCP workflow:', error);
      throw error;
    }
  }
  
  // New method: Dynamically get available MCP list
  private async getAvailableMCPs(): Promise<MCPInfo[]> {
    try {
      logger.info(`[MCP Debug] Starting to get available MCP list from static configuration`);
      
      // 直接使用静态配置的完整MCP列表，因为它包含了所有已集成的37个MCP服务
      // 这比通过HTTP适配器获取更准确，因为HTTP适配器只管理少数几个MCP
      const availableMCPs = [...AVAILABLE_MCPS];
      
      logger.info(`[MCP Debug] Successfully retrieved available MCP list from static config, total ${availableMCPs.length} MCPs`);
      logger.info(`[MCP Debug] Available MCP categories: ${JSON.stringify([...new Set(availableMCPs.map(mcp => mcp.category))])}`);
      
      // 按类别分组显示MCP信息
      const mcpsByCategory = availableMCPs.reduce((acc, mcp) => {
        const category = mcp.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(mcp.name);
        return acc;
      }, {} as Record<string, string[]>);
      
      logger.info(`[MCP Debug] MCPs by category: ${JSON.stringify(mcpsByCategory, null, 2)}`);
      
      return availableMCPs;

    } catch (error) {
      logger.error(`[MCP Debug] Failed to get available MCP list:`, error);
      logger.warn(`[MCP Debug] Using fallback MCP list`);
      return AVAILABLE_MCPS; // Return default list on failure
    }
  }
  
  /**
   * Extract search keywords from task content
   * @param content Task content
   * @returns Search keyword
   */
  private extractSearchTerm(content: string): string | null {
    // Try to extract search terms from content
    const searchPatterns = [
      /search[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /search\s+for\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /find[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /look\s+for\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /query[：:]\s*([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i,
      /search\s+([^\s.,。，]+(?:\s+[^\s.,。，]+)*)/i
    ];
    
    for (const pattern of searchPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }
} 