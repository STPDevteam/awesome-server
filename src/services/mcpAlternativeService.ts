import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPInfo } from '../models/mcp.js';
import { mcpAlternativeDao } from '../dao/mcpAlternativeDao.js';
import { mcpInfoService } from './mcpInfoService.js';
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
    'WeatherTool': ['WebBrowserTool'],
    'playwright-mcp-service': ['brave-search-mcp', 'WebBrowserTool'],
    'playwright': ['brave-search-mcp', 'WebBrowserTool']
  };
  
  // 可用的MCP列表
  private availableMCPs: MCPInfo[];
  
  constructor() {
    // 使用mcpInfoService中的数据
    this.availableMCPs = mcpInfoService.getAllMCPs();
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.MCP_ALTERNATIVE_MODEL || 'gpt-4o',
      temperature: 0.3,
      configuration: {
        httpAgent: agent, // ✅ 使用代理关键设置
      },
    });
    
    logger.info(`MCPAlternativeService 已初始化，加载了 ${this.availableMCPs.length} 个可用MCP`);
  }
  
  /**
   * 获取最新的MCP列表
   * 确保每次都使用最新的MCP信息
   */
  private getAvailableMCPs(): MCPInfo[] {
    return mcpInfoService.getAllMCPs();
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
      
      // 获取最新的MCP列表
      const availableMCPs = this.getAvailableMCPs();
      
      // 使用LLM推荐替代选项
      logger.info(`使用LLM推荐替代选项 [MCP: ${mcpName}], 可用MCP数量: ${availableMCPs.length}`);
      const llmRecommendations = await this.recommendAlternatives(mcpName, taskContent);
      
      if (llmRecommendations.length > 0) {
        logger.info(`LLM推荐的替代选项: ${llmRecommendations.map(m => m.name).join(', ')}`);
        // 对LLM推荐的结果进行排序
        const rankedAlternatives = await this.rankAlternatives(mcpName, llmRecommendations, taskContent);
        return rankedAlternatives;
      }
      
      // 如果LLM推荐失败，尝试使用预定义映射作为后备
      logger.info(`LLM推荐失败，尝试使用预定义映射作为后备`);
      const predefinedAlternatives = this.alternativeMap[mcpName] || [];
      
      if (predefinedAlternatives.length > 0) {
        const alternativeMCPs = availableMCPs.filter(mcp => 
          predefinedAlternatives.includes(mcp.name)
        );
        if (alternativeMCPs.length > 0) {
          logger.info(`找到预定义替代选项: ${alternativeMCPs.map(m => m.name).join(', ')}`);
          return alternativeMCPs;
        }
      }
      
      // 最后的后备选项：返回一些通用的替代工具
      logger.info(`没有找到任何替代选项，返回通用替代工具`);
      const fallbackAlternatives = availableMCPs
        .filter(mcp => mcp.name !== mcpName)
        .slice(0, 3);
      
      return fallbackAlternatives;
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
      const availableMCPs = this.getAvailableMCPs();
      const mcpToReplace = availableMCPs.find(mcp => mcp.name === mcpName);
      
      if (!mcpToReplace) {
        return [];
      }
      
      // 按类别分组显示可用MCP，便于LLM理解
      const mcpsByCategory = availableMCPs
        .filter(mcp => mcp.name !== mcpName)
        .reduce((acc, mcp) => {
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
        new SystemMessage(`你是一位MCP（Model Context Protocol）专家，负责根据用户任务需求推荐最合适的替代工具。

用户当前无法使用 "${mcpName}" 工具，需要找到能够替代其功能的其他MCP工具。

当前不可用工具的功能：
${JSON.stringify(mcpToReplace, null, 2)}

可选的替代MCP工具（按类别分组）：
${JSON.stringify(mcpsByCategory, null, 2)}

请仔细分析用户的任务内容，根据以下标准推荐最多3个最合适的替代工具：
1. 功能匹配度：工具的capabilities是否能满足任务需求
2. 类别相关性：同类别或相关类别的工具优先
3. 实用性：工具是否易于使用且稳定

输出格式（必须是有效的JSON）：
{
  "alternatives": ["Tool1Name", "Tool2Name", "Tool3Name"],
  "explanation": "详细说明为什么推荐这些工具，以及它们如何满足用户的任务需求"
}

重要：请确保返回的工具名称完全匹配可选工具列表中的name字段。`),
        new HumanMessage(`用户任务：${taskContent}`)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        const parsedResponse = JSON.parse(responseText);
        const alternativeNames: string[] = parsedResponse.alternatives || [];
        
        // 获取这些替代项的详细信息
        const alternatives = availableMCPs.filter(mcp => 
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
          
          return availableMCPs.filter(mcp => 
            alternativeNames.includes(mcp.name)
          );
        }
        
        // 如果无法提取，随机返回1-3个其他工具
        return availableMCPs
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
      const newMCP = mcpInfoService.getMCPById(newMcpName);
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
        newMCP.authRequired,
        {
          category: newMCP.category,
          imageUrl: newMCP.imageUrl,
          githubUrl: newMCP.githubUrl,
          authParams: newMCP.authParams
        }
      );
    } catch (error) {
      logger.error(`替换任务工作流中的MCP失败 [任务: ${taskId}]:`, error);
      return false;
    }
  }
} 