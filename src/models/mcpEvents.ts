/**
 * MCP Connection Event Types
 */
export interface MCPConnectionErrorEvent {
  event: 'mcp_connection_error';
  data: {
    mcpName: string;
    step?: number;
    agentName?: string;
    errorType: string;
    title: string;
    message: string;
    suggestions: string[];
    authFieldsRequired?: string[];
    isRetryable: boolean;
    requiresUserAction: boolean;
    llmAnalysis?: string;
    originalError?: string;
    timestamp: string;
  };
}

export interface MCPAuthRequiredEvent {
  event: 'mcp_auth_required';
  data: {
    mcpName: string;
    step?: number;
    agentName?: string;
    authParams: Record<string, any>;
    authInstructions?: string;
    isFirstConnection: boolean;
    timestamp: string;
  };
}

export interface MCPConnectionSuccessEvent {
  event: 'mcp_connection_success';
  data: {
    mcpName: string;
    step?: number;
    agentName?: string;
    toolCount: number;
    connectionTime: number;
    timestamp: string;
  };
}

export type MCPConnectionEvent = 
  | MCPConnectionErrorEvent 
  | MCPAuthRequiredEvent 
  | MCPConnectionSuccessEvent; 