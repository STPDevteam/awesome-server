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
   * 智能分析任务 - 应该由 TaskAnalysisService 处理，不是 IntelligentTaskService
   * 这个方法不应该存在，分析阶段应该完全由 TaskAnalysisService 完成
   */
  async analyzeTaskIntelligently(
    taskId: string,
    stream: (data: any) => void
  ): Promise<boolean> {
    throw new Error('分析阶段应该由 TaskAnalysisService 完成，IntelligentTaskService 只负责执行阶段');
  }

  /**
   * Intelligent task execution - using workflow engine for automatic execution (based on task analysis results)
   */
  async executeTaskIntelligently(
    taskId: string,
    stream: (data: any) => void
  ): Promise<boolean> {
    try {
      logger.info(`⚡ Starting intelligent task execution [Task: ${taskId}]`);

      // Get task information
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }

      // Check if task has been analyzed
      if (!task.mcpWorkflow) {
        stream({ 
          event: 'error', 
          data: { 
            message: 'Task not analyzed yet',
            details: 'Please call task analysis API (/api/task/:id/analyze) first'
          } 
        });
        return false;
      }

      // Send execution start event
      stream({ 
        event: 'execution_start', 
        data: { 
          taskId, 
          query: task.content,
          timestamp: new Date().toISOString(),
          usePreselectedMCPs: true // Indicates using preselected MCPs
        } 
      });

      // Update task status
      await taskExecutorDao.updateTaskStatus(taskId, 'in_progress');
      stream({ event: 'status_update', data: { status: 'in_progress' } });

      // Parse MCP workflow information
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      // Send preselected MCP information
      stream({
        event: 'preselected_mcps',
        data: {
          mcps: mcpWorkflow.mcps || [],
          workflowSteps: mcpWorkflow.workflow || []
        }
      });

      // Use intelligent workflow engine to execute task (will automatically use preselected MCPs)
      const workflowResult = await this.workflowEngine.executeIntelligentWorkflow(
        taskId,
        task.content,
        mcpWorkflow.mcps || [], // Pass preselected MCPs
        100 // Maximum 100 iterations for execution phase - increased to support complex multi-step workflows
      );

      // Process workflow execution results
      const finalState = workflowResult;
      const executionSteps: ExecutionStep[] = finalState?.executionHistory || [];

      // Save each step's results to database
      for (const step of executionSteps) {
        await taskExecutorDao.saveStepResult(
          taskId,
          step.stepNumber,
          step.success,
          step.result
        );

        // Save step messages to conversation
        if (task.conversationId) {
          const stepContent = step.success 
            ? `Execution successful: ${step.plan?.tool}\n\n${step.result}`
            : `Execution failed: ${step.plan?.tool}\n\nError: ${step.error}`;

          await messageDao.createMessage({
            conversationId: task.conversationId,
            content: stepContent,
            type: MessageType.ASSISTANT,
            intent: MessageIntent.TASK,
            taskId,
            metadata: {
              stepType: MessageStepType.EXECUTION,
              stepNumber: step.stepNumber,
              stepName: step.plan?.tool || 'Unknown Step',
              taskPhase: 'execution',
              isComplete: true
            }
          });

          await conversationDao.incrementMessageCount(task.conversationId);
        }

        // Send step completion event
        stream({
          event: 'step_complete',
          data: {
            step: step.stepNumber,
            tool: step.plan?.tool,
            success: step.success,
            result: step.result,
            error: step.error
          }
        });
      }

      // Determine overall execution result
      const successfulSteps = executionSteps.filter(step => step.success).length;
      const overallSuccess = successfulSteps > 0 && executionSteps.length > 0;

      // Generate final result
      let finalResult = '';
      if (finalState && finalState.blackboard && finalState.blackboard.lastResult) {
        finalResult = finalState.blackboard.lastResult;
      } else if (finalState && finalState.finalAnswer) {
        finalResult = finalState.finalAnswer;
      } else {
        // Extract results from execution steps
        const successfulResults = executionSteps
          .filter(step => step.success)
          .map(step => step.result)
          .join('\n\n');
        finalResult = successfulResults || 'Execution completed, but no clear result obtained';
      }

      // Generate execution summary using LLM
      const executionSummary = await this.generateExecutionSummary(
        task.content,
        executionSteps,
        finalResult
      );

      // Save summary message to conversation
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

      // Update task result
      await taskExecutorDao.updateTaskResult(
        taskId,
        overallSuccess ? 'completed' : 'partial_failure',
        {
          summary: executionSummary,
          steps: executionSteps,
          finalResult,
          executionHistory: finalState?.executionHistory || [],
          usedPreselectedMCPs: true // Indicates preselected MCPs were used
        }
      );

      // Send execution completion event
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

      logger.info(`✅ Intelligent task execution completed [Task: ${taskId}, Success: ${overallSuccess}]`);
      return overallSuccess;

    } catch (error) {
      logger.error(`❌ Intelligent task execution failed:`, error);
      
      stream({
        event: 'error',
        data: {
          message: 'Intelligent execution failed',
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
   * Generate execution summary in English
   */
  private async generateExecutionSummary(
    taskContent: string,
    executionSteps: ExecutionStep[],
    finalResult: string
  ): Promise<string> {
    const stepsSummary = executionSteps.map(step => 
      `- Step ${step.stepNumber}: ${step.plan?.tool} - ${step.success ? 'Success' : 'Failed'}`
    ).join('\n');

    return `## Task Execution Summary

**Original Task**: ${taskContent}

**Execution Steps**:
${stepsSummary}

**Execution Result**:
${finalResult}

**Statistics**:
- Total Steps: ${executionSteps.length}
- Successful Steps: ${executionSteps.filter(s => s.success).length}
- Failed Steps: ${executionSteps.filter(s => !s.success).length}`;
  }
}

// 导出单例实例
export const intelligentTaskService = new IntelligentTaskService(); 