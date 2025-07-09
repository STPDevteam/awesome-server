import dotenv from 'dotenv';
// 确保在其他导入之前加载环境变量
dotenv.config();

import express from 'express';
import cors from 'cors';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPManager } from './services/mcpManager.js';
import { MCPToolAdapter } from './services/mcpToolAdapter.js';
import { OfficialMCPAdapter } from './services/officialMcpAdapter.js';
import { predefinedMCPs, getPredefinedMCP } from './services/predefinedMCPs.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/task.js';
import conversationRoutes from './routes/conversation.js';
import { requireAuth, optionalAuth, generalRateLimit } from './middleware/auth.js';
import { db } from './config/database.js';
import { migrationService } from './scripts/migrate-database.js';
import paymentRoutes from './routes/payment.js';
import { getS3AvatarService } from './services/s3AvatarService.js';
import { HTTPMCPAdapter } from './services/httpMcpAdapter.js';
import { TaskAnalysisService } from './services/llmTasks/taskAnalysisService.js';
import { TaskExecutorService } from './services/taskExecutorService.js';
import { MCPAuthService } from './services/mcpAuthService.js';
import { awePaymentService } from './services/awePaymentService.js';
import { getConversationService } from './services/conversationService.js';



const app = express();
const PORT = process.env.PORT || 3001;

// 初始化 S3 头像服务
const s3AvatarService = getS3AvatarService();

app.use(cors());

// 特殊处理 webhook 路由 - 需要原始请求体
app.use('/api/payment/webhooks/coinbase', express.raw({ type: 'application/json' }));

// 其他路由使用 JSON 解析
app.use(express.json());
app.use(generalRateLimit); // 全局速率限制

// LangChain 配置 - 使用支持函数调用的模型
const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7,
});

// MCP 客户端管理
const mcpManager = new MCPManager();

// 将 mcpManager 设置到 app 中，供路由使用
app.set('mcpManager', mcpManager);

// 选择使用官方适配器或自定义适配器
const USE_OFFICIAL_ADAPTER = process.env.USE_OFFICIAL_MCP_ADAPTER === 'true';
const mcpToolAdapter = USE_OFFICIAL_ADAPTER 
  ? new OfficialMCPAdapter(mcpManager)
  : new MCPToolAdapter(mcpManager);

console.log(`🔧 Using ${USE_OFFICIAL_ADAPTER ? 'Official' : 'Custom'} MCP Adapter`);

// 初始化HTTP MCP适配器
const httpMcpAdapter = new HTTPMCPAdapter();

// 初始化MCP认证服务
const mcpAuthService = new MCPAuthService();

// 初始化任务分析服务
const taskAnalysisService = new TaskAnalysisService();

// 初始化任务执行服务
const taskExecutorService = new TaskExecutorService(httpMcpAdapter, mcpAuthService, mcpManager);

// 转换消息格式的辅助函数
function convertToLangChainMessages(messages: any[]) {
  return messages.map((msg: any) => {
    switch (msg.role) {
      case 'system':
        return new SystemMessage(msg.content);
      case 'user':
        return new HumanMessage(msg.content);
      case 'assistant':
        return new AIMessage(msg.content);
      default:
        return new HumanMessage(msg.content);
    }
  });
}

// 认证路由
app.use('/api/auth', authRoutes);

// MCP路由
import mcpRoutes from './routes/mcp.js';
app.use('/api/mcp', mcpRoutes);

// 任务相关路由
app.use('/api/task', taskRoutes);

// 支付路由
app.use('/api/payment', paymentRoutes);

// 对话路由 - 新增（已集成增强版多轮对话功能）
app.use('/api/conversation', conversationRoutes);

// API 路由 - 保护聊天端点，需要登录
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { messages, config } = req.body;
    const userId = req.userId; // 从认证中间件获取用户ID
    
    console.log('Chat request received with', messages.length, 'messages from user:', userId);
    
    // 获取所有可用的 MCP 工具，传递用户ID
    const tools = await mcpToolAdapter.getAllTools(userId);
    console.log('Available tools:', tools.length, 'tools found for user:', userId);
    
    // 转换消息格式
    const langchainMessages = convertToLangChainMessages(messages);
    
    // 如果有工具可用，使用带工具的 LLM
    let response;
    if (tools.length > 0) {
      console.log('Using LLM with tools');
      // 绑定工具到 LLM
      const llmWithTools = llm.bindTools(tools);
      
      // 调用 LLM，它会自动决定是否使用工具
      const aiMessage = await llmWithTools.invoke(langchainMessages);
      console.log('LLM response received:', {
        hasContent: !!aiMessage.content,
        hasToolCalls: !!(aiMessage.tool_calls && aiMessage.tool_calls.length > 0)
      });
      
      // 检查是否有工具调用
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        console.log('Tool calls detected:', aiMessage.tool_calls.length);
        
        // 创建新的消息列表，包含AI的工具调用请求
        const messagesWithToolCall = [...langchainMessages, aiMessage];
        
        // 执行每个工具调用
        for (const toolCall of aiMessage.tool_calls) {
          console.log('Executing tool:', toolCall.name, 'with args:', toolCall.args);
          
          try {
            // 查找对应的工具
            const tool = tools.find(t => t.name === toolCall.name);
            if (!tool) {
              throw new Error(`Tool ${toolCall.name} not found`);
            }
            
            // 执行工具 (兼容官方和自定义适配器)
            const toolResult = 'func' in tool 
              ? await tool.func(toolCall.args)
              : await tool.invoke(toolCall.args);
            console.log('Tool execution result:', {
              toolName: toolCall.name,
              resultLength: typeof toolResult === 'string' ? toolResult.length : 'non-string',
              resultType: typeof toolResult
            });
            
            // 处理工具结果格式（兼容官方和自定义适配器）
            let processedContent: string;
            
            if (USE_OFFICIAL_ADAPTER && typeof toolResult === 'object' && toolResult !== null) {
              // 官方适配器可能返回复杂对象
              if ('content' in toolResult && Array.isArray(toolResult.content)) {
                // 处理包含 content 数组的结果
                processedContent = toolResult.content
                  .map((item: any) => {
                    if (typeof item === 'string') return item;
                    if (item.type === 'text' && item.text) return item.text;
                    return JSON.stringify(item);
                  })
                  .join('\n');
              } else {
                // 其他对象格式转为 JSON 字符串
                processedContent = JSON.stringify(toolResult, null, 2);
              }
            } else {
              // 自定义适配器或字符串结果
              processedContent = typeof toolResult === 'string' 
                ? toolResult 
                : JSON.stringify(toolResult, null, 2);
            }
            
            console.log('Processed content length:', processedContent.length);
            
            // 创建工具结果消息
            const toolMessage = new ToolMessage({
              content: processedContent,
              tool_call_id: toolCall.id || `${toolCall.name}_${Date.now()}`
            });
            
            messagesWithToolCall.push(toolMessage);
          } catch (error) {
            console.error('Tool execution error:', error);
            const errorMessage = new ToolMessage({
              content: `Error executing tool ${toolCall.name}: ${error instanceof Error ? error.message : String(error)}`,
              tool_call_id: toolCall.id || `${toolCall.name}_error_${Date.now()}`
            });
            messagesWithToolCall.push(errorMessage);
          }
        }
        
        // 再次调用 LLM 获取最终回答
        console.log('Getting final response from LLM with tool results');
        response = await llmWithTools.invoke(messagesWithToolCall);
      } else {
        console.log('No tool calls, using direct response');
        response = aiMessage;
      }
    } else {
      console.log('No tools available, using regular LLM');
      // 没有工具时，使用普通 LLM
      response = await llm.invoke(langchainMessages);
    }
    
    console.log('Final response content length:', 
      typeof response.content === 'string' ? response.content.length : 'non-string');
    
    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: response.content
        }
      }]
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 流式聊天端点 - 保护端点，需要登录
app.post('/api/chat/stream', requireAuth, async (req, res) => {
  try {
    const { messages, config } = req.body;
    const userId = req.userId; // 从认证中间件获取用户ID
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 获取所有可用的 MCP 工具，传递用户ID
    const tools = await mcpToolAdapter.getAllTools(userId);
    
    // 转换消息格式
    const langchainMessages = convertToLangChainMessages(messages);
    
    // 如果有工具可用，使用带工具的 LLM
    if (tools.length > 0) {
      const llmWithTools = llm.bindTools(tools);
      const stream = await llmWithTools.stream(langchainMessages);
      
      for await (const chunk of stream) {
        if (chunk.content) {
          res.write(`data: ${JSON.stringify({ 
            choices: [{ delta: { content: chunk.content } }] 
          })}\n\n`);
        }
      }
    } else {
      // 没有工具时，使用普通流式响应
      const stream = await llm.stream(langchainMessages);
      
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ 
          choices: [{ delta: { content: chunk.content } }] 
        })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// MCP 连接端点 - 保护端点，需要登录
app.post('/api/mcp/connect', requireAuth, async (req, res) => {
  try {
    const { name, command, args, env } = req.body;
    const userId = req.userId; // 从认证中间件获取用户ID
    
    // 检查是否已经连接，传递用户ID
    const wasConnected = mcpManager.getConnectedMCPs(userId).some(mcp => mcp.name === name);
    
    await mcpManager.connect(name, command, args, env, userId);
    
    res.json({ 
      success: true, 
      message: wasConnected ? `MCP ${name} was already connected` : `Successfully connected to MCP: ${name}`,
      alreadyConnected: wasConnected
    });
  } catch (error) {
    console.error('MCP connection error:', error);
    res.status(500).json({ error: 'Failed to connect MCP' });
  }
});

// MCP 断开连接端点 - 保护端点，需要登录
app.post('/api/mcp/disconnect', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.userId; // 从认证中间件获取用户ID
    
    // 检查是否已连接，传递用户ID
    const isConnected = mcpManager.getConnectedMCPs(userId).some(mcp => mcp.name === name);
    
    if (!isConnected) {
      return res.json({ 
        success: true, 
        message: `MCP ${name} is not connected`,
        wasConnected: false
      });
    }
    
    await mcpManager.disconnect(name, userId);
    res.json({ 
      success: true, 
      message: `Disconnected from MCP: ${name}`,
      wasConnected: true
    });
  } catch (error) {
    console.error('MCP disconnection error:', error);
    res.status(500).json({ error: 'Failed to disconnect MCP' });
  }
});

// 获取 MCP 列表 - 保护端点，需要登录
app.get('/api/mcp/list', requireAuth, async (req, res) => {
  try {
    const userId = req.userId; // 从认证中间件获取用户ID
    const connectedMCPs = mcpManager.getConnectedMCPs(userId);
    
    // 获取每个 MCP 的详细信息
    const detailedList = await Promise.all(
      connectedMCPs.map(async (mcp) => {
        try {
          const tools = await mcpManager.getTools(mcp.name, userId);
          return {
            ...mcp,
            toolCount: tools.length,
            status: 'connected'
          };
        } catch (error) {
          return {
            ...mcp,
            toolCount: 0,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    res.json(detailedList);
  } catch (error) {
    console.error('Get MCP list error:', error);
    res.status(500).json({ error: 'Failed to get MCP list' });
  }
});

// 获取 MCP 工具 - 保护端点，需要登录
app.get('/api/mcp/:name/tools', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const userId = req.userId; // 从认证中间件获取用户ID
    const tools = await mcpManager.getTools(name, userId);
    res.json({ tools });
  } catch (error) {
    console.error('Get MCP tools error:', error);
    res.status(500).json({ error: 'Failed to get MCP tools' });
  }
});

// MCP 工具调用端点 - 保护端点，需要登录
app.post('/api/mcp/tool', requireAuth, async (req, res) => {
  try {
    const { mcpName, toolName, arguments: toolArgs } = req.body;
    const userId = req.userId; // 从认证中间件获取用户ID
    const result = await mcpManager.callTool(mcpName, toolName, toolArgs, userId);
    res.json({ result });
  } catch (error) {
    console.error('MCP tool error:', error);
    res.status(500).json({ error: 'Failed to call MCP tool' });
  }
});

// 健康检查
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await db.checkConnection();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 将mcpManager实例挂载到app上，以便在路由处理器中访问
app.set('mcpManager', mcpManager);
app.set('taskAnalysisService', taskAnalysisService);
app.set('taskExecutorService', taskExecutorService);
app.set('mcpAuthService', mcpAuthService);
app.set('mcpToolAdapter', mcpToolAdapter);

// 数据库初始化和服务器启动
async function startServer() {
  try {
    console.log('🔌 Connecting to database...');
    
    // 检查数据库连接
    const isConnected = await db.checkConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    console.log('✅ Database connected successfully');
    
    // 运行数据库迁移
    console.log('🚀 Running database migrations...');
    await migrationService.runMigrations();
    console.log('✅ Database migrations completed');
    
    // 验证 S3 配置（如果配置了）
    if (process.env.AWS_S3_BUCKET_NAME) {
      console.log('🪣 Validating S3 avatar service configuration...');
      const isS3Valid = await s3AvatarService.validateConfiguration();
      if (isS3Valid) {
        console.log('✅ S3 avatar service configured successfully');
      } else {
        console.log('⚠️  S3 avatar service configuration invalid - avatar randomization disabled');
      }
    } else {
      console.log('ℹ️  S3 avatar service not configured - avatar randomization disabled');
    }
    

    // 连接预定义的MCP服务
    console.log('🔌 Connecting to predefined MCP services...');
    
    // 注释掉所有自动连接的MCP服务，用户需要手动连接
    console.log('ℹ️  All MCP auto-connection disabled - MCPs need to be connected manually');
    
    /*
    // 尝试连接AWE Core MCP
    const aweMCP = getPredefinedMCP('AWE Core MCP Server');
    if (aweMCP) {
      try {
        console.log('🌐 Connecting to AWE Core MCP...');
        const connected = await mcpManager.connectPredefined(aweMCP);
        if (connected) {
          console.log('✅ AWE Core MCP connected successfully');
        } else {
          console.log('⚠️ Failed to connect to AWE Core MCP');
        }
      } catch (error) {
        console.error('❌ Error connecting to AWE Core MCP:', error);
      }
    }
    
    // 尝试连接Playwright MCP
    const playwrightMCP = getPredefinedMCP('playwright');
    if (playwrightMCP) {
      try {
        console.log('🎭 Connecting to Playwright MCP...');
        const connected = await mcpManager.connectPredefined(playwrightMCP);
        if (connected) {
          console.log('✅ Playwright MCP connected successfully');
        } else {
          console.log('⚠️ Failed to connect to Playwright MCP');
        }
      } catch (error) {
        console.error('❌ Error connecting to Playwright MCP:', error);
      }
    }

    // 尝试连接12306 MCP
    const trainMCP = getPredefinedMCP('12306-mcp');
    if (trainMCP) {
      try {
        console.log('🚄 Connecting to 12306 MCP...');
        const connected = await mcpManager.connectPredefined(trainMCP);
        if (connected) {
          console.log('✅ 12306 MCP connected successfully');
        } else {
          console.log('⚠️ Failed to connect to 12306 MCP');
        }
      } catch (error) {
        console.error('❌ Error connecting to 12306 MCP:', error);
      }
    }
    */

    // AWE 支付服务状态
    if (process.env.BASE_RPC_URL) {
      console.log('💎 AWE payment service configured');
      console.log('✅ AWE payment service ready');
    } else {
      console.log('ℹ️  BASE_RPC_URL not configured - AWE payment features disabled');
    }
    
    // 启动服务器
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  
  try {
    // 销毁 MCP Manager（包括断开连接和清理定时器）
    console.log('📡 Destroying MCP Manager...');
    await mcpManager.destroy();
    
    // 关闭数据库连接
    console.log('🔌 Closing database connections...');
    await db.close();
    
    console.log('✅ Server shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
  
  try {
    await mcpManager.destroy();
    await db.close();
    console.log('✅ Server shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});
