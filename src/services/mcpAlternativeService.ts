import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPInfo } from '../models/mcp.js';
import { mcpAlternativeDao } from '../dao/mcpAlternativeDao.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
/**
 * MCP替代选项服务
 * 负责提供MCP的替代选项推荐
 */
export class MCPAlternativeService {
  private llm: ChatOpenAI;
  
  // 替代MCP映射关系
  private alternativeMap: Record<string, string[]> = {
    'GitHubTool': ['FileSystemTool', 'WebBrowserTool'],
    'GoogleSearchTool': ['WebBrowserTool'],
    'FileSystemTool': ['WebBrowserTool'],
    'WebBrowserTool': ['GoogleSearchTool'],
    'DatabaseQueryTool': ['FileSystemTool'],
    'ImageAnalysisTool': ['WebBrowserTool', 'TextAnalysisTool'],
    'TextAnalysisTool': ['WebBrowserTool'],
    'WeatherTool': ['WebBrowserTool']
  };
  
  // 可用的MCP列表
  private availableMCPs: MCPInfo[];
  
  constructor(availableMCPs: MCPInfo[]) {
    this.availableMCPs = availableMCPs;
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.MCP_ALTERNATIVE_MODEL || 'gpt-4o',
      temperature: 0.3,
      configuration: {
        httpAgent: agent, // ✅ 使用代理关键设置
      },
    });
  }
  
  /**
   * 获取MCP的替代选项
   * @param mcpName 当前MCP名称
   * @param taskContent 任务内容
   * @returns 替代的MCP列表
   */
  async getAlternativeMCPs(mcpName: string, taskContent: string): Promise<MCPInfo[]> {
    try {
      logger.info(`获取MCP替代选项 [MCP: ${mcpName}]`);
      
      // 硬编码playwright-mcp-service的替代选项
      if (mcpName === 'playwright-mcp-service' || mcpName === 'playwright') {
        logger.info(`返回playwright的硬编码替代选项`);
        // 返回一个默认的替代项列表
        return [{
          name: 'WebBrowserTool',
          description: '网页浏览工具，可以用于访问网页并获取信息',
          capabilities: ['打开浏览器', '访问网页', '获取页面内容'],
          authRequired: false
        }];
      }
      
      // 先从预定义映射中获取可能的替代项
      const predefinedAlternatives = this.alternativeMap[mcpName] || [];
      
      // 获取这些替代项的详细信息
      const alternativeMCPs = this.availableMCPs.filter(mcp => 
        predefinedAlternatives.includes(mcp.name)
      );
      
      // 跳过LLM调用，直接返回预定义的替代项
      if (alternativeMCPs.length === 0) {
        // 如果没有预定义的替代项，返回一个默认的列表
        logger.info(`没有找到预定义替代项，返回默认替代项`);
        return this.availableMCPs.slice(0, 2);  // 返回最多2个可用工具作为替代
      }
      
      // 直接返回找到的替代项，不调用LLM排序
      return alternativeMCPs;
    } catch (error) {
      logger.error(`获取MCP替代选项失败 [MCP: ${mcpName}]:`, error);
      // 返回空替代项
      return [];
    }
  }
  
  /**
   * 使用LLM推荐替代MCP
   * @param mcpName 当前MCP名称
   * @param taskContent 任务内容
   */
  private async recommendAlternatives(mcpName: string, taskContent: string): Promise<MCPInfo[]> {
    try {
      const mcpToReplace = this.availableMCPs.find(mcp => mcp.name === mcpName);
      
      if (!mcpToReplace) {
        return [];
      }
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位MCP（Model Context Protocol）专家，负责推荐替代工具。
用户当前无法使用${mcpName}工具，需要找到能够替代其功能的其他MCP工具。

当前工具的功能：
${JSON.stringify(mcpToReplace, null, 2)}

可选的其他MCP工具：
${JSON.stringify(this.availableMCPs.filter(mcp => mcp.name !== mcpName), null, 2)}

请根据用户的任务内容，推荐最多3个能够替代${mcpName}的工具。这些工具应该能够尽可能完成相同或类似的功能。

输出格式：
{
  "alternatives": ["Tool1Name", "Tool2Name", "Tool3Name"],
  "explanation": "推荐这些替代工具的理由"
}

请确保推荐的替代工具确实可以满足用户的需求，即使功能不完全一样。`),
        new HumanMessage(taskContent)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        const alternativeNames: string[] = parsedResponse.alternatives || [];
        
        // 获取这些替代项的详细信息
        const alternatives = this.availableMCPs.filter(mcp => 
          alternativeNames.includes(mcp.name)
        );
        
        // 可选：记录推荐的替代方案
        if (alternatives.length > 0) {
          await mcpAlternativeDao.saveAlternativeRecommendation(
            "task_id_placeholder", // 实际应用中应传入任务ID
            mcpName,
            alternativeNames,
            taskContent
          ).catch(err => logger.error('记录替代方案推荐失败', err));
        }
        
        return alternatives;
      } catch (parseError) {
        logger.error('解析LLM推荐的替代MCP失败:', parseError);
        
        // 尝试从文本中提取工具名称
        const alternativeMatch = responseText.match(/["']alternatives["']\s*:\s*\[(.*?)\]/s);
        if (alternativeMatch) {
          const alternativeNames = alternativeMatch[1]
            .split(',')
            .map(name => name.trim().replace(/^["']|["']$/g, ''))
            .filter(name => name.length > 0);
          
          return this.availableMCPs.filter(mcp => 
            alternativeNames.includes(mcp.name)
          );
        }
        
        // 如果无法提取，随机返回1-3个其他工具
        return this.availableMCPs
          .filter(mcp => mcp.name !== mcpName)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
      }
    } catch (error) {
      logger.error(`推荐替代MCP失败 [MCP: ${mcpName}]:`, error);
      return [];
    }
  }
  
  /**
   * 根据任务内容对替代项进行排序
   * @param mcpName 当前MCP名称
   * @param alternatives 替代MCP列表
   * @param taskContent 任务内容
   */
  private async rankAlternatives(
    mcpName: string,
    alternatives: MCPInfo[],
    taskContent: string
  ): Promise<MCPInfo[]> {
    if (alternatives.length <= 1) {
      return alternatives;
    }
    
    try {
      const response = await this.llm.invoke([
        new SystemMessage(`你是一位MCP（Model Context Protocol）专家，负责对替代工具进行排序。
用户当前无法使用${mcpName}工具，需要从以下替代工具中选择最适合的：

${JSON.stringify(alternatives, null, 2)}

请根据用户的任务内容，对这些替代工具进行排序，从最适合到最不适合。

输出格式：
{
  "ranked_alternatives": ["Tool1Name", "Tool2Name", "Tool3Name"],
  "explanation": "排序理由"
}

请基于工具功能与任务的匹配度、功能完整度、使用便捷性等因素进行排序。`),
        new HumanMessage(taskContent)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        const rankedNames: string[] = parsedResponse.ranked_alternatives || [];
        
        // 根据排序返回替代项
        const rankedAlternatives: MCPInfo[] = [];
        for (const name of rankedNames) {
          const mcp = alternatives.find(m => m.name === name);
          if (mcp) {
            rankedAlternatives.push(mcp);
          }
        }
        
        // 添加任何未在排序中出现的原始替代项
        const remainingAlternatives = alternatives.filter(
          mcp => !rankedAlternatives.some(r => r.name === mcp.name)
        );
        
        return [...rankedAlternatives, ...remainingAlternatives];
      } catch (parseError) {
        logger.error('解析LLM排序的替代MCP失败:', parseError);
        return alternatives;
      }
    } catch (error) {
      logger.error(`排序替代MCP失败 [MCP: ${mcpName}]:`, error);
      return alternatives;
    }
  }
  
  /**
   * 替换任务中的MCP
   * @param taskId 任务ID
   * @param originalMcpName 原始MCP名称
   * @param newMcpName 新MCP名称
   */
  async replaceMCPInWorkflow(
    taskId: string,
    originalMcpName: string,
    newMcpName: string
  ): Promise<boolean> {
    try {
      logger.info(`替换任务工作流中的MCP [任务: ${taskId}, 原MCP: ${originalMcpName}, 新MCP: ${newMcpName}]`);
      
      // 获取新MCP的详细信息
      const newMCP = this.availableMCPs.find(mcp => mcp.name === newMcpName);
      if (!newMCP) {
        logger.error(`替换失败：找不到指定的新MCP [${newMcpName}]`);
        return false;
      }
      
      // 调用DAO层替换MCP
      return await mcpAlternativeDao.replaceMCPInWorkflow(
        taskId,
        originalMcpName,
        newMcpName,
        newMCP.description,
        newMCP.authRequired
      );
    } catch (error) {
      logger.error(`替换任务工作流中的MCP失败 [任务: ${taskId}]:`, error);
      return false;
    }
  }
} 