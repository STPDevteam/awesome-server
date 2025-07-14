import { logger } from '../utils/logger.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getTaskService } from './taskService.js';
import { getAllPredefinedMCPs } from './predefinedMCPs.js';

export interface MCPChangeDetectionResult {
  hasChanges: boolean;
  changes: MCPChange[];
  needsReanalysis: boolean;
  summary: string;
}

export interface MCPChange {
  type: 'auth_status' | 'mcp_replaced' | 'new_auth' | 'removed_auth';
  mcpName: string;
  description: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * MCP变化检测服务
 * 负责检测用户是否修改了MCP配置，包括：
 * 1. 认证状态变化
 * 2. MCP工具替换
 * 3. 新增/移除认证
 */
export class MCPChangeDetectionService {
  private mcpAuthService: MCPAuthService;
  private taskService = getTaskService();
  
  constructor() {
    this.mcpAuthService = new MCPAuthService();
  }
  
  /**
   * 检测任务的MCP配置是否发生变化
   * @param taskId 任务ID
   * @param userId 用户ID
   * @returns 变化检测结果
   */
  async detectMCPChanges(taskId: string, userId: string): Promise<MCPChangeDetectionResult> {
    try {
      logger.info(`🔍 检测任务 ${taskId} 的MCP配置变化 [用户: ${userId}]`);
      
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }
      
      if (!task.mcpWorkflow || !task.mcpWorkflow.mcps) {
        return {
          hasChanges: false,
          changes: [],
          needsReanalysis: false,
          summary: 'Task has no MCP workflow'
        };
      }
      
      const changes: MCPChange[] = [];
      
      // 1. 检查认证状态变化
      await this.checkAuthStatusChanges(task.mcpWorkflow.mcps, userId, changes);
      
      // 2. 检查是否有新的MCP被认证（可能想要替换）
      await this.checkNewMCPAuthentications(task.mcpWorkflow.mcps, userId, changes);
      
      // 3. 检查是否有更好的替代MCP可用
      await this.checkBetterAlternatives(task.mcpWorkflow.mcps, userId, task.content, changes);
      
      const hasChanges = changes.length > 0;
      const needsReanalysis = this.shouldReanalyze(changes);
      
      const summary = this.generateChangeSummary(changes);
      
      logger.info(`🔍 MCP变化检测完成 [任务: ${taskId}] - 变化: ${hasChanges}, 需要重新分析: ${needsReanalysis}`);
      
      return {
        hasChanges,
        changes,
        needsReanalysis,
        summary
      };
      
    } catch (error) {
      logger.error(`MCP变化检测失败 [任务: ${taskId}]:`, error);
      // 如果检测失败，为了安全起见，假设有变化
      return {
        hasChanges: true,
        changes: [{
          type: 'auth_status',
          mcpName: 'unknown',
          description: 'Failed to detect changes, re-analyzing for safety'
        }],
        needsReanalysis: true,
        summary: 'Detection failed, re-analyzing for safety'
      };
    }
  }
  
  /**
   * 检查认证状态变化
   */
  private async checkAuthStatusChanges(
    taskMCPs: any[], 
    userId: string, 
    changes: MCPChange[]
  ): Promise<void> {
    for (const mcp of taskMCPs) {
      if (mcp.authRequired) {
        try {
          const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcp.name);
          const isCurrentlyVerified = userAuth && userAuth.isVerified;
          
          // 如果当前认证状态与任务中记录的状态不一致
          if (mcp.authVerified !== isCurrentlyVerified) {
            changes.push({
              type: 'auth_status',
              mcpName: mcp.name,
              description: `Authentication status changed from ${mcp.authVerified} to ${isCurrentlyVerified}`,
              oldValue: mcp.authVerified,
              newValue: isCurrentlyVerified
            });
          }
        } catch (error) {
          logger.error(`检查 ${mcp.name} 认证状态失败:`, error);
        }
      }
    }
  }
  
  /**
   * 检查新的MCP认证（可能想要替换现有的）
   */
  private async checkNewMCPAuthentications(
    taskMCPs: any[], 
    userId: string, 
    changes: MCPChange[]
  ): Promise<void> {
    try {
      // 获取所有可用的MCP
      const allMCPs = getAllPredefinedMCPs();
      const taskMCPNames = new Set(taskMCPs.map(mcp => mcp.name));
      
      // 检查是否有新的MCP被用户认证了
      for (const availableMCP of allMCPs) {
        if (!taskMCPNames.has(availableMCP.name) && availableMCP.authParams) {
          try {
            const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, availableMCP.name);
            if (userAuth && userAuth.isVerified) {
              // 检查这个新认证的MCP是否与任务中的MCP同类别
              const similarTaskMCP = taskMCPs.find(taskMcp => 
                taskMcp.category === availableMCP.category
              );
              
              if (similarTaskMCP) {
                changes.push({
                  type: 'new_auth',
                  mcpName: availableMCP.name,
                  description: `New MCP ${availableMCP.name} (${availableMCP.category}) is authenticated and could replace ${similarTaskMCP.name}`,
                  oldValue: similarTaskMCP.name,
                  newValue: availableMCP.name
                });
              }
            }
          } catch (error) {
            // 忽略单个MCP的检查错误
          }
        }
      }
    } catch (error) {
      logger.error('检查新MCP认证失败:', error);
    }
  }
  
  /**
   * 检查是否有更好的替代MCP可用
   */
  private async checkBetterAlternatives(
    taskMCPs: any[], 
    userId: string, 
    taskContent: string,
    changes: MCPChange[]
  ): Promise<void> {
    // 这里可以添加更智能的逻辑来检测是否有更好的MCP替代方案
    // 例如：检查用户最近认证的MCP，或者根据任务内容推荐更合适的MCP
    
    for (const taskMcp of taskMCPs) {
      if (taskMcp.alternatives && taskMcp.alternatives.length > 0) {
        // 检查备选MCP是否有更好的认证状态
        for (const alternative of taskMcp.alternatives) {
          try {
            const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, alternative.name);
            if (userAuth && userAuth.isVerified && !taskMcp.authVerified) {
              changes.push({
                type: 'mcp_replaced',
                mcpName: alternative.name,
                description: `Alternative MCP ${alternative.name} is authenticated while ${taskMcp.name} is not`,
                oldValue: taskMcp.name,
                newValue: alternative.name
              });
            }
          } catch (error) {
            // 忽略单个备选MCP的检查错误
          }
        }
      }
    }
  }
  
  /**
   * 判断是否需要重新分析
   */
  private shouldReanalyze(changes: MCPChange[]): boolean {
    // 如果有以下类型的变化，需要重新分析：
    // 1. 认证状态从false变为true（新的MCP可用）
    // 2. 有新的MCP可以替换现有的
    // 3. 有更好的替代方案
    
    return changes.some(change => 
      (change.type === 'auth_status' && change.newValue === true) ||
      change.type === 'new_auth' ||
      change.type === 'mcp_replaced'
    );
  }
  
  /**
   * 生成变化摘要
   */
  private generateChangeSummary(changes: MCPChange[]): string {
    if (changes.length === 0) {
      return 'No MCP configuration changes detected';
    }
    
    const authChanges = changes.filter(c => c.type === 'auth_status').length;
    const newAuths = changes.filter(c => c.type === 'new_auth').length;
    const replacements = changes.filter(c => c.type === 'mcp_replaced').length;
    
    const parts: string[] = [];
    
    if (authChanges > 0) {
      parts.push(`${authChanges} authentication status change(s)`);
    }
    
    if (newAuths > 0) {
      parts.push(`${newAuths} new MCP authentication(s)`);
    }
    
    if (replacements > 0) {
      parts.push(`${replacements} potential MCP replacement(s)`);
    }
    
    return `Detected ${parts.join(', ')}`;
  }
  
  /**
   * 快速检查是否需要重新分析（简化版本）
   * @param taskId 任务ID
   * @param userId 用户ID
   * @returns 是否需要重新分析
   */
  async quickCheckNeedsReanalysis(taskId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.detectMCPChanges(taskId, userId);
      return result.needsReanalysis;
    } catch (error) {
      logger.error(`快速检查失败 [任务: ${taskId}]:`, error);
      // 如果检查失败，为了安全起见，假设需要重新分析
      return true;
    }
  }
}

// 创建服务实例
export const mcpChangeDetectionService = new MCPChangeDetectionService(); 