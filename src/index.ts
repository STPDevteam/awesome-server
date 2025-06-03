import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPManager } from './services/mcpManager.js';
import { MCPToolAdapter } from './services/mcpToolAdapter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// LangChain 配置 - 使用支持函数调用的模型
const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7,
});

// MCP 客户端管理
const mcpManager = new MCPManager();
const mcpToolAdapter = new MCPToolAdapter(mcpManager);

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
    
    console.log('Chat request received with', messages.length, 'messages');
    
    // 获取所有可用的 MCP 工具
    const tools = await mcpToolAdapter.getAllTools();
    console.log('Available tools:', tools.length, 'tools found');
    
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
            
            // 执行工具
            const toolResult = await tool.func(toolCall.args);
            console.log('Tool execution result:', {
              toolName: toolCall.name,
              resultLength: typeof toolResult === 'string' ? toolResult.length : 'non-string'
            });
            
            // 创建工具结果消息
            const toolMessage = new ToolMessage({
              content: toolResult,
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

// 流式聊天端点
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, config } = req.body;
    
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 获取所有可用的 MCP 工具
    const tools = await mcpToolAdapter.getAllTools();
    
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

// MCP 连接端点
app.post('/api/mcp/connect', async (req, res) => {
  try {
    const { name, command, args, env } = req.body;
    
    // 检查是否已经连接
    const wasConnected = mcpManager.getConnectedMCPs().some(mcp => mcp.name === name);
    
    await mcpManager.connect(name, command, args, env);
    
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

// MCP 断开连接端点
app.post('/api/mcp/disconnect', async (req, res) => {
  try {
    const { name } = req.body;
    
    // 检查是否已连接
    const isConnected = mcpManager.getConnectedMCPs().some(mcp => mcp.name === name);
    
    if (!isConnected) {
      return res.json({ 
        success: true, 
        message: `MCP ${name} is not connected`,
        wasConnected: false
      });
    }
    
    await mcpManager.disconnect(name);
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

// 获取 MCP 列表
app.get('/api/mcp/list', async (req, res) => {
  try {
    const connectedMCPs = mcpManager.getConnectedMCPs();
    
    // 获取每个 MCP 的详细信息
    const detailedList = await Promise.all(
      connectedMCPs.map(async (mcp) => {
        try {
          const tools = await mcpManager.getTools(mcp.name);
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
