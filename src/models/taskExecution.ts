/**
 * 任务执行步骤结果
 */
export interface TaskStepResult {
  step: number;
  success: boolean;
  result?: any;
  error?: string;
  executedAt: Date;
}

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  summary: string;
  steps: TaskStepResult[];
  finalResult?: any;
  completedAt: Date;
}

/**
 * 工作流步骤执行请求
 */
export interface WorkflowStepExecution {
  taskId: string;
  stepNumber: number;
  mcpName: string;
  action: string;
  input: any;
}

/**
 * 工作流执行状态
 */
export type WorkflowExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'; 