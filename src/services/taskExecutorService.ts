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
import { messageDao } from '../dao/messageDao.js';
import { MessageType, MessageIntent, MessageStepType } from '../models/conversation.js';
import { conversationDao } from '../dao/conversationDao.js';

import { MCPInfo } from '../models/mcp.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { mcpNameMapping } from './predefinedMCPs.js';
import { IntelligentWorkflowEngine } from './intelligentWorkflowEngine.js';

// 🎛️ 智能工作流全局开关 - 设置为false可快速回退到原有流程
const ENABLE_INTELLIGENT_WORKFLOW = false;

// 添加LangChain链式调用支持
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fa from 'zod/dist/types/v4/locales/fa.js';

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
  private intelligentWorkflowEngine: IntelligentWorkflowEngine;
  
  constructor(httpAdapter: HTTPMCPAdapter, mcpAuthService: MCPAuthService, mcpManager: MCPManager) {
    this.httpAdapter = httpAdapter;
    this.mcpAuthService = mcpAuthService;
    this.mcpManager = mcpManager;
    
    // 初始化MCPToolAdapter
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    
    // 初始化智能工作流引擎
    this.intelligentWorkflowEngine = new IntelligentWorkflowEngine();
    
    // 初始化ChatOpenAI
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3,
      streaming: true,
      maxTokens: 16384, // 大幅增加token限制，支持更大的数据处理
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  /**
   * 验证并确保MCP客户端连接正常
   * @param mcpName MCP名称
   * @param userId 用户ID
   * @returns 验证过的客户端实例
   */
  private async ensureClientConnection(mcpName: string, userId?: string): Promise<any> {
    const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
    const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);
        
    if (!isConnected) {
      throw new Error(`MCP ${mcpName} not connected, please ensure MCP service is available`);
      }

    // 验证客户端连接状态
    const client = this.mcpManager.getClient(mcpName, userId);
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
        await this.mcpManager.disconnect(mcpName, userId);
        await this.mcpManager.connect(mcpName, mcpConfig.command, mcpConfig.args, mcpConfig.env, userId);
          
        // 验证重连后的连接
        const reconnectedClient = this.mcpManager.getClient(mcpName, userId);
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
   * 🔧 新增：根据schema自动创建参数
   */
  private createParamsFromSchema(userInput: string, schema: any): any {
    const params: any = {};
    
    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const fieldSchema = value as any;
        
        // 对于字符串类型参数，尝试从用户输入中提取
        if (fieldSchema.type === 'string') {
          if (key.toLowerCase().includes('protocol') || key.toLowerCase().includes('name')) {
            // 尝试从用户输入中提取协议名称
            const protocolMatch = userInput.match(/\b([A-Za-z][A-Za-z0-9\s]*)\s+protocol/i);
            if (protocolMatch) {
              params[key] = protocolMatch[1].trim();
            } else {
              // 从用户输入中提取第一个大写开头的单词作为协议名
              const nameMatch = userInput.match(/\b([A-Z][a-z]+)/);
              if (nameMatch) {
                params[key] = nameMatch[1];
              } else {
                params[key] = userInput.split(' ')[0]; // 使用第一个单词作为降级
              }
            }
          } else {
            params[key] = userInput; // 默认使用整个用户输入
          }
        } else if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
          params[key] = 1; // 默认数值
        } else if (fieldSchema.type === 'boolean') {
          params[key] = true; // 默认布尔值
        } else {
          params[key] = userInput; // 默认使用用户输入
        }
      }
    }
    
    return params;
  }

  /**
   * 通过LangChain调用MCP工具
   */
  private async callMCPToolWithLangChain(mcpName: string, toolName: string, input: any, taskId?: string): Promise<any> {
    try {
      // 🔧 新增：记录内存使用情况和输入数据大小
      const memUsageBefore = process.memoryUsage();
      const inputSize = JSON.stringify(input).length;
      
      console.log(`\n==== 🧠 Memory & Data Debug - BEFORE MCP Call ====`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`MCP: ${mcpName}, Tool: ${toolName}, Task: ${taskId}`);
      console.log(`Memory Before (MB):`);
      console.log(`  RSS: ${(memUsageBefore.rss / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Used: ${(memUsageBefore.heapUsed / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Total: ${(memUsageBefore.heapTotal / 1024 / 1024).toFixed(2)}`);
      console.log(`  External: ${(memUsageBefore.external / 1024 / 1024).toFixed(2)}`);
      console.log(`Input Data Size: ${inputSize} bytes (${(inputSize / 1024).toFixed(2)} KB)`);
      console.log(`Input Data Preview: ${JSON.stringify(input).substring(0, 200)}...`);
      
      logger.info(`🔍 Calling MCP tool via LangChain [MCP: ${mcpName}, Tool: ${toolName}]`);
      
      // 获取用户ID
      let userId: string | undefined;
      if (taskId) {
        const task = await taskService.getTaskById(taskId);
        userId = task?.userId;
      }
      
      // 验证并确保客户端连接正常
      await this.ensureClientConnection(mcpName, userId);
      
      // 获取MCP的所有工具
      const mcpTools = await this.mcpManager.getTools(mcpName, userId);
      
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
      const langchainTool = await this.mcpToolAdapter.convertMCPToolToLangChainTool(mcpName, targetTool, userId);
      
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
        // 🔧 新增：记录工具调用前的内存状态
        const memBeforeToolCall = process.memoryUsage();
        console.log(`\n==== 🔧 Memory Before Tool Invoke ====`);
        console.log(`  RSS: ${(memBeforeToolCall.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Used: ${(memBeforeToolCall.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Heap Total: ${(memBeforeToolCall.heapTotal / 1024 / 1024).toFixed(2)} MB`);
        
        console.log(`🚀 INVOKING LANGCHAIN TOOL: ${langchainTool.name}...`);
        result = await langchainTool.invoke(input);
        console.log(`✅ LANGCHAIN TOOL INVOCATION COMPLETED`);
        
        // 🔧 新增：记录工具调用后的内存状态和结果大小
        const memAfterToolCall = process.memoryUsage();
        const resultSize = typeof result === 'string' ? result.length : JSON.stringify(result).length;
        
        console.log(`\n==== 🧠 Memory & Data Debug - AFTER Tool Invoke ====`);
        console.log(`  RSS: ${(memAfterToolCall.rss / 1024 / 1024).toFixed(2)} MB (${((memAfterToolCall.rss - memBeforeToolCall.rss) / 1024 / 1024).toFixed(2)} MB delta)`);
        console.log(`  Heap Used: ${(memAfterToolCall.heapUsed / 1024 / 1024).toFixed(2)} MB (${((memAfterToolCall.heapUsed - memBeforeToolCall.heapUsed) / 1024 / 1024).toFixed(2)} MB delta)`);
        console.log(`  Heap Total: ${(memAfterToolCall.heapTotal / 1024 / 1024).toFixed(2)} MB (${((memAfterToolCall.heapTotal - memBeforeToolCall.heapTotal) / 1024 / 1024).toFixed(2)} MB delta)`);
        console.log(`Result Data Size: ${resultSize} bytes (${(resultSize / 1024).toFixed(2)} KB, ${(resultSize / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`Result Type: ${typeof result}`);
        console.log(`Result Preview: ${typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500)}...`);
        
      } catch (schemaError) {
        if (schemaError instanceof Error && schemaError.message && schemaError.message.includes('schema')) {
          logger.warn(`Schema validation failed, attempting to convert input parameters...`);
          console.log(`⚠️ Schema validation failed, attempting parameter conversion...`);
          console.log(`⚠️ Schema Error Details: ${schemaError.message}`);
          console.log(`⚠️ Schema Error Stack: ${schemaError.stack}`);
          
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
            // 🔧 改进JSON解析，先清理LLM响应中的额外内容
            let responseText = conversionResponse.content.toString().trim();
            
            console.log(`\n==== 📝 LLM Parameter Conversion Debug ====`);
            console.log(`Raw LLM Response Length: ${responseText.length} chars`);
            console.log(`Raw LLM Response: ${responseText}`);
            
            // 移除Markdown代码块标记
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            console.log(`After Markdown Cleanup: ${responseText}`);
            
            // 尝试提取JSON对象
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              responseText = jsonMatch[0];
              console.log(`After JSON Extraction: ${responseText}`);
            }
            
            console.log(`🧹 Final Cleaned LLM response: ${responseText}`);
            
            const convertedInput = JSON.parse(responseText);
            console.log(`🔄 Converted input: ${JSON.stringify(convertedInput, null, 2)}`);
            console.log(`🔄 Converted input size: ${JSON.stringify(convertedInput).length} bytes`);
            logger.info(`🔄 Attempting tool call with converted input: ${JSON.stringify(convertedInput)}`);
            
            // 🔧 新增：记录参数转换后的工具调用
            const memBeforeConvertedCall = process.memoryUsage();
            console.log(`\n==== 🔧 Memory Before Converted Tool Call ====`);
            console.log(`  RSS: ${(memBeforeConvertedCall.rss / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Heap Used: ${(memBeforeConvertedCall.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            
            console.log(`🚀 INVOKING LANGCHAIN TOOL WITH CONVERTED PARAMS: ${langchainTool.name}...`);
            result = await langchainTool.invoke(convertedInput);
            console.log(`✅ CONVERTED TOOL CALL SUCCEEDED`);
            
            // 🔧 新增：记录转换后调用的内存状态
            const memAfterConvertedCall = process.memoryUsage();
            const convertedResultSize = typeof result === 'string' ? result.length : JSON.stringify(result).length;
            
            console.log(`\n==== 🧠 Memory After Converted Tool Call ====`);
            console.log(`  RSS: ${(memAfterConvertedCall.rss / 1024 / 1024).toFixed(2)} MB (${((memAfterConvertedCall.rss - memBeforeConvertedCall.rss) / 1024 / 1024).toFixed(2)} MB delta)`);
            console.log(`  Heap Used: ${(memAfterConvertedCall.heapUsed / 1024 / 1024).toFixed(2)} MB (${((memAfterConvertedCall.heapUsed - memBeforeConvertedCall.heapUsed) / 1024 / 1024).toFixed(2)} MB delta)`);
            console.log(`Converted Result Size: ${convertedResultSize} bytes (${(convertedResultSize / 1024).toFixed(2)} KB, ${(convertedResultSize / 1024 / 1024).toFixed(2)} MB)`);
            
          } catch (conversionError) {
            console.log(`\n==== ❌ Parameter Conversion Error ====`);
            console.log(`Conversion Error: ${conversionError}`);
            console.log(`Conversion Error Message: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`);
            console.log(`Conversion Error Stack: ${conversionError instanceof Error ? conversionError.stack : 'No stack'}`);
            logger.error(`❌ Parameter conversion failed: ${conversionError}`);
            logger.error(`❌ Raw LLM response: ${conversionResponse.content.toString()}`);
            
            // 🔧 添加更智能的降级处理
            if (input && typeof input === 'string' && targetTool.inputSchema) {
              try {
                // 尝试根据 schema 自动创建参数
                const autoParams = this.createParamsFromSchema(input, targetTool.inputSchema);
                console.log(`🚨 Attempting auto-generated params: ${JSON.stringify(autoParams, null, 2)}`);
                console.log(`🚨 Auto-generated params size: ${JSON.stringify(autoParams).length} bytes`);
                
                const memBeforeAutoCall = process.memoryUsage();
                console.log(`🔧 Memory Before Auto-Param Call: Heap Used ${(memBeforeAutoCall.heapUsed / 1024 / 1024).toFixed(2)} MB`);
                
                result = await langchainTool.invoke(autoParams);
                console.log(`✅ Tool call succeeded with auto-generated params`);
                
                const memAfterAutoCall = process.memoryUsage();
                console.log(`🔧 Memory After Auto-Param Call: Heap Used ${(memAfterAutoCall.heapUsed / 1024 / 1024).toFixed(2)} MB (${((memAfterAutoCall.heapUsed - memBeforeAutoCall.heapUsed) / 1024 / 1024).toFixed(2)} MB delta)`);
                
              } catch (autoError) {
                console.log(`❌ Auto-generated params failed: ${autoError}`);
                logger.error(`❌ Auto-generated params also failed: ${autoError}`);
                throw schemaError; // 抛出原始错误
              }
            } else {
              throw schemaError; // 抛出原始错误
            }
          }
        } else {
          console.log(`❌ Non-schema error: ${schemaError}`);
          throw schemaError;
        }
      }
      
      // 🔧 新增：记录最终结果处理前的状态
      const memBeforeResultProcessing = process.memoryUsage();
      console.log(`\n==== 🔧 Memory Before Result Processing ====`);
      console.log(`  RSS: ${(memBeforeResultProcessing.rss / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Heap Used: ${(memBeforeResultProcessing.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      
      console.log(`\n==== LangChain Tool Call Raw Result ====`);
      console.log(`Raw Result Type: ${typeof result}`);
      console.log(`Raw Result Size: ${typeof result === 'string' ? result.length : JSON.stringify(result).length} bytes`);
      console.log(`Raw Result Preview: ${typeof result === 'string' ? result.substring(0, 1000) : JSON.stringify(result).substring(0, 1000)}...`);
      
      logger.info(`✅ LangChain tool call successful`);
      logger.info(`📤 Raw result: ${typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)}...`);
      
      // 尝试解析JSON结果
      let finalResult;
      try {
        console.log(`\n==== 📊 JSON Result Processing Debug ====`);
        console.log(`Starting JSON.parse() on result...`);
        console.log(`Result to parse (first 500 chars): ${typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500)}...`);
        
        // 🔧 新增：记录JSON解析前的内存
        const memBeforeJSONParse = process.memoryUsage();
        console.log(`Memory before JSON.parse(): Heap Used ${(memBeforeJSONParse.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        
        const parsedResult = JSON.parse(result);
        
        // 🔧 新增：记录JSON解析后的内存
        const memAfterJSONParse = process.memoryUsage();
        console.log(`Memory after JSON.parse(): Heap Used ${(memAfterJSONParse.heapUsed / 1024 / 1024).toFixed(2)} MB (${((memAfterJSONParse.heapUsed - memBeforeJSONParse.heapUsed) / 1024 / 1024).toFixed(2)} MB delta)`);
        
        console.log(`✅ JSON.parse() successful`);
        console.log(`Parsed result type: ${typeof parsedResult}`);
        console.log(`Parsed result keys: ${typeof parsedResult === 'object' && parsedResult !== null ? Object.keys(parsedResult) : 'Not an object'}`);
        
        if (parsedResult.content) {
          console.log(`Found content field in parsed result`);
          console.log(`Content type: ${typeof parsedResult.content}`);
          console.log(`Content size: ${JSON.stringify(parsedResult.content).length} bytes`);
          finalResult = parsedResult;
        } else {
          console.log(`No content field found, wrapping result`);
          finalResult = {
            content: [{
              type: 'text',
              text: result
            }]
          };
        }
      } catch (parseError) {
        console.log(`❌ JSON.parse() failed: ${parseError}`);
        console.log(`Parse error message: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        console.log(`Creating wrapped result...`);
        finalResult = {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }
      
      // 🔧 新增：记录处理完成后的最终内存状态
      const memUsageAfter = process.memoryUsage();
      const finalResultSize = JSON.stringify(finalResult).length;
      
      console.log(`\n==== 🧠 Memory & Data Debug - FINAL STATE ====`);
      console.log(`Memory After (MB):`);
      console.log(`  RSS: ${(memUsageAfter.rss / 1024 / 1024).toFixed(2)} (${((memUsageAfter.rss - memUsageBefore.rss) / 1024 / 1024).toFixed(2)} MB total delta)`);
      console.log(`  Heap Used: ${(memUsageAfter.heapUsed / 1024 / 1024).toFixed(2)} (${((memUsageAfter.heapUsed - memUsageBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB total delta)`);
      console.log(`  Heap Total: ${(memUsageAfter.heapTotal / 1024 / 1024).toFixed(2)} (${((memUsageAfter.heapTotal - memUsageBefore.heapTotal) / 1024 / 1024).toFixed(2)} MB total delta)`);
      console.log(`  External: ${(memUsageAfter.external / 1024 / 1024).toFixed(2)} (${((memUsageAfter.external - memUsageBefore.external) / 1024 / 1024).toFixed(2)} MB total delta)`);
      console.log(`Final Result Size: ${finalResultSize} bytes (${(finalResultSize / 1024).toFixed(2)} KB, ${(finalResultSize / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`🎯 MEMORY EFFICIENCY RATIO: ${((finalResultSize / 1024 / 1024) / ((memUsageAfter.heapUsed - memUsageBefore.heapUsed) / 1024 / 1024)).toFixed(2)} (result MB / heap delta MB)`);
      
      // 🔧 强制垃圾回收（如果可用）
      if (global.gc) {
        console.log(`🗑️ Forcing garbage collection...`);
        global.gc();
        const memAfterGC = process.memoryUsage();
        console.log(`Memory after GC: Heap Used ${(memAfterGC.heapUsed / 1024 / 1024).toFixed(2)} MB (${((memAfterGC.heapUsed - memUsageAfter.heapUsed) / 1024 / 1024).toFixed(2)} MB freed)`);
      } else {
        console.log(`⚠️ Garbage collection not available (start Node.js with --expose-gc to enable)`);
      }
      
      return finalResult;
    } catch (error) {
      // 🔧 新增：记录错误时的内存状态
      const memUsageOnError = process.memoryUsage();
      console.log(`\n==== ❌ Memory Debug - ERROR STATE ====`);
      console.log(`Memory on Error (MB):`);
      console.log(`  RSS: ${(memUsageOnError.rss / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Used: ${(memUsageOnError.heapUsed / 1024 / 1024).toFixed(2)}`);
      console.log(`  Heap Total: ${(memUsageOnError.heapTotal / 1024 / 1024).toFixed(2)}`);
      console.log(`Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.log(`Error Message: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Error Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      
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

      // 获取用户ID
      let userId: string | undefined;
      if (taskId) {
        const task = await taskService.getTaskById(taskId);
        userId = task?.userId;
      }

      // 检查MCP是否已连接
      const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
      const isConnected = connectedMCPs.some(mcp => mcp.name === actualMcpName);
      
      console.log(`\n==== MCP Connection Status Debug ====`);
      console.log(`MCP Name: ${actualMcpName}`);
      console.log(`User ID: ${userId}`);
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
          await this.mcpManager.disconnect(actualMcpName, userId);
        }
        console.log(`Calling autoConnectMCP with task ID: ${taskId}...`);
        await this.autoConnectMCP(actualMcpName, taskId, userId);
      } else {
        console.log(`MCP already connected with valid auth, skipping autoConnectMCP`);
      }

      // 获取MCP的所有工具
      const mcpTools = await this.mcpManager.getTools(actualMcpName, userId);
      logger.info(`📋 Available tools in ${actualMcpName}: ${mcpTools.map(t => t.name).join(', ')}`);

      // 使用LLM根据目标选择合适的工具，并转换输入参数
      const toolSelectionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

CONTEXT:
- Previous step output: ${typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
- Next action: ${objective}
- Available tools with their schemas:
${mcpTools.map(tool => {
  const schema = tool.inputSchema || {};
  return `
Tool: ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema: ${JSON.stringify(schema, null, 2)}
`;
}).join('\n')}

TRANSFORMATION PRINCIPLES:
1. **Select the correct tool**: Choose the most appropriate tool from available options based on the objective
2. **Transform parameters**: Convert previous output into correct input format for the selected tool
3. **CRITICAL: Use exact parameter names from the schema**: 
   - ALWAYS check the inputSchema and use the exact parameter names shown
   - For example, if the schema shows "text" as parameter name, use "text" NOT "tweet" or other variations
   - Match the exact property names shown in the inputSchema
4. **Handle missing data intelligently**: 
   - For required data not in previous output: Extract from task context or use descriptive placeholders
   - For optional fields: Omit them if not relevant
   - DO NOT use hardcoded examples or templates

5. **Format according to tool expectations**:
   - Social media tools: Create engaging, concise content from the data
   - API tools: Return structured JSON exactly matching the API schema
   - Content tools: Transform data into readable, formatted text
   - Search tools: Extract relevant keywords or criteria

CRITICAL TWITTER RULES:
- Twitter has a HARD 280 character limit!
- Count ALL characters including spaces, emojis, URLs, hashtags
- If content is too long, you MUST:
  1. Remove URLs (they're not clickable in tweets anyway)
  2. Use abbreviations (e.g., "w/" for "with")
  3. Remove less important details
  4. Keep only the most essential information
- For threads: First tweet should be <250 chars to leave room for thread numbering
- Example of good tweet: "🚀 Top 3 Meme Coins 🧵\n\n1️⃣ Big Papa ($PAPA) - Solana meme coin\n2️⃣ $BEAST - Pulsechain revolution\n3️⃣ Novus Ordo ($NOVO) - Providence themed\n\n#MemeCoins #Crypto" (under 280 chars)

IMPORTANT REMINDERS:
- Base transformations on actual data and tool schemas, not examples
- Each tool has unique requirements - analyze the schema carefully
- Focus on the objective and what the tool actually needs
- VERIFY character count for Twitter - must be under 280!

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "toolName": "exact_tool_name_from_available_tools",
  "inputParams": { /* transformed parameters using EXACT parameter names from the tool's input schema */ },
  "reasoning": "brief explanation of tool selection and parameter transformation"
}

EXAMPLE TRANSFORMATIONS:
- For create_tweet tool with schema {"text": {"type": "string"}}: 
  * Use {"text": "your tweet content"} NOT {"tweet": "content"}
  * MUST be under 280 characters! Summarize if needed
  * For threads: Create first tweet mentioning "Thread 1/n 🧵"
- For cryptocurrency queries: Use proper coin IDs like "bitcoin", "ethereum" and "usd" for vs_currency
- For social media: Extract key insights and format as engaging content (respect character limits!)
- For API calls: Structure data according to API schema requirements
- For content creation: Transform data into readable, formatted text

IMPORTANT: Always check the exact parameter names in the inputSchema and use those exact names in your inputParams.

Transform the data now:`;

      const toolSelectionResponse = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      let toolSelection;
      try {
        toolSelection = this.parseLLMJsonResponse(toolSelectionResponse.content.toString());
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        logger.error(`Failed to parse tool selection response: ${errorMessage}`);
        
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
      
      const result = await this.callMCPToolWithLangChain(actualMcpName, finalToolName, convertedInput, taskId);
      
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
        const result = await this.callMCPToolWithLangChain(actualMcpName, toolNameOrObjective, input, taskId);

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
  private async autoConnectMCP(mcpName: string, taskId?: string, userId?: string): Promise<void> {
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
    
    // 处理args中的环境变量替换
    const dynamicArgs = await this.injectArgsAuthentication(mcpConfig.args || [], dynamicEnv, taskId);
    
    // 使用动态环境变量和args创建MCP配置
    const dynamicMcpConfig = {
      ...mcpConfig,
      env: dynamicEnv,
      args: dynamicArgs
    };
    
    // 尝试连接MCP，传递userId
    const connected = await this.mcpManager.connectPredefined(dynamicMcpConfig, userId);
    if (!connected) {
      throw new Error(`Failed to connect to MCP ${mcpName}. Please ensure the MCP server is installed and configured correctly.`);
    }
    
    logger.info(`✅ MCP ${mcpName} auto-connection successful`);
    
    // 验证工具是否存在并详细记录
    try {
      const tools = await this.mcpManager.getTools(mcpName, userId);
      logger.info(`✅ Available tools after connection [${mcpName}]: ${tools.map(t => t.name).join(', ')}`);
      
      // 详细记录每个工具的信息
      tools.forEach((tool, index) => {
        logger.info(`🔧 Tool ${index + 1}: ${tool.name}`);
        logger.info(`   Description: ${tool.description || 'No description'}`);
        if (tool.inputSchema) {
          logger.info(`   Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
        }
      });
      
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
                  // 🔧 特殊处理Notion MCP的OPENAPI_MCP_HEADERS
                  if (envKey === 'OPENAPI_MCP_HEADERS' && mcpConfig.name === 'notion-mcp') {
                    const authValue = userAuth.authData[envKey];
                    console.log(`🔧 处理Notion MCP的OPENAPI_MCP_HEADERS: "${authValue}"`);
                    
                    // 检查用户填写的是否已经是完整的JSON字符串
                    if (authValue.startsWith('{') && authValue.endsWith('}')) {
                      // 用户填写的是完整JSON，直接使用
                      dynamicEnv[envKey] = authValue;
                      console.log(`✅ 使用完整JSON格式: ${authValue}`);
                    } else if (authValue.startsWith('ntn_') || authValue.startsWith('secret_')) {
                      // 用户只填写了token，构建完整的JSON字符串
                      const jsonHeaders = JSON.stringify({
                        "Authorization": `Bearer ${authValue}`,
                        "Notion-Version": "2022-06-28"
                      });
                      dynamicEnv[envKey] = jsonHeaders;
                      console.log(`✅ 自动构建JSON格式: ${jsonHeaders}`);
                      logger.info(`自动构建Notion认证JSON: ${jsonHeaders}`);
                    } else {
                      // 尝试解析为JSON，如果失败则当作token处理
                      try {
                        JSON.parse(authValue);
                        dynamicEnv[envKey] = authValue;
                        console.log(`✅ 验证JSON格式有效: ${authValue}`);
                      } catch {
                        // 当作token处理
                        const jsonHeaders = JSON.stringify({
                          "Authorization": `Bearer ${authValue}`,
                          "Notion-Version": "2022-06-28"
                        });
                        dynamicEnv[envKey] = jsonHeaders;
                        console.log(`✅ 解析失败，当作token处理: ${jsonHeaders}`);
                      }
                    }
                  } else {
                    // 其他MCP的正常处理
                  dynamicEnv[envKey] = userAuth.authData[envKey];
                  console.log(`✅ Injected ${envKey} = "${userAuth.authData[envKey]}"`);
                  }
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
   * 动态注入args中的认证信息
   */
  private async injectArgsAuthentication(originalArgs: string[], dynamicEnv: Record<string, string>, taskId?: string): Promise<string[]> {
    if (!originalArgs || originalArgs.length === 0) {
      return originalArgs;
    }
    
    console.log(`\n==== Args Authentication Injection Debug ====`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Original Args: ${JSON.stringify(originalArgs, null, 2)}`);
    console.log(`Dynamic Env: ${JSON.stringify(dynamicEnv, null, 2)}`);
    
    // 创建args的副本进行处理
    const dynamicArgs = [...originalArgs];
    
    // 遍历每个arg，查找并替换环境变量引用
    for (let i = 0; i < dynamicArgs.length; i++) {
      const arg = dynamicArgs[i];
      
      // 查找包含 process.env.* 的参数
      if (typeof arg === 'string' && arg.includes('process.env.')) {
        console.log(`Processing arg ${i}: "${arg}"`);
        
        // 使用正则表达式查找所有的 process.env.VARIABLE_NAME 引用
        const envVarRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
        let modifiedArg = arg;
        let match;
        
        while ((match = envVarRegex.exec(arg)) !== null) {
          const envVarName = match[1]; // 环境变量名
          const fullMatch = match[0]; // 完整匹配的字符串
          
          console.log(`Found env var reference: ${fullMatch} (variable: ${envVarName})`);
          
          // 先检查dynamicEnv中是否有值
          if (dynamicEnv[envVarName]) {
            const newValue = dynamicEnv[envVarName];
            modifiedArg = modifiedArg.replace(fullMatch, newValue);
            console.log(`✅ Replaced ${fullMatch} with "${newValue}"`);
          } else {
            // 如果dynamicEnv中没有，尝试从process.env获取
            const processEnvValue = process.env[envVarName] || '';
            modifiedArg = modifiedArg.replace(fullMatch, processEnvValue);
            console.log(`⚠️ Used process.env value for ${envVarName}: "${processEnvValue}"`);
          }
        }
        
        // 如果参数被修改了，更新它
        if (modifiedArg !== arg) {
          dynamicArgs[i] = modifiedArg;
          console.log(`Updated arg ${i}: "${arg}" -> "${modifiedArg}"`);
        }
      }
    }
    
    console.log(`Final Dynamic Args: ${JSON.stringify(dynamicArgs, null, 2)}`);
    return dynamicArgs;
  }
  
  /**
   * 处理工具返回结果 - 提取原始数据，不做格式化处理
   * @param rawResult 原始返回结果
   * 
   * 注释说明：这个方法已经不再使用，因为它会对不同MCP的返回格式做假设，
   * 容易出现数据丢失或格式错误。现在直接将原始结果传给LLM处理更可靠。
   */
  // private processToolResult(rawResult: any): any {
  //   if (!rawResult) return null;
  //   
  //   logger.info(`🔍 Processing MCP tool raw return result: ${JSON.stringify(rawResult, null, 2)}`);
  //   
  //   // 简化处理逻辑：直接提取数据，让LLM来处理所有格式化
  //   let extractedData;
  //   
  //   try {
  //     // 尝试提取实际的数据内容
  //     if (rawResult.content) {
  //       if (Array.isArray(rawResult.content)) {
  //         // 如果是数组，提取第一个元素的text或整个数组
  //         const firstContent = rawResult.content[0];
  //         if (firstContent && firstContent.text) {
  //           extractedData = firstContent.text;
  //         } else {
  //           extractedData = rawResult.content;
  //         }
  //       } else if (typeof rawResult.content === 'object') {
  //         // 如果是对象，提取text字段或整个对象
  //         extractedData = rawResult.content.text || rawResult.content;
  //       } else {
  //         // 如果是字符串，直接使用
  //         extractedData = rawResult.content;
  //       }
  //     } else {
  //       // 如果没有content字段，使用整个结果
  //       extractedData = rawResult;
  //     }
  //     
  //     // 如果提取的数据是对象，转换为JSON字符串
  //     if (typeof extractedData === 'object') {
  //       extractedData = JSON.stringify(extractedData, null, 2);
  //     } else if (typeof extractedData !== 'string') {
  //       extractedData = String(extractedData);
  //     }
  //     
  //   } catch (error) {
  //     logger.warn(`Error processing tool result, using raw result: ${error}`);
  //     extractedData = JSON.stringify(rawResult, null, 2);
  //   }
  //   
  //   logger.info(`📤 MCP tool extracted data: ${extractedData}`);
  //   return extractedData;
  // }
  
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
1. **Smart Data Recognition**: Analyze the raw result to identify if it contains:
   - Valid data (JSON arrays, objects, structured information)
   - Error messages or failures
   - Mixed results (some data with warnings/errors)

2. **Format Based on Content Type**:
   - **Valid Data**: Extract and present the meaningful information
   - **Error Results**: Explain what went wrong in user-friendly terms
   - **Mixed Results**: Present available data and note any issues

3. **Presentation Guidelines**:
   - Use proper Markdown formatting (headers, lists, tables, etc.)
   - Highlight important numbers, dates, and key information
   - Remove technical details, error codes, and unnecessary metadata
   - If the result contains financial data, format numbers properly (e.g., $1,234.56)
   - If the result contains lists or arrays, present them as bullet points or tables
   - Use emojis where appropriate to make the content more engaging
   - Keep the formatting clean and professional

4. **Error Handling**:
   - If the result indicates an error, explain it clearly in user-friendly language
   - For API errors, translate technical messages into understandable explanations
   - For partial failures, present what data is available and note limitations

5. **Data Extraction**:
   - For JSON arrays: Present as organized lists or tables
   - For nested objects: Extract key-value pairs meaningfully
   - For mixed formats: Adapt presentation to the data structure

OUTPUT FORMAT:
- Start with a brief summary of what was retrieved or what happened
- Present the main data in an organized manner (or explain the error)
- End with any relevant notes or observations

🚨 CRITICAL: Return ONLY the raw Markdown content without any code block wrappers. 
❌ DO NOT wrap your response in \`\`\`markdown \`\`\` or \`\`\` \`\`\` blocks.
✅ Return the markdown content directly, ready for immediate display.

Example of CORRECT output:
# Latest Tweets from @username
Here are the recent tweets...

Example of WRONG output:
\`\`\`markdown
# Latest Tweets from @username
Here are the recent tweets...
\`\`\`

IMPORTANT: Your response should be ready-to-display markdown content, not wrapped in any code blocks.`;

      const response = await this.llm.invoke([
        new SystemMessage(formatPrompt)
      ]);
      
      let formattedResult = response.content.toString().trim();
      
      // 🔧 关键修复：清理可能的markdown代码块包装
      if (formattedResult.startsWith('```markdown\n') && formattedResult.endsWith('\n```')) {
        formattedResult = formattedResult.slice(12, -4).trim();
        logger.info(`🔧 Cleaned markdown code block wrapper`);
      } else if (formattedResult.startsWith('```\n') && formattedResult.endsWith('\n```')) {
        formattedResult = formattedResult.slice(4, -4).trim();
        logger.info(`🔧 Cleaned generic code block wrapper`);
      }
      
      logger.info(`✅ Result formatted successfully`);
      
      return formattedResult;
    } catch (error) {
      logger.error(`Failed to format result with LLM:`, error);
      // 降级处理：返回基本格式化的结果
      return `### ${actionName} 结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
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
   * 构建LangChain链式工作流（带消息存储功能）
   * @param workflow 工作流配置
   * @param taskId 任务ID
   * @param conversationId 会话ID
   * @param stream 流式输出回调
   * @returns LangChain的RunnableSequence
   */
  private async buildLangChainWorkflowChainWithMessages(
    workflow: Array<{ step: number; mcp: string; action: string; input?: any }>,
    taskId: string,
    conversationId: string | undefined,
    stream: (data: any) => void
  ): Promise<RunnableSequence> {
    logger.info(`🔗 Building LangChain workflow chain with message storage for ${workflow.length} steps`);
      
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
          
          // 创建步骤消息（流式）
          let stepMessageId: string | undefined;
          if (conversationId) {
            const stepMessage = await messageDao.createStreamingMessage({
              conversationId,
              content: `Executing step ${stepNumber}: ${actionName}...`,
              type: MessageType.ASSISTANT,
              intent: MessageIntent.TASK,
              taskId,
              metadata: {
                stepType: MessageStepType.EXECUTION,
                stepNumber,
                stepName: actionName,
                totalSteps: workflow.length,
                taskPhase: 'execution',
                contentType: stepNumber === workflow.length ? 'final_result' : 'step_thinking'  // 区分思考过程和最终结果
              }
            });
            stepMessageId = stepMessage.id;
        
            // 增量会话消息计数
            await conversationDao.incrementMessageCount(conversationId);
          }
        
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
            
            // 如果是最后一步，使用流式格式化并发送final_result_chunk事件
            let formattedResult: string;
            if (stepNumber === workflow.length) {
              // 最后一步使用流式格式化
              formattedResult = await this.formatResultWithLLMStream(
                stepResult, 
                actualMcpName, 
                actionName,
                (chunk: string) => {
                  // 发送流式final_result块
                  stream({
                    event: 'final_result_chunk',
                    data: { chunk }
                  });
                }
              );
            } else {
              // 其他步骤使用普通格式化
              formattedResult = await this.formatResultWithLLM(stepResult, actualMcpName, actionName);
            }
            
            // 完成步骤消息
            if (stepMessageId) {
              await messageDao.completeStreamingMessage(stepMessageId, formattedResult);
            }
            
            // 保存步骤结果（保存格式化后的结果）
            await taskExecutorDao.saveStepResult(taskId, stepNumber, true, formattedResult);
          
            // 发送步骤完成信息（发送格式化后的结果）
          stream({ 
            event: 'step_complete', 
            data: { 
              step: stepNumber,
              success: true,
                result: formattedResult,
                rawResult: stepResult // 保留原始MCP结果供调试
            } 
          });
          
            return {
              step: stepNumber,
              success: true,
              result: formattedResult,
              rawResult: stepResult,
              parsedData: this.parseResultData(stepResult) // 解析结构化数据供下一步使用
            };
        } catch (error) {
            logger.error(`❌ LangChain Step ${stepNumber} failed:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          
            // 完成步骤消息（错误状态）
            if (stepMessageId) {
              await messageDao.completeStreamingMessage(stepMessageId, `执行失败: ${errorMsg}`);
            }
            
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
   * 流式生成结果摘要（带消息更新功能）
   * @param taskContent 任务内容
   * @param stepResults 步骤结果
   * @param streamCallback 流式回调函数
   * @param summaryMessageId 摘要消息ID（用于更新消息内容）
   */
  private async generateResultSummaryStreamWithMessage(
    taskContent: string, 
    stepResults: any[], 
    streamCallback: (chunk: string) => void,
    summaryMessageId?: string
  ): Promise<void> {
    try {
      logger.info('Streaming generation of task result summary with message update');
      
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
      
      // 累积完整的摘要内容
      let fullSummary = '';
      
      // 处理流的内容
      for await (const chunk of stream) {
        if (chunk.content) {
          // 修复类型错误，确保内容为字符串
          const chunkText = typeof chunk.content === 'string' 
            ? chunk.content 
            : JSON.stringify(chunk.content);
          
          fullSummary += chunkText;
          streamCallback(chunkText);
        }
      }
      
      // 完成摘要消息
      if (summaryMessageId) {
        await messageDao.completeStreamingMessage(summaryMessageId, `## 📊 任务执行摘要

${fullSummary}`);
      }
    } catch (error) {
      logger.error('Streaming generation of result summary failed:', error);
      const fallbackSummary = `Task execution completed, executed ${stepResults.length} steps in total, ${stepResults.filter(s => s.success).length} successful, ${stepResults.filter(s => !s.success).length} failed. Please check detailed step results for more information.`;
      
      streamCallback(fallbackSummary);
      
      // 完成摘要消息（降级处理）
      if (summaryMessageId) {
        await messageDao.completeStreamingMessage(summaryMessageId, `## 📊 任务执行摘要

${fallbackSummary}`);
      }
    }
  }

  /**
   * 从前一步结果中提取有用数据（使用LLM智能转换）
   * @param prevResult 前一步的结果
   * @param nextAction 下一步的动作
   * @returns 提取的数据
   */
  private async extractUsefulDataFromResult(prevResult: any, nextAction: string): Promise<any> {
    try {
      logger.info(`🔍 Using LLM to extract useful data for next action: ${nextAction}`);
      
      // 准备前一步结果的文本表示
      let rawResult = prevResult.result;
      if (typeof rawResult === 'object' && rawResult.content) {
        if (Array.isArray(rawResult.content) && rawResult.content[0]?.text) {
          rawResult = rawResult.content[0].text;
        } else if (rawResult.content.text) {
          rawResult = rawResult.content.text;
        }
      }
      
      const conversionPrompt = `You are an intelligent data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

CRITICAL: DO NOT use any hardcoded examples or templates. Analyze the actual data and requirements to create appropriate parameters.

CONTEXT:
Previous step output: ${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}
Next action/tool: ${nextAction}

TRANSFORMATION PRINCIPLES:
1. **Analyze the tool name/action**: Understand what the next tool expects based on its name
2. **Extract relevant data**: From previous output, extract only the data relevant to the next tool
3. **Format according to tool type**:
   - For social media tools (tweet, post): Extract key insights and create engaging content
   - For API tools: Structure data according to common API patterns
   - For content creation: Transform data into readable text
   - For database operations: Create properly structured data objects

4. **Common tool patterns**:
   - create_tweet/post_tweet: Expects {"text": "content up to 280 chars"}
     CRITICAL: Twitter has a 280 character limit! If content is longer:
     * For single tweet: Summarize to fit within 280 chars
     * For thread request: Create first tweet only, mentioning it's part 1 of a thread
   - create_post/publish: Expects {"content": "formatted content"}
   - search operations: Expects {"query": "search terms"}
   - data fetching: Expects specific IDs or parameters

5. **Smart content generation**:
   - For Twitter: MUST be under 280 characters! Use concise language, abbreviations if needed
   - For cryptocurrency/financial data: Highlight price, changes, trends
   - For analysis results: Summarize key findings concisely
   - For lists/collections: Format as readable bullet points or threads

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{
  "transformedData": { /* the actual parameters for the next tool */ },
  "reasoning": "brief explanation of the transformation logic"
}

IMPORTANT: Base your transformation purely on the tool name and previous data. Do not use any pre-defined templates.

Transform the data now:`;

      const response = await this.llm.invoke([
        new SystemMessage(conversionPrompt)
      ]);

      let transformedData;
      try {
        const responseText = response.content.toString().trim();
        // 清理可能的markdown格式
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        const parsed = JSON.parse(cleanedText);
        transformedData = parsed.transformedData || parsed;
        
        logger.info(`🤖 LLM数据转换成功: ${JSON.stringify(transformedData, null, 2)}`);
      } catch (parseError) {
        logger.error(`解析LLM转换结果失败: ${response.content}`);
        // 回退处理
        transformedData = rawResult;
      }

      return transformedData;
    } catch (error) {
      logger.error(`❌ Failed to transform data using LLM: ${error}`);
      
      // 降级处理：尝试简单提取
      if (prevResult.result) {
        const resultStr = JSON.stringify(prevResult.result);
        // 如果是推文相关，尝试生成简单内容
        if (nextAction.toLowerCase().includes('tweet') || nextAction.toLowerCase().includes('post')) {
          return {
            text: '🚀 Check out the latest crypto market updates! #Crypto #DeFi'
          };
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
      
      // 获取会话ID用于存储消息
      const conversationId = task.conversationId;
      if (!conversationId) {
        logger.warn(`Task ${taskId} has no associated conversation, execution messages will not be stored`);
      }
      
      // 获取任务的工作流
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;
      
      logger.info(`📋 Workflow structure: ${JSON.stringify(mcpWorkflow, null, 2)}`);
      
      // 🎛️ 根据全局开关决定执行方式
      if (ENABLE_INTELLIGENT_WORKFLOW) {
        // 使用智能工作流引擎，将LLM和预选的MCP工具智能结合执行
        if (mcpWorkflow && mcpWorkflow.workflow && mcpWorkflow.workflow.length > 0) {
          logger.info(`🧠 使用智能工作流引擎执行任务，结合预选的MCP工具 [任务: ${taskId}]`);
          return await this.executeWithIntelligentWorkflow(taskId, task, stream, conversationId);
        } else {
          logger.info(`🧠 使用智能工作流引擎执行任务，无预选MCP工具 [任务: ${taskId}]`);
          return await this.executeWithIntelligentWorkflow(taskId, task, stream, conversationId);
        }
      }
      
      // 传统工作流执行方式（需要预定义工作流）
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
      
      logger.info(`📊 使用传统工作流执行任务 [任务: ${taskId}]`);
      
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
      
      // 创建执行开始的消息
      if (conversationId) {
        const executionStartMessage = await messageDao.createMessage({
          conversationId,
          content: `Executing task "${task.title}" with ${mcpWorkflow.workflow.length} steps...`,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.EXECUTION,
            stepName: 'Execution Start',
            taskPhase: 'execution',
            totalSteps: mcpWorkflow.workflow.length,
            isComplete: true
          }
        });
        
        // 增量会话消息计数
        await conversationDao.incrementMessageCount(conversationId);
      }
      
      try {
        // 使用LangChain构建链式工作流，但添加消息存储功能
        logger.info(`🔗 Building LangChain workflow chain for ${mcpWorkflow.workflow.length} steps`);
        const workflowChain = await this.buildLangChainWorkflowChainWithMessages(
          mcpWorkflow.workflow,
          taskId,
          conversationId,
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
        
        // 创建摘要消息（流式更新）
        let summaryMessageId: string | undefined;
        if (conversationId) {
          const summaryMessage = await messageDao.createStreamingMessage({
            conversationId,
            content: 'Generating execution summary...',
            type: MessageType.ASSISTANT,
            intent: MessageIntent.TASK,
            taskId,
            metadata: {
              stepType: MessageStepType.SUMMARY,
              stepName: 'Execution Summary',
              taskPhase: 'execution',
              isComplete: false
            }
          });
          summaryMessageId = summaryMessage.id;
          
          // 增量会话消息计数
          await conversationDao.incrementMessageCount(conversationId);
        }
        
        await this.generateResultSummaryStreamWithMessage(
          task.content, 
          workflowResults, 
          (summaryChunk) => {
        stream({ 
          event: 'summary_chunk', 
          data: { content: summaryChunk } 
        });
          },
          summaryMessageId
        );
        
        // 判断整体执行是否成功
        const overallSuccess = workflowResults.every(result => result.success);
      
        // 🔧 新增：发送最终结果给前端
        if (finalResult) {
          stream({ 
            event: 'final_result', 
            data: { 
              finalResult,
              message: 'Final execution result available'
            } 
          });
        }
      
        // 🔧 优化：只在workflow_complete事件中返回finalResult，避免重复
      // 工作流完成
      stream({ 
        event: 'workflow_complete', 
        data: { 
            success: overallSuccess,
            message: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with errors',
            finalResult: finalResult // 🔧 在这里统一返回finalResult
          }
        });
        
        // 更新任务状态
        await taskExecutorDao.updateTaskResult(
          taskId, 
          overallSuccess ? 'completed' : 'failed',
          {
            summary: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with some failures',
        steps: workflowResults,
        finalResult
          }
        );
      
      // 发送任务完成信息
        stream({ 
          event: 'task_complete', 
          data: { 
            taskId, 
            success: overallSuccess
          } 
        });
        
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
   * 使用智能工作流引擎执行任务
   * @param taskId 任务ID
   * @param task 任务对象
   * @param stream 流式回调
   * @param conversationId 会话ID
   * @returns 执行是否成功
   */
  private async executeWithIntelligentWorkflow(
    taskId: string, 
    task: any, 
    stream: (data: any) => void,
    conversationId?: string
  ): Promise<boolean> {
    try {
      logger.info(`🧠 使用智能工作流引擎执行任务 [任务: ${taskId}]`);
      
      // 直接调用 IntelligentTaskService 的执行方法
      // 这个方法会读取预选的 MCP 工具并智能执行
      const { intelligentTaskService } = await import('./intelligentTaskService.js');
      
      return await intelligentTaskService.executeTaskIntelligently(taskId, stream);
      
    } catch (error) {
      logger.error(`❌ 智能工作流执行失败:`, error);
      
      stream({
        event: 'error',
        data: {
          message: '智能工作流执行失败',
          details: error instanceof Error ? error.message : String(error)
        }
      });

      // 更新任务状态为失败
      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: `智能工作流执行失败: ${error instanceof Error ? error.message : String(error)}`
      });

      return false;
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

  /**
   * 通用LLM JSON响应解析函数
   */
  private parseLLMJsonResponse(responseContent: string): any {
    const responseText = responseContent.toString().trim();
    
    console.log(`\n==== 📝 LLM JSON Response Parsing Debug ====`);
    console.log(`Raw Response Length: ${responseText.length} chars`);
    console.log(`Raw Response: ${responseText}`);
    
    // 🔧 改进JSON解析，先清理LLM响应中的额外内容
    let cleanedText = responseText;
    
    // 移除Markdown代码块标记
    cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    console.log(`After Markdown Cleanup: ${cleanedText}`);
    
    // 🔧 修复：使用更智能的JSON提取逻辑
    const extractedJson = this.extractCompleteJson(cleanedText);
    if (extractedJson) {
      cleanedText = extractedJson;
      console.log(`After JSON Extraction: ${cleanedText}`);
    }
    
    console.log(`🧹 Final Cleaned text: ${cleanedText}`);
    
    try {
      const parsed = JSON.parse(cleanedText);
      console.log(`✅ JSON.parse() successful`);
      console.log(`Parsed result: ${JSON.stringify(parsed, null, 2)}`);
      return parsed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ JSON.parse() failed: ${errorMessage}`);
      logger.error(`Failed to parse LLM JSON response. Error: ${errorMessage}`);
      logger.error(`Original response: ${responseContent}`);
      throw new Error(`JSON parsing failed: ${errorMessage}`);
    }
  }

  /**
   * 智能提取完整的JSON对象
   */
  private extractCompleteJson(text: string): string | null {
    // 查找第一个 '{' 的位置
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
      return null;
    }
    
    // 从 '{' 开始，手动匹配大括号以找到完整的JSON对象
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          
          // 当大括号计数为0时，我们找到了完整的JSON对象
          if (braceCount === 0) {
            const jsonString = text.substring(startIndex, i + 1);
            console.log(`🔧 Extracted complete JSON: ${jsonString}`);
            return jsonString;
          }
        }
      }
    }
    
    // 如果没有找到完整的JSON对象，返回null
    console.log(`⚠️ Could not find complete JSON object`);
    return null;
  }

  /**
   * 使用LLM流式格式化结果
   * @param rawResult 原始结果
   * @param mcpName MCP名称
   * @param actionName 操作名称
   * @param streamCallback 流式回调函数
   */
  private async formatResultWithLLMStream(
    rawResult: any, 
    mcpName: string, 
    actionName: string,
    streamCallback: (chunk: string) => void
  ): Promise<string> {
    try {
      logger.info(`🤖 Using LLM to format result for ${mcpName}/${actionName} (streaming)`);
      
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
      
      // 检查内容长度，避免超出限制
      const contentStr = typeof actualContent === 'string' ? actualContent : JSON.stringify(actualContent, null, 2);
      const MAX_CONTENT_LENGTH = 50000; // 50k字符限制
      
      let processedContent = contentStr;
      if (contentStr.length > MAX_CONTENT_LENGTH) {
        processedContent = contentStr.substring(0, MAX_CONTENT_LENGTH) + '\n... (content truncated due to length)';
        logger.warn(`Content truncated from ${contentStr.length} to ${MAX_CONTENT_LENGTH} characters`);
      }
      
      // 构建格式化提示词
      const formatPrompt = `You are a professional data presentation specialist. Your task is to extract useful information from raw API/tool responses and present it in a clean, readable Markdown format.

MCP Tool: ${mcpName}
Action: ${actionName}
Raw Result:
${processedContent}

FORMATTING RULES:
1. **Smart Data Recognition**: Analyze the raw result to identify if it contains:
   - Valid data (JSON arrays, objects, structured information)
   - Error messages or failures
   - Mixed results (some data with warnings/errors)

2. **Format Based on Content Type**:
   - **Valid Data**: Extract and present the meaningful information
   - **Error Results**: Explain what went wrong in user-friendly terms
   - **Mixed Results**: Present available data and note any issues

3. **Presentation Guidelines**:
   - Use proper Markdown formatting (headers, lists, tables, etc.)
   - Highlight important numbers, dates, and key information
   - Remove technical details, error codes, and unnecessary metadata
   - If the result contains financial data, format numbers properly (e.g., $1,234.56)
   - Include relevant links, images, or references if available
   - Structure the information logically with clear sections

4. **Quality Standards**:
   - Be concise but comprehensive
   - Focus on user-actionable information
   - Maintain professional tone
   - Ensure the output is immediately useful to the end user

🚨 CRITICAL: Return ONLY the raw Markdown content without any code block wrappers. 
❌ DO NOT wrap your response in \`\`\`markdown \`\`\` or \`\`\` \`\`\` blocks.
✅ Return the markdown content directly, ready for immediate display.

IMPORTANT: Your response should be ready-to-display markdown content, not wrapped in any code blocks.`;

      // 创建流式LLM实例
      const streamingLLM = new ChatOpenAI({
        modelName: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 16384,
        streaming: true,
        apiKey: process.env.OPENAI_API_KEY
      });

      let fullResult = '';
      let isFirstChunk = true;
      let hasMarkdownWrapper = false;
      
      // 使用流式调用
      const stream = await streamingLLM.stream([
        new SystemMessage(formatPrompt)
      ]);

      for await (const chunk of stream) {
        const content = chunk.content.toString();
        if (content) {
          // 🔧 关键修复：检测并处理markdown代码块包装
          if (isFirstChunk && content.includes('```markdown')) {
            hasMarkdownWrapper = true;
            // 移除开头的```markdown\n
            const cleanContent = content.replace(/^.*?```markdown\s*\n?/s, '');
            if (cleanContent) {
              fullResult += cleanContent;
              streamCallback(cleanContent);
            }
          } else if (hasMarkdownWrapper && content.includes('```')) {
            // 移除结尾的\n```
            const cleanContent = content.replace(/\n?```.*$/s, '');
            if (cleanContent) {
              fullResult += cleanContent;
              streamCallback(cleanContent);
            }
            hasMarkdownWrapper = false; // 标记包装已结束
          } else if (!hasMarkdownWrapper || !content.trim().startsWith('```')) {
            fullResult += content;
            streamCallback(content);
          }
          isFirstChunk = false;
        }
      }
      
      // 🔧 额外清理：如果还有残留的markdown包装
      if (fullResult.startsWith('```markdown\n') && fullResult.endsWith('\n```')) {
        fullResult = fullResult.slice(12, -4).trim();
        logger.info(`🔧 Cleaned residual markdown wrapper in stream`);
      }
      
      logger.info(`✅ Result formatted successfully with streaming`);
      return fullResult.trim();
      
    } catch (error) {
      logger.error(`Failed to format result with LLM (streaming):`, error);
      
      // 降级处理：返回基本格式化的结果
      const fallbackResult = `### ${actionName} 结果\n\n\`\`\`json\n${JSON.stringify(rawResult, null, 2)}\n\`\`\``;
      streamCallback(fallbackResult);
      return fallbackResult;
    }
  }
} 