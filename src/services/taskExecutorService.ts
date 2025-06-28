import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { Task } from '../models/task.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getTaskService } from './taskService.js';
import { HTTPMCPAdapter } from './httpMcpAdapter.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { TaskStepResult, TaskExecutionResult, WorkflowExecutionStatus } from '../models/taskExecution.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { MCPManager } from './mcpManager.js';

import { MCPInfo } from '../models/mcp.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { mcpNameMapping } from './predefinedMCPs.js';

// 添加LangChain链式调用支持
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
// 获取taskService实例
const taskService = getTaskService();

/**
 * Task Executor Service
 * 通用任务执行器，负责执行MCP工作流并生成结果
 * 不包含任何特定MCP的业务逻辑
 */
export class TaskExecutorService {
  private llm: ChatOpenAI;
  private mcpAuthService: MCPAuthService;
  private httpAdapter: HTTPMCPAdapter;
  private mcpManager: MCPManager;
  private mcpToolAdapter: MCPToolAdapter;
  
  constructor(httpAdapter: HTTPMCPAdapter, mcpAuthService: MCPAuthService, mcpManager: MCPManager) {
    this.httpAdapter = httpAdapter;
    this.mcpAuthService = mcpAuthService;
    this.mcpManager = mcpManager;
    
    // 初始化MCPToolAdapter
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    
    // 初始化ChatOpenAI
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      streaming: true,
      maxTokens: 4096,
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  /**
   * 验证并确保MCP客户端连接正常
   * @param mcpName MCP名称
   * @returns 验证过的客户端实例
   */
  private async ensureClientConnection(mcpName: string): Promise<any> {
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);
    
    if (!isConnected) {
      throw new Error(`MCP ${mcpName} not connected, please ensure MCP service is available`);
    }
    
    // 验证客户端连接状态
    const client = this.mcpManager.getClient(mcpName);
    if (!client) {
      throw new Error(`No client found for MCP: ${mcpName}`);
    }

    // 检查客户端实际连接状态
    try {
      await client.listTools();
      logger.info(`✅ Client connection verified for ${mcpName}`);
      return client;
    } catch (connectionError) {
      logger.error(`❌ Client connection failed for ${mcpName}:`, connectionError);
      logger.info(`🔄 Attempting to reconnect ${mcpName}...`);
      
      // 获取MCP配置用于重连
      const mcpConfig = connectedMCPs.find(mcp => mcp.name === mcpName);
      if (!mcpConfig) {
        throw new Error(`MCP ${mcpName} configuration not found for reconnection`);
      }
      
      try {
        // 尝试重新连接
        await this.mcpManager.disconnect(mcpName);
        await this.mcpManager.connect(mcpName, mcpConfig.command, mcpConfig.args, mcpConfig.env);
        
        // 验证重连后的连接
        const reconnectedClient = this.mcpManager.getClient(mcpName);
        if (!reconnectedClient) {
          throw new Error(`Failed to get reconnected client for ${mcpName}`);
        }
        
        await reconnectedClient.listTools();
        logger.info(`✅ Successfully reconnected ${mcpName}`);
        
        return reconnectedClient;
      } catch (reconnectError) {
        logger.error(`❌ Failed to reconnect ${mcpName}:`, reconnectError);
        throw new Error(`MCP ${mcpName} connection failed and reconnection failed: ${reconnectError}`);
      }
    }
  }
  
  /**
   * 通用步骤输入处理
   */
  private processStepInput(input: any): any {
    // 如果input是JSON字符串，尝试解析它
    if (typeof input === 'string' && input.startsWith('{') && input.endsWith('}')) {
      try {
        return JSON.parse(input);
      } catch (e) {
        logger.warn(`Input is not a valid JSON string, will be processed as regular string: ${input}`);
        return input;
      }
    }
    return input;
  }
  
  /**
   * 通用关键步骤判断
   */
  private isCriticalStep(actionName: string): boolean {
    // 定义通用的关键操作关键词
    const criticalKeywords = [
      'create', 'send', 'post', 'publish', 'tweet', 'payment', 'transfer', 
      'buy', 'sell', 'trade', 'execute', 'deploy', 'delete', 'remove'
    ];
    
    return criticalKeywords.some(keyword => 
      actionName.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  /**
   * 通用结果验证
   */
  private validateStepResult(mcpName: string, actionName: string, stepResult: any): void {
    if (!stepResult) {
      throw new Error(`Step result is null or undefined`);
    }
    
    // 检查是否包含错误信息
    if (stepResult.error) {
      throw new Error(`MCP returned error: ${stepResult.error}`);
    }
    
    // 检查内容中是否包含常见错误关键词
    if (stepResult.content) {
      const content = Array.isArray(stepResult.content) ? stepResult.content[0] : stepResult.content;
      const resultText = content?.text || content?.toString() || '';
      
      // 修复误判逻辑：只有在明确包含错误信息且没有有效数据时才判断为失败
      const errorKeywords = ['unauthorized', 'forbidden', 'rate limit', 'invalid', 'exception', 'failed'];
      
      // 检查是否包含有效的数据结构（如JSON格式的API响应）
      const hasValidData = this.hasValidApiData(resultText);
      
      // 只有在没有有效数据且包含真正的错误关键词时才抛出错误
      if (!hasValidData) {
        const hasError = errorKeywords.some(keyword => 
          resultText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasError) {
          throw new Error(`Operation failed: ${resultText}`);
        }
      }
      
      // 对于明确的错误状态码或错误消息
      if (resultText.includes('"error_code":') && !resultText.includes('"error_code":0')) {
        const errorMatch = resultText.match(/"error_message":"([^"]+)"/);
        const errorMessage = errorMatch ? errorMatch[1] : 'API returned error';
        throw new Error(`API Error: ${errorMessage}`);
      }
    }
  }
  
  /**
   * 检查响应是否包含有效的API数据
   */
  private hasValidApiData(resultText: string): boolean {
    try {
      // 尝试解析JSON
      const parsed = JSON.parse(resultText);
      
      // 检查是否包含常见的有效数据结构
      if (parsed.status && parsed.data) {
        // CoinMarketCap类型的响应
        if (parsed.status.error_code === 0 || parsed.status.error_code === '0') {
          return true;
        }
      }
      
      if (parsed.data && (Array.isArray(parsed.data) || typeof parsed.data === 'object')) {
        // 包含数据数组或对象
        return true;
      }
      
      if (parsed.result || parsed.results) {
        // 包含结果数据
        return true;
      }
      
      // 检查是否是比特币价格数据
      if (parsed.BTC || (parsed.data && parsed.data.BTC)) {
        return true;
      }
      
      return false;
    } catch (e) {
      // 不是JSON，检查是否包含结构化数据特征
      const dataIndicators = [
        '"price":', '"market_cap":', '"volume_24h":', '"symbol":"BTC"',
        '"name":"Bitcoin"', '"rank":', '"dominance":', '"timestamp":'
      ];
      
      return dataIndicators.some(indicator => resultText.includes(indicator));
    }
  }
  
  /**
   * 通过LangChain调用MCP工具
   */
  private async callMCPToolWithLangChain(mcpName: string, toolName: string, input: any): Promise<any> {
    try {
      logger.info(`🔍 Calling MCP tool via LangChain [MCP: ${mcpName}, Tool: ${toolName}]`);
      
      // 验证并确保客户端连接正常
      await this.ensureClientConnection(mcpName);
      
      // 获取MCP的所有工具
      const mcpTools = await this.mcpManager.getTools(mcpName);
      
      // 查找目标工具 - 处理连字符和下划线的兼容性
      const targetTool = mcpTools.find(t => 
        t.name === toolName || 
        t.name.replace(/-/g, '_') === toolName.replace(/-/g, '_') ||
        t.name.replace(/_/g, '-') === toolName.replace(/_/g, '-')
      );
      
      if (!targetTool) {
        logger.error(`Tool ${toolName} does not exist in MCP ${mcpName}`);
        logger.info(`Available tools: ${mcpTools.map(t => t.name).join(', ')}`);
        throw new Error(`Tool ${toolName} does not exist in MCP ${mcpName}`);
      }
      
      // 将MCP工具转换为LangChain工具
      const langchainTool = await this.mcpToolAdapter.convertMCPToolToLangChainTool(mcpName, targetTool);
      
      // 调用LangChain工具
      logger.info(`📞 Calling LangChain tool: ${langchainTool.name}`);
      logger.info(`📥 Input parameters: ${JSON.stringify(input, null, 2)}`);
      
      console.log(`\n==== LangChain Tool Call Details ====`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`MCP Name: ${mcpName}`);
      console.log(`Tool Name: ${toolName}`);
      console.log(`LangChain Tool Name: ${langchainTool.name}`);
      console.log(`Input Parameters to LangChain: ${JSON.stringify(input, null, 2)}`);
      console.log(`Tool Description: ${targetTool.description || 'No description'}`);
      console.log(`Tool Input Schema: ${JSON.stringify(targetTool.inputSchema, null, 2)}`);
      
      let result;
      try {
        result = await langchainTool.invoke(input);
      } catch (schemaError) {
        if (schemaError instanceof Error && schemaError.message && schemaError.message.includes('schema')) {
          logger.warn(`Schema validation failed, attempting to convert input parameters...`);
          console.log(`⚠️ Schema validation failed, attempting parameter conversion...`);
          
          // 使用LLM转换输入参数
          const conversionPrompt = `Convert the input parameters to match the tool schema.

Tool: ${targetTool.name}
Description: ${targetTool.description || 'No description'}
Expected Schema: ${JSON.stringify(targetTool.inputSchema, null, 2)}
Current Input: ${JSON.stringify(input, null, 2)}

Please respond with ONLY a valid JSON object that matches the expected schema.
For cryptocurrency tools:
- Use lowercase coin IDs like "bitcoin", "ethereum"
- Use "usd" for vs_currency
- Include boolean flags like include_market_cap: true, include_24hr_change: true`;

          const conversionResponse = await this.llm.invoke([
            new SystemMessage(conversionPrompt)
          ]);

          try {
            const convertedInput = JSON.parse(conversionResponse.content.toString().trim());
            console.log(`🔄 Converted input: ${JSON.stringify(convertedInput, null, 2)}`);
            logger.info(`🔄 Attempting tool call with converted input: ${JSON.stringify(convertedInput)}`);
            
            result = await langchainTool.invoke(convertedInput);
            console.log(`✅ Tool call succeeded with converted input`);
          } catch (conversionError) {
            logger.error(`❌ Parameter conversion failed: ${conversionError}`);
            throw schemaError; // 抛出原始错误
          }
        } else {
          throw schemaError;
        }
      }
      
      console.log(`\n==== LangChain Tool Call Raw Result ====`);
      console.log(`Raw Result Type: ${typeof result}`);
      console.log(`Raw Result: ${result}`);
      
      logger.info(`✅ LangChain tool call successful`);
      logger.info(`📤 Raw result: ${result}`);
      
      // 尝试解析JSON结果
      try {
        const parsedResult = JSON.parse(result);
        if (parsedResult.content) {
          return parsedResult;
        }
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      } catch (e) {
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }
    } catch (error) {
      logger.error(`❌ LangChain tool call failed:`, error);
      throw error;
    }
  }

  /**
   * 根据任务目标动态调用MCP工具
   */
  private async callMCPWithObjective(mcpName: string, objective: string, input: any, taskId?: string): Promise<any> {
    try {
      logger.info(`🎯 Calling MCP with objective [MCP: ${mcpName}, Objective: ${objective}]`);
      logger.info(`📥 Input parameters: ${JSON.stringify(input, null, 2)}`);

      // 标准化MCP名称
      const actualMcpName = this.normalizeMCPName(mcpName);
      if (actualMcpName !== mcpName) {
        logger.info(`MCP name mapping: '${mcpName}' mapped to '${actualMcpName}'`);
      }

      // 检查MCP是否已连接
      const connectedMCPs = this.mcpManager.getConnectedMCPs();
      const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
      
      console.log(`\n==== MCP Connection Status Debug ====`);
      console.log(`MCP Name: ${actualMcpName}`);
      console.log(`Is Connected: ${isConnected}`);
      console.log(`Connected MCPs:`, connectedMCPs.map(mcp => ({
        name: mcp.name,
        env: mcp.env,
        connected: mcp.connected
      })));
      
      // 检查已连接的MCP是否有正确的认证信息
      let needsReconnection = false;
      if (isConnected) {
        const connectedMcp = connectedMCPs.find(mcp => mcp.name === actualMcpName);
        if (connectedMcp) {
          console.log(`Connected MCP env:`, connectedMcp.env);
          const apiKey = connectedMcp.env?.COINMARKETCAP_API_KEY;
          console.log(`API Key status: ${apiKey ? 'Present' : 'Missing'} (length: ${apiKey?.length || 0})`);
          
          // 如果API密钥缺失，需要重新连接
          if (!apiKey || apiKey === '') {
            console.log(`API Key missing, need to reconnect with proper authentication`);
            needsReconnection = true;
          }
        }
      }
      
      // 如果未连接或需要重新连接，尝试自动连接
      if (!isConnected || needsReconnection) {
        if (needsReconnection) {
          console.log(`Disconnecting MCP ${actualMcpName} to reconnect with proper auth...`);
          await this.mcpManager.disconnect(actualMcpName);
        }
        console.log(`Calling autoConnectMCP with task ID: ${taskId}...`);
        await this.autoConnectMCP(actualMcpName, taskId);
      } else {
        console.log(`MCP already connected with valid auth, skipping autoConnectMCP`);
      }

      // 获取MCP的所有工具
      const mcpTools = await this.mcpManager.getTools(actualMcpName);
      logger.info(`📋 Available tools in ${actualMcpName}: ${mcpTools.map(t => t.name).join(', ')}`);

      // 使用LLM根据目标选择合适的工具，并转换输入参数
      const toolSelectionPrompt = `You are an AI assistant that selects the most appropriate tool and generates proper input parameters.

Task objective: ${objective}
Original input: ${JSON.stringify(input)}

Available tools:
${mcpTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}${tool.inputSchema ? '\n  Input schema: ' + JSON.stringify(tool.inputSchema) : ''}`).join('\n')}

Please respond in JSON format with:
{
  "toolName": "exact_tool_name",
  "inputParams": { /* converted parameters based on tool schema */ },
  "reasoning": "brief explanation"
}

For cryptocurrency queries:
- Use "bitcoin" as ID for Bitcoin, "ethereum" for Ethereum, etc.
- Use "usd" as vs_currency for USD prices
- Include relevant parameters like include_market_cap, include_24hr_change, etc.`;

      const toolSelectionResponse = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      let toolSelection;
      try {
        const responseText = toolSelectionResponse.content.toString().trim();
        // 尝试解析JSON响应
        toolSelection = JSON.parse(responseText);
      } catch (parseError) {
        logger.error(`Failed to parse tool selection response: ${toolSelectionResponse.content}`);
        // 回退到简单的工具选择
        const fallbackPrompt = `Available tools: ${mcpTools.map(t => t.name).join(', ')}\nObjective: ${objective}\nSelect ONLY the exact tool name:`;
        const fallbackResponse = await this.llm.invoke([new SystemMessage(fallbackPrompt)]);
        const fallbackToolName = fallbackResponse.content.toString().trim();
        toolSelection = {
          toolName: fallbackToolName,
          inputParams: input,
          reasoning: "Fallback selection due to parsing error"
        };
      }

      const selectedToolName = toolSelection.toolName;
      const convertedInput = toolSelection.inputParams || input;
      
      logger.info(`🔧 LLM selected tool: ${selectedToolName}`);
      logger.info(`🔧 Converted input parameters: ${JSON.stringify(convertedInput)}`);
      logger.info(`🧠 Selection reasoning: ${toolSelection.reasoning || 'No reasoning provided'}`);

      // 验证选择的工具是否存在
      let selectedTool = mcpTools.find(t => t.name === selectedToolName);
      let finalToolName = selectedToolName;
      
      if (!selectedTool) {
        logger.error(`Selected tool ${selectedToolName} not found in available tools`);
        // 尝试模糊匹配
        const fuzzyMatch = mcpTools.find(t => 
          t.name.toLowerCase().includes(selectedToolName.toLowerCase()) ||
          selectedToolName.toLowerCase().includes(t.name.toLowerCase())
        );
        if (fuzzyMatch) {
          logger.info(`Found fuzzy match: ${fuzzyMatch.name}`);
          selectedTool = fuzzyMatch;
          finalToolName = fuzzyMatch.name;
        } else {
          throw new Error(`Tool selection failed: ${selectedToolName} not found in available tools`);
        }
      }

      // 调用选定的工具
      console.log(`\n==== MCP Objective-Based Call Details ====`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Original MCP Name: ${mcpName}`);
      console.log(`Actual MCP Name: ${actualMcpName}`);
      console.log(`Objective: ${objective}`);
      console.log(`Selected Tool: ${finalToolName}`);
      console.log(`Original Input: ${JSON.stringify(input, null, 2)}`);
      console.log(`Converted Input Parameters: ${JSON.stringify(convertedInput, null, 2)}`);
      
      const result = await this.callMCPToolWithLangChain(actualMcpName, finalToolName, convertedInput);
      
      console.log(`\n==== MCP Objective-Based Call Result ====`);
      console.log(`Status: Success`);
      console.log(`Return Data: ${JSON.stringify(result, null, 2)}`);
      
      return result;

    } catch (error) {
      logger.error(`❌ MCP objective-based call failed [${mcpName}/${objective}]:`, error);
      throw error;
    }
  }

  /**
   * 通用MCP工具调用方法
   */
  private async callMCPTool(mcpName: string, toolNameOrObjective: string, input: any, taskId?: string): Promise<any> {
    try {
      // 判断是工具名还是任务目标
      // 如果包含空格或中文，很可能是任务目标描述
      const isObjective = /[\s\u4e00-\u9fa5]/.test(toolNameOrObjective) || 
                         toolNameOrObjective.includes('_') === false && 
                         toolNameOrObjective.length > 30;

      if (isObjective) {
        logger.info(`🎯 Detected objective-based call: ${toolNameOrObjective}`);
        return await this.callMCPWithObjective(mcpName, toolNameOrObjective, input, taskId);
      } else {
        logger.info(`🔧 Detected tool-based call: ${toolNameOrObjective}`);
        // 原有的直接调用工具的逻辑
        logger.info(`🔍 Calling MCP tool [MCP: ${mcpName}, Tool: ${toolNameOrObjective}]`);
        logger.info(`📥 MCP tool input parameters: ${JSON.stringify(input, null, 2)}`);

        console.log(`\n==== MCP Call Details ====`);
        console.log(`Time: ${new Date().toISOString()}`);
        console.log(`MCP Service: ${mcpName}`);
        console.log(`Tool Name: ${toolNameOrObjective}`);
        console.log(`Input Parameters: ${JSON.stringify(input, null, 2)}`);
        
        // 标准化MCP名称
        const actualMcpName = this.normalizeMCPName(mcpName);
        if (actualMcpName !== mcpName) {
          logger.info(`MCP name mapping: '${mcpName}' mapped to '${actualMcpName}'`);
        }

        // 检查MCP是否已连接
        const connectedMCPs = this.mcpManager.getConnectedMCPs();
        const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
        
        // 如果未连接，尝试自动连接
        if (!isConnected) {
          await this.autoConnectMCP(actualMcpName, taskId);
        }

        // 使用LangChain调用MCP工具
        logger.info(`🔗 Using LangChain to call MCP tool...`);
        const result = await this.callMCPToolWithLangChain(actualMcpName, toolNameOrObjective, input);

        console.log(`\n==== MCP Call Result (via LangChain) ====`);
        console.log(`Status: Success`);
        console.log(`Return Data: ${JSON.stringify(result, null, 2)}`);

        logger.info(`📤 MCP tool return result (LangChain): ${JSON.stringify(result, null, 2)}`);
        logger.info(`✅ MCP tool call successful (via LangChain) [MCP: ${mcpName}, Tool: ${toolNameOrObjective}]`);
        
        return result;
      }
    } catch (error) {
      console.log(`\n==== MCP Call Error ====`);
      console.log(`Status: Failed`);
      console.log(`Error Message: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Error Details: ${JSON.stringify(error, null, 2)}`);

      logger.error(`❌ MCP tool call failed [${mcpName}/${toolNameOrObjective}]:`, error);
      throw error;
    }
  }
  
  /**
   * 自动连接MCP服务
   */
  private async autoConnectMCP(mcpName: string, taskId?: string): Promise<void> {
    logger.info(`MCP ${mcpName} not connected, attempting auto-connection...`);
    
    // 从predefinedMCPs获取MCP配置
    const { getPredefinedMCP } = await import('../services/predefinedMCPs.js');
    const mcpConfig = getPredefinedMCP(mcpName);
    
    if (!mcpConfig) {
      logger.error(`MCP ${mcpName} configuration not found`);
      throw new Error(`MCP ${mcpName} configuration not found`);
    }
    
    // 动态注入用户认证信息
    const dynamicEnv = await this.injectUserAuthentication(mcpConfig, taskId);
    
    // 使用动态环境变量创建MCP配置
    const dynamicMcpConfig = {
      ...mcpConfig,
      env: dynamicEnv
    };
    
    // 尝试连接MCP
    const connected = await this.mcpManager.connectPredefined(dynamicMcpConfig);
    if (!connected) {
      throw new Error(`Failed to connect to MCP ${mcpName}. Please ensure the MCP server is installed and configured correctly.`);
    }
    
    logger.info(`✅ MCP ${mcpName} auto-connection successful`);
    
    // 验证工具是否存在并详细记录
    try {
      const tools = await this.mcpManager.getTools(mcpName);
      logger.info(`✅ Available tools after connection [${mcpName}]: ${tools.map(t => t.name).join(', ')}`);
      
      // 详细记录每个工具的信息
      tools.forEach((tool, index) => {
        logger.info(`🔧 Tool ${index + 1}: ${tool.name}`);
        logger.info(`   Description: ${tool.description || 'No description'}`);
        if (tool.inputSchema) {
          logger.info(`   Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
        }
      });
      
      // 特别检查x-mcp的工具
      if (mcpName === 'x-mcp') {
        logger.info(`🐦 X-MCP Tools Summary:`);
        logger.info(`   Total tools found: ${tools.length}`);
        logger.info(`   Expected tools: get_home_timeline, create_tweet, reply_to_tweet`);
        
        const expectedTools = ['get_home_timeline', 'create_tweet', 'reply_to_tweet', 'get_list_tweets'];
        expectedTools.forEach(expectedTool => {
          const found = tools.find(t => t.name === expectedTool);
          if (found) {
            logger.info(`   ✅ ${expectedTool}: FOUND`);
                  } else {
            logger.warn(`   ❌ ${expectedTool}: NOT FOUND`);
          }
        });
      }
    } catch (toolError) {
      logger.error(`❌ Unable to get tool list for MCP ${mcpName}:`, toolError);
    }
  }
  
  /**
   * 动态注入用户认证信息
   */
  private async injectUserAuthentication(mcpConfig: any, taskId?: string): Promise<Record<string, string>> {
    let dynamicEnv = { ...mcpConfig.env };
    
    console.log(`\n==== Authentication Injection Debug ====`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`MCP Name: ${mcpConfig.name}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Original Env: ${JSON.stringify(mcpConfig.env, null, 2)}`);
    console.log(`Dynamic Env (initial): ${JSON.stringify(dynamicEnv, null, 2)}`);
    
    // 检查是否需要认证
    if (mcpConfig.env) {
      const missingEnvVars: string[] = [];
      
      // 检查每个环境变量是否缺失
      for (const [key, value] of Object.entries(mcpConfig.env)) {
        if (!value || value === '') {
          missingEnvVars.push(key);
        }
      }
      
      console.log(`Missing env vars: ${JSON.stringify(missingEnvVars)}`);
      
      // 如果有缺失的环境变量，尝试从数据库获取用户认证信息
      if (missingEnvVars.length > 0 && taskId) {
        logger.info(`MCP needs authentication, attempting to get user auth data from database...`);
        
        try {
          const currentTask = await taskService.getTaskById(taskId);
          if (currentTask) {
            const userId = currentTask.userId;
            logger.info(`Got user ID from task context: ${userId}`);
            console.log(`User ID: ${userId}`);
            
            const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpConfig.name);
            console.log(`User Auth Result:`, {
              hasUserAuth: !!userAuth,
              isVerified: userAuth?.isVerified,
              hasAuthData: !!userAuth?.authData
            });
            
            if (userAuth && userAuth.isVerified && userAuth.authData) {
              logger.info(`Found user ${userId} auth info for ${mcpConfig.name}, injecting environment variables...`);
              console.log(`User Auth Data: ${JSON.stringify(userAuth.authData, null, 2)}`);
              
              // 动态注入认证信息到环境变量
              for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
                console.log(`Checking env var: ${envKey} = "${envValue}"`);
                if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                  dynamicEnv[envKey] = userAuth.authData[envKey];
                  console.log(`✅ Injected ${envKey} = "${userAuth.authData[envKey]}"`);
                  logger.info(`Injected environment variable ${envKey}`);
                } else {
                  console.log(`❌ Not injecting ${envKey}: envValue="${envValue}", authData has key: ${!!userAuth.authData[envKey]}`);
                }
              }
              
              const stillMissingVars = missingEnvVars.filter(key => !dynamicEnv[key] || dynamicEnv[key] === '');
              if (stillMissingVars.length === 0) {
                logger.info(`✅ Successfully injected all required auth info for ${mcpConfig.name}`);
                console.log(`✅ All required auth info injected successfully`);
              } else {
                console.log(`❌ Still missing vars: ${JSON.stringify(stillMissingVars)}`);
              }
            } else {
              console.log(`❌ No valid user auth found:`, {
                hasUserAuth: !!userAuth,
                isVerified: userAuth?.isVerified,
                hasAuthData: !!userAuth?.authData
              });
            }
          } else {
            console.log(`❌ Task not found: ${taskId}`);
          }
        } catch (error) {
          logger.error(`Failed to get user auth info:`, error);
          console.log(`❌ Error getting user auth:`, error);
        }
      }
    }
    
    console.log(`Final Dynamic Env: ${JSON.stringify(dynamicEnv, null, 2)}`);
    return dynamicEnv;
  }
  
  /**
   * 处理工具返回结果
   * @param rawResult 原始返回结果
   */
  private processToolResult(rawResult: any): any {
    if (!rawResult) return null;
    
    logger.info(`🔍 Processing MCP tool raw return result: ${JSON.stringify(rawResult, null, 2)}`);
    
    // 处理不同类型的返回结果
    let processedResult;
    if (rawResult.content) {
      if (Array.isArray(rawResult.content)) {
        // 如果是数组，检查第一个元素
        const firstContent = rawResult.content[0];
        if (firstContent && firstContent.text) {
          processedResult = this.formatApiResponse(firstContent.text);
        } else {
          processedResult = JSON.stringify(rawResult.content, null, 2);
        }
      } else if (typeof rawResult.content === 'object') {
        // 如果是对象，检查是否有 text 字段
        if (rawResult.content.text) {
          processedResult = this.formatApiResponse(rawResult.content.text);
        } else {
          processedResult = JSON.stringify(rawResult.content, null, 2);
        }
      } else {
        processedResult = this.formatApiResponse(String(rawResult.content));
      }
    } else {
      processedResult = JSON.stringify(rawResult, null, 2);
    }
    
    logger.info(`📤 MCP tool processed result: ${processedResult}`);
    return processedResult;
  }
  
  /**
   * 使用LLM将原始结果格式化为易读的Markdown格式
   * @param rawResult 原始结果
   * @param mcpName MCP名称
   * @param actionName 动作名称
   * @returns 格式化后的Markdown内容
   */
  private async formatResultWithLLM(rawResult: any, mcpName: string, actionName: string): Promise<string> {
    try {
      logger.info(`🤖 Using LLM to format result for ${mcpName}/${actionName}`);
      
      // 提取实际内容
      let actualContent = rawResult;
      if (rawResult && typeof rawResult === 'object' && rawResult.content) {
        if (Array.isArray(rawResult.content) && rawResult.content.length > 0) {
          actualContent = rawResult.content[0].text || rawResult.content[0];
        } else if (rawResult.content.text) {
          actualContent = rawResult.content.text;
        } else {
          actualContent = rawResult.content;
        }
      }
      
      // 构建格式化提示词
      const formatPrompt = `You are a professional data presentation specialist. Your task is to extract useful information from raw API/tool responses and present it in a clean, readable Markdown format.

MCP Tool: ${mcpName}
Action: ${actionName}
Raw Result:
${typeof actualContent === 'string' ? actualContent : JSON.stringify(actualContent, null, 2)}

FORMATTING RULES:
1. Extract ONLY the meaningful and valuable information
2. Use proper Markdown formatting (headers, lists, tables, etc.)
3. Highlight important numbers, dates, and key information
4. Remove technical details, error codes, and unnecessary metadata
5. If the result contains financial data, format numbers properly (e.g., $1,234.56)
6. If the result contains lists or arrays, present them as bullet points or tables
7. Use emojis where appropriate to make the content more engaging
8. Keep the formatting clean and professional
9. If the result indicates an error or no data, explain it clearly

OUTPUT FORMAT:
- Start with a brief summary of what was retrieved
- Present the main data in an organized manner
- End with any relevant notes or observations

IMPORTANT: Return ONLY the formatted Markdown content, no explanations or meta-commentary.`;

      const response = await this.llm.invoke([
        new SystemMessage(formatPrompt)
      ]);
      
      const formattedResult = response.content.toString().trim();
      logger.info(`✅ Result formatted successfully`);
      
      return formattedResult;
    } catch (error) {
      logger.error(`Failed to format result with LLM:`, error);
      // 降级处理：返回基本格式化的结果
      return `### ${actionName} 结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
    }
  }
  
  /**
   * 格式化API响应数据，使其更易读
   */
  private formatApiResponse(rawText: string): string {
    try {
      // 尝试解析JSON并格式化
      const parsed = JSON.parse(rawText);
      
      // 特殊处理CoinMarketCap响应
      if (parsed.status && parsed.data && parsed.status.error_code === 0) {
        const result: any = {
          success: true,
          timestamp: parsed.status.timestamp,
          data: parsed.data
        };
        
        // 如果是比特币数据，提取关键信息
        if (parsed.data.BTC && Array.isArray(parsed.data.BTC) && parsed.data.BTC.length > 0) {
          const btcData = parsed.data.BTC[0];
          const summary = {
            name: btcData.name,
            symbol: btcData.symbol,
            rank: btcData.cmc_rank,
            price: btcData.quote?.USD?.price,
            market_cap: btcData.quote?.USD?.market_cap,
            market_cap_dominance: btcData.quote?.USD?.market_cap_dominance,
            volume_24h: btcData.quote?.USD?.volume_24h,
            percent_change_24h: btcData.quote?.USD?.percent_change_24h,
            last_updated: btcData.quote?.USD?.last_updated
          };
          
          result.summary = summary;
        }
        
        return JSON.stringify(result, null, 2);
      }
      
      // 其他JSON响应正常格式化
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // 不是有效JSON，直接返回
      return rawText;
    }
  }
  
  /**
   * 生成任务结果摘要
   * @param taskContent 任务内容
   * @param stepResults 步骤结果
   */
  private async generateResultSummary(taskContent: string, stepResults: any[]): Promise<string> {
    try {
      logger.info('Generating task result summary');
      
      // 计算成功和失败步骤数
      const successSteps = stepResults.filter(step => step.success).length;
      const failedSteps = stepResults.length - successSteps;
      
      // 准备步骤结果详情
      const stepDetails = stepResults.map(step => {
        if (step.success) {
          // 如果结果已经是Markdown格式，直接使用前100个字符
          const resultPreview = typeof step.result === 'string' ? 
            step.result.replace(/\n/g, ' ').substring(0, 100) : 
            JSON.stringify(step.result).substring(0, 100);
          return `步骤${step.step}: 成功执行 - ${resultPreview}${resultPreview.length >= 100 ? '...' : ''}`;
        } else {
          return `步骤${step.step}: 执行失败 - ${step.error}`;
        }
      }).join('\n');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional task summary specialist responsible for summarizing complex workflow execution results into detailed yet easy-to-understand reports.
Please generate a comprehensive report based on the original task requirements and execution results, including the following:

1. Task execution overview - total steps, successful steps, failed steps
2. Successfully completed operations and results achieved
3. If any steps failed, detailed explanation of the failure reasons and impacts
4. Overall task outcomes and value
5. Recommendations for the user (if applicable)

Please note that this summary will be presented directly to the user and should use friendly language and formatting to ensure the user understands the complete process and results of the task execution.
Avoid technical jargon while maintaining professionalism and accuracy. Please especially emphasize the value and outcomes the task has delivered to the user.`),
        new HumanMessage(`Task content: ${taskContent}

Execution statistics:
- Total steps: ${stepResults.length}
- Successful steps: ${successSteps}
- Failed steps: ${failedSteps}

Step details:
${stepDetails}

Based on the above task execution information, please generate a complete execution report, focusing on what this task has done for the user and what specific outcomes have been achieved.`)
      ]);
      
      return response.content.toString();
    } catch (error) {
      logger.error('Generating result summary failed:', error);
      return `任务执行完成，共执行了${stepResults.length}个步骤，成功${stepResults.filter(s => s.success).length}个，失败${stepResults.filter(s => !s.success).length}个。请查看详细的步骤结果了解更多信息。`;
    }
  }

  /**
   * 构建LangChain链式工作流
   * @param workflow 工作流配置
   * @param taskId 任务ID
   * @param stream 流式输出回调
   * @returns LangChain的RunnableSequence
   */
  private async buildLangChainWorkflowChain(
    workflow: Array<{ step: number; mcp: string; action: string; input?: any }>,
    taskId: string,
    stream: (data: any) => void
  ): Promise<RunnableSequence> {
    logger.info(`🔗 Building LangChain workflow chain with ${workflow.length} steps`);

    // 创建工作流步骤的Runnable数组
    const runnables = workflow.map((step) => {
      return RunnablePassthrough.assign({
        [`step${step.step}`]: async (previousResults: any) => {
          const stepNumber = step.step;
          const mcpName = step.mcp;
          const actionName = step.action;
          
          // 处理输入：优先使用上一步的结果，如果没有则使用配置的输入
          let input = step.input;
          
          // 如果是第一步之后的步骤，尝试使用前一步的结果
          if (stepNumber > 1 && previousResults[`step${stepNumber - 1}`]) {
            const prevResult = previousResults[`step${stepNumber - 1}`];
            // 智能提取前一步结果中的有用数据
            input = await this.extractUsefulDataFromResult(prevResult, actionName);
          }
          
          // 确保输入格式正确
          input = this.processStepInput(input || {});
          
          logger.info(`📍 LangChain Step ${stepNumber}: ${mcpName} - ${actionName}`);
          logger.info(`📥 Step input: ${JSON.stringify(input, null, 2)}`);
          
          // 发送步骤开始信息
          stream({ 
            event: 'step_start', 
            data: { 
              step: stepNumber,
              mcpName,
              actionName,
              input: typeof input === 'object' ? JSON.stringify(input) : input
            } 
          });
          
          try {
            // 标准化MCP名称
            const actualMcpName = this.normalizeMCPName(mcpName);
            
            // 调用MCP工具
            const stepResult = await this.callMCPTool(actualMcpName, actionName, input, taskId);
            
            // 验证结果
            this.validateStepResult(actualMcpName, actionName, stepResult);
            
            // 处理结果
            const processedResult = this.processToolResult(stepResult);
            
            // 使用LLM格式化结果为Markdown
            const formattedResult = await this.formatResultWithLLM(stepResult, actualMcpName, actionName);
            
            // 保存步骤结果（保存格式化后的结果）
            await taskExecutorDao.saveStepResult(taskId, stepNumber, true, formattedResult);
            
            // 发送步骤完成信息（发送格式化后的结果）
            stream({ 
              event: 'step_complete', 
              data: { 
                step: stepNumber,
                success: true,
                result: formattedResult,
                rawResult: processedResult // 也保留原始结果供调试
              } 
            });
            
            return {
              step: stepNumber,
              success: true,
              result: formattedResult,
              rawResult: processedResult,
              parsedData: this.parseResultData(processedResult) // 解析结构化数据供下一步使用
            };
          } catch (error) {
            logger.error(`❌ LangChain Step ${stepNumber} failed:`, error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // 保存错误结果
            await taskExecutorDao.saveStepResult(taskId, stepNumber, false, errorMsg);
            
            // 发送步骤错误信息
            stream({ 
              event: 'step_error', 
              data: { 
                step: stepNumber,
                error: errorMsg
              } 
            });
            
            return {
              step: stepNumber,
              success: false,
              error: errorMsg
            };
          }
        }
      });
    });

    // 使用pipe方法创建链式调用
    if (runnables.length === 0) {
      throw new Error('Workflow must have at least one step');
    }
    
    // 使用reduce创建链式调用
    const chain = runnables.reduce((prev, current, index) => {
      if (index === 0) {
        return current;
      }
      return prev.pipe(current);
    }, runnables[0] as any);
    
    return chain as RunnableSequence;
  }

  /**
   * 从前一步结果中智能提取有用数据 - 使用LLM进行智能数据转换
   * @param prevResult 前一步的结果
   * @param nextAction 下一步的动作
   * @returns 提取的输入数据
   */
  private async extractUsefulDataFromResult(prevResult: any, nextAction: string): Promise<any> {
    try {
      if (!prevResult || !prevResult.result) {
        logger.info('No previous result to extract from');
        return {};
      }

      // 获取原始结果数据 - 优先使用rawResult（未格式化的原始数据）
      let rawResult = prevResult.rawResult || prevResult.result;
      
      // 处理MCP响应格式 - 提取实际内容
      if (rawResult && typeof rawResult === 'object' && rawResult.content) {
        if (Array.isArray(rawResult.content) && rawResult.content.length > 0) {
          const firstContent = rawResult.content[0];
          if (firstContent.text) {
            rawResult = firstContent.text;
          }
        }
      }

      logger.info(`🤖 Using LLM to transform data for next action: ${nextAction}`);
      
      // 构建智能转换提示词
      const conversionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

PREVIOUS STEP OUTPUT:
${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}

NEXT STEP ACTION: ${nextAction}

TRANSFORMATION RULES:
1. Analyze what type of input the next action expects based on its name
2. Extract and transform relevant data from the previous output
3. Return the data in the exact format expected by the next tool

SPECIAL HANDLING:
- For social media posts (tweet, post, etc.): Return ONLY the text content as a plain string, no JSON wrapper
- For API calls: Return properly structured JSON with required fields
- For data analysis: Include all relevant data from previous step
- Keep social media posts under 280 characters
- Make content engaging and contextual

IMPORTANT:
- Do NOT include explanations or metadata
- Return ONLY the transformed data
- If the next action expects a string, return a string
- If the next action expects JSON, return valid JSON

Example transformations:
- DEXScreener data → Tweet: "🚀 Trending token alert! $SYMBOL is up X% today!"
- Price data → Analysis: {"symbol": "BTC", "price": 50000, "change": 5.2}
- Analysis → Tweet: "Market insight: Bitcoin shows strong momentum..."`;

      const response = await this.llm.invoke([
        new SystemMessage(conversionPrompt)
      ]);

      let transformedData = response.content.toString().trim();
      
      // 清理可能的markdown代码块标记
      if (transformedData.startsWith('```') && transformedData.endsWith('```')) {
        transformedData = transformedData.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
      
      logger.info(`📊 LLM Data Transformation Result:`);
      logger.info(`   Original: ${JSON.stringify(rawResult).substring(0, 200)}...`);
      logger.info(`   Transformed: ${transformedData.substring(0, 200)}${transformedData.length > 200 ? '...' : ''}`);

      // 尝试解析为JSON，如果失败则返回原始字符串
      try {
        const parsed = JSON.parse(transformedData);
        logger.info(`   Type: JSON object`);
        return parsed;
      } catch {
        // 不是JSON，返回字符串（适用于推文等纯文本场景）
        logger.info(`   Type: Plain text string`);
        return transformedData;
      }

    } catch (error) {
      logger.error(`❌ Failed to transform data using LLM: ${error}`);
      
      // 降级处理：尝试简单提取
      if (prevResult.result) {
        const resultStr = JSON.stringify(prevResult.result);
        // 如果是推文相关，尝试生成简单内容
        if (nextAction.toLowerCase().includes('tweet') || nextAction.toLowerCase().includes('post')) {
          return '🚀 Check out the latest crypto market updates! #Crypto #DeFi';
        }
        // 否则返回解析的数据或原始结果
        return prevResult.parsedData || prevResult.result;
      }
      
      return {};
    }
  }

  /**
   * 解析结果数据为结构化格式
   * @param result 原始结果
   * @returns 解析后的结构化数据
   */
  private parseResultData(result: any): any {
    try {
      if (typeof result === 'string') {
        // 尝试解析JSON
        const parsed = JSON.parse(result);
        
        // 提取关键数据
        if (parsed.data) {
          return parsed.data;
        } else if (parsed.summary) {
          return parsed.summary;
        } else {
          return parsed;
        }
      }
      return result;
    } catch (error) {
      // 如果不是JSON，返回原始数据
      return { rawData: result };
    }
  }

  /**
   * 生成社交媒体发布内容
   * @param data 数据
   * @returns 发布内容
   */
  private generatePostContent(data: any): string {
    if (data.symbol && data.price) {
      return `${data.symbol} current price: $${data.price}${data.percent_change_24h ? ` (${data.percent_change_24h > 0 ? '+' : ''}${data.percent_change_24h}%)` : ''}`;
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * 流式执行任务工作流
   * @param taskId 任务ID
   * @param stream 响应流，用于实时发送执行结果
   * @returns 是否执行成功
   */
  async executeTaskStream(taskId: string, stream: (data: any) => void): Promise<boolean> {
    try {
      logger.info(`🚀 Starting streaming task execution with LangChain [Task ID: ${taskId}]`);
      
      // 发送执行开始信息
      stream({ 
        event: 'execution_start', 
        data: { taskId, timestamp: new Date().toISOString() } 
      });
      
      // 获取任务详情
      const task = await taskService.getTaskById(taskId);
      if (!task) {
        logger.error(`❌ Task not found [ID: ${taskId}]`);
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }
      
      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });
      
      // 获取任务的工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;
      
      logger.info(`📋 Workflow structure: ${JSON.stringify(mcpWorkflow, null, 2)}`);
      
      if (!mcpWorkflow || !mcpWorkflow.workflow || mcpWorkflow.workflow.length === 0) {
        logger.error(`❌ Task execution failed: No valid workflow [Task ID: ${taskId}]`);
        
        stream({ 
          event: 'error', 
          data: { 
            message: 'Task execution failed: No valid workflow',
            details: 'Please call task analysis API /api/task/:id/analyze first'
          } 
        });
        
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: 'Task execution failed: No valid workflow, please call task analysis API first'
        });
        
        return false;
      }
      
      // 检查 mcpManager 是否已初始化
      if (!this.mcpManager) {
        logger.error(`❌ mcpManager not initialized, cannot execute task [Task ID: ${taskId}]`);
        stream({ 
          event: 'error', 
          data: { 
            message: 'Task execution failed: MCP manager not initialized',
            details: 'Server configuration error, please contact administrator'
          } 
        });
        
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: 'Task execution failed: MCP manager not initialized'
        });
        
        return false;
      }
      
      try {
        // 使用LangChain构建链式工作流
        logger.info(`🔗 Building LangChain workflow chain for ${mcpWorkflow.workflow.length} steps`);
        const workflowChain = await this.buildLangChainWorkflowChain(
          mcpWorkflow.workflow,
          taskId,
          stream
        );
        
        // 执行链式调用，初始输入包含任务内容
        logger.info(`▶️ Executing LangChain workflow chain`);
        const chainResult = await workflowChain.invoke({
          taskContent: task.content,
          taskId: taskId
        });
        
        // 收集所有步骤的结果
        const workflowResults: any[] = [];
        let finalResult = null;
        
        // 从chainResult中提取步骤结果
        for (let i = 1; i <= mcpWorkflow.workflow.length; i++) {
          const stepResult = chainResult[`step${i}`];
          if (stepResult) {
            workflowResults.push(stepResult);
            
            // 最后一步的结果作为最终结果
            if (i === mcpWorkflow.workflow.length && stepResult.success) {
              finalResult = stepResult.result;
            }
          }
        }
        
        // 生成结果摘要，使用流式生成
        stream({ event: 'generating_summary', data: { message: 'Generating result summary...' } });
        await this.generateResultSummaryStream(task.content, workflowResults, (summaryChunk) => {
          stream({ 
            event: 'summary_chunk', 
            data: { content: summaryChunk } 
          });
        });
        
        // 判断整体执行是否成功
        const overallSuccess = workflowResults.every(result => result.success);
        
        // 工作流完成
        stream({ 
          event: 'workflow_complete', 
          data: { 
            success: overallSuccess,
            message: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with errors'
          }
        });
        
        // 更新任务状态
        await taskExecutorDao.updateTaskResult(
          taskId, 
          overallSuccess ? 'completed' : 'partial_failure',
          {
            summary: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with some failures',
            steps: workflowResults,
            finalResult
          }
        );
        
        // 发送任务完成信息
        stream({ event: 'task_complete', data: { taskId, success: overallSuccess } });
        
        logger.info(`✅ Task execution completed [Task ID: ${taskId}, Success: ${overallSuccess}]`);
        return overallSuccess;
        
      } catch (chainError) {
        logger.error(`❌ LangChain workflow execution failed:`, chainError);
        
        // 发送链式调用错误信息
        stream({ 
          event: 'error', 
          data: { 
            message: 'Workflow chain execution failed',
            details: chainError instanceof Error ? chainError.message : String(chainError)
          }
        });
        
        await taskExecutorDao.updateTaskResult(taskId, 'failed', {
          error: `Chain execution failed: ${chainError instanceof Error ? chainError.message : String(chainError)}`
        });
        
        return false;
      }
      
    } catch (error) {
      logger.error(`Error occurred during task execution [Task ID: ${taskId}]:`, error);
      
      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 发送错误信息
      stream({ 
        event: 'error', 
        data: { 
          message: 'Task execution failed', 
          details: error instanceof Error ? error.message : String(error)
        } 
      });
      
      return false;
    }
  }
  
  /**
   * 流式生成结果摘要
   * @param taskContent 任务内容
   * @param stepResults 步骤结果
   * @param streamCallback 流式回调函数
   */
  private async generateResultSummaryStream(
    taskContent: string, 
    stepResults: any[], 
    streamCallback: (chunk: string) => void
  ): Promise<void> {
    try {
      logger.info('Streaming generation of task result summary');
      
      // 计算成功和失败步骤数
      const successSteps = stepResults.filter(step => step.success).length;
      const failedSteps = stepResults.length - successSteps;
      
      // 准备步骤结果详情
      const stepDetails = stepResults.map(step => {
        if (step.success) {
          // 如果结果已经是Markdown格式，直接使用前100个字符
          const resultPreview = typeof step.result === 'string' ? 
            step.result.replace(/\n/g, ' ').substring(0, 100) : 
            JSON.stringify(step.result).substring(0, 100);
          return `步骤${step.step}: 成功执行 - ${resultPreview}${resultPreview.length >= 100 ? '...' : ''}`;
        } else {
          return `步骤${step.step}: 执行失败 - ${step.error}`;
        }
      }).join('\n');
      
      // 创建流式LLM实例
      const streamingLlm = new ChatOpenAI({
        modelName: process.env.TASK_ANALYSIS_MODEL || 'gpt-4o',
        temperature: 0.7,
        openAIApiKey: process.env.OPENAI_API_KEY,
        streaming: true
      });
      
      // 创建消息
      const messages = [
        new SystemMessage(`You are a professional task summary specialist responsible for summarizing complex workflow execution results into detailed yet easy-to-understand reports.
Please generate a comprehensive report based on the original task requirements and execution results, including the following:

1. Task execution overview - total steps, successful steps, failed steps
2. Successfully completed operations and results achieved
3. If any steps failed, detailed explanation of the failure reasons and impacts
4. Overall task outcomes and value
5. Recommendations for the user (if applicable)

Please note that this summary will be presented directly to the user and should use friendly language and formatting to ensure the user understands the complete process and results of the task execution.
Avoid technical jargon while maintaining professionalism and accuracy. Please especially emphasize the value and outcomes the task has delivered to the user.`),
        new HumanMessage(`Task content: ${taskContent}

Execution statistics:
- Total steps: ${stepResults.length}
- Successful steps: ${successSteps}
- Failed steps: ${failedSteps}

Step details:
${stepDetails}

Based on the above task execution information, please generate a complete execution report, focusing on what this task has done for the user and what specific outcomes have been achieved.`)
      ];
      
      // 获取流
      const stream = await streamingLlm.stream(messages);
      
      // 处理流的内容
      for await (const chunk of stream) {
        if (chunk.content) {
          // 修复类型错误，确保内容为字符串
          const chunkText = typeof chunk.content === 'string' 
            ? chunk.content 
            : JSON.stringify(chunk.content);
          
          streamCallback(chunkText);
        }
      }
    } catch (error) {
      logger.error('Streaming generation of result summary failed:', error);
      streamCallback(`Task execution completed, executed ${stepResults.length} steps in total, ${stepResults.filter(s => s.success).length} successful, ${stepResults.filter(s => !s.success).length} failed. Please check detailed step results for more information.`);
    }
  }

  /**
   * 映射MCP名称，确保名称一致性
   * @param mcpName 原始MCP名称
   * @returns 标准化的MCP名称
   */
  private normalizeMCPName(mcpName: string): string {
    // MCP名称映射表
    const mcpNameMapping: Record<string, string> = {
      'coinmarketcap-mcp-service': 'coinmarketcap-mcp-service',
      'coinmarketcap': 'coinmarketcap-mcp-service',
      'cmc': 'coinmarketcap-mcp-service',
      'playwright': 'playwright',
      'github-mcp-server': 'github-mcp-server',
      'github': 'github-mcp-server',
      'evm-mcp': 'evm-mcp',
      'ethereum': 'evm-mcp',
      'dexscreener-mcp-server': 'dexscreener-mcp-server',
      'dexscreener': 'dexscreener-mcp-server',
      'x-mcp': 'x-mcp',
      'twitter': 'x-mcp',
      'coingecko-mcp': 'coingecko-mcp',
      'coingecko': 'coingecko-mcp',
      'notion-mcp-server': 'notion-mcp-server',
      'notion': 'notion-mcp-server',
      '12306-mcp': '12306-mcp',
      'train': '12306-mcp',
      'AWE Core MCP Server': 'AWE Core MCP Server',
      'awe': 'AWE Core MCP Server'
    };
    
    return mcpNameMapping[mcpName] || mcpName;
  }
}