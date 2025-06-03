import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPManager } from './services/mcpManager.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// LangChain 配置
const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7,
});

// MCP 客户端管理
const mcpManager = new MCPManager();

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

// API 路由
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, config } = req.body;
    
    // 获取最后一条用户消息
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }
    
    // 检查是否需要调用 MCP 工具
    const userContent = lastUserMessage.content.toLowerCase();
    let mcpResult = null;
    
    // 检查 x-mcp-server 是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const xMcpConnected = connectedMCPs.some(mcp => mcp.name === 'x-mcp-server');

    // const baseMcpConnected = connectedMCPs.some(mcp => mcp.name === 'base-mcp');

    // console.log('baseMcpConnected222', baseMcpConnected)
    if (xMcpConnected) {
      // 检查用户意图并调用相应的工具
      if (userContent.includes('查看') && (userContent.includes('推文') || userContent.includes('tweet') || userContent.includes('timeline'))) {
        // 调用 get_home_timeline
        try {
          mcpResult = await mcpManager.callTool('x-mcp-server', 'get_home_timeline', { limit: 5 });
        } catch (error) {
          console.error('Failed to get timeline:', error);
        }
      } else if ((userContent.includes('发推文') || userContent.includes('发布推文') || userContent.includes('发送推文') || 
                  userContent.includes('发tweet') || userContent.includes('发表推文') || 
                  (userContent.includes('发') && userContent.includes('推文')) ||
                  (userContent.includes('发布') && userContent.includes('推文')) ||
                  (userContent.includes('发送') && userContent.includes('推文')))) {
        // 提取推文内容 - 支持多种分隔符
        const match = userContent.match(/[：:"'](.*)/);
        if (match) {
          const tweetText = match[1].trim();
          try {
            mcpResult = await mcpManager.callTool('x-mcp-server', 'create_tweet', { text: tweetText });
          } catch (error) {
            console.error('Failed to create tweet:', error);
          }
        } else {
          // 如果没有找到分隔符，尝试其他模式
          // 例如："发推文 内容"
          const spaceMatch = userContent.match(/(?:发推文|发布推文|发送推文|发tweet)\s+(.+)/);
          if (spaceMatch) {
            const tweetText = spaceMatch[1].trim();
            try {
              mcpResult = await mcpManager.callTool('x-mcp-server', 'create_tweet', { text: tweetText });
            } catch (error) {
              console.error('Failed to create tweet:', error);
            }
          }
        }
      } else if (userContent.includes('回复') && (userContent.includes('推文') || userContent.includes('tweet'))) {
        // 这需要更复杂的解析来获取 tweet_id 和回复内容
        // 暂时跳过
      }
    }
    
    // 构建响应
    let responseContent = '';
    
    if (mcpResult) {
      // 如果有 MCP 结果，格式化响应
      if (userContent.includes('查看')) {
        responseContent = '以下是你的最新推文：\n\n';
        if (mcpResult.content && Array.isArray(mcpResult.content)) {
          mcpResult.content.forEach((tweet: any, index: number) => {
            responseContent += `${index + 1}. @${tweet.author_username}: ${tweet.text}\n`;
            responseContent += `   时间: ${new Date(tweet.created_at).toLocaleString()}\n\n`;
          });
        }
      } else if (userContent.includes('发') && userContent.includes('推文')) {
        responseContent = '推文发布成功！';
        if (mcpResult.content) {
          responseContent += `\n推文ID: ${mcpResult.content.id}`;
        }
      }
    } else {
      // 如果没有 MCP 结果，使用 LangChain 生成响应
      const langchainMessages = convertToLangChainMessages(messages);
      const response = await llm.invoke(langchainMessages);
      responseContent = response.content as string;
    }
    
    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: responseContent
        }
      }]
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 流式聊天端点
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, config } = req.body;
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 获取最后一条用户消息
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    if (!lastUserMessage) {
      res.write(`data: ${JSON.stringify({ error: 'No user message found' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    
    // 检查是否需要调用 MCP 工具
    const userContent = lastUserMessage.content.toLowerCase();
    let mcpResult = null;
    
    // 检查 x-mcp-server 是否已连接
    const connectedMCPs = mcpManager.getConnectedMCPs();
    const xMcpConnected = connectedMCPs.some(mcp => mcp.name === 'x-mcp-server');
    const baseMcpConnected = connectedMCPs.some(mcp => mcp.name === 'base-mcp');


    if(baseMcpConnected) {
      try {
          mcpResult = await mcpManager.callTool('base-mcp', 'WalletActionProvider_get_wallet_details', { text: userContent });
        } catch (error) {
          console.error('Failed to create tweet:', error);
        }
    }

    if (xMcpConnected) {
      // 检查用户意图并调用相应的工具
      if (userContent.includes('查看') && (userContent.includes('推文') || userContent.includes('tweet') || userContent.includes('timeline'))) {
        // 调用 get_home_timeline
        try {
          mcpResult = await mcpManager.callTool('x-mcp-server', 'get_home_timeline', { limit: 5 });
        } catch (error) {
          console.error('Failed to get timeline:', error);
        }
      } else if ((userContent.includes('发推文') || userContent.includes('发布推文') || userContent.includes('发送推文') || 
                  userContent.includes('发tweet') || userContent.includes('发表推文') || 
                  (userContent.includes('发') && userContent.includes('推文')) ||
                  (userContent.includes('发布') && userContent.includes('推文')) ||
                  (userContent.includes('发送') && userContent.includes('推文')))) {
        // 提取推文内容 - 支持多种分隔符
        const match = userContent.match(/[：:"'](.*)/);
        if (match) {
          const tweetText = match[1].trim();
          try {
            mcpResult = await mcpManager.callTool('x-mcp-server', 'create_tweet', { text: tweetText });
          } catch (error) {
            console.error('Failed to create tweet:', error);
          }
        } else {
          // 如果没有找到分隔符，尝试其他模式
          // 例如："发推文 内容"
          const spaceMatch = userContent.match(/(?:发推文|发布推文|发送推文|发tweet)\s+(.+)/);
          if (spaceMatch) {
            const tweetText = spaceMatch[1].trim();
            try {
              mcpResult = await mcpManager.callTool('x-mcp-server', 'create_tweet', { text: tweetText });
            } catch (error) {
              console.error('Failed to create tweet:', error);
            }
          }
        }
      } else if (userContent.includes('回复') && (userContent.includes('推文') || userContent.includes('tweet'))) {
        // 这需要更复杂的解析来获取 tweet_id 和回复内容
        // 暂时跳过
      }
    }
    
    // 构建响应
    if (mcpResult) {
      // 如果有 MCP 结果，格式化响应
      let responseContent = '';

      if(baseMcpConnected) {
         responseContent = mcpResult.content[0].text

       console.log('responseContent====', responseContent)
      }
      if(xMcpConnected) {
        if (userContent.includes('查看')) {
          responseContent = '以下是你的最新推文：\n\n';
          if (mcpResult.content && Array.isArray(mcpResult.content)) {
            mcpResult.content.forEach((tweet: any, index: number) => {
              responseContent += `${index + 1}. @${tweet.author_username}: ${tweet.text}\n`;
              responseContent += `   时间: ${new Date(tweet.created_at).toLocaleString()}\n\n`;
            });
          }
        } else if (userContent.includes('发') && userContent.includes('推文')) {
          responseContent = '推文发布成功！';
          if (mcpResult.content) {
            responseContent += `\n推文ID: ${mcpResult.content.id}`;
          }
        }
        
      }

      // 流式发送响应
      const chunks = responseContent.split('');


      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ 
          choices: [{ delta: { content: chunk } }] 
        })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 10)); // 小延迟以模拟流式效果
      }
    } else {
      // 如果没有 MCP 结果，使用 LangChain 生成响应
      const langchainMessages = convertToLangChainMessages(messages);
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

// MCP 连接端点
app.post('/api/mcp/connect', async (req, res) => {
  try {
    const { name, command, args, env } = req.body;
    await mcpManager.connect(name, command, args, env);
    res.json({ success: true, message: `Connected to MCP: ${name}` });
  } catch (error) {
    console.error('MCP connection error:', error);
    res.status(500).json({ error: 'Failed to connect MCP' });
  }
});

// 获取 MCP 列表
app.get('/api/mcp/list', async (req, res) => {
  try {
    const list = mcpManager.getConnectedMCPs();
    res.json(list);
  } catch (error) {
    console.error('Get MCP list error:', error);
    res.status(500).json({ error: 'Failed to get MCP list' });
  }
});

// 获取 MCP 工具
app.get('/api/mcp/:name/tools', async (req, res) => {
  try {
    const { name } = req.params;
    const tools = await mcpManager.getTools(name);
    res.json({ tools });
  } catch (error) {
    console.error('Get MCP tools error:', error);
    res.status(500).json({ error: 'Failed to get MCP tools' });
  }
});

// MCP 工具调用端点
app.post('/api/mcp/tool', async (req, res) => {
  try {
    const { mcpName, toolName, arguments: toolArgs } = req.body;
    const result = await mcpManager.callTool(mcpName, toolName, toolArgs);
    res.json({ result });
  } catch (error) {
    console.error('MCP tool error:', error);
    res.status(500).json({ error: 'Failed to call MCP tool' });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// 优雅关闭
process.on('SIGINT', async () => {
  await mcpManager.disconnectAll();
  process.exit(0);
});
