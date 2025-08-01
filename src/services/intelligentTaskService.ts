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
   * 智能执行任务 - 使用工作流引擎自动执行（基于任务分析结果）
   */
  async executeTaskIntelligently(
    taskId: string,
    stream: (data: any) => void
  ): Promise<boolean> {
    try {
      logger.info(`⚡ Starting intelligent task execution [Task: ${taskId}]`);

      // 获取任务信息
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        stream({ event: 'error', data: { message: 'Task not found' } });
        return false;
      }

      // 检查任务是否已经过分析
      if (!task.mcpWorkflow) {
        stream({ 
          event: 'error', 
          data: { 
            message: 'Task not analyzed yet',
            details: 'Please call task analysis API (/api/task/:id/analyze) first for task analysis'
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
        // 处理智能引擎事件，转换为传统引擎格式
        switch (workflowStep.event) {
          case 'node_complete':
            const { node, result } = workflowStep.data;
            
            // 🔧 智能引擎节点完成 - 根据节点类型发送对应事件
            if (node === 'planner' && result.currentPlan) {
              // 规划节点完成 - 发送步骤开始事件（对齐传统引擎格式）
              stream({
                event: 'step_start',
                data: {
                  step: result.currentIteration || executionSteps.length + 1,
                  mcpName: result.currentPlan.mcpName || 'intelligent-engine',
                  actionName: result.currentPlan.tool,
                  input: typeof result.currentPlan.args === 'object' 
                    ? JSON.stringify(result.currentPlan.args) 
                    : result.currentPlan.args || ''
                }
              });
            }
            break;

          case 'step_complete':
            const step = workflowStep.data;
            executionSteps.push(step);

            // 🔧 如果是成功步骤，发送final_result_chunk事件（对齐传统引擎格式）
            if (step.success && step.result) {
              const resultText = typeof step.result === 'string' ? step.result : JSON.stringify(step.result);
              
              // 模拟流式输出final_result_chunk
              const chunks = resultText.match(/.{1,100}/g) || [resultText];
              for (const chunk of chunks) {
                stream({
                  event: 'final_result_chunk',
                  data: { chunk }
                });
                // 短暂延迟模拟流式输出
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }

            // 🔧 如果步骤失败，发送step_error事件（对齐传统引擎格式）
            if (!step.success) {
              // 🔧 Enhanced: Use error handler to analyze errors with LLM for task execution
              let detailedError = null;
              let isMCPConnectionError = false;
              let mcpName: string | undefined;
              
              try {
                // Extract MCP name from step plan or error message
                if (step.plan?.mcpName) {
                  mcpName = step.plan.mcpName;
                } else if (step.error && step.error.includes('MCP ')) {
                  const mcpMatch = step.error.match(/MCP\s+([^\s]+)/);
                  if (mcpMatch) {
                    mcpName = mcpMatch[1];
                  }
                }
                
                const { MCPErrorHandler } = await import('./mcpErrorHandler.js');
                const errorToAnalyze = new Error(step.error || 'Unknown error');
                const errorDetails = await MCPErrorHandler.analyzeError(errorToAnalyze, mcpName);
                detailedError = MCPErrorHandler.formatErrorForFrontend(errorDetails);
                
                // Check if this is an MCP connection/authentication error
                isMCPConnectionError = this.isMCPConnectionError(errorDetails.type);
                
                if (isMCPConnectionError && mcpName) {
                  // Send specialized MCP connection error event
                  stream({
                    event: 'mcp_connection_error',
                    data: {
                      mcpName: mcpName,
                      step: step.step,
                      errorType: errorDetails.type,
                      title: errorDetails.title,
                      message: errorDetails.userMessage,
                      suggestions: errorDetails.suggestions,
                      authFieldsRequired: errorDetails.authFieldsRequired,
                      isRetryable: errorDetails.isRetryable,
                      requiresUserAction: errorDetails.requiresUserAction,
                      llmAnalysis: errorDetails.llmAnalysis,
                      originalError: errorDetails.originalError,
                      timestamp: new Date().toISOString()
                    }
                  });
                }
              } catch (analysisError) {
                logger.warn('Error analysis failed:', analysisError);
              }
              
              // Send regular step error event if not MCP connection error
              if (!isMCPConnectionError) {
              stream({
                event: 'step_error',
                data: {
                  step: step.step,
                    error: step.error || 'Unknown error',
                    detailedError: detailedError
                }
              });
              }
            }

            // 保存步骤结果到数据库
            await taskExecutorDao.saveStepResult(
              taskId,
              step.step,
              step.success,
              step.result
            );

            // 🔧 保存步骤消息到会话 - 存储原始结果和格式化结果
            if (task.conversationId) {
              // 1. 存储原始结果消息
              const rawContent = step.success 
                ? `Step ${step.step} Raw Result: ${step.plan?.tool}\n\n${JSON.stringify(step.result, null, 2)}`
                : `Step ${step.step} Failed: ${step.plan?.tool}\n\nError: ${step.error}`;

              await messageDao.createMessage({
                conversationId: task.conversationId,
                content: rawContent,
                type: MessageType.ASSISTANT,
                intent: MessageIntent.TASK,
                taskId,
                metadata: {
                  stepType: MessageStepType.EXECUTION,
                  stepNumber: step.step,
                  stepName: step.plan?.tool || 'Unknown Step',
                  taskPhase: 'execution',
                  contentType: 'raw_result',
                  isComplete: true,
                  toolDetails: {
                    toolType: step.plan?.toolType,
                    toolName: step.plan?.tool,
                    mcpName: step.plan?.mcpName || null,
                    args: step.plan?.args,
                    expectedOutput: step.plan?.expectedOutput,
                    reasoning: step.plan?.reasoning,
                    timestamp: new Date().toISOString()
                  },
                  executionDetails: {
                    rawResult: step.result,
                    success: step.success,
                    error: step.error,
                    processingInfo: {
                      originalDataSize: JSON.stringify(step.result).length,
                      processingTime: new Date().toISOString()
                    }
                  }
                }
              });

              // 2. 存储格式化结果消息（如果执行成功且有结果）
              if (step.success && step.result) {
                const formattedContent = `Step ${step.step} Formatted Result: ${step.plan?.tool}\n\n${step.result}`;

                await messageDao.createMessage({
                  conversationId: task.conversationId,
                  content: formattedContent,
                  type: MessageType.ASSISTANT,
                  intent: MessageIntent.TASK,
                  taskId,
                  metadata: {
                    stepType: MessageStepType.EXECUTION,
                    stepNumber: step.step,
                    stepName: step.plan?.tool || 'Unknown Step',
                    taskPhase: 'execution',
                    contentType: 'formatted_result',
                    isComplete: true,
                    toolDetails: {
                      toolType: step.plan?.toolType,
                      toolName: step.plan?.tool,
                      mcpName: step.plan?.mcpName || null,
                      args: step.plan?.args,
                      expectedOutput: step.plan?.expectedOutput,
                      reasoning: step.plan?.reasoning,
                      timestamp: new Date().toISOString()
                    },
                    executionDetails: {
                      formattedResult: step.result,
                      success: step.success,
                      processingInfo: {
                        formattedDataSize: String(step.result).length,
                        processingTime: new Date().toISOString()
                      }
                    }
                }
              });
              }

              await conversationDao.incrementMessageCount(task.conversationId);
            }

            // 🔧 发送步骤完成事件（对齐传统引擎格式）
            stream({
              event: 'step_complete',
              data: {
                step: step.step,
                success: step.success,
                result: step.result,        // 格式化后的结果
                rawResult: step.result      // 智能引擎的原始结果作为rawResult
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
      if (finalState && finalState.blackboard && finalState.blackboard.lastResult) {
        finalResult = finalState.blackboard.lastResult;
      } else {
        // 从执行步骤中提取结果
        const successfulResults = executionSteps
          .filter(step => step.success)
          .map(step => step.result)
          .join('\n\n');
        finalResult = successfulResults || 'Execution completed, but no clear result obtained';
      }

      // 🔧 发送最终结果（对齐传统引擎格式）
      if (finalResult) {
        stream({
          event: 'final_result',
          data: {
            finalResult,
            message: 'Final execution result available'
          }
        });
      }

      // 🔧 生成摘要，使用流式生成（对齐传统引擎格式）
      stream({ event: 'generating_summary', data: { message: 'Generating result summary...' } });

      // 创建摘要消息（流式更新）
      let summaryMessageId: string | undefined;
      if (task.conversationId) {
        const summaryMessage = await messageDao.createStreamingMessage({
          conversationId: task.conversationId,
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

        await conversationDao.incrementMessageCount(task.conversationId);
      }

      // 更新任务结果
      await taskExecutorDao.updateTaskResult(
        taskId,
        overallSuccess ? 'completed' : 'failed',
        {
          summary: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with some failures',
          steps: executionSteps,
          finalResult,
          executionHistory: finalState?.executionHistory || [],
          usedPreselectedMCPs: true
        }
      );

      // 🔧 发送工作流完成事件（对齐传统引擎格式）
      stream({
        event: 'workflow_complete',
        data: {
          success: overallSuccess,
          message: overallSuccess ? 'Task execution completed successfully' : 'Task execution completed with errors',
          finalResult: finalResult
        }
      });

      // 🔧 发送任务完成事件（对齐传统引擎格式）
      stream({
        event: 'task_complete',
        data: {
          taskId,
          success: overallSuccess
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
   * Check if error type is MCP connection related
   */
  private isMCPConnectionError(errorType: string): boolean {
    const mcpConnectionErrorTypes = [
      'INVALID_API_KEY',
      'EXPIRED_API_KEY', 
      'WRONG_PASSWORD',
      'MISSING_AUTH_PARAMS',
      'INVALID_AUTH_FORMAT',
      'INSUFFICIENT_PERMISSIONS',
      'MCP_CONNECTION_FAILED',
      'MCP_AUTH_REQUIRED',
      'MCP_SERVICE_INIT_FAILED'
    ];
    return mcpConnectionErrorTypes.includes(errorType);
  }
}

// 导出单例实例
export const intelligentTaskService = new IntelligentTaskService(); 