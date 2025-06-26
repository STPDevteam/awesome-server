import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { 
  PromptTemplate, 
  ChatPromptTemplate
} from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
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
 * Available MCP List
 * Note: In actual application, this should be loaded from database or config file
 * todo Code fallback to be adjusted later
 */
export const AVAILABLE_MCPS: MCPInfo[] = [
  {
    name: 'github-mcp-service',
    description: 'GitHub code repository operation tool, which can access and manage GitHub repositories',
    authRequired: true,
    authFields: ['GITHUB_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
    githubUrl: 'https://github.com/features/actions',
    authParams: {
      tokenName: 'GITHUB_TOKEN'
    }
  },
  {
    name: 'FileSystemTool',
    description: 'Local filesystem operation tool',
    authRequired: false,
    category: 'System Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-file-100.png',
    githubUrl: 'https://github.com/nodejs/node'
  },

  {
    name: 'playwright-mcp-service',
    description: 'Playwright browser automation tool that can control browser to access web pages',
    authRequired: false,
    category: 'Automation Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
    githubUrl: 'https://github.com/microsoft/playwright'
  },
  {
    name: '12306-mcp-service',
    description: '12306 train ticket query and booking tool',
    authRequired: false,
    category: 'Transportation Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/12306.png',
    githubUrl: 'https://github.com/12306-mcp'
  },
  
  // Chain PRC Category
  {
    name: 'base-mcp-service',
    description: 'Base Chain Protocol integration for blockchain operations',
    authRequired: false,
    category: 'Chain PRC',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/base.ico',
    githubUrl: 'https://github.com/base/base-mcp'
  },
  {
    name: 'evm-mcp-service',
    description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
    authRequired: false,
    authFields: ['PRIVATE_KEY'],
    category: 'Chain PRC',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
    githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server',
    authParams: {
      privateKeyName: 'PRIVATE_KEY'
    }
  },
  
  {
    name: 'coingecko-mcp',
    description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data with 46 tools including prices, NFTs, DEX data, and market analysis',
    authRequired: true,
    authFields: ['COINGECKO_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
    githubUrl: 'https://docs.coingecko.com/reference/mcp-server',
    authParams: {
      apiKeyName: 'COINGECKO_API_KEY'
    }
  },
  {
    name: 'coinmarketcap-mcp-service',
    description: 'CoinMarketCap market data integration with comprehensive cryptocurrency data',
    authRequired: true,
    authFields: ['COINMARKETCAP_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
    githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp',
    authParams: {
      apiKeyName: 'COINMARKETCAP_API_KEY'
    }
  },
  {
    name: 'defillama-mcp-service',
    description: 'DeFiLlama protocol data and analytics',
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-defillama.png',
    githubUrl: 'https://github.com/dcSpark/mcp-server-defillama'
  },
  {
    name: 'dune-mcp-service',
    description: 'Dune Analytics blockchain data queries',
    authRequired: true,
    authFields: ['DUNE_API_KEY'],
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dune.png',
    githubUrl: 'https://github.com/ekailabs/dune-mcp-server',
    authParams: {
      apiKeyName: 'DUNE_API_KEY'
    }
  },
  {
    name: 'rug-check-mcp-service',
    description: 'Rug Check security analysis for tokens',
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-rug-100.png',
    githubUrl: 'https://github.com/kukapay/rug-check-mcp'
  },
  {
    name: 'chainlink-feeds-mcp-service',
    description: 'ChainLink price feeds and oracle data',
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-chainlink-100.png',
    githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp'
  },
  {
    name: 'crypto-feargreed-mcp-service',
    description: 'Fear & Greed Index for cryptocurrency market sentiment',
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
    githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp'
  },
  {
    name: 'whale-tracker-mcp-service',
    description: 'Whale Tracker for large cryptocurrency transactions',
    authRequired: false,
    category: 'Market Data',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
    githubUrl: 'https://github.com/kukapay/whale-tracker-mcp'
  },
  
  // Dev Tool Category
  {
    name: 'github-mcp-server-service',
    description: 'GitHub repository management and operations',
    authRequired: true,
    authFields: ['GITHUB_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
    githubUrl: 'https://github.com/github/github-mcp-server',
    authParams: {
      tokenName: 'GITHUB_TOKEN'
    }
  },
  {
    name: 'langchain-mcp-service',
    description: 'LangChain integration for AI workflows',
    authRequired: true,
    authFields: ['OPENAI_API_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/langchain.png',
    githubUrl: 'https://github.com/langchain-ai/langchain',
    authParams: {
      apiKeyName: 'OPENAI_API_KEY'
    }
  },
  {
    name: 'minds-mcp-service',
    description: 'MindsDB machine learning database integration',
    authRequired: true,
    authFields: ['MINDSDB_API_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-money-minded-68.png',
    githubUrl: 'https://github.com/mindsdb/minds-mcp',
    authParams: {
      apiKeyName: 'MINDSDB_API_KEY'
    }
  },
  {
    name: 'blender-mcp-service',
    description: 'Blender 3D modeling and animation integration',
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'ttps://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-blender-100.png',
    githubUrl: 'https://github.com/ahujasid/blender-mcp'
  },
  {
    name: 'unity-mcp-service',
    description: 'Unity game engine integration',
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unity-100.png',
    githubUrl: 'https://github.com/justinpbarnett/unity-mcp'
  },
  {
    name: 'unreal-mcp-service',
    description: 'Unreal Engine integration',
    authRequired: false,
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unreal-engine-100.png',
    githubUrl: 'https://github.com/chongdashu/unreal-mcp'
  },
  {
    name: 'figma-context-mcp-service',
    description: 'Figma design tool integration',
    authRequired: true,
    authFields: ['FIGMA_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-figma-96.png',
    githubUrl: 'https://github.com/GLips/Figma-Context-MCP',
    authParams: {
      tokenName: 'FIGMA_TOKEN'
    }
  },
  {
    name: 'aws-mcp-service',
    description: 'AWS cloud services integration',
    authRequired: true,
    authFields: ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
    githubUrl: 'https://awslabs.github.io/mcp/',
    authParams: {
      accessKeyName: 'AWS_ACCESS_KEY',
      secretKeyName: 'AWS_SECRET_KEY'
    }
  },
  {
    name: 'convex-mcp-service',
    description: 'Convex backend platform integration',
    authRequired: true,
    authFields: ['CONVEX_DEPLOY_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-convex-66.png',
    githubUrl: 'https://github.com/get-convex/convex-backend',
    authParams: {
      deployKeyName: 'CONVEX_DEPLOY_KEY'
    }
  },
  {
    name: 'cloudflare-mcp-service',
    description: 'Cloudflare services integration',
    authRequired: true,
    authFields: ['CLOUDFLARE_API_TOKEN'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
    githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
    authParams: {
      apiTokenName: 'CLOUDFLARE_API_TOKEN'
    }
  },
  {
    name: 'supabase-mcp-service',
    description: 'Supabase backend-as-a-service integration',
    authRequired: true,
    authFields: ['SUPABASE_URL', 'SUPABASE_KEY'],
    category: 'Development Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-supabase-100.png',
    githubUrl: 'https://github.com/supabase-community/supabase-mcp',
    authParams: {
      urlName: 'SUPABASE_URL',
      keyName: 'SUPABASE_KEY'
    }
  },
  
  // Trading Category
  {
    name: 'binance-mcp-service',
    description: 'Binance cryptocurrency exchange integration',
    authRequired: true,
    authFields: ['BINANCE_API_KEY', 'BINANCE_SECRET_KEY'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
    githubUrl: 'https://github.com/TermiX-official/binance-mcp',
    authParams: {
      apiKeyName: 'BINANCE_API_KEY',
      secretKeyName: 'BINANCE_SECRET_KEY'
    }
  },
  {
    name: 'uniswap-trader-mcp-service',
    description: 'Uniswap decentralized exchange trading',
    authRequired: true,
    authFields: ['PRIVATE_KEY', 'RPC_URL'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-uniswap-100.png',
    githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp',
    authParams: {
      privateKeyName: 'PRIVATE_KEY',
      rpcUrlName: 'RPC_URL'
    }
  },
  {
    name: 'hyperliquid-mcp-service',
    description: 'Hyperliquid perpetual trading platform',
    authRequired: true,
    authFields: ['HYPERLIQUID_API_KEY', 'HYPERLIQUID_SECRET'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.jpego',
    githubUrl: 'https://github.com/mektigboy/server-hyperliquid',
    authParams: {
      apiKeyName: 'HYPERLIQUID_API_KEY',
      secretName: 'HYPERLIQUID_SECRET'
    }
  },
  {
    name: 'pumpfun-mcp-service',
    description: 'Pump.fun meme token trading platform',
    authRequired: true,
    authFields: ['WALLET_PRIVATE_KEY'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-pumpkin-96.png',
    githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server',
    authParams: {
      privateKeyName: 'WALLET_PRIVATE_KEY'
    }
  },
  
  // Social Category
  {
    name: 'discord-mcp-service',
    description: 'Discord social platform integration',
    authRequired: true,
    authFields: ['DISCORD_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
    githubUrl: 'https://github.com/hanweg/mcp-discord',
    authParams: {
      botTokenName: 'DISCORD_BOT_TOKEN'
    }
  },
  {
    name: 'telegram-mcp-service',
    description: 'Telegram messaging platform integration',
    authRequired: true,
    authFields: ['TELEGRAM_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
    githubUrl: 'https://github.com/sparfenyuk/mcp-telegram',
    authParams: {
      botTokenName: 'TELEGRAM_BOT_TOKEN'
    }
  },
  {
    name: 'x-mcp',
    description: 'X (Twitter) MCP server for reading timeline and engaging with tweets. Built-in rate limit handling for free API tier',
    authRequired: true,
    authFields: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
    category: 'Social',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
    githubUrl: 'https://github.com/datawhisker/x-mcp-server',
    authParams: {
      apiKeyName: 'TWITTER_API_KEY',
      apiSecretName: 'TWITTER_API_SECRET',
      accessTokenName: 'TWITTER_ACCESS_TOKEN',
      accessTokenSecretName: 'TWITTER_ACCESS_SECRET'
    }
  },
  {
    name: 'notion-mcp',
    description: 'Notion workspace and documentation integration',
    authRequired: true,
    authFields: ['NOTION_TOKEN'],
    category: 'Productivity',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
    githubUrl: 'https://github.com/makenotion/notion-mcp-server',
    authParams: {
      tokenName: 'NOTION_TOKEN'
    }
  },

  // Additional integrated MCPs
  {
    name: 'discord-mcp',
    description: 'Discord social platform integration for server management and messaging',
    authRequired: true,
    authFields: ['DISCORD_TOKEN'],
    category: 'Social',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
    githubUrl: 'https://github.com/hanweg/mcp-discord'
  },
  {
    name: 'telegram-mcp',
    description: 'Telegram messaging platform integration for bot operations',
    authRequired: true,
    authFields: ['TELEGRAM_BOT_TOKEN'],
    category: 'Social',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
    githubUrl: 'https://github.com/sparfenyuk/mcp-telegram'
  },
  {
    name: 'binance-mcp',
    description: 'Binance cryptocurrency exchange integration',
    authRequired: true,
    authFields: ['BINANCE_API_KEY', 'BINANCE_SECRET'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
    githubUrl: 'https://github.com/binance/binance-mcp'
  },
  {
    name: 'uniswap-trader-mcp',
    description: 'Uniswap decentralized exchange trading platform',
    authRequired: true,
    authFields: ['PRIVATE_KEY', 'INFURA_API_KEY'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-uniswap-100.png',
    githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp'
  },
  {
    name: 'hyperliquid-mcp',
    description: 'Hyperliquid decentralized perpetuals trading',
    authRequired: true,
    authFields: ['HYPERLIQUID_PRIVATE_KEY'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.jpego',
    githubUrl: 'https://github.com/mektigboy/server-hyperliquid'
  },
  {
    name: 'pumpfun-mcp',
    description: 'Pump.fun meme token trading platform',
    authRequired: true,
    authFields: ['PUMPFUN_API_KEY'],
    category: 'Trading',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-pumpkin-96.png',
    githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server'
  },
  {
    name: 'aws-mcp',
    description: 'Amazon Web Services cloud platform integration',
    authRequired: true,
    authFields: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    category: 'Cloud Services',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
    githubUrl: 'https://github.com/aws/aws-mcp'
  },
  {
    name: 'cloudflare-mcp',
    description: 'Cloudflare CDN and security services integration',
    authRequired: true,
    authFields: ['CLOUDFLARE_API_TOKEN'],
    category: 'Cloud Services',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
    githubUrl: 'https://github.com/cloudflare/cloudflare-mcp'
  },
  {
    name: 'supabase-mcp',
    description: 'Supabase backend-as-a-service platform integration',
    authRequired: true,
    authFields: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    category: 'Database Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-supabase-100.png',
    githubUrl: 'https://github.com/supabase/supabase-mcp'
  },
  {
    name: 'filesystem-mcp',
    description: 'File system operations and management',
    authRequired: false,
    category: 'System Tools',
    imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-file-100.png',
    githubUrl: 'https://github.com/modelcontextprotocol/servers'
  },
];

/**
 * 任务分析服务
 * 负责对任务进行分析、推荐合适的MCP、确认可交付内容并构建工作流
 */
export class TaskAnalysisService {
  private llm: ChatOpenAI;
  
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: process.env.TASK_ANALYSIS_MODEL || 'gpt-4o',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
      timeout: 15000, // 15秒超时
      maxRetries: 1 // 最多重试1次
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
          authVerified: false, // 初始状态未验证
          // 可选字段 - 只在需要时添加
          ...(mcp.category ? { category: mcp.category } : {}),
          ...(mcp.imageUrl ? { imageUrl: mcp.imageUrl } : {}),
          ...(mcp.githubUrl ? { githubUrl: mcp.githubUrl } : {}),
          ...(mcp.authParams ? { authParams:mcp.authParams } : {})
        })),
        workflow: workflowResult.workflow
      };
      
      // 直接使用对象，不需要转换为字符串
      await taskService.updateTask(taskId, { mcpWorkflow });
      
      // 为前端准备精简的mcpWorkflow数据
      const optimizedWorkflow = {
        mcps: mcpResult.recommendedMCPs.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          authRequired: mcp.authRequired,
          authVerified: false,
          // 只在需要认证时返回实际的认证参数（不包含描述）
          ...(mcp.authRequired && mcp.authParams ? { authParams: mcp.authParams } : {})
        })),
        workflow: workflowResult.workflow
      };
      
      // 发送分析完成信息
      stream({ 
        event: 'analysis_complete', 
        data: { 
          taskId,
          mcpWorkflow: optimizedWorkflow,
          // 添加元信息
          metadata: {
            totalSteps: workflowResult.workflow.length,
            requiresAuth: mcpResult.recommendedMCPs.some(mcp => mcp.authRequired),
            mcpsRequiringAuth: mcpResult.recommendedMCPs
              .filter(mcp => mcp.authRequired)
              .map(mcp => mcp.name)
          }
        } 
      });

      await taskService.updateTask(taskId, { status: 'completed' });
      
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
          authParams: mcp.authParams ? mcp.authParams : undefined
        })),
        workflow: workflowResult.workflow
      };

      // Update task's MCP workflow with retry mechanism
      let saveSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!saveSuccess && retryCount < maxRetries) {
        try {
      await taskService.updateTask(taskId, {
        mcpWorkflow: mcpWorkflow
      });
          
          // Verify the save was successful
          const updatedTask = await taskService.getTaskById(taskId);
          if (updatedTask && updatedTask.mcpWorkflow) {
            // 验证保存的数据是否正确
            const savedWorkflow = updatedTask.mcpWorkflow;
            if (savedWorkflow.mcps && savedWorkflow.workflow && 
                savedWorkflow.mcps.length === mcpWorkflow.mcps.length &&
                savedWorkflow.workflow.length === mcpWorkflow.workflow.length) {
              saveSuccess = true;
              logger.info(`✅ Workflow successfully saved and verified [Task ID: ${taskId}]`);
            } else {
              throw new Error('Workflow verification failed - data mismatch');
            }
          } else {
            throw new Error('Workflow not found after save');
          }
        } catch (saveError) {
          retryCount++;
          logger.error(`Failed to save workflow (attempt ${retryCount}/${maxRetries}) [Task ID: ${taskId}]:`, saveError);
          if (retryCount < maxRetries) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (!saveSuccess) {
        throw new Error('Failed to save workflow after multiple attempts');
      }
      
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
   * Step 1: Analyze task requirements - 使用LangChain增强
   * @param taskContent Task content
   * @returns Requirements analysis result
   */
  public async analyzeRequirements(taskContent: string): Promise<{
    content: string;
    reasoning: string;
  }> {
    // 如果没有OpenAI API Key，直接使用简单的分析
    if (!process.env.OPENAI_API_KEY) {
      logger.info('No OpenAI API Key, using simple analysis');
      return {
        content: `任务分析: ${taskContent}`,
        reasoning: `这是一个关于"${taskContent}"的任务，系统将尝试找到合适的工具来完成它。`
      };
    }
    
    try {
      logger.info('[LangChain] Starting task requirements analysis with structured prompts');
      
      // 创建一个带超时的Promise包装器
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Requirements analysis timeout')), timeoutMs);
          })
        ]);
      };
      
      // LLM分析逻辑
      const analysisLogic = async () => {
        // 使用LangChain的ChatPromptTemplate
        const analysisPrompt = ChatPromptTemplate.fromMessages([
          ['system', `You are a professional task analyst responsible for analyzing user task requirements.
Please analyze the following task content in detail, deconstructing and identifying:
1. Core goals and sub-goals
2. Key constraints
3. Necessary inputs and expected outputs
4. Potential challenges and risk points

You must output valid JSON with the following structure:
{format_instructions}`],
          ['human', '{taskContent}']
        ]);
        
        // 使用JsonOutputParser
        const outputParser = new JsonOutputParser();
        
        // 创建prompt with format instructions
        const formattedPrompt = await analysisPrompt.formatMessages({
          taskContent,
          format_instructions: JSON.stringify({
            analysis: "Task analysis summary for user (string)",
            detailed_reasoning: "Detailed reasoning process (string)"
          }, null, 2)
        });
        
        // 调用LLM并解析
        logger.info('[LangChain] Invoking LLM for requirements analysis');
        const response = await this.llm.invoke(formattedPrompt);
        logger.info('[LangChain] LLM response received, parsing...');
        
        try {
          // 使用JsonOutputParser解析响应
          const parsedResponse = await outputParser.parse(response.content.toString());
          
          logger.info('[LangChain] Successfully parsed requirements analysis');
          
          return {
            content: parsedResponse.analysis || "Unable to generate task analysis",
            reasoning: parsedResponse.detailed_reasoning || "No detailed reasoning"
          };
        } catch (parseError) {
          logger.error('[LangChain] Failed to parse with JsonOutputParser, using fallback:', parseError);
          
          // 降级到正则匹配
          const responseText = response.content.toString();
          const contentMatch = responseText.match(/["']analysis["']\s*:\s*["'](.+?)["']/s);
          const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
          
          return {
            content: contentMatch ? contentMatch[1].trim() : "Unable to parse task analysis",
            reasoning: reasoningMatch ? reasoningMatch[1].trim() : responseText
          };
        }
      };
      
      // 使用超时包装器执行分析（8秒超时）
      const result = await withTimeout(analysisLogic(), 8000);
      logger.info('[LangChain] Requirements analysis completed successfully');
      return result;
      
    } catch (error) {
      logger.error('[LangChain] Task requirements analysis failed:', error);
      
      // 降级处理：如果LLM分析失败，使用基本分析
      logger.info('Using fallback analysis due to LLM failure');
      return {
        content: `基本任务分析: ${taskContent}。系统将尝试根据内容关键词找到合适的工具。`,
        reasoning: `由于LLM分析失败（${error instanceof Error ? error.message : 'Unknown error'}），使用降级分析。任务内容为"${taskContent}"，将基于关键词匹配来选择合适的MCP工具。`
      };
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
      
      // 添加基于关键词的预筛选逻辑
      const keywordBasedMCPs = this.preselectMCPsByKeywords(taskContent, availableMCPs);
      if (keywordBasedMCPs.length > 0) {
        logger.info(`[MCP Debug] Pre-selected MCPs based on keywords: ${JSON.stringify(keywordBasedMCPs.map(mcp => mcp.name))}`);
      }
      
      // Group MCPs by category for better LLM understanding and selection
      const mcpsByCategory = availableMCPs.reduce((acc, mcp) => {
        const category = mcp.category || 'Other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push({
          name: mcp.name,
          description: mcp.description,
          // 标记预选的MCP
          preselected: keywordBasedMCPs.some(pre => pre.name === mcp.name)
        });
        return acc;
      }, {} as Record<string, any[]>);

      // 使用重试机制
      let attemptCount = 0;
      const maxAttempts = 2;
      
      while (attemptCount < maxAttempts) {
        attemptCount++;
        
        try {
          const response = await this.llm.invoke([
            new SystemMessage(`You are an MCP tool selector. Your job is to select ONLY the tools that are absolutely necessary for the specific task.

**CRITICAL RULE**: Be very selective. Only choose tools that are directly required to complete the task. Do NOT select extra tools "just in case".

**Task-specific selections**:
- For Twitter/推文 tasks → ONLY select "x-mcp"
- For GitHub/代码库 tasks → ONLY select "github-mcp-server" 
- For crypto/币价 tasks → ONLY select "coingecko-mcp"
- For 12306/火车 tasks → ONLY select "12306-mcp-service"
- For browser automation → ONLY select "playwright-mcp-service"

**Current task**: "${taskContent}"

Available MCP tools:
${JSON.stringify(availableMCPs.map(mcp => ({
  name: mcp.name,
  description: mcp.description,
  category: mcp.category
})), null, 2)}

Select ONLY the minimum tools needed. Respond in valid JSON:
{
  "selected_mcps": ["tool1"],
  "selection_explanation": "Brief explanation of why this tool was selected",
  "detailed_reasoning": "Explain why you chose only this tool and not others"
}`),
             new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
             new HumanMessage(`User task: ${taskContent}`)
          ]);
          
          logger.info(`[MCP Debug] LLM response successful (attempt ${attemptCount}), starting to parse MCP selection results`);
          
          // Parse the returned JSON
          const responseText = response.content.toString();
          logger.info(`[MCP Debug] LLM original response: ${responseText}`);
          
          // Clean possible Markdown formatting
          const cleanedText = responseText
            .replace(/```json\s*/g, '')
            .replace(/```\s*$/g, '')
            .trim();
          
          logger.info(`[MCP Debug] Cleaned response: ${cleanedText}`);
          
          const parsedResponse = JSON.parse(cleanedText);
          let selectedMCPNames: string[] = parsedResponse.selected_mcps || [];
          
          // 信任LLM的智能识别结果，不强制添加预选的MCP
          // 只有当LLM没有选择任何MCP且预选列表不为空时，才使用预选结果作为备选
          if (selectedMCPNames.length === 0 && keywordBasedMCPs.length > 0) {
            logger.info(`[MCP Debug] LLM did not select any MCPs, using pre-selected as fallback: ${keywordBasedMCPs.map(m => m.name).join(', ')}`);
            selectedMCPNames = keywordBasedMCPs.map(m => m.name).slice(0, 4);
          } else {
            logger.info(`[MCP Debug] Using LLM selected MCPs, ignoring keyword pre-selection`);
          }
          
          logger.info(`[MCP Debug] Final selected MCPs: ${JSON.stringify(selectedMCPNames)}`);
          
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
          logger.warn(`[MCP Debug] Attempt ${attemptCount} failed: ${parseError}`);
          
          if (attemptCount >= maxAttempts) {
            // 如果所有尝试都失败，使用基于关键词的备选方案
            logger.info(`[MCP Debug] All LLM attempts failed, using keyword-based fallback`);
            
            if (keywordBasedMCPs.length > 0) {
              return {
                content: `Based on the keywords in your task, I've selected the following tools: ${keywordBasedMCPs.map(m => m.name).join(', ')}`,
                reasoning: `Keyword-based selection was used due to LLM parsing issues. Selected tools based on direct keyword matching.`,
                recommendedMCPs: keywordBasedMCPs.slice(0, 4) // 最多4个
              };
            }
            
            throw parseError;
          }
          
          // 等待一小段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 不应该到达这里
      throw new Error('Unexpected error in MCP selection');
      
    } catch (error) {
      logger.error('Failed to identify relevant MCPs:', error);
      
      // 最后的备选方案：如果有关键词匹配的MCP，返回它们
      const availableMCPs = await this.getAvailableMCPs();
      const keywordBasedMCPs = this.preselectMCPsByKeywords(taskContent, availableMCPs);
      
      if (keywordBasedMCPs.length > 0) {
        return {
          content: `Based on the keywords in your task, I've selected the following tools: ${keywordBasedMCPs.map(m => m.name).join(', ')}`,
          reasoning: `Fallback selection based on keyword matching due to processing error.`,
          recommendedMCPs: keywordBasedMCPs.slice(0, 4)
        };
      }
      
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

IMPORTANT: Always respond with VALID JSON format only, no additional text or explanations outside the JSON structure.

For x-mcp tool specifically:
- The "get_home_timeline" action CAN retrieve the user's own tweets from their timeline
- This is the standard way to get a user's recent tweets including their own posts
- The tool is capable of accessing the authenticated user's timeline which includes their own tweets

Please assess based on the user's task requirements and selected MCP tools:
1. Whether the user's requirements can be fully met
2. If they cannot be fully met, which parts can be implemented
3. A specific list of deliverables

Available MCP tools:
${JSON.stringify(recommendedMCPs, null, 2)}

MUST respond in exactly this JSON format (no extra text):
{
  "can_be_fulfilled": true,
  "deliverables": [
    "Specific deliverable 1",
    "Specific deliverable 2"
  ],
  "limitations": "If there are limitations, explain here",
  "conclusion": "Summary explanation",
  "detailed_reasoning": "Detailed reasoning process"
}`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      try {
        // Clean possible Markdown formatting and extract JSON
        let cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        // 如果响应不是以{开头，尝试提取JSON部分
        if (!cleanedText.startsWith('{')) {
          const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            cleanedText = jsonMatch[0];
          }
        }
        
        // 修复常见的JSON格式问题
        cleanedText = this.fixMalformedJSON(cleanedText);
        
        logger.info(`[MCP Debug] Cleaned deliverables response: ${cleanedText.substring(0, 500)}...`);
        
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
      input?: any;
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
              input: {"affiliation": "owner"}
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
${JSON.stringify(recommendedMCPs.map(mcp => ({
  name: mcp.name,
  description: mcp.description
})), null, 2)}

Deliverables:
${deliverables.join('\n')}

**IMPORTANT RULES**:
1. DO NOT include any authentication information (API keys, tokens, etc.) in the workflow input
2. The workflow should specify which MCP to use and what goal to achieve
3. DO NOT specify exact tool names - use descriptive objectives instead
4. The system will automatically select the best available tool based on the objective
5. Focus on WHAT to achieve, not HOW to achieve it

Please design an ordered step process, specifying for each step:
1. Which MCP service to use
2. What objective to achieve using natural language descriptions
3. What the input parameters are (excluding auth info)

For example:
- Correct: {"step": 1, "mcp": "coinmarketcap-mcp-service", "action": "get current price and market data for Bitcoin", "input": {"symbol": "BTC"}}
- Correct: {"step": 2, "mcp": "x-mcp", "action": "create a tweet about the price information", "input": {"content": "Bitcoin price update"}}
- Wrong: {"step": 1, "mcp": "coinmarketcap-mcp-service", "action": "cryptoQuotesLatest", "input": {"symbol": "BTC"}}

Output format:
{
  "workflow": [
    {
      "step": 1,
      "mcp": "MCP service name",
      "action": "Task objective description",
      "input": {actual parameters only, no auth}
    },
    ...
  ],
  "workflow_summary": "Workflow summary explaining to the user how the workflow will run",
  "detailed_reasoning": "Detailed design thinking, explaining why the workflow is designed this way and the purpose of each step"
}

Please ensure the workflow logic is reasonable, with clear data flow between steps, and can effectively complete the user's requirements.`),
        new SystemMessage(`Task analysis result: ${requirementsAnalysis}`),
        new HumanMessage(taskContent)
      ]);
      
      // Parse the returned JSON
      const responseText = response.content.toString();
      let jsonText = responseText.trim();
      
      try {
        // 优先从Markdown代码块中提取JSON
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonText = jsonMatch[1].trim();
          logger.info(`[MCP Debug] Extracted JSON from markdown block.`);
        } else {
          // 如果没有markdown块，尝试找到第一个和最后一个大括号来提取JSON对象
          const firstBrace = responseText.indexOf('{');
          const lastBrace = responseText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonText = responseText.substring(firstBrace, lastBrace + 1).trim();
            logger.info(`[MCP Debug] Extracted JSON by finding first and last braces.`);
          }
        }

        logger.info(`[MCP Debug] Attempting to parse cleaned JSON: ${jsonText.substring(0, 500)}...`);
        const parsedResponse = JSON.parse(jsonText);
        
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
        logger.error('Problematic JSON text:', jsonText);
        
        // 解析失败，直接进入后备方案
        // 最后的后备方案：从文本中提取信息
        const workflowMatch = responseText.match(/["']workflow["']\s*:\s*(\[[\s\S]*?\])/s);
        let workflow: Array<{
          step: number;
          mcp: string;
          action: string;
          input?: any;
        }> = [];

        if (workflowMatch && workflowMatch[1]) {
          try {
            workflow = JSON.parse(workflowMatch[1]);
            logger.info(`[MCP Debug] Successfully extracted workflow via regex.`);
          } catch (e) {
            logger.error(`[MCP Debug] Could not parse workflow extracted via regex: ${workflowMatch[1]}`);
            workflow = [];
          }
        }
        
        // 如果无法提取格式化的工作流，创建一个简单的默认工作流
        if (workflow.length === 0 && recommendedMCPs.length > 0) {
          workflow = [{
            step: 1,
            mcp: recommendedMCPs[0].name,
            action: "Execute task using available tools",
            input: {}
          }];
        }
        
        // 提取摘要和推理
        const summaryMatch = responseText.match(/["']workflow_summary["']\s*:\s*["'](.+?)["']/s);
        const reasoningMatch = responseText.match(/["']detailed_reasoning["']\s*:\s*["'](.+?)["']/s);
        
        return {
          content: summaryMatch ? summaryMatch[1].trim() : "Workflow created with fallback parsing",
          reasoning: reasoningMatch ? reasoningMatch[1].trim() : "Used fallback workflow generation due to parsing issues",
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



  /**
   * 修复常见的JSON格式错误
   * @param jsonText 需要修复的JSON文本
   * @returns 修复后的JSON文本
   */
  private fixMalformedJSON(jsonText: string): string {
    try {
      let fixed = jsonText;
      
      // 1. 移除多余的逗号
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      
      // 2. 修复未引用的键
      fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
      
      // 3. 处理单引号字符串
      fixed = fixed.replace(/:\s*'([^']*)'(?=\s*[,}\]\n])/g, ':"$1"');
      
                // 4. 特殊处理：修复引号内的冒号问题 - 但要小心不要破坏正常的JSON结构
          // 这个规则可能导致JSON格式错误，暂时注释掉
          // fixed = fixed.replace(/:\s*"([^"]*):([^"]*)"(?=\s*[,}\]])/g, ':"$1,$2"');
      
      // 5. 处理未引用的字符串值，但保留数字和布尔值
      fixed = fixed.replace(/:\s*([^",{\[\]}\s\n][^,}\]\n]*?)(?=\s*[,}\]\n])/g, (match, value) => {
        const trimmedValue = value.trim();
        
        // 跳过已经有引号的值
        if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
          return match;
        }
        
        // 保留数字、布尔值和null
        if (/^(true|false|null|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(trimmedValue)) {
          return `:${trimmedValue}`;
        }
        
        // 处理包含特殊字符的值，只转义双引号和换行符
        const escapedValue = trimmedValue
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        
        // 其他值加引号
        return `:"${escapedValue}"`;
      });
      
      // 6. 处理换行符和多余空白
      fixed = fixed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      // 7. 修复可能的双引号问题
      fixed = fixed.replace(/""([^"]*)""/g, '"$1"');
      
      // 8. 最后检查：确保所有冒号后的值都正确格式化
      fixed = fixed.replace(/:\s*([^",{\[\]}\s][^,}\]]*?)(?=\s*[,}\]])/g, (match, value) => {
        const trimmedValue = value.trim();
        
        // 如果值已经有引号或是数字/布尔值，保持不变
        if (trimmedValue.startsWith('"') || /^(true|false|null|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(trimmedValue)) {
          return `:${trimmedValue}`;
        }
        
        // 处理包含特殊字符的值，只转义双引号和换行符
        const escapedValue = trimmedValue
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        
        // 否则加引号
        return `:"${escapedValue}"`;
      });
      
      return fixed;
    } catch (error) {
      logger.error('Error in fixMalformedJSON:', error);
      return jsonText; // 如果修复失败，返回原始文本
    }
  }

  private preselectMCPsByKeywords(taskContent: string, availableMCPs: MCPInfo[]): MCPInfo[] {
    const taskLower = taskContent.toLowerCase();
    const preselected: MCPInfo[] = [];
    
    // 定义关键词映射规则
    const keywordMappings: Array<{
      keywords: string[];
      mcpNames: string[];
    }> = [
      {
        keywords: ['twitter', 'tweet', 'x平台', '推特', 'x.com', 'timeline'],
        mcpNames: ['x-mcp']
      },
      {
        keywords: ['github', '仓库', '代码库', 'repository', 'repo', 'pull request', 'issue'],
        mcpNames: ['github-mcp-server', 'github-mcp-service']
      },
      {
        keywords: ['coinmarketcap', 'cmc', 'market cap', '市值'],
        mcpNames: ['coinmarketcap-mcp', 'coinmarketcap-mcp-service']
      },
      {
        keywords: ['coingecko', 'gecko'],
        mcpNames: ['coingecko-mcp']
      },
      {
        keywords: ['cryptocurrency', 'crypto', 'coin', '币价', '加密货币', 'bitcoin', 'btc', 'eth', 'ethereum', '代币价格'],
        mcpNames: ['coinmarketcap-mcp', 'coingecko-mcp', 'dexscreener-mcp-server']
      },
      {
        keywords: ['12306', '火车', '高铁', 'train', '动车', '铁路', '车票'],
        mcpNames: ['12306-mcp-service']
      },
      {
        keywords: ['playwright', '浏览器自动化', 'browser automation', '网页自动化', '自动化浏览', '打开网页', '访问网站', '点击', '填写表单'],
        mcpNames: ['playwright-mcp-service', 'playwright']
      },
      {
        keywords: ['notion', '笔记', 'workspace', '文档管理'],
        mcpNames: ['notion-mcp', 'notion-mcp-server']
      },
      {
        keywords: ['weather', '天气', '气温', '降雨', '天气预报'],
        mcpNames: ['WeatherTool']
      },
      {
        keywords: ['google', '搜索', 'search', '查找', '谷歌'],
        mcpNames: ['GoogleSearchTool']
      },
      {
        keywords: ['file', '文件', 'directory', '目录', '读取文件', '写入文件'],
        mcpNames: ['FileSystemTool', 'filesystem-mcp']
      },
      {
        keywords: ['database', '数据库', 'sql', 'query', '查询'],
        mcpNames: ['DatabaseQueryTool', 'sqlite-mcp', 'postgres-mcp']
      },
      {
        keywords: ['ethereum', 'eth', 'evm', 'smart contract', '智能合约', 'blockchain', '区块链', 'web3'],
        mcpNames: ['evm-mcp-service', 'evm-mcp']
      },
      {
        keywords: ['base', 'base chain', 'base network'],
        mcpNames: ['base-mcp-service']
      },
      {
        keywords: ['dex', 'uniswap', 'swap', '交易所', 'defi'],
        mcpNames: ['dexscreener-mcp-server', 'uniswap-trader-mcp-service', 'uniswap-trader-mcp']
      },
      {
        keywords: ['discord', 'chat', '聊天'],
        mcpNames: ['discord-mcp-service', 'discord-mcp']
      },
      {
        keywords: ['telegram', 'tg', '电报'],
        mcpNames: ['telegram-mcp-service', 'telegram-mcp']
      },
      {
        keywords: ['aws', 'amazon', 'ec2', 's3', 'lambda'],
        mcpNames: ['aws-mcp-service', 'aws-mcp']
      },
      {
        keywords: ['cloudflare', 'cdn', 'dns'],
        mcpNames: ['cloudflare-mcp-service', 'cloudflare-mcp']
      },
      {
        keywords: ['supabase', 'baas', 'backend'],
        mcpNames: ['supabase-mcp-service', 'supabase-mcp']
      },
      {
        keywords: ['binance', '币安', 'trading', '交易'],
        mcpNames: ['binance-mcp-service', 'binance-mcp']
      },
      {
        keywords: ['cook', '烹饪', '做饭', '食谱', '菜谱'],
        mcpNames: ['cook-mcp-service']
      }
    ];
    
    // 检查每个映射规则
    for (const mapping of keywordMappings) {
      // 如果任务内容包含任何关键词
      if (mapping.keywords.some(keyword => taskLower.includes(keyword))) {
        // 查找对应的MCP
        for (const mcpName of mapping.mcpNames) {
          const mcp = availableMCPs.find(m => 
            m.name === mcpName || 
            m.name.toLowerCase() === mcpName.toLowerCase()
          );
          
          if (mcp && !preselected.some(p => p.name === mcp.name)) {
            preselected.push(mcp);
            logger.info(`[MCP Debug] Keyword match found: "${mapping.keywords.find(k => taskLower.includes(k))}" → ${mcp.name}`);
          }
        }
      }
    }
    
    // 额外的模糊匹配：如果任务内容直接包含MCP名称
    for (const mcp of availableMCPs) {
      const mcpNameLower = mcp.name.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');
      const mcpNameParts = mcpNameLower.split(' ').filter(part => 
        part.length > 3 && !['service', 'server', 'tool', 'mcp'].includes(part)
      );
      
      // 如果任务内容包含MCP名称的关键部分
      if (mcpNameParts.some(part => taskLower.includes(part))) {
        if (!preselected.some(p => p.name === mcp.name)) {
          preselected.push(mcp);
          logger.info(`[MCP Debug] Direct name match found: ${mcp.name}`);
        }
      }
    }
    
    return preselected;
  }
} 