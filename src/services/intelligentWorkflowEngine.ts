import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { logger } from '../utils/logger.js';
import { MCPManager } from './mcpManager.js';
import { MCPToolAdapter } from './mcpToolAdapter.js';
import { MCPAuthService } from './mcpAuthService.js';
import { getAllPredefinedMCPs, getPredefinedMCP } from './predefinedMCPs.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { z } from 'zod';
import { getTaskService } from './taskService.js';

const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);

/**
 * Execution plan - defines what action to take next
 */
export interface ExecutionPlan {
  tool: string;                    // Dynamic tool name (e.g., "create_tweet", "get_price")
  toolType: 'llm' | 'mcp';        // Tool source type
  mcpName?: string;               // MCP service name if toolType is 'mcp'
  args: Record<string, any>;      // Tool-specific arguments
  expectedOutput: string;         // Expected result description
  reasoning: string;              // Why this step was chosen
}

/**
 * Execution step - records what was actually executed
 */
export interface ExecutionStep {
  stepNumber: number;
  plan: ExecutionPlan;
  result: any;
  success: boolean;
  error?: string;
  timestamp: Date;
  // Dynamic step classification (generated at runtime)
  stepDescription: string;        // e.g., "twitter-mcp.create_tweet", "llm.analyze"
}

/**
 * Workflow state definition - using correct Annotation API
 */
const WorkflowStateAnnotation = Annotation.Root({
  taskId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  originalQuery: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  currentObjective: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  executionHistory: Annotation<ExecutionStep[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  blackboard: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  currentPlan: Annotation<ExecutionPlan | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  isComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  maxIterations: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 10,
  }),
  currentIteration: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  lastError: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;

/**
 * Intelligent workflow engine - based on LangGraph for Plan-Act-Observe micro-cycle
 */
export class IntelligentWorkflowEngine {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private mcpToolAdapter: MCPToolAdapter;
  private graph: StateGraph<any>;
  private taskService: any;
  private mcpAuthService: MCPAuthService;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o',
      temperature: 0.1,
    //   httpAgent: agent,
    //   httpsAgent: agent,
    });

    this.mcpManager = new MCPManager();
    this.mcpToolAdapter = new MCPToolAdapter(this.mcpManager);
    this.taskService = getTaskService();
    
    // Directly initialize MCPAuthService like a traditional executor
    this.mcpAuthService = new MCPAuthService();
    
    this.graph = this.buildWorkflowGraph();
  }

  /**
   * Build LangGraph workflow graph - using correct API
   */
  private buildWorkflowGraph(): StateGraph<any> {
    const graph = new StateGraph(WorkflowStateAnnotation);

    // Add nodes
    graph.addNode('planner' as any, this.plannerNode.bind(this));
    graph.addNode('executor' as any, this.executorNode.bind(this));
    graph.addNode('observer' as any, this.observerNode.bind(this));

    // Set entry point - using START constant
    graph.addEdge(START, 'planner' as any);
    
    // Set edges
    graph.addEdge('planner' as any, 'executor' as any);
    graph.addEdge('executor' as any, 'observer' as any);
    
    // Conditional edges: determine whether to continue based on observation results
    graph.addConditionalEdges(
      'observer' as any,
      this.shouldContinue.bind(this),
      {
        continue: 'planner' as any,
        end: END
      } as any
    );

    return graph;
  }

  /**
   * Planner Node - Analyze current state and create execution plan
   */
  private async plannerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    try {
      logger.info(`🧠 Planner: Analyzing task [Iteration: ${state.currentIteration + 1}]`);
      
      // Get available MCP capabilities
      const availableMCPs = await this.getAvailableMCPCapabilities(state.taskId);
      
      // Build prompt
      const plannerPrompt = this.buildPlannerPrompt(state, availableMCPs);

      const response = await this.llm.invoke([
        new SystemMessage(plannerPrompt)
      ]);

      const plan = this.parsePlan(response.content as string);
      
      logger.info(`📋 Planner: Created next step plan - ${plan.tool} (${plan.toolType})`);
      logger.info(`💭 Reasoning: ${plan.reasoning}`);
      
      return {
        currentPlan: plan,
        currentIteration: state.currentIteration + 1
      };
      
    } catch (error) {
      logger.error('Planner node execution failed:', error);
      
      return {
        errors: [...state.errors, `Planner failed: ${error}`],
        currentIteration: state.currentIteration + 1
      };
    }
  }

  /**
   * Build Planner prompt
   */
  private buildPlannerPrompt(state: WorkflowState, availableMCPs: any[]): string {
    // Analyze current execution state
    const totalSteps = state.executionHistory.length;
    const hasData = Object.keys(state.blackboard).length > 1;
    const lastStepResult = totalSteps > 0 ? state.executionHistory[totalSteps - 1] : null;
    
    return `You are an intelligent workflow step planner. Your job is to determine the NEXT SINGLE STEP to achieve the user's goal.

**USER TASK**: "${state.originalQuery || state.currentObjective}"

**CURRENT STATE**:
- Steps completed: ${totalSteps}
- Available data: ${hasData ? Object.keys(state.blackboard).filter(k => k !== 'lastResult').join(', ') : 'None'}
- Last step: ${lastStepResult ? `${lastStepResult.plan.tool} (${lastStepResult.success ? 'Success' : 'Failed'})` : 'None'}
${lastStepResult?.result ? `- Last result preview: ${JSON.stringify(lastStepResult.result).substring(0, 150)}...` : ''}

**AVAILABLE TOOLS**:
${availableMCPs.map(mcp => `- ${mcp.mcpName}: ${mcp.description || 'General purpose tool'}`).join('\n')}

**PLANNING PRINCIPLES**:

1. **Task-Driven Decision**: Choose the next step based on what the user actually wants to achieve, not a predefined workflow pattern.

2. **Flexible Execution**: 
   - Simple tasks might need only 1 step (e.g., "get Bitcoin price")
   - Complex tasks might need many steps (e.g., multi-source analysis)
   - Some tasks start with actions, not data collection (e.g., "post a tweet about today's weather")

3. **Smart Progression**:
   - If task requires information you don't have → Get that information
   - If task requires analysis of available data → Analyze the data
   - If task requires action and you have what you need → Take the action
   - If task is complete → You're done

4. **Build on Context**: Use results from previous steps intelligently when they're relevant to the next action.

**DECISION LOGIC**:

Ask yourself: "What is the most logical next step to get closer to completing this specific user task?"

- Don't force unnecessary data collection if the task doesn't need it
- Don't force analysis if the task is straightforward  
- Don't follow rigid patterns - adapt to the actual task requirements
- Consider if the task might already be complete

**OUTPUT FORMAT** (JSON only):
{
  "tool": "exact-tool-name",
  "toolType": "mcp" or "llm",
  "mcpName": "exact-mcp-name-if-mcp-tool",
  "args": {
    // Parameters specific to this tool/action
    // Use previous results when relevant
  },
  "expectedOutput": "What this step should accomplish",
  "reasoning": "Why this specific step makes sense for this specific task"
}

**EXAMPLE REASONING**:

*Simple task*: "Get current Bitcoin price"
→ One step: Use coingecko-mcp to get price data. Done.

*Complex task*: "Analyze three crypto influencers and summarize their sentiment"  
→ Step 1: Get tweets from influencer A
→ Step 2: Get tweets from influencer B  
→ Step 3: Get tweets from influencer C
→ Step 4: Analyze sentiment patterns
→ Step 5: Create summary

*Action task*: "Post a tweet saying hello"
→ One step: Use x-mcp to post the tweet. Done.

What is the most logical next step for THIS specific task?`;
  }

  /**
   * Executor Node - Execute the plan
   */
  private async executorNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    if (!state.currentPlan) {
      return {
        lastError: 'No executable plan available',
        errors: [...state.errors, 'No executable plan available']
      };
    }

    logger.info(`⚡ Executor: Executing plan ${state.currentPlan.tool}`);

    try {
      // 🔗 Key fix: Add chaining logic (reference traditional executor)
      // If there are previous step results, intelligently use them as input for current step
      let enhancedPlan = { ...state.currentPlan };
      
      if (state.executionHistory.length > 0 && state.blackboard.lastResult) {
        logger.info(`🔗 Detected previous step result, starting chain call transformation`);
        
        // Use similar logic to traditional executor, intelligently extract useful data from previous step
        const enhancedInput = await this.extractUsefulDataFromResult(
          { result: state.blackboard.lastResult }, // Simulate traditional executor result format
          state.currentPlan.tool, // Next action
          state // Pass workflow state
        );
        
        // Merge original parameters with extracted data
        enhancedPlan.args = {
          ...state.currentPlan.args,
          ...enhancedInput
        };
        
        logger.info(`🔗 Chain call: Previous step result integrated into current plan`);
        logger.info(`📥 Enhanced parameters: ${JSON.stringify(enhancedPlan.args, null, 2)}`);
      }

      let result: any;
      
      if (enhancedPlan.toolType === 'mcp') {
        // Call MCP tool
        result = await this.executeMCPTool(enhancedPlan, state);
      } else {
        // Call LLM capability
        result = await this.executeLLMTool(enhancedPlan, state);
      }

      // Record execution step
      const step: ExecutionStep = {
        stepNumber: state.executionHistory.length + 1,
        plan: enhancedPlan, // Use enhanced plan
        result,
        success: true,
        timestamp: new Date(),
        stepDescription: this.generateStepDescription(enhancedPlan)
      };

      logger.info(`✅ Execution successful: ${enhancedPlan.tool}`);

      return {
        executionHistory: [...state.executionHistory, step],
        blackboard: {
          ...state.blackboard,
          [`step${step.stepNumber}`]: result,
          lastResult: result,
          // 🔗 Add parsed data for next step use (reference traditional executor)
          parsedData: this.parseResultData(result)
        }
      };

    } catch (error) {
      logger.error('Executor node execution failed:', error);
      
      const step: ExecutionStep = {
        stepNumber: state.executionHistory.length + 1,
        plan: state.currentPlan,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        stepDescription: this.generateStepDescription(state.currentPlan)
      };

      return {
        executionHistory: [...state.executionHistory, step],
        lastError: `Execution failed: ${error}`,
        errors: [...state.errors, `Execution failed: ${error}`]
      };
    }
  }

  /**
   * Observer Node - Observe execution results and determine completion status
   */
  private async observerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info(`👁️ Observer: Observing execution results and determining completion status`);

    try {
      // Build observer prompt
      const observerPrompt = this.buildObserverPrompt(state);
      
      // Call LLM to analyze current state
      const response = await this.llm.invoke([
        new SystemMessage(observerPrompt),
        new HumanMessage('Please analyze the current execution state and determine if continuation is needed')
      ]);

      // Parse observation result
      const observation = this.parseObservation(response.content as string);
      
      logger.info(`🔍 Observation result: ${observation.isComplete ? 'Task complete' : 'Need to continue'}`);

      return {
        isComplete: observation.isComplete,
        currentObjective: observation.nextObjective || state.currentObjective,
        currentIteration: state.currentIteration + 1,
        messages: [...state.messages, response]
      };

    } catch (error) {
      logger.error('Observer node execution failed:', error);
      return {
        lastError: `Observation analysis failed: ${error}`,
        errors: [...state.errors, `Observation analysis failed: ${error}`]
      };
    }
  }

  /**
   * Determine if execution should continue
   */
  private shouldContinue(state: WorkflowState): 'continue' | 'end' {
    // Check completion status
    if (state.isComplete) {
      return 'end';
    }

    // Check maximum iterations
    if (state.currentIteration >= state.maxIterations) {
      logger.warn(`Reached maximum iterations ${state.maxIterations}, stopping execution`);
      return 'end';
    }

    // Check consecutive errors
    if (state.errors.length >= 3) {
      logger.warn('Too many consecutive errors, stopping execution');
      return 'end';
    }

    return 'continue';
  }

  /**
   * Get preselected MCP list from task analysis results
   */
  private async getPreselectedMCPs(taskId: string): Promise<any[]> {
    try {
      // Get task information
      const task = await this.taskService.getTaskById(taskId);
      if (!task || !task.mcpWorkflow) {
        logger.info(`Task ${taskId} has no preselected MCP workflow`);
        return [];
      }

      // Parse MCP workflow
      const mcpWorkflow = typeof task.mcpWorkflow === 'string' 
        ? JSON.parse(task.mcpWorkflow) 
        : task.mcpWorkflow;

      if (!mcpWorkflow.mcps || mcpWorkflow.mcps.length === 0) {
        logger.info(`Task ${taskId} MCP workflow is empty`);
        return [];
      }

      logger.info(`📋 Task ${taskId} preselected MCPs: ${mcpWorkflow.mcps.map((mcp: any) => mcp.name).join(', ')}`);
      return mcpWorkflow.mcps;

    } catch (error) {
      logger.error(`Failed to get preselected MCPs:`, error);
      return [];
    }
  }

  /**
   * Get available MCP capabilities - based on task analysis results
   */
  private async getAvailableMCPCapabilities(taskId?: string): Promise<any[]> {
    if (!taskId) {
      // If no taskId, fallback to only using connected MCPs
      return this.getConnectedMCPCapabilities();
    }

    try {
      // Get preselected MCPs based on task analysis results
      const capabilities = await this.ensurePreselectedMCPsConnected(taskId);
      
      if (capabilities.length === 0) {
        logger.info('🧠 No available preselected MCPs, using pure LLM mode');
      } else {
        logger.info(`📋 Available preselected MCP capabilities: ${capabilities.map(cap => cap.mcpName).join(', ')}`);
      }

      return capabilities;
    } catch (error) {
      logger.error('Failed to get preselected MCP capabilities:', error);
      // Fallback to using connected MCPs
      return this.getConnectedMCPCapabilities();
    }
  }

  /**
   * Ensure preselected MCPs are connected and get actual tool list
   */
  private async ensurePreselectedMCPsConnected(taskId: string): Promise<any[]> {
    const preselectedMCPs = await this.getPreselectedMCPs(taskId);
    const capabilities: any[] = [];

    if (preselectedMCPs.length === 0) {
      logger.info('🧠 No preselected MCPs, using pure LLM mode');
      return [];
    }

    // Get task user ID
    let userId: string | undefined;
    const task = await this.taskService.getTaskById(taskId);
    userId = task?.userId;

    for (const mcpInfo of preselectedMCPs) {
      try {
        const mcpName = mcpInfo.name;
        
        // Check if already connected
        const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
        const isConnected = connectedMCPs.some(mcp => mcp.name === mcpName);

        if (!isConnected) {
          logger.info(`🔗 Connecting preselected MCP: ${mcpName}`);
          try {
            await this.autoConnectMCP(mcpName, taskId, userId);
            logger.info(`✅ Preselected MCP ${mcpName} connected successfully`);
          } catch (connectError) {
            logger.error(`❌ Preselected MCP ${mcpName} connection failed:`, connectError);
            // Skip this MCP and continue with others
            continue;
          }
        }

        // Verify connection status again
        const connectedAfterAttempt = this.mcpManager.getConnectedMCPs(userId).some(mcp => mcp.name === mcpName);
        if (!connectedAfterAttempt) {
          logger.warn(`⚠️ MCP ${mcpName} still not connected after connection attempt, skipping`);
          continue;
        }

        // Get tool list
        try {
          const tools = await this.mcpManager.getTools(mcpName, userId);
          logger.info(`✅ Successfully got MCP ${mcpName} tool list, tool count: ${tools.length}`);
          
          capabilities.push({
            mcpName,
            description: mcpInfo.description || `MCP Service: ${mcpName}`,
            tools
          });
        } catch (toolError) {
          logger.error(`❌ Failed to get MCP ${mcpName} tool list:`, toolError);
          // Skip this MCP
          continue;
        }

      } catch (error) {
        logger.error(`Error processing preselected MCP ${mcpInfo.name}:`, error);
        // Continue with other MCPs
        continue;
      }
    }

    logger.info(`📋 Successfully connected preselected MCPs: ${capabilities.length}/${preselectedMCPs.length}`);
    return capabilities;
  }

  /**
   * Get connected MCP capabilities (fallback solution)
   */
  private async getConnectedMCPCapabilities(): Promise<any[]> {
    const capabilities: any[] = [];
    
    // Get connected MCPs
    const connectedMCPs = this.mcpManager.getConnectedMCPs();
    
    if (connectedMCPs.length === 0) {
      logger.info('🧠 No connected MCPs, using pure LLM mode');
      return [];
    }
    
    // Only process connected MCPs
    for (const mcp of connectedMCPs) {
      try {
        // 🔧 Key fix: Get actual tool list for MCP
        const actualTools = await this.mcpManager.getTools(mcp.name);
        logger.info(`📋 ${mcp.name} actual available tools: ${actualTools.map(t => t.name).join(', ')}`);
        
        capabilities.push({
          mcpName: mcp.name,
          description: mcp.description || `MCP Service: ${mcp.name}`,
          // 🔧 Use actual tool list
          tools: actualTools.map(tool => ({
            name: tool.name,
            description: tool.description || 'No description',
            parameters: tool.inputSchema
          }))
        });

        logger.info(`✅ Found connected MCP: ${mcp.name} (${actualTools.length} tools)`);

      } catch (error) {
        logger.warn(`Failed to get MCP capabilities: ${mcp.name}`, error);
      }
    }

    return capabilities;
  }

  /**
   * Build observer prompt
   */
  private buildObserverPrompt(state: WorkflowState): string {
    const lastStep = state.executionHistory[state.executionHistory.length - 1];
    
    return `You are an intelligent observer responsible for analyzing task execution results and determining completion status.

## Task Information
- Original Query: ${state.originalQuery}
- Current Objective: ${state.currentObjective}
- Executed Steps: ${state.executionHistory.length}

## Execution History
${state.executionHistory.map(step => `
Step ${step.stepNumber}: ${step.plan.tool} (${step.plan.toolType})
- Execution Status: ${step.success ? 'Success' : 'Failed'}
- Plan: ${step.plan.reasoning}
- Result Type: ${step.success ? typeof step.result : 'Failed'}
`).join('\n')}

## Latest Execution Result
${lastStep ? `
Step ${lastStep.stepNumber}: ${lastStep.plan.tool}
- Execution Status: ${lastStep.success ? 'Success' : 'Failed'}
- Plan: ${lastStep.plan.reasoning}
- Result: ${lastStep.success ? JSON.stringify(lastStep.result).substring(0, 1000) + '...' : lastStep.error}
` : 'No execution history yet'}

## Blackboard Data
${JSON.stringify(state.blackboard, null, 2)}

## Judgment Criteria
Please carefully analyze the current state and determine if the task is truly complete:

### 🔍 Compound Task Recognition
**Original Task**: ${state.originalQuery}

Please carefully analyze all requirements in the original task:
- Does it contain multiple actions (e.g., analyze + record, fetch + send, compare + summarize)?
- Are there connecting words like "and", "then", "also", "simultaneously"?
- Are there multiple target platforms or tools (e.g., GitHub + Notion, Twitter + Email)?

### 📋 Completeness Check
1. **Data Fetching Tasks**: If only raw data was obtained but user requested "analysis", LLM analysis is still needed
2. **Analysis Tasks**: If user requested analysis, comparison, summary, ensure LLM analysis step is completed
3. **Storage/Recording Tasks**: If user requested "record to xxx", "save to xxx", "send to xxx", ensure storage operation is executed
4. **Multi-step Tasks**: Check if all necessary steps are completed
5. **Result Completeness**: Check if results answer all user requirements

### ⚠️ Common Missing Scenarios
- ✅ Analyzed GitHub issues → ❌ But not recorded to Notion
- ✅ Fetched price data → ❌ But not sent to Twitter
- ✅ Compared two projects → ❌ But not generated report document
- ✅ Analyzed code → ❌ But not created GitHub issue

### 🎯 Key Judgment Principle
**Only when ALL requirements in the original task are completed can the task be considered complete!**

Please return in format:
{
  "isComplete": true/false,
  "reasoning": "detailed reasoning for the judgment",
  "nextObjective": "next objective (if not complete)",
  "finalAnswer": "final answer (if complete)"
}`;
  }

  /**
   * Parse plan
   */
  private parsePlan(content: string): ExecutionPlan {
    try {
      // 🔧 General JSON parsing: supports multiple formats
      const cleanedJson = this.extractAndCleanJson(content);
      if (!cleanedJson) {
        throw new Error('No valid JSON structure found in response');
      }
      
      const parsed = JSON.parse(cleanedJson);
      
      // 🔧 General parsing: supports multiple data structures
      return this.normalizeToExecutionPlan(parsed);
      
    } catch (error) {
      logger.warn(`Plan parsing failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn(`Original content: ${content.substring(0, 200)}...`);
      
      // General fallback strategy
      return this.generateIntelligentFallbackPlan(content);
    }
  }

  /**
   * Extract and clean JSON content
   */
  private extractAndCleanJson(content: string): string | null {
    let text = content.trim();
    
    // Remove markdown code blocks
    text = text.replace(/```json\s*|\s*```/g, '');
    text = text.replace(/```\s*|\s*```/g, '');
    
    // Find JSON structure (array or object)
    const jsonMatch = text.match(/[\[\{][\s\S]*[\]\}]/);
    if (!jsonMatch) {
      return null;
    }
    
    // Clean and fix JSON
    return this.fixJsonFormat(jsonMatch[0]);
  }

  /**
   * Normalize parsed data to execution plan
   */
  private normalizeToExecutionPlan(parsed: any): ExecutionPlan {
    // Handle array format (workflow step list)
    if (Array.isArray(parsed)) {
      const firstStep = parsed[0];
      if (!firstStep) {
        throw new Error('Empty array in parsed plan');
      }
      return this.convertStepToExecutionPlan(firstStep);
    }
    
    // Handle object format
    if (typeof parsed === 'object' && parsed !== null) {
      return this.convertStepToExecutionPlan(parsed);
    }
    
    throw new Error('Invalid parsed plan structure');
  }

  /**
   * Convert step object to standard execution plan
   */
  private convertStepToExecutionPlan(step: any): ExecutionPlan {
    // Generic field mapping
    const tool = step.tool || step.action || step.name || 'llm.process';
    const mcpName = step.mcpName || step.mcp || step.service;
    const args = step.args || step.parameters || step.params || step.input || {};
    const output = step.expectedOutput || step.objective || step.goal || step.description || 'Task result';
    const reasoning = step.reasoning || step.rationale || step.explanation || output;
    
    // Determine tool type
    let toolType: 'llm' | 'mcp' = 'llm';
    let finalTool = tool;
    
    if (mcpName) {
      toolType = 'mcp';
      // If tool name doesn't contain MCP name, combine them
      if (!tool.includes(mcpName)) {
        finalTool = `${mcpName}.${tool}`;
      }
    } else if (tool.includes('.') || tool.includes('-mcp')) {
      toolType = 'mcp';
      // Try to extract MCP name from tool name
      const parts = tool.split('.');
      if (parts.length > 1) {
        // Extract from "mcp-name.tool-name" format
        return {
          tool: finalTool,
          toolType,
          mcpName: parts[0],
          args,
          expectedOutput: output,
          reasoning
        };
      }
    }
    
    return {
      tool: finalTool,
      toolType,
      mcpName,
      args,
      expectedOutput: output,
      reasoning
    };
  }

  /**
   * Generic JSON format fix
   */
  private fixJsonFormat(jsonText: string): string {
    let fixed = jsonText;
    
    // Remove comments (single and multi-line)
    fixed = fixed.replace(/\/\/[^\n\r]*/g, '');
    fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix unreferenced property names (but keep already correctly referenced)
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, (match, prefix, prop) => {
      // If property name is already surrounded by quotes, don't process again
      if (prop.startsWith('"') && prop.endsWith('"')) {
        return match;
      }
      return `${prefix}"${prop}":`;
    });
    
    // Fix single quotes to double quotes (but be careful with string content)
    fixed = fixed.replace(/'/g, '"');
    
    // Fix extra commas
    fixed = fixed.replace(/,+/g, ',');
    
    // Fix line breaks and special characters
    fixed = fixed.replace(/\n/g, '\\n');
    fixed = fixed.replace(/\r/g, '\\r');
    fixed = fixed.replace(/\t/g, '\\t');
    
    // Fix unescaped quotes (in string values)
    // This is a simplified handling, more complex cases may require more detailed parsing
    
    return fixed.trim();
  }

  /**
   * Generate general intelligent fallback plan
   */
  private generateIntelligentFallbackPlan(content: string): ExecutionPlan {
    // General fallback strategy: always fall back to LLM processing
    // LLM can handle any type of content, then re-plan in the next iteration
    return {
      tool: 'llm.process',
      toolType: 'llm',
      args: { 
        content: content,
        instruction: 'Process the content and determine the next appropriate action based on available tools and workflow context.'
      },
      expectedOutput: 'Processing result with next action recommendation',
      reasoning: 'JSON parsing failed, using LLM processing to understand content and determine next steps'
    };
  }

  /**
   * Parse observation result
   */
  private parseObservation(content: string): { isComplete: boolean; nextObjective?: string; finalAnswer?: string } {
    try {
      // 🔧 Enhanced JSON parsing: using the same cleaning logic
      let jsonText = content.trim();
      
      // Remove markdown code block markers
      jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
      jsonText = jsonText.replace(/```\s*|\s*```/g, '');
      
      // Find JSON content
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let cleanJson = jsonMatch[0];
        
        // Fix common JSON format issues
        cleanJson = this.fixJsonFormat(cleanJson);
        
        const observation = JSON.parse(cleanJson);
        
        // Record Observer's reasoning process
        if (observation.reasoning) {
          logger.info(`🤔 Observer reasoning: ${observation.reasoning}`);
        }
        
        return {
          isComplete: observation.isComplete || false,
          nextObjective: observation.nextObjective,
          finalAnswer: observation.finalAnswer
        };
      }
    } catch (error) {
      logger.warn(`Observation parsing failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn(`Original content: ${content.substring(0, 200)}...`);
    }

    // More intelligent default judgment logic
    return this.intelligentCompletionCheck(content);
  }

  /**
   * Intelligent completion status check
   */
  private intelligentCompletionCheck(content: string): { isComplete: boolean; nextObjective?: string; finalAnswer?: string } {
    // Check for explicit completion signals
    const explicitComplete = /task complete|analysis complete|execution complete|completed|all steps completed|workflow complete/i.test(content);
    
    // Check for explicit continuation signals
    const explicitContinue = /need to continue|continue analysis|next step|not complete|missing step|still need to/i.test(content);
    
    if (explicitComplete) {
      return {
        isComplete: true,
        finalAnswer: content
      };
    }
    
    if (explicitContinue) {
      return {
        isComplete: false,
        nextObjective: content
      };
    }
    
    // 🔧 Key fix: Intelligent judgment for compound tasks
    // If content contains error, failure or missing signals, task is not complete
    const hasErrors = /error|failed|403|500|failed to|unable to|cannot|could not|missing|not found/i.test(content);
    if (hasErrors) {
      return {
        isComplete: false,
        nextObjective: 'Need to handle errors or complete missing steps'
      };
    }
    
    // Check if it's only data fetching step (usually not complete task)
    const isDataOnly = /fetched|retrieved|got data|obtained|collected|gathered/i.test(content) &&
                      !/posted|sent|published|created|saved|recorded|analyzed|summarized/i.test(content);
    
    if (isDataOnly && content.length < 500) {
      return {
        isComplete: false,
        nextObjective: 'Data has been obtained, need to proceed with next step (such as analysis, publish, save, etc.)'
      };
    }
    
    // Default: judge based on content complexity, but more conservative
    if (content.length < 50) {
      return {
        isComplete: false,
        nextObjective: 'Need more detailed analysis or processing'
      };
    }
    
    // For longer content, still need to check for explicit results
    const hasActionResults = /posted|sent|published|created|saved|recorded|tweet|message|notification/i.test(content);
    
    if (hasActionResults) {
      return {
        isComplete: true,
        finalAnswer: content
      };
    }
    
    // If only data description without explicit action results, may need to continue
    return {
      isComplete: false,
      nextObjective: 'Data has been obtained, may need to execute additional operations (such as publish, save or analyze)'
    };
  }

  /**
   * Execute MCP tool
   */
  private async executeMCPTool(plan: ExecutionPlan, state: WorkflowState): Promise<any> {
    if (!plan.mcpName) {
      throw new Error('MCP tool requires mcpName to be specified');
    }

    logger.info(`⚡ Calling MCP tool: ${plan.tool} (from ${plan.mcpName})`);
    
    // Get user ID
    let userId: string | undefined;
    if (state.taskId) {
      const task = await this.taskService.getTaskById(state.taskId);
      userId = task?.userId;
    }
    
    // Check if MCP is connected, auto-connect if not
    const connectedMCPs = this.mcpManager.getConnectedMCPs(userId);
    const isConnected = connectedMCPs.some(mcp => mcp.name === plan.mcpName);
    
    if (!isConnected) {
      logger.info(`🔗 MCP ${plan.mcpName} not connected, attempting auto-connection...`);
      try {
        await this.autoConnectMCP(plan.mcpName, state.taskId, userId);
        logger.info(`✅ MCP ${plan.mcpName} connection successful`);
      } catch (connectError) {
        logger.error(`❌ MCP ${plan.mcpName} connection failed:`, connectError);
        throw new Error(`Failed to connect to MCP ${plan.mcpName}: ${connectError instanceof Error ? connectError.message : 'Unknown error'}`);
      }
    }
    
    // Verify connection status again
    const connectedAfterAttempt = this.mcpManager.getConnectedMCPs(userId).some(mcp => mcp.name === plan.mcpName);
    if (!connectedAfterAttempt) {
      throw new Error(`MCP ${plan.mcpName} is not connected after connection attempt`);
    }
    
    try {
      // 🔧 Key fix: Get actual tool list for MCP
      const actualTools = await this.mcpManager.getTools(plan.mcpName, userId);
      logger.info(`📋 ${plan.mcpName} actual available tools: ${actualTools.map(t => t.name).join(', ')}`);
      
      // 🔧 Verify tool exists, if not let LLM re-select
      let selectedTool = actualTools.find(t => t.name === plan.tool);
      let finalToolName = plan.tool;
      let finalArgs = plan.args;
      
      if (!selectedTool) {
        logger.warn(`Tool ${plan.tool} does not exist in ${plan.mcpName}, using LLM to re-select...`);
        
        // Try fuzzy matching
        const fuzzyMatch = actualTools.find(t => 
          t.name.toLowerCase().includes(plan.tool.toLowerCase()) ||
          plan.tool.toLowerCase().includes(t.name.toLowerCase())
        );
        
        if (fuzzyMatch) {
          logger.info(`Found fuzzy match: ${fuzzyMatch.name}`);
          selectedTool = fuzzyMatch;
          finalToolName = fuzzyMatch.name;
        } else {
          // Use LLM to re-select tool
          logger.info(`Using LLM to re-select appropriate tool...`);
          const toolSelectionResult = await this.selectCorrectTool(
            plan.tool, 
            plan.args, 
            actualTools, 
            state.currentObjective
          );
          
          selectedTool = actualTools.find(t => t.name === toolSelectionResult.toolName);
          if (selectedTool) {
            finalToolName = toolSelectionResult.toolName;
            finalArgs = toolSelectionResult.inputParams;
            logger.info(`LLM re-selected tool: ${finalToolName}`);
          } else {
            throw new Error(`Cannot find suitable tool in ${plan.mcpName} to execute task: ${plan.tool}`);
          }
        }
      }
      
      logger.info(`🔧 Final tool call: ${finalToolName} (parameters: ${JSON.stringify(finalArgs)})`);
      
      const result = await this.mcpToolAdapter.callTool(
        plan.mcpName,
        finalToolName,
        finalArgs,
        userId
      );

      // 🔧 新增：x-mcp自动发布处理
      const processedResult = await this.handleXMcpAutoPublish(plan.mcpName, finalToolName, result, userId);

      return processedResult;
    } catch (error) {
      logger.error(`❌ MCP tool call failed [${plan.mcpName}]:`, error);
      throw error;
    }
  }

  /**
   * 从文本中提取draft_id的辅助方法
   */
  private extractDraftIdFromText(text: string): string | null {
    const patterns = [
      /draft[_-]?id["\s:]*([^"\s,}]+)/i,                    // draft_id: "xxx" 
      /with\s+id\s+([a-zA-Z0-9_.-]+\.json)/i,               // "with ID thread_draft_xxx.json"
      /created\s+with\s+id\s+([a-zA-Z0-9_.-]+\.json)/i,     // "created with ID xxx.json"
      /id[:\s]+([a-zA-Z0-9_.-]+\.json)/i,                   // "ID: xxx.json" 或 "ID xxx.json"
      /([a-zA-Z0-9_.-]*draft[a-zA-Z0-9_.-]*\.json)/i        // 任何包含draft的.json文件
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * x-mcp自动发布处理：当create_draft_tweet或create_draft_thread成功后自动发布
   */
  private async handleXMcpAutoPublish(
    mcpName: string, 
    toolName: string, 
    result: any, 
    userId?: string
  ): Promise<any> {
    // 🔧 添加详细调试信息
    logger.info(`🔍 X-MCP Auto-publish Check: mcpName="${mcpName}", toolName="${toolName}"`);
    
    // 只处理x-mcp的草稿创建操作
    if (mcpName !== 'x-mcp') {
      logger.info(`❌ X-MCP Auto-publish: MCP name "${mcpName}" is not "x-mcp", skipping auto-publish`);
      return result;
    }

    // 检查是否是草稿创建操作
    if (!toolName.includes('create_draft')) {
      logger.info(`❌ X-MCP Auto-publish: Tool name "${toolName}" does not include "create_draft", skipping auto-publish`);
      return result;
    }

    try {
      logger.info(`🔄 X-MCP Auto-publish: Detected ${toolName} completion, attempting auto-publish...`);

      // 提取draft_id
      let draftId = null;
      if (result && typeof result === 'object') {
        // 尝试从不同的结果格式中提取draft_id
        if (result.draft_id) {
          draftId = result.draft_id;
        } else if (result.content && Array.isArray(result.content)) {
          // MCP标准格式
          for (const content of result.content) {
            if (content.text) {
                          try {
              const parsed = JSON.parse(content.text);
              if (parsed.draft_id) {
                draftId = parsed.draft_id;
                break;
              } else if (Array.isArray(parsed)) {
                // 🔧 处理解析成功但是数组结构的情况
                for (const nestedItem of parsed) {
                  if (nestedItem && nestedItem.text) {
                    const innerText = nestedItem.text;
                    const innerMatch = this.extractDraftIdFromText(innerText);
                    if (innerMatch) {
                      draftId = innerMatch;
                      logger.info(`📝 WorkflowEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
                      break;
                    }
                  }
                }
                if (draftId) break;
              }
            } catch {
                // 🔧 修复：处理嵌套JSON结构和文本提取
                let text = content.text;
                
                // 🔧 处理双重嵌套的JSON情况：text字段本身是JSON字符串
                try {
                  // 尝试解析text作为JSON数组
                  const nestedArray = JSON.parse(text);
                  if (Array.isArray(nestedArray)) {
                    // 遍历嵌套数组，寻找包含draft信息的文本
                    for (const nestedItem of nestedArray) {
                      if (nestedItem && nestedItem.text) {
                        const innerText = nestedItem.text;
                        // 先尝试从内层文本提取draft_id
                        const innerMatch = this.extractDraftIdFromText(innerText);
                        if (innerMatch) {
                          draftId = innerMatch;
                          logger.info(`📝 WorkflowEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from nested JSON structure`);
                          break;
                        }
                      }
                    }
                  }
                } catch {
                  // 如果不是JSON，继续用原文本进行模式匹配
                }
                
                // 如果嵌套解析没有找到，用原文本进行模式匹配
                if (!draftId) {
                  draftId = this.extractDraftIdFromText(text);
                  if (draftId) {
                    logger.info(`📝 WorkflowEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from text pattern matching`);
                  }
                }
                
                if (draftId) break;
              }
            }
          }
        }
      }
      
      // 🔧 修复：处理字符串类型的result
      if (!draftId && typeof result === 'string') {
        // 从字符串结果中提取
        try {
          const parsed = JSON.parse(result);
          if (parsed.draft_id) {
            draftId = parsed.draft_id;
          }
        } catch {
          // 🔧 修复：处理嵌套JSON和字符串文本中提取draft ID
          draftId = this.extractDraftIdFromText(result);
          if (draftId) {
            logger.info(`📝 WorkflowEngine X-MCP Auto-publish: Extracted draft_id "${draftId}" from string pattern matching`);
          }
        }
      }

      if (!draftId) {
        logger.warn(`⚠️ X-MCP Auto-publish: Could not extract draft_id from result: ${JSON.stringify(result)}`);
        return result;
      }

      logger.info(`📝 X-MCP Auto-publish: Extracted draft_id: ${draftId}`);

            // 调用publish_draft
      logger.info(`🚀 X-MCP Auto-publish: Publishing draft ${draftId}...`);
      
      const publishInput = { draft_id: draftId };
      logger.info(`📝 WorkflowEngine X-MCP Auto-publish INPUT: ${JSON.stringify(publishInput, null, 2)}`);
      
      const publishResult = await this.mcpToolAdapter.callTool(
        mcpName,
        'publish_draft',
        publishInput,
        userId
      );
      
      logger.info(`📤 WorkflowEngine X-MCP Auto-publish OUTPUT: ${JSON.stringify(publishResult, null, 2)}`);

      logger.info(`✅ X-MCP Auto-publish: Successfully published draft ${draftId}`);

      // 返回合并的结果
      return {
        draft_creation: result,
        auto_publish: publishResult,
        combined_result: `Draft created and published successfully. Draft ID: ${draftId}`,
        draft_id: draftId,
        published: true
      };

    } catch (error) {
      logger.error(`❌ X-MCP Auto-publish failed:`, error);
      
      // 即使发布失败，也返回原始的草稿创建结果
      return {
        draft_creation: result,
        auto_publish_error: error instanceof Error ? error.message : String(error),
        combined_result: `Draft created successfully but auto-publish failed. You may need to publish manually.`,
        published: false
      };
    }
  }

  /**
   * Auto-connect MCP (with user authentication injection)
   */
  private async autoConnectMCP(mcpName: string, taskId?: string, userId?: string): Promise<void> {
    const mcpConfig = getPredefinedMCP(mcpName);
    if (!mcpConfig) {
      throw new Error(`MCP configuration not found: ${mcpName}`);
    }

    logger.info(`🔗 Auto-connecting MCP: ${mcpName} (user: ${userId || 'default'})`);
    
    try {
      // Dynamically inject user authentication information
      const dynamicEnv = await this.injectUserAuthentication(mcpConfig, taskId, userId);
      
      // Process environment variable replacement in args
      const dynamicArgs = await this.injectArgsAuthentication(mcpConfig.args || [], dynamicEnv, taskId);
      
      // Create MCP configuration with dynamic environment variables and args
      const dynamicMcpConfig = {
        ...mcpConfig,
        env: dynamicEnv,
        args: dynamicArgs
      };
      
      // Try to connect MCP, pass userId
      const connected = await this.mcpManager.connectPredefined(dynamicMcpConfig, userId);
      if (!connected) {
        throw new Error(`Failed to connect to MCP ${mcpName} for user ${userId || 'default'}. Please ensure the MCP server is installed and configured correctly.`);
      }
      
      logger.info(`✅ MCP connection successful: ${mcpName} (user: ${userId || 'default'})`);
    } catch (error) {
      logger.error(`❌ MCP connection failed: ${mcpName} (user: ${userId || 'default'})`, error);
      throw error;
    }
  }

  /**
   * Dynamically inject user authentication information
   */
  private async injectUserAuthentication(mcpConfig: any, taskId?: string, userId?: string): Promise<Record<string, string>> {
    let dynamicEnv = { ...mcpConfig.env };
    
    console.log(`\n==== Intelligent Workflow Engine - Authentication Injection Debug ====`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`MCP Name: ${mcpConfig.name}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Original Environment Variables: ${JSON.stringify(mcpConfig.env, null, 2)}`);
    
    // Check if authentication is needed
    if (mcpConfig.env) {
      const missingEnvVars: string[] = [];
      
      // Check if each environment variable is missing
      for (const [key, value] of Object.entries(mcpConfig.env)) {
        if (!value || value === '') {
          missingEnvVars.push(key);
        }
      }
      
      console.log(`Missing environment variables: ${JSON.stringify(missingEnvVars)}`);
      
      // If there are missing environment variables, try to get user authentication information from database
      if (missingEnvVars.length > 0 && taskId) {
        logger.info(`MCP needs authentication, attempting to get user auth data from database...`);
        
        try {
          const currentTask = await this.taskService.getTaskById(taskId);
          if (currentTask) {
            const userId = currentTask.userId;
            logger.info(`Got user ID from task context: ${userId}`);
            console.log(`User ID: ${userId}`);
            
            // Ensure MCPAuthService is initialized
            if (!this.mcpAuthService) {
              throw new Error('MCPAuthService not initialized');
            }
            
            const userAuth = await this.mcpAuthService.getUserMCPAuth(userId, mcpConfig.name);
            console.log(`User auth result:`, {
              hasUserAuth: !!userAuth,
              isVerified: userAuth?.isVerified,
              hasAuthData: !!userAuth?.authData
            });
            
            if (userAuth && userAuth.isVerified && userAuth.authData) {
              logger.info(`Found user ${userId} auth info for ${mcpConfig.name}, injecting environment variables...`);
              console.log(`User auth data: ${JSON.stringify(userAuth.authData, null, 2)}`);
              
              // Dynamically inject authentication information into environment variables
              for (const [envKey, envValue] of Object.entries(mcpConfig.env)) {
                console.log(`Checking environment variable: ${envKey} = "${envValue}"`);
                if ((!envValue || envValue === '') && userAuth.authData[envKey]) {
                  // 🔧 Special handling for Notion MCP's OPENAPI_MCP_HEADERS
                  if (envKey === 'OPENAPI_MCP_HEADERS' && mcpConfig.name === 'notion-mcp') {
                    const authValue = userAuth.authData[envKey];
                    console.log(`🔧 Processing Notion MCP OPENAPI_MCP_HEADERS: "${authValue}"`);
                    
                    // Check if user provided complete JSON string
                    if (authValue.startsWith('{') && authValue.endsWith('}')) {
                      // User provided complete JSON, use directly
                      dynamicEnv[envKey] = authValue;
                      console.log(`✅ Using complete JSON format: ${authValue}`);
                    } else if (authValue.startsWith('ntn_') || authValue.startsWith('secret_')) {
                      // User only provided token, build complete JSON string
                      const jsonHeaders = JSON.stringify({
                        "Authorization": `Bearer ${authValue}`,
                        "Notion-Version": "2022-06-28"
                      });
                      dynamicEnv[envKey] = jsonHeaders;
                      console.log(`✅ Auto-built JSON format: ${jsonHeaders}`);
                      logger.info(`Auto-built Notion auth JSON: ${jsonHeaders}`);
                    } else {
                      // Try to parse as JSON, if fails treat as token
                      try {
                        JSON.parse(authValue);
                        dynamicEnv[envKey] = authValue;
                        console.log(`✅ Verified valid JSON format: ${authValue}`);
                      } catch {
                        // Treat as token
                        const jsonHeaders = JSON.stringify({
                          "Authorization": `Bearer ${authValue}`,
                          "Notion-Version": "2022-06-28"
                        });
                        dynamicEnv[envKey] = jsonHeaders;
                        console.log(`✅ Parse failed, treating as token: ${jsonHeaders}`);
                      }
                    }
                  } else {
                    // Normal handling for other MCPs
                    dynamicEnv[envKey] = userAuth.authData[envKey];
                    console.log(`✅ Injected ${envKey} = "${userAuth.authData[envKey]}"`);
                  }
                  logger.info(`Injected environment variable ${envKey}`);
                } else {
                  console.log(`❌ Not injecting ${envKey}: envValue="${envValue}", auth data has key: ${!!userAuth.authData[envKey]}`);
                }
              }
              
              const stillMissingVars = missingEnvVars.filter(key => !dynamicEnv[key] || dynamicEnv[key] === '');
              if (stillMissingVars.length === 0) {
                logger.info(`✅ Successfully injected all required auth info for ${mcpConfig.name}`);
                console.log(`✅ All required auth info injected successfully`);
              } else {
                console.log(`❌ Still missing variables: ${JSON.stringify(stillMissingVars)}`);
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
    
    console.log(`Final dynamic environment variables: ${JSON.stringify(dynamicEnv, null, 2)}`);
    return dynamicEnv;
  }
  
  /**
   * Dynamically inject authentication information in args
   */
  private async injectArgsAuthentication(originalArgs: string[], dynamicEnv: Record<string, string>, taskId?: string): Promise<string[]> {
    if (!originalArgs || originalArgs.length === 0) {
      return originalArgs;
    }
    
    console.log(`\n==== Intelligent Workflow Engine - Args Authentication Injection Debug ====`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Original Args: ${JSON.stringify(originalArgs, null, 2)}`);
    console.log(`Dynamic Environment Variables: ${JSON.stringify(dynamicEnv, null, 2)}`);
    
    // Create a copy of args for processing
    const dynamicArgs = [...originalArgs];
    
    // Iterate through each arg, find and replace environment variable references
    for (let i = 0; i < dynamicArgs.length; i++) {
      const arg = dynamicArgs[i];
      
      // Find parameters containing process.env.*
      if (typeof arg === 'string' && arg.includes('process.env.')) {
        console.log(`Processing arg ${i}: "${arg}"`);
        
        // Use regex to find all process.env.VARIABLE_NAME references
        const envVarRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
        let modifiedArg = arg;
        let match;
        
        while ((match = envVarRegex.exec(arg)) !== null) {
          const envVarName = match[1]; // Environment variable name
          const fullMatch = match[0]; // Full matched string
          
          console.log(`Found environment variable reference: ${fullMatch} (variable: ${envVarName})`);
          
          // First check if dynamicEnv has value
          if (dynamicEnv[envVarName]) {
            const newValue = dynamicEnv[envVarName];
            modifiedArg = modifiedArg.replace(fullMatch, newValue);
            console.log(`✅ Replaced ${fullMatch} with "${newValue}"`);
          } else {
            // If not in dynamicEnv, try to get from process.env
            const processEnvValue = process.env[envVarName] || '';
            modifiedArg = modifiedArg.replace(fullMatch, processEnvValue);
            console.log(`⚠️ Used process.env value for ${envVarName}: "${processEnvValue}"`);
          }
        }
        
        // If parameter was modified, update it
        if (modifiedArg !== arg) {
          dynamicArgs[i] = modifiedArg;
          console.log(`Updated arg ${i}: "${arg}" -> "${modifiedArg}"`);
        }
      }
    }
    
    console.log(`Final dynamic args: ${JSON.stringify(dynamicArgs, null, 2)}`);
    return dynamicArgs;
  }

  /**
   * Extract useful data from previous step result for next step
   */
  private async extractUsefulDataFromResult(prevResult: any, nextAction: string, workflowState?: WorkflowState): Promise<any> {
    try {
      // Get raw result
      let rawResult = prevResult.result;
      
      // 🔧 Major optimization: use LLM to intelligently extract content instead of hardcoding assumptions
      logger.info(`🤖 Using LLM to intelligently extract and transform data for next action: ${nextAction}`);
      
      // Get current MCP tool information
      let toolInfo = null;
      try {
        const connectedMCPs = this.mcpManager.getConnectedMCPs();
        for (const mcp of connectedMCPs) {
          const tools = await this.mcpManager.getTools(mcp.name);
          const targetTool = tools.find((t: any) => t.name === nextAction);
          if (targetTool) {
            toolInfo = targetTool;
            break;
          }
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to get tool info for ${nextAction}:`, error);
      }
      
      // 🔧 Core improvement: build intelligent data extraction and transformation prompt
      const intelligentExtractionPrompt = this.buildIntelligentExtractionPrompt(rawResult, nextAction, toolInfo, workflowState);

      const response = await this.llm.invoke([
        new SystemMessage(intelligentExtractionPrompt)
      ]);

      let transformedData;
      try {
        const responseText = response.content.toString().trim();
        
        // Clean possible markdown format wrappers
        let cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        
        // Try to extract JSON object
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        }
        
        const parsed = JSON.parse(cleanedText);
        transformedData = parsed.extractedData || parsed.transformedData || parsed;
        
        logger.info(`🎯 LLM intelligent extraction successful: ${JSON.stringify(transformedData, null, 2)}`);
        logger.info(`💭 Extraction reasoning: ${parsed.reasoning || 'No reasoning provided'}`);
        
      } catch (parseError) {
        logger.error(`❌ LLM extraction result parsing failed:`, parseError);
        logger.error(`Original response: ${response.content}`);
        
        // Degradation handling: return simplified raw data
        if (typeof rawResult === 'string') {
          transformedData = { content: rawResult };
        } else if (typeof rawResult === 'object') {
        transformedData = rawResult;
        } else {
          transformedData = { data: String(rawResult) };
      }

        logger.info(`🚨 Using degraded result: ${JSON.stringify(transformedData, null, 2)}`);
      }

      return transformedData;
    } catch (error) {
      logger.error(`❌ Intelligent data extraction failed:`, error);
      
      // Final degradation: return raw result
      return prevResult.result || {};
    }
  }

  /**
   * Build intelligent data extraction and transformation prompt
   */
  private buildIntelligentExtractionPrompt(rawResult: any, nextAction: string, toolInfo: any, workflowState?: WorkflowState): string {
    // Analyze workflow context
    const userGoal = workflowState?.originalQuery || workflowState?.currentObjective || 'Complete the workflow';
    const currentStep = (workflowState?.executionHistory?.length || 0) + 1;
    const totalContext = this.formatExecutionProgress(workflowState);
      
    // Prepare tool schema information
    const toolSchemaInfo = toolInfo ? `
**Next Tool Schema**: ${JSON.stringify(toolInfo.inputSchema || {}, null, 2)}
**Tool Description**: ${toolInfo.description || 'No description available'}` : `
**Next Tool**: ${nextAction} (schema not available)`;

    return `You are an expert data extraction and transformation specialist working within an intelligent workflow engine. Your task is to analyze the raw output from the previous step and intelligently extract the most relevant data for the next tool.

## 🎯 WORKFLOW CONTEXT
**User's Goal**: "${userGoal}"
**Current Progress**: ${totalContext}
**Next Action**: ${nextAction}

## 📥 PREVIOUS STEP RAW OUTPUT
\`\`\`
${typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)}
\`\`\`

${toolSchemaInfo}

## 🧠 INTELLIGENT EXTRACTION PRINCIPLES

### 1. **Format-Agnostic Analysis**
- DO NOT assume any specific format structure
- Analyze the actual content regardless of wrapper format
- Handle JSON objects, arrays, strings, or mixed formats
- Extract meaningful data from any MCP response structure

### 2. **Context-Aware Extraction**
- Consider the user's ultimate goal
- Focus on data that advances the workflow
- Maintain relevance to the next tool's purpose
- Preserve critical information for downstream steps

### 3. **Smart Data Recognition**
- Identify and extract:
  * Key business data (prices, names, IDs, addresses)
  * Actionable information (tweets, posts, content)
  * Structured data (lists, tables, relationships)
  * Error messages or status information
- Ignore:
  * Technical metadata (timestamps, request IDs, debug info)
  * Wrapper objects that don't contain actual data
  * Redundant or duplicate information

### 4. **Next-Tool Optimization**
- For **Social Media Tools** (tweet, post): Extract key insights, format for engagement
- For **Data Retrieval Tools**: Extract identifiers, parameters, search terms
- For **Analysis Tools**: Extract raw data for processing
- For **Action Tools**: Extract confirmation data, IDs, results

### 5. **Parameter Mapping Intelligence**
- If tool schema is available: Map data to exact parameter names
- If no schema: Use common parameter patterns (text, content, data, query, etc.)
- Handle missing required data: Extract from context or provide reasonable defaults
- Respect tool constraints (character limits, data types, format requirements)

## 📤 OUTPUT FORMAT
Return a JSON object with this exact structure:
\`\`\`json
{
  "extractedData": {
    // The actual parameters/data for the next tool
    // Mapped to tool schema if available
    // Otherwise using common parameter names
  },
  "reasoning": "Brief explanation of what was extracted and why",
  "dataSource": "Description of where the key data came from in the raw result",
  "confidence": "high|medium|low - confidence in the extraction quality"
}
\`\`\`

## 🚨 CRITICAL REQUIREMENTS
1. **NO FORMAT ASSUMPTIONS**: Don't assume content.0.text or any specific structure
2. **INTELLIGENT ANALYSIS**: Use AI to understand what the data represents
3. **GOAL-ORIENTED**: Always consider how this data helps achieve the user's goal
4. **ERROR-RESILIENT**: Handle unexpected formats gracefully
5. **PRESERVE VALUE**: Don't lose important information in the transformation

Analyze the raw result and extract the most valuable data for the next step:`;
  }

  /**
   * Format execution progress
   */
  private formatExecutionProgress(workflowState?: WorkflowState): string {
    if (!workflowState || !workflowState.executionHistory || workflowState.executionHistory.length === 0) {
      return 'Starting workflow execution';
      }
      
    const history = workflowState.executionHistory;
    const currentStep = history.length + 1;
    const recentSteps = history.slice(-2).map(step => 
      `${step.plan.tool}(${step.success ? '✓' : '✗'})`
    ).join(' → ');
    
    return `Step ${currentStep} | Recent: ${recentSteps}`;
  }

  /**
   * Parse result data to structured format (ported from traditional executor)
   * @param result Original result
   * @returns Parsed structured data
   */
  private parseResultData(result: any): any {
    try {
      if (typeof result === 'string') {
        // Try to parse JSON
        const parsed = JSON.parse(result);
        
        // Extract key data
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
      // If not JSON, return raw data
      return { rawData: result };
    }
  }

  /**
   * Use LLM to select correct tool (reference traditional executor approach)
   */
  private async selectCorrectTool(
    originalTool: string,
    originalArgs: any,
    availableTools: any[],
    objective: string
  ): Promise<{ toolName: string; inputParams: any; reasoning: string }> {
    try {
      const toolSelectionPrompt = `You are an expert data transformation assistant. Your task is to intelligently transform the output from one tool into the appropriate input for the next tool in a workflow chain.

CONTEXT:
- Previous step output: ${typeof originalArgs === 'string' ? originalArgs : JSON.stringify(originalArgs, null, 2)}
- Next action: ${objective}
- Available tools with their schemas:
${availableTools.map(tool => {
  const schema = tool.inputSchema || {};
  return `
Tool: ${tool.name}
Description: ${tool.description || 'No description'}
Input Schema: ${JSON.stringify(schema, null, 2)}
`;
}).join('\n')}

TRANSFORMATION PRINCIPLES:
1. **Select the correct tool**: Choose the most appropriate tool from available options
2. **Transform parameters**: Convert previous output into correct input format for the selected tool
3. **CRITICAL: Use exact parameter names from the schema**: 
   - For example, if the schema shows "text" as parameter name, use "text" NOT "tweet" or other variations
   - Match the exact property names shown in the inputSchema
4. **Handle missing data intelligently**: 
   - For IDs/references: Use clear placeholders like "REQUIRED_[TYPE]_ID" 
   - For optional fields: Omit or use reasonable defaults
   - For required fields: Extract from context or use descriptive placeholders

5. **Format according to tool expectations**:
   - API tools: Return structured JSON matching the API schema
   - Content tools: Return plain text or formatted content
   - Social media: Return concise, engaging text
   - Database tools: Return properly structured data objects

SMART DATA HANDLING:
- Extract and transform actual data from previous outputs
- Only use placeholders when absolutely necessary
- Focus on what the specific tool actually needs

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

      const response = await this.llm.invoke([
        new SystemMessage(toolSelectionPrompt)
      ]);

      let toolSelection;
      try {
        const responseText = response.content.toString().trim();
        // Clean possible markdown format
        const cleanedText = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*$/g, '')
          .trim();
        toolSelection = JSON.parse(cleanedText);
      } catch (parseError) {
        logger.error(`Failed to parse tool selection response: ${response.content}`);
        // Fallback to simple selection
        const fallbackPrompt = `Available tools: ${availableTools.map(t => t.name).join(', ')}\nObjective: ${objective}\nSelect exact tool name only:`;
        const fallbackResponse = await this.llm.invoke([new SystemMessage(fallbackPrompt)]);
        const fallbackToolName = fallbackResponse.content.toString().trim();
        toolSelection = {
          toolName: fallbackToolName,
          inputParams: originalArgs,
          reasoning: "Fallback selection due to parsing error"
        };
      }

      return {
        toolName: toolSelection.toolName || originalTool,
        inputParams: toolSelection.inputParams || originalArgs,
        reasoning: toolSelection.reasoning || "No reasoning provided"
      };

    } catch (error) {
      logger.error(`LLM tool selection failed:`, error);
      // Final fallback: use first available tool
      if (availableTools.length > 0) {
          return {
          toolName: availableTools[0].name,
          inputParams: originalArgs,
          reasoning: `Due to LLM selection failure, using first available tool: ${availableTools[0].name}`
        };
      }
      throw new Error('No available tools and LLM selection failed');
    }
  }

  /**
   * Execute LLM tool - Universal dynamic execution
   */
  private async executeLLMTool(plan: ExecutionPlan, state: WorkflowState): Promise<any> {
    const toolName = plan.tool.replace('llm.', '');
    
    logger.info(`🤖 Executing universal LLM tool: ${toolName}`);
    
    // Build universal LLM execution prompt
    const universalPrompt = this.buildUniversalLLMPrompt(toolName, plan, state);
    
    try {
      const response = await this.llm.invoke([new SystemMessage(universalPrompt)]);
      const result = response.content as string;
      
      logger.info(`✅ LLM tool ${toolName} executed successfully`);
      
      // Intelligently try to parse JSON from any LLM response
      try {
        // Look for JSON blocks in the response (handles markdown code blocks too)
        const jsonMatch = result.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```|\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          // Use the captured group if available, otherwise the full match
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          const parsed = JSON.parse(jsonStr);
          logger.info(`📊 Successfully parsed structured output for ${toolName}`);
          return parsed;
        }
      } catch (parseError) {
        // JSON parsing failed, continue with text output
        logger.debug(`📝 JSON parsing failed for ${toolName}, returning text output`);
      }
      
      return result;

    } catch (error) {
      logger.error(`❌ LLM tool ${toolName} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Build universal LLM execution prompt - supports any LLM capability
   */
  private buildUniversalLLMPrompt(toolName: string, plan: ExecutionPlan, state: WorkflowState): string {
    // Get workflow context
    const userGoal = state.originalQuery || state.currentObjective;
    const currentStep = (state.executionHistory?.length || 0) + 1;
    const hasHistory = state.executionHistory && state.executionHistory.length > 0;
    const previousResults = hasHistory ? state.blackboard.lastResult : null;
    
    // Build base prompt
    let prompt = `You are an expert AI assistant capable of performing any text-based task. Your current task is: "${toolName}".

## 🎯 CONTEXT
**User's Goal**: ${userGoal}
**Current Step**: ${currentStep}
**Task Type**: ${toolName}

## 📥 INPUT DATA
`;

    // Add input data based on args
    if (plan.args) {
      for (const [key, value] of Object.entries(plan.args)) {
        prompt += `**${key}**: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`;
      }
    }

    // Add previous results if available
    if (previousResults) {
      prompt += `\n## 📋 PREVIOUS STEP RESULTS
${typeof previousResults === 'string' ? previousResults : JSON.stringify(previousResults, null, 2)}
`;
    }

    // Add intelligent task instructions - completely universal approach
    prompt += `\n## 🧠 INTELLIGENT TASK EXECUTION

You are executing the task: **"${toolName}"**

**Core Intelligence Principles**:

1. **Semantic Understanding**: Analyze the task name "${toolName}" semantically to understand the intent
   - Understand meaning regardless of language (中文, English, Español, etc.)
   - Interpret creative or domain-specific terminology  
   - Recognize implicit requirements and expectations

2. **Context Integration**: Synthesize all available information
   - User's ultimate goal: "${userGoal}"
   - Current workflow progress and previous results
   - Input parameters and their relationships
   - Expected output and downstream needs

3. **Adaptive Execution**: Dynamically determine the best approach
   - Apply relevant expertise (technical, creative, analytical, etc.)
   - Choose appropriate methods and frameworks
   - Adapt complexity and detail level to requirements
   - Balance thoroughness with practical utility

4. **Value Optimization**: Maximize usefulness for the user
   - Deliver actionable and meaningful results
   - Address both explicit and implicit needs
   - Provide insights that advance the workflow
   - Ensure compatibility with subsequent steps

**Execution Strategy**: 
Leverage your full capabilities to understand and execute "${toolName}" in the context of achieving "${userGoal}". Let your expertise guide the approach, methodology, and output format to deliver maximum value.`;

    // Add intelligent output format guidance
    prompt += `\n\n## 📤 OUTPUT INTELLIGENCE

**Format Adaptability**: Choose the most appropriate output format for the task "${toolName}"
- **Structured Data** (JSON/XML): When precise data organization is needed
- **Natural Language**: When human-readable explanation is primary
- **Mixed Format**: When both structure and narrative are valuable
- **Domain-Specific**: When specialized formats serve the use case better

**Quality Standards**:
- **Clarity**: Ensure output is immediately understandable and actionable
- **Completeness**: Address all aspects of the task comprehensively  
- **Relevance**: Focus on information that advances the user's goal
- **Usability**: Format output for optimal use in subsequent workflow steps

**Intelligent Decision Making**: Analyze the task context to determine:
- What format would be most useful for downstream processing?
- How detailed should the response be given the workflow context?
- What additional insights could provide extra value?
- How can the output best serve the user's ultimate objective?`;

    // Add execution context
    if (plan.expectedOutput) {
      prompt += `\n\n**Expected Output**: ${plan.expectedOutput}`;
    }

    if (plan.reasoning) {
      prompt += `\n**Task Reasoning**: ${plan.reasoning}`;
    }

    prompt += `\n\nExecute the "${toolName}" task now:`;

    return prompt;
  }




  /**
   * Generate dynamic step description based on execution plan
   */
  private generateStepDescription(plan: ExecutionPlan): string {
    if (plan.toolType === 'mcp') {
      return `${plan.mcpName || 'unknown-mcp'}.${plan.tool}`;
    } else {
      return `llm.${plan.tool.replace('llm.', '')}`;
    }
  }



  /**
   * Stream execute intelligent workflow
   */
  async *executeWorkflowStream(
    taskId: string,
    query: string,
    maxIterations: number = 10
  ): AsyncGenerator<{ event: string; data: any }, WorkflowState, unknown> {
    logger.info(`🚀 Starting streaming intelligent workflow [Task: ${taskId}]`);

    // Initialize state - using correct type
    const initialState: WorkflowState = {
      taskId,
      originalQuery: query,
      currentObjective: query,
      messages: [] as BaseMessage[],
      executionHistory: [] as ExecutionStep[],
      blackboard: {} as Record<string, any>,
      currentPlan: null as ExecutionPlan | null,
      isComplete: false,
      maxIterations,
      currentIteration: 0,
      errors: [] as string[],
      lastError: null as string | null
    };

    let finalState = initialState; // Save final state

    try {
      // Compile graph
      const compiledGraph = this.graph.compile();

      // Stream execution - await first then for-await-of
      const stream = await compiledGraph.stream(initialState);
      for await (const step of stream) {
        const [nodeName, nodeResult] = Object.entries(step)[0];
        
        // Update final state
        finalState = nodeResult as WorkflowState;
        
        yield {
          event: 'node_complete',
          data: {
            node: nodeName,
            result: nodeResult,
            iteration: (nodeResult as any).currentIteration || 0
          }
        };

        // If execution step completed, send detailed information
        if (nodeName === 'executor' && (nodeResult as any).executionHistory) {
          const history = (nodeResult as any).executionHistory;
          const lastStep = history[history.length - 1];
          
          yield {
            event: 'step_complete',
            data: {
              step: lastStep.stepNumber,
              plan: lastStep.plan,
              result: lastStep.result,
              success: lastStep.success,
              error: lastStep.error
            }
          };
        }

        // Check if completed
        if ((nodeResult as any).isComplete) {
          yield {
            event: 'workflow_complete',
            data: {
              success: true,
              finalState: nodeResult
            }
          };
          break;
        }
      }

      return finalState; // Return actual final state

    } catch (error) {
      logger.error(`❌ Streaming intelligent workflow execution failed:`, error);
      
      yield {
        event: 'workflow_error',
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
      
      throw error;
    }
  }
}