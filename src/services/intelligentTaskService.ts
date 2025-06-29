import { logger } from '../utils/logger.js';
import { IntelligentWorkflowEngine, WorkflowState, ExecutionStep } from './intelligentWorkflowEngine.js';
import { getTaskService } from './taskService.js';
import { taskExecutorDao } from '../dao/taskExecutorDao.js';
import { messageDao } from '../dao/messageDao.js';
import { conversationDao } from '../dao/conversationDao.js';
import { MessageType, MessageIntent, MessageStepType } from '../models/conversation.js';

/**
 * 智能任务服务 - 使用智能工作流引擎执行任务
 */
export class IntelligentTaskService {
  private workflowEngine: IntelligentWorkflowEngine;
  private taskService: any;

  constructor() {
    this.workflowEngine = new IntelligentWorkflowEngine();
    this.taskService = getTaskService();
  }

  /**
   * 智能分析任务 - 使用工作流引擎自动分析和规划
   */
  async analyzeTaskIntelligently(
    taskId: string,
    stream: (data: any) => void
  ): Promise<boolean> {
    try {
      logger.info(`🧠 开始智能任务分析 [任务: ${taskId}]`);

      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: '任务不存在' } });
        return false;
      }

      // 发送分析开始事件
      stream({ 
        event: 'analysis_start', 
        data: { 
          taskId, 
          query: task.content,
          timestamp: new Date().toISOString() 
        } 
      });

      // 更新任务状态
      await this.taskService.updateTask(taskId, { status: 'in_progress' });
      stream({ event: 'status_update', data: { status: 'in_progress' } });

      // 构建分析查询
      const analysisQuery = `请分析以下任务并制定执行计划：

任务内容：${task.content}

需要分析：
1. 任务需求和目标
2. 需要哪些MCP工具和能力
3. 执行步骤和工作流
4. 预期结果和交付物

请提供详细的分析和推荐方案。`;

      // 使用智能工作流引擎进行分析
      const workflowGenerator = this.workflowEngine.executeWorkflowStream(
        taskId,
        analysisQuery,
        5 // 分析阶段最多5次迭代
      );

      let finalState: WorkflowState | null = null;
      let analysisResult = '';

      for await (const workflowStep of workflowGenerator) {
        // 转发工作流事件
        stream({
          event: 'workflow_step',
          data: {
            workflowEvent: workflowStep.event,
            workflowData: workflowStep.data
          }
        });

        // 处理特定事件
        switch (workflowStep.event) {
          case 'step_complete':
            // 发送步骤完成事件
            stream({
              event: 'analysis_step',
              data: {
                step: workflowStep.data.step,
                tool: workflowStep.data.plan?.tool,
                result: workflowStep.data.result,
                success: workflowStep.data.success
              }
            });

            // 累积分析结果
            if (workflowStep.data.success && workflowStep.data.result) {
              analysisResult += `\n\n## 步骤 ${workflowStep.data.step}\n${workflowStep.data.result}`;
            }
            break;

          case 'workflow_complete':
            finalState = workflowStep.data.finalState;
            break;

          case 'workflow_error':
            stream({
              event: 'error',
              data: { message: workflowStep.data.error }
            });
            return false;
        }
      }

      // 生成最终的分析报告
      if (finalState && finalState.blackboard.lastResult) {
        analysisResult = finalState.blackboard.lastResult;
      }

      // 解析分析结果，提取MCP工作流信息
      const mcpWorkflow = await this.extractMCPWorkflowFromAnalysis(
        analysisResult,
        task.content
      );

      // 更新任务的MCP工作流
      await this.taskService.updateTask(taskId, {
        status: 'analyzed',
        mcpWorkflow: JSON.stringify(mcpWorkflow)
      });

      // 保存分析消息到会话
      if (task.conversationId) {
        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: analysisResult,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.ANALYSIS,
            stepName: 'Intelligent Task Analysis',
            taskPhase: 'analysis',
            isComplete: true
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }

      // 发送分析完成事件
      stream({
        event: 'analysis_complete',
        data: {
          success: true,
          analysisResult,
          mcpWorkflow,
          executionHistory: finalState?.executionHistory || []
        }
      });

      logger.info(`✅ 智能任务分析完成 [任务: ${taskId}]`);
      return true;

    } catch (error) {
      logger.error(`❌ 智能任务分析失败:`, error);
      
      stream({
        event: 'error',
        data: {
          message: '智能分析失败',
          details: error instanceof Error ? error.message : String(error)
        }
      });

      // 更新任务状态为失败
      await this.taskService.updateTask(taskId, { status: 'failed' });
      
      return false;
    }
  }

  /**
   * 智能执行任务 - 使用工作流引擎自动执行（基于任务分析结果）
   */
  async executeTaskIntelligently(
    taskId: string,
    stream: (data: any) => void
  ): Promise<boolean> {
    try {
      logger.info(`⚡ 开始智能任务执行 [任务: ${taskId}]`);

      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: '任务不存在' } });
        return false;
      }

      // 检查任务是否已经过分析
      if (!task.mcpWorkflow) {
        stream({ 
          event: 'error', 
          data: { 
            message: '任务尚未分析',
            details: '请先调用任务分析API (/api/task/:id/analyze) 进行任务分析'
          } 
        });
        return false;
      }

      // 发送执行开始事件
      stream({ 
        event: 'execution_start', 
        data: { 
          taskId, 
          query: task.content,
          timestamp: new Date().toISOString(),
          usePreselectedMCPs: true // 标识使用预选的MCP
        } 
      });

      // 更新任务状态
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });

      // 解析MCP工作流信息
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      // 发送预选MCP信息
      stream({
        event: 'preselected_mcps',
        data: {
          mcps: mcpWorkflow.mcps || [],
          workflowSteps: mcpWorkflow.workflow || []
        }
      });

      // 使用智能工作流引擎执行任务（会自动使用预选的MCP）
      const workflowGenerator = this.workflowEngine.executeWorkflowStream(
        taskId,
        task.content,
        15 // 执行阶段最多15次迭代
      );

      let finalState: WorkflowState | null = null;
      let executionSteps: ExecutionStep[] = [];

      for await (const workflowStep of workflowGenerator) {
        // 转发工作流事件
        stream({
          event: 'workflow_step',
          data: {
            workflowEvent: workflowStep.event,
            workflowData: workflowStep.data
          }
        });

        // 处理特定事件
        switch (workflowStep.event) {
          case 'step_complete':
            const step = workflowStep.data;
            executionSteps.push(step);

            // 保存步骤结果到数据库
            await taskExecutorDao.saveStepResult(
              taskId,
              step.step,
              step.success,
              step.result
            );

            // 保存步骤消息到会话
            if (task.conversationId) {
              const stepContent = step.success 
                ? `执行成功: ${step.plan?.tool}\n\n${step.result}`
                : `执行失败: ${step.plan?.tool}\n\n错误: ${step.error}`;

              await messageDao.createMessage({
                conversationId: task.conversationId,
                content: stepContent,
                type: MessageType.ASSISTANT,
                intent: MessageIntent.TASK,
                taskId,
                metadata: {
                  stepType: MessageStepType.EXECUTION,
                  stepNumber: step.step,
                  stepName: step.plan?.tool || 'Unknown Step',
                  taskPhase: 'execution',
                  isComplete: true
                }
              });

              await conversationDao.incrementMessageCount(task.conversationId);
            }

            // 发送步骤完成事件
            stream({
              event: 'step_complete',
              data: {
                step: step.step,
                tool: step.plan?.tool,
                success: step.success,
                result: step.result,
                error: step.error
              }
            });
            break;

          case 'workflow_complete':
            finalState = workflowStep.data.finalState;
            break;

          case 'workflow_error':
            stream({
              event: 'error',
              data: { message: workflowStep.data.error }
            });
            
            await taskExecutorDao.updateTaskResult(taskId, 'failed', {
              error: workflowStep.data.error
            });
            
            return false;
        }
      }

      // 判断整体执行结果
      const successfulSteps = executionSteps.filter(step => step.success).length;
      const overallSuccess = successfulSteps > 0 && executionSteps.length > 0;

      // 生成最终结果
      let finalResult = '';
      if (finalState && finalState.blackboard.lastResult) {
        finalResult = finalState.blackboard.lastResult;
      } else {
        // 从执行步骤中提取结果
        const successfulResults = executionSteps
          .filter(step => step.success)
          .map(step => step.result)
          .join('\n\n');
        finalResult = successfulResults || '执行完成，但未获得明确结果';
      }

      // 使用LLM生成执行摘要
      const executionSummary = await this.generateExecutionSummary(
        task.content,
        executionSteps,
        finalResult
      );

      // 保存摘要消息到会话
      if (task.conversationId) {
        await messageDao.createMessage({
          conversationId: task.conversationId,
          content: executionSummary,
          type: MessageType.ASSISTANT,
          intent: MessageIntent.TASK,
          taskId,
          metadata: {
            stepType: MessageStepType.SUMMARY,
            stepName: 'Execution Summary',
            taskPhase: 'execution',
            isComplete: true
          }
        });

        await conversationDao.incrementMessageCount(task.conversationId);
      }

      // 更新任务结果
      await taskExecutorDao.updateTaskResult(
        taskId,
        overallSuccess ? 'completed' : 'partial_failure',
        {
          summary: executionSummary,
          steps: executionSteps,
          finalResult,
          executionHistory: finalState?.executionHistory || [],
          usedPreselectedMCPs: true // 标识使用了预选的MCP
        }
      );

      // 发送执行完成事件
      stream({
        event: 'execution_complete',
        data: {
          success: overallSuccess,
          summary: executionSummary,
          steps: executionSteps.length,
          successfulSteps: successfulSteps,
          usedPreselectedMCPs: true
        }
      });

      logger.info(`✅ 智能任务执行完成 [任务: ${taskId}, 成功: ${overallSuccess}]`);
      return overallSuccess;

    } catch (error) {
      logger.error(`❌ 智能任务执行失败:`, error);
      
      stream({
        event: 'error',
        data: {
          message: '智能执行失败',
          details: error instanceof Error ? error.message : String(error)
        }
      });

      await taskExecutorDao.updateTaskResult(taskId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return false;
    }
  }

  /**
   * 从分析结果中提取MCP工作流信息
   */
  private async extractMCPWorkflowFromAnalysis(
    analysisResult: string,
    taskContent: string
  ): Promise<any> {
    // 这里可以使用LLM来解析分析结果，提取出结构化的MCP工作流信息
    // 为简化，这里返回一个基本结构
    return {
      mcps: [],
      workflow: [
        {
          step: 1,
          mcp: 'intelligent-workflow',
          action: 'auto-execute',
          input: { content: taskContent }
        }
      ]
    };
  }

  /**
   * 生成执行摘要
   */
  private async generateExecutionSummary(
    taskContent: string,
    executionSteps: ExecutionStep[],
    finalResult: string
  ): Promise<string> {
    const stepsSummary = executionSteps.map(step => 
      `- 步骤${step.stepNumber}: ${step.plan?.tool} - ${step.success ? '成功' : '失败'}`
    ).join('\n');

    return `## 任务执行摘要

**原始任务**: ${taskContent}

**执行步骤**:
${stepsSummary}

**执行结果**:
${finalResult}

**统计信息**:
- 总步骤数: ${executionSteps.length}
- 成功步骤: ${executionSteps.filter(s => s.success).length}
- 失败步骤: ${executionSteps.filter(s => !s.success).length}`;
  }
}

// 导出单例实例
export const intelligentTaskService = new IntelligentTaskService(); 