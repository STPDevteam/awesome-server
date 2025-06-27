import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPInfo } from '../models/mcp.js';
import { getAllPredefinedMCPs } from './predefinedMCPs.js';
import { mcpAlternativeDao } from '../dao/mcpAlternativeDao.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getTaskService } from './taskService.js';
import { TaskAnalysisService } from './llmTasks/taskAnalysisService.js';

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);

/**
 * MCP替代服务
 * 负责智能推荐和替换MCP工具
 */
export class MCPAlternativeService {
  private llm: ChatOpenAI;
  private taskService = getTaskService();
  private taskAnalysisService = new TaskAnalysisService();
  
  // 移除硬编码的alternativeMap，改为智能推荐
  private availableMCPs: MCPInfo[];
  
  constructor() {
    // 使用predefinedMCPs中的数据，转换为MCPInfo格式
    this.availableMCPs = this.convertMCPServicesToMCPInfos(getAllPredefinedMCPs());
    
    // 配置LLM，根据环境决定是否使用代理
    const llmConfig: any = {
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.MCP_ALTERNATIVE_MODEL || 'gpt-4o',
      temperature: 0.3,
      timeout: 15000, // 增加超时时间
      maxRetries: 2
    };
    
    // 仅在有代理且代理可用时使用代理
    if (process.env.HTTPS_PROXY && process.env.HTTPS_PROXY !== '') {
      try {
        const proxyUrl = process.env.HTTPS_PROXY;
        logger.info(`[MCP Alternative] Using proxy: ${proxyUrl}`);
        llmConfig.configuration = {
          httpAgent: agent
        };
      } catch (proxyError) {
        logger.warn(`[MCP Alternative] Proxy configuration failed, using direct connection:`, proxyError);
      }
    } else {
      logger.info(`[MCP Alternative] No proxy configured, using direct connection`);
    }
    
    this.llm = new ChatOpenAI(llmConfig);
    
    logger.info(`MCPAlternativeService 已初始化，加载了 ${this.availableMCPs.length} 个可用MCP`);
  }
  
  /**
   * 将MCPService转换为MCPInfo
   */
  private convertMCPServicesToMCPInfos(mcpServices: any[]): MCPInfo[] {
    return mcpServices.map(service => ({
      name: service.name,
      description: service.description,
      authRequired: service.authParams ? Object.keys(service.authParams).length > 0 : false,
      category: service.category,
      imageUrl: service.imageUrl,
      githubUrl: service.githubUrl,
      authParams: service.authParams
    }));
  }
  
  /**
   * 获取最新的MCP列表
   */
  private getAvailableMCPs(): MCPInfo[] {
    return this.convertMCPServicesToMCPInfos(getAllPredefinedMCPs());
  }
  
  /**
   * 智能获取MCP的替代选项
   * @param mcpName 当前MCP名称
   * @param taskContent 任务内容
   * @param currentWorkflow 当前完整的工作流，用于上下文分析
   * @returns 替代的MCP列表
   */
  async getAlternativeMCPs(
    mcpName: string, 
    taskContent: string,
    currentWorkflow?: any
  ): Promise<MCPInfo[]> {
    try {
      logger.info(`智能获取MCP替代选项 [MCP: ${mcpName}]`);
      
      // 获取最新的MCP列表
      const availableMCPs = this.getAvailableMCPs();
      
      // 使用LLM智能推荐替代选项
      const llmRecommendations = await this.recommendAlternativesWithContext(
        mcpName, 
        taskContent, 
        currentWorkflow
      );
      
      if (llmRecommendations.length > 0) {
        logger.info(`智能推荐的替代选项: ${llmRecommendations.map(m => m.name).join(', ')}`);
        return llmRecommendations;
      }
      
      // 如果智能推荐失败，使用基于类别的后备推荐
      logger.warn(`智能推荐失败，使用基于类别的后备推荐`);
      const categoryBasedAlternatives = this.getCategoryBasedAlternatives(mcpName);
      
      return categoryBasedAlternatives;
    } catch (error) {
      logger.error(`获取MCP替代选项失败 [MCP: ${mcpName}]:`, error);
      return [];
    }
  }
  
  /**
   * 使用LLM智能推荐替代MCP（带上下文分析）
   */
  private async recommendAlternativesWithContext(
    mcpName: string, 
    taskContent: string,
    currentWorkflow?: any
  ): Promise<MCPInfo[]> {
    try {
      const availableMCPs = this.getAvailableMCPs();
      const mcpToReplace = availableMCPs.find(mcp => mcp.name === mcpName);
      
      if (!mcpToReplace) {
        return [];
      }
      
      // 按类别分组显示可用MCP
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
            authRequired: mcp.authRequired
          });
          return acc;
        }, {} as Record<string, any[]>);
      
      // 构建上下文信息
      const contextInfo = currentWorkflow ? 
        `\n\n当前完整工作流上下文：\n${JSON.stringify(currentWorkflow, null, 2)}` : 
        '';
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are an MCP tool expert responsible for intelligently recommending the most suitable alternative tools.

**Current Situation**:
- User cannot use the "${mcpName}" tool
- Need to find other MCP tools to replace its functionality
- Must consider collaboration relationships with other tools

**Tool to Replace**:
${JSON.stringify(mcpToReplace, null, 2)}

**Available Alternative MCP Tools (grouped by category)**:
${JSON.stringify(mcpsByCategory, null, 2)}${contextInfo}

**Recommendation Criteria**:
1. **Functionality Match**: Whether the tool capabilities can meet task requirements
2. **Category Relevance**: Prioritize tools from the same or related categories
3. **Collaboration Compatibility**: Degree of compatibility with other tools in the existing workflow
4. **Authentication Complexity**: Prioritize tools with simple authentication
5. **Stability**: Tool reliability and maturity

**Important Notes**:
- Must return pure JSON format, do not use markdown code blocks
- Recommend at most 3 most suitable alternative tools
- Tool names must exactly match the name field in the available tools list

Return Format:
{
  "alternatives": ["tool1_name", "tool2_name", "tool3_name"],
  "explanation": "Detailed explanation of why these tools are recommended and how they meet user task requirements and collaborate with other tools",
  "compatibility_analysis": "Analysis of compatibility between these alternative tools and the existing workflow"
}`),
        new HumanMessage(`User Task: ${taskContent}`)
      ]);
      
      // 解析返回的JSON
      const responseText = response.content.toString();
      try {
        let cleanedText = responseText.trim();
        
        // 清理可能的Markdown格式
        cleanedText = cleanedText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .replace(/^```/g, '')
          .trim();
        
        logger.info(`[MCP Alternative] Cleaned response text: ${cleanedText.substring(0, 200)}...`);
        
        const parsedResponse = JSON.parse(cleanedText);
        const alternativeNames: string[] = parsedResponse.alternatives || [];
        
        // 获取这些替代项的详细信息
        const alternatives = availableMCPs.filter(mcp => 
          alternativeNames.includes(mcp.name)
        );
        
        // 记录推荐结果
        if (alternatives.length > 0) {
          logger.info(`[MCP Alternative] 成功推荐 ${alternatives.length} 个替代选项: ${alternatives.map(a => a.name).join(', ')}`);
          logger.info(`[MCP Alternative] 推荐理由: ${parsedResponse.explanation}`);
        }
        
        return alternatives;
      } catch (parseError) {
        logger.error('解析LLM推荐的替代MCP失败:', parseError);
        logger.error('原始响应文本:', responseText);
        
        // 尝试从文本中提取工具名称
        return this.extractAlternativesFromText(responseText, availableMCPs, mcpName);
      }
    } catch (error) {
      logger.error(`智能推荐替代MCP失败 [MCP: ${mcpName}]:`, error);
      return [];
    }
  }
  
  /**
   * 从文本中提取替代工具名称（容错处理）
   */
  private extractAlternativesFromText(
    responseText: string, 
    availableMCPs: MCPInfo[], 
    mcpName: string
  ): MCPInfo[] {
    const extractedNames: string[] = [];
    
    // 尝试多种模式匹配
    const patterns = [
      /["']alternatives["']\s*:\s*\[(.*?)\]/s,
      /alternatives["\']?\s*:\s*\[(.*?)\]/s,
      /\[(.*?)\]/s
    ];
    
    for (const pattern of patterns) {
      const match = responseText.match(pattern);
      if (match && match[1]) {
        const namesText = match[1];
        const nameMatches = namesText.match(/["']([^"']+)["']/g);
        if (nameMatches) {
          nameMatches.forEach(nameMatch => {
            const name = nameMatch.replace(/["']/g, '');
            if (availableMCPs.some(mcp => mcp.name === name)) {
              extractedNames.push(name);
            }
          });
        }
        
        if (extractedNames.length > 0) {
          logger.info(`[MCP Alternative] 通过模式匹配提取到工具名称: ${extractedNames.join(', ')}`);
          break;
        }
      }
    }
    
    if (extractedNames.length > 0) {
      return availableMCPs.filter(mcp => extractedNames.includes(mcp.name));
    }
    
    // 如果无法提取，使用基于类别的智能推荐
    return this.getCategoryBasedAlternatives(mcpName);
  }
  
  /**
   * 基于类别的后备推荐
   */
  private getCategoryBasedAlternatives(mcpName: string): MCPInfo[] {
    const availableMCPs = this.getAvailableMCPs();
    const mcpToReplace = availableMCPs.find(mcp => mcp.name === mcpName);
    
    if (mcpToReplace && mcpToReplace.category) {
      const sameCategoryMCPs = availableMCPs.filter(mcp => 
        mcp.category === mcpToReplace.category && mcp.name !== mcpName
      );
      
      if (sameCategoryMCPs.length > 0) {
        logger.info(`[MCP Alternative] 找到 ${sameCategoryMCPs.length} 个同类别替代选项: ${mcpToReplace.category}`);
        return sameCategoryMCPs.slice(0, 3);
      }
    }
    
    // 最后的备选：返回一些通用工具
    return availableMCPs
      .filter(mcp => mcp.name !== mcpName)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
  }
  

  /**
   * 使用新MCP重新生成工作流
   */
  private async regenerateWorkflowWithNewMCP(
    taskContent: string,
    newMcpList: any[],
    originalMcpName: string,
    newMcpName: string
  ): Promise<any[]> {
    try {
      // 将MCP列表转换为MCPInfo格式
      const mcpInfoList: MCPInfo[] = newMcpList.map(mcp => ({
        name: mcp.name,
        description: mcp.description,
        authRequired: mcp.authRequired,
        category: mcp.category,
        imageUrl: mcp.imageUrl,
        githubUrl: mcp.githubUrl,
        authParams: mcp.authParams
      }));
      
      // 使用TaskAnalysisService重新构建工作流
      const workflowResult = await this.taskAnalysisService.buildMCPWorkflow(
        taskContent,
        `任务重新分析：将 ${originalMcpName} 替换为 ${newMcpName}`,
        mcpInfoList,
        true, // 假设可以完成
        [`使用 ${newMcpName} 替代 ${originalMcpName} 完成任务`]
      );
      
      return workflowResult.workflow;
    } catch (error) {
      logger.error('重新生成工作流失败:', error);
      // 返回一个基本的工作流作为后备
      return [{
        step: 1,
        mcp: newMcpName,
        action: `使用 ${newMcpName} 完成任务`,
        input: {}
      }];
    }
  }

  /**
   * 验证MCP替换的合理性
   * @param originalMcpName 原始MCP名称
   * @param newMcpName 新MCP名称
   * @param taskContent 任务内容
   * @returns 验证结果
   */
  async validateMCPReplacement(
    originalMcpName: string,
    newMcpName: string,
    taskContent: string
  ): Promise<{
    isValid: boolean;
    confidence: number;
    reasons: string[];
    warnings: string[];
  }> {
    try {
      const availableMCPs = this.getAvailableMCPs();
      const originalMcp = availableMCPs.find(mcp => mcp.name === originalMcpName);
      const newMcp = availableMCPs.find(mcp => mcp.name === newMcpName);
      
      if (!originalMcp || !newMcp) {
        return {
          isValid: false,
          confidence: 0,
          reasons: ['找不到指定的MCP'],
          warnings: []
        };
      }
      
      const response = await this.llm.invoke([
        new SystemMessage(`你是一个MCP工具专家，负责验证MCP替换的合理性。

**原始工具**：
${JSON.stringify(originalMcp, null, 2)}

**新工具**：
${JSON.stringify(newMcp, null, 2)}

请分析将原始工具替换为新工具的合理性，考虑以下因素：
1. 功能匹配度
2. 类别相关性
3. 认证要求变化
4. 任务完成能力

返回格式（纯JSON）：
{
  "isValid": true/false,
  "confidence": 0-100,
  "reasons": ["支持替换的理由"],
  "warnings": ["需要注意的问题"]
}`),
        new HumanMessage(`任务内容：${taskContent}`)
      ]);
      
      const responseText = response.content.toString();
      try {
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        const result = JSON.parse(cleanedText);
        return {
          isValid: result.isValid || false,
          confidence: result.confidence || 0,
          reasons: result.reasons || [],
          warnings: result.warnings || []
        };
      } catch (parseError) {
        logger.error('解析MCP替换验证结果失败:', parseError);
        return {
          isValid: false,
          confidence: 0,
          reasons: ['验证失败'],
          warnings: ['无法解析验证结果']
        };
      }
    } catch (error) {
      logger.error('验证MCP替换失败:', error);
      return {
        isValid: false,
        confidence: 0,
        reasons: ['验证过程出错'],
        warnings: ['系统错误']
      };
    }
  }


  /**
   * 批量替换MCP并重新分析任务（流式版本）
   * @param taskId 任务ID
   * @param replacements 替换列表
   * @param stream 流式回调函数
   * @returns 是否成功
   */
  async batchReplaceAndReanalyzeTaskStream(
    taskId: string,
    replacements: Array<{ originalMcpName: string; newMcpName: string }>,
    stream: (data: any) => void
  ): Promise<boolean> {
    try {
      logger.info(`🔄 开始流式批量替换MCP并重新分析 [任务: ${taskId}, 替换数量: ${replacements.length}]`);
      
      // 1. 验证阶段
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'batch_validation',
          stepName: 'Validate Batch Replacement Conditions',
          stepNumber: 1,
          totalSteps: 5
        } 
      });
      
      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }
      
      if (!task.mcpWorkflow) {
        stream({ event: 'error', data: { message: 'Task has no workflow information' } });
        return false;
      }
      
      // 验证所有新MCP是否存在
      const availableMCPs = this.getAvailableMCPs();
      const invalidMCPs: string[] = [];
      
      for (const replacement of replacements) {
        const newMCP = availableMCPs.find(mcp => mcp.name === replacement.newMcpName);
        if (!newMCP) {
          invalidMCPs.push(replacement.newMcpName);
        }
      }
      
      if (invalidMCPs.length > 0) {
        stream({ 
          event: 'error', 
          data: { message: `Cannot find specified MCPs: ${invalidMCPs.join(', ')}` } 
        });
        return false;
      }
      
      // 检查所有原MCP是否在当前工作流中
      const missingOriginalMCPs: string[] = [];
      
      for (const replacement of replacements) {
        const originalMcpExists = task.mcpWorkflow.mcps.some(mcp => mcp.name === replacement.originalMcpName);
        if (!originalMcpExists) {
          missingOriginalMCPs.push(replacement.originalMcpName);
        }
      }
      
      if (missingOriginalMCPs.length > 0) {
        stream({ 
          event: 'error', 
          data: { message: `Original MCPs not found in workflow: ${missingOriginalMCPs.join(', ')}` } 
        });
        return false;
      }
      
      const replacementSummary = replacements.map(r => `${r.originalMcpName} -> ${r.newMcpName}`).join(', ');
      
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'batch_validation',
          content: `Batch validation passed: Can replace ${replacements.length} MCPs`,
          reasoning: `All replacement MCPs exist and original MCPs are in current workflow`,
          replacements: replacementSummary
        } 
      });
      
      // 2. 构建新MCP列表阶段
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'batch_mcp_replacement',
          stepName: 'Build New MCP List with Batch Replacements',
          stepNumber: 2,
          totalSteps: 5
        } 
      });
      
      let newMcpList = [...task.mcpWorkflow.mcps];
      
      for (const replacement of replacements) {
        const newMCP = availableMCPs.find(mcp => mcp.name === replacement.newMcpName)!;
        
        newMcpList = newMcpList.map(mcp => {
          if (mcp.name === replacement.originalMcpName) {
            return {
              name: newMCP.name,
              description: newMCP.description,
              authRequired: newMCP.authRequired,
              authVerified: !newMCP.authRequired,
              category: newMCP.category,
              imageUrl: newMCP.imageUrl,
              githubUrl: newMCP.githubUrl,
              authParams: newMCP.authParams
            };
          }
          return mcp;
        });
      }
      
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'batch_mcp_replacement',
          content: `Built new MCP list with ${newMcpList.length} tools after ${replacements.length} replacements`,
          reasoning: `Successfully replaced MCPs: ${replacementSummary}`,
          mcps: newMcpList.map(mcp => ({
            name: mcp.name,
            description: mcp.description,
            authRequired: mcp.authRequired,
            authVerified: mcp.authVerified
          }))
        } 
      });
      
      // 3. 重新生成工作流阶段
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'batch_workflow_regeneration',
          stepName: 'Regenerate Workflow with New MCPs',
          stepNumber: 3,
          totalSteps: 5
        } 
      });
      
      const newWorkflow = await this.regenerateBatchWorkflowWithNewMCPs(
        task.content,
        newMcpList,
        replacements
      );
      
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'batch_workflow_regeneration',
          content: `Regenerated workflow with ${newWorkflow.length} steps`,
          reasoning: `Reanalyzed task based on new MCP combination after batch replacement`,
          workflow: newWorkflow
        } 
      });
      
      // 4. 更新任务阶段
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'batch_task_update',
          stepName: 'Update Task Information',
          stepNumber: 4,
          totalSteps: 5
        } 
      });
      
      const updatedMcpWorkflow = {
        mcps: newMcpList.map(mcp => ({
          name: mcp.name,
          description: mcp.description,
          authRequired: mcp.authRequired,
          authVerified: mcp.authVerified || false,
          category: mcp.category,
          imageUrl: mcp.imageUrl,
          githubUrl: mcp.githubUrl,
          ...(mcp.authRequired && mcp.authParams ? { authParams: mcp.authParams } : {})
        })),
        workflow: newWorkflow
      };
      
      const updateSuccess = await this.taskService.updateTask(taskId, {
        mcpWorkflow: updatedMcpWorkflow,
        status: 'analyzed'
      });
      
      if (!updateSuccess) {
        stream({ event: 'error', data: { message: 'Failed to update task workflow' } });
        return false;
      }
      
      stream({ 
        event: 'step_complete', 
        data: { 
          stepType: 'batch_task_update',
          content: 'Task information updated successfully',
          reasoning: 'Workflow saved to database, task status updated to analyzed'
        } 
      });
      
      // 5. 完成阶段
      stream({ 
        event: 'step_start', 
        data: { 
          stepType: 'batch_completion',
          stepName: 'Complete Batch Replacement Operation',
          stepNumber: 5,
          totalSteps: 5
        } 
      });
      
      // 记录批量替换操作
      await mcpAlternativeDao.saveAlternativeRecommendation(
        taskId,
        'batch_replacement',
        replacements.map(r => r.newMcpName),
        `批量MCP替换操作：${replacementSummary}`
      ).catch(err => logger.error('记录批量MCP替换操作失败', err));
      
      // 构建元数据信息
      const metadata = {
        totalSteps: newWorkflow.length,
        requiresAuth: newMcpList.some(mcp => mcp.authRequired),
        mcpsRequiringAuth: newMcpList
          .filter(mcp => mcp.authRequired)
          .map(mcp => mcp.name)
      };
      
      // 发送最终完成信息
      stream({ 
        event: 'batch_replacement_complete', 
        data: { 
          taskId,
          message: `Successfully replaced ${replacements.length} MCPs and regenerated workflow`,
          mcpWorkflow: updatedMcpWorkflow,
          metadata,
          replacementInfo: {
            replacements,
            replacementSummary,
            timestamp: new Date().toISOString(),
            totalReplacements: replacements.length
          }
        } 
      });
      
      logger.info(`✅ 流式批量MCP替换和重新分析完成 [任务: ${taskId}, 替换数量: ${replacements.length}]`);
      return true;
      
    } catch (error) {
      logger.error(`流式批量替换MCP失败 [任务: ${taskId}]:`, error);
      stream({ 
        event: 'error', 
        data: { 
          message: `Batch replacement failed: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.stack : undefined
        } 
      });
      return false;
    }
  }
  
  /**
   * 使用新MCP批量重新生成工作流
   */
  private async regenerateBatchWorkflowWithNewMCPs(
    taskContent: string,
    newMcpList: any[],
    replacements: Array<{ originalMcpName: string; newMcpName: string }>
  ): Promise<any[]> {
    try {
      // 将MCP列表转换为MCPInfo格式
      const mcpInfoList: MCPInfo[] = newMcpList.map(mcp => ({
        name: mcp.name,
        description: mcp.description,
        authRequired: mcp.authRequired,
        category: mcp.category,
        imageUrl: mcp.imageUrl,
        githubUrl: mcp.githubUrl,
        authParams: mcp.authParams
      }));
      
      const replacementSummary = replacements.map(r => `${r.originalMcpName} -> ${r.newMcpName}`).join(', ');
      
      // 使用TaskAnalysisService重新构建工作流
      const workflowResult = await this.taskAnalysisService.buildMCPWorkflow(
        taskContent,
        `Task reanalysis after batch MCP replacement: ${replacementSummary}`,
        mcpInfoList,
        true,
        [`Complete task using updated MCPs after batch replacement: ${replacementSummary}`]
      );
      
      return workflowResult.workflow;
    } catch (error) {
      logger.error('重新生成批量工作流失败:', error);
      // 返回一个基本的工作流作为后备
      const newMcpNames = replacements.map(r => r.newMcpName);
      return newMcpNames.map((mcpName, index) => ({
        step: index + 1,
        mcp: mcpName,
        action: `Complete task using ${mcpName}`,
        input: {}
      }));
    }
  }
} 