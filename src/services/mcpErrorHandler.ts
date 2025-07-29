import { logger } from '../utils/logger.js';
import { SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

/**
 * MCP Error Type Enumeration
 */
export enum MCPErrorType {
  // Authentication related errors
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_API_KEY = 'EXPIRED_API_KEY',
  WRONG_PASSWORD = 'WRONG_PASSWORD',
  MISSING_AUTH_PARAMS = 'MISSING_AUTH_PARAMS',
  INVALID_AUTH_FORMAT = 'INVALID_AUTH_FORMAT',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Connection related errors
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Configuration related errors
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  MISSING_DEPENDENCIES = 'MISSING_DEPENDENCIES',
  INVALID_COMMAND = 'INVALID_COMMAND',
  
  // Server related errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // MCP Connection specific errors
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  MCP_AUTH_REQUIRED = 'MCP_AUTH_REQUIRED',
  MCP_SERVICE_INIT_FAILED = 'MCP_SERVICE_INIT_FAILED',
  
  // Generic error
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * MCP Error Details Interface
 */
export interface MCPErrorDetails {
  type: MCPErrorType;
  title: string;
  message: string;
  userMessage: string;
  suggestions: string[];
  httpStatus?: number;
  originalError?: string;
  mcpName?: string;
  isRetryable: boolean;
  requiresUserAction: boolean;
  authFieldsRequired?: string[];
  llmAnalysis?: string;
}

/**
 * MCP Error Handler Service with LLM Enhancement
 */
export class MCPErrorHandler {
  
  /**
   * Analyze error and return detailed information with LLM enhancement
   */
  static async analyzeError(error: Error | string, mcpName?: string): Promise<MCPErrorDetails> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? '' : error.stack || '';
    
    logger.info(`🔍 Analyzing MCP error [MCP: ${mcpName || 'unknown'}]: ${errorMessage}`);
    
    // Try LLM-enhanced analysis first for better accuracy
    const llmAnalysis = await this.getLLMErrorAnalysis(errorMessage, mcpName);
    
    // Authentication related error detection
    if (this.isAuthenticationError(errorMessage, errorStack)) {
      const result = await this.handleAuthenticationError(errorMessage, mcpName);
      result.llmAnalysis = llmAnalysis;
      return result;
    }
    
    // Connection related error detection  
    if (this.isConnectionError(errorMessage, errorStack)) {
      const result = await this.handleConnectionError(errorMessage, mcpName);
      result.llmAnalysis = llmAnalysis;
      return result;
    }
    
    // Configuration related error detection
    if (this.isConfigurationError(errorMessage, errorStack)) {
      const result = await this.handleConfigurationError(errorMessage, mcpName);
      result.llmAnalysis = llmAnalysis;
      return result;
    }
    
    // Server related error detection
    if (this.isServerError(errorMessage, errorStack)) {
      const result = await this.handleServerError(errorMessage, mcpName);
      result.llmAnalysis = llmAnalysis;
      return result;
    }
    
    // Default handling for unknown errors
    const result = await this.handleUnknownError(errorMessage, mcpName);
    result.llmAnalysis = llmAnalysis;
    return result;
  }
  
  /**
   * Get LLM-enhanced error analysis for complex MCP errors
   */
  private static async getLLMErrorAnalysis(errorMessage: string, mcpName?: string): Promise<string> {
    try {
      const llm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 500
      });

      const prompt = `You are an expert MCP (Model Context Protocol) troubleshooting assistant. Analyze this error and provide helpful guidance.

MCP Service: ${mcpName || 'Unknown'}
Error Message: ${errorMessage}

Provide a concise analysis in JSON format:
{
  "errorType": "authentication|connection|configuration|rate_limit|server|unknown",
  "likelyIssue": "brief description of the most likely cause",
  "userFriendlyExplanation": "simple explanation for non-technical users",
  "specificSuggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "authFieldsNeeded": ["field1", "field2"] // if authentication issue, list required fields
}

Focus on:
1. Common API key/authentication issues
2. Service-specific configuration problems  
3. Network and connectivity issues
4. Rate limiting and quota problems
5. Clear, actionable solutions

Keep suggestions practical and specific to the error and MCP service.`;

      const response = await llm.invoke([new SystemMessage(prompt)]);
      return response.content as string;
    } catch (llmError) {
      logger.warn('LLM error analysis failed:', llmError);
      return 'LLM analysis unavailable';
    }
  }
  
  /**
   * Detect if error is authentication related
   */
  private static isAuthenticationError(message: string, stack: string): boolean {
    const authPatterns = [
      // API Key related
      /invalid.*api.*key/i,
      /api.*key.*invalid/i,
      /unauthorized.*api.*key/i,
      /bad.*api.*key/i,
      
      // Password related
      /wrong.*password/i,
      /incorrect.*password/i,
      /password.*incorrect/i,
      /invalid.*password/i,
      
      // Authentication failures
      /authentication.*failed/i,
      /auth.*failed/i,
      /unauthorized/i,
      /access.*denied/i,
      /forbidden/i,
      
      // HTTP status codes
      /401/,
      /403/,
      
      // Service specific error codes
      /error.*399/i, // Twitter error code
      /credential.*invalid/i,
      /token.*expired/i,
      /invalid.*token/i
    ];
    
    return authPatterns.some(pattern => pattern.test(message) || pattern.test(stack));
  }
  
  /**
   * Detect if error is connection related
   */
  private static isConnectionError(message: string, stack: string): boolean {
    const connectionPatterns = [
      /connection.*timeout/i,
      /connect.*timeout/i,
      /timeout/i,
      /connection.*refused/i,
      /connect.*refused/i,
      /econnrefused/i,
      /enotfound/i,
      /network.*error/i,
      /connection.*closed/i,
      /connection.*lost/i,
      /socket.*hang.*up/i,
      /service.*unavailable/i,
      /host.*unreachable/i
    ];
    
    return connectionPatterns.some(pattern => pattern.test(message) || pattern.test(stack));
  }
  
  /**
   * Detect if error is configuration related
   */
  private static isConfigurationError(message: string, stack: string): boolean {
    const configPatterns = [
      /command.*not.*found/i,
      /no.*such.*file/i,
      /cannot.*find.*module/i,
      /missing.*dependency/i,
      /invalid.*configuration/i,
      /config.*error/i,
      /npm.*not.*found/i,
      /npx.*not.*found/i,
      /permission.*denied/i,
      /eacces/i
    ];
    
    return configPatterns.some(pattern => pattern.test(message) || pattern.test(stack));
  }
  
  /**
   * Detect if error is server related
   */
  private static isServerError(message: string, stack: string): boolean {
    const serverPatterns = [
      /internal.*server.*error/i,
      /500/,
      /502/,
      /503/,
      /504/,
      /rate.*limit/i,
      /quota.*exceeded/i,
      /too.*many.*requests/i,
      /service.*overloaded/i
    ];
    
    return serverPatterns.some(pattern => pattern.test(message) || pattern.test(stack));
  }
  
  /**
   * Handle authentication errors
   */
  private static async handleAuthenticationError(message: string, mcpName?: string): Promise<MCPErrorDetails> {
    // API Key errors
    if (/invalid.*api.*key|api.*key.*invalid|bad.*api.*key/i.test(message)) {
      return {
        type: MCPErrorType.INVALID_API_KEY,
        title: 'Invalid API Key',
        message: `The API Key for ${mcpName || 'MCP service'} is invalid or incorrectly formatted`,
        userMessage: 'The API Key you provided is invalid. Please check and enter a valid API Key',
        suggestions: [
          'Check if the API Key is complete without missing characters',
          'Ensure the API Key does not contain extra spaces',
          'Verify the API Key is from the correct service provider',
          'If this is a newly created API Key, wait a few minutes and try again'
        ],
        httpStatus: 401,
        originalError: message,
        mcpName,
        isRetryable: false,
        requiresUserAction: true
      };
    }
    
    // Password errors
    if (/wrong.*password|incorrect.*password|password.*incorrect/i.test(message)) {
      return {
        type: MCPErrorType.WRONG_PASSWORD,
        title: 'Wrong Password',
        message: `The password for ${mcpName || 'MCP service'} is incorrect`,
        userMessage: 'The password you entered is incorrect. Please check and re-enter',
        suggestions: [
          'Verify the password case sensitivity is correct',
          'Check if Caps Lock is enabled',
          'If entered incorrectly multiple times, the account may be temporarily locked',
          'Try resetting the password or using alternative authentication methods'
        ],
        httpStatus: 401,
        originalError: message,
        mcpName,
        isRetryable: false,
        requiresUserAction: true
      };
    }
    
    // Token expiration
    if (/token.*expired|expired.*token/i.test(message)) {
      return {
        type: MCPErrorType.EXPIRED_API_KEY,
        title: 'Token Expired',
        message: `The access token for ${mcpName || 'MCP service'} has expired`,
        userMessage: 'Your access token has expired and needs to be refreshed or renewed',
        suggestions: [
          'Try refreshing the token',
          'Re-login to get a new token',
          'Check the token validity period settings',
          'Ensure system time is correct'
        ],
        httpStatus: 401,
        originalError: message,
        mcpName,
        isRetryable: true,
        requiresUserAction: true
      };
    }
    
    // Insufficient permissions
    if (/forbidden|access.*denied|insufficient.*permission/i.test(message)) {
      return {
        type: MCPErrorType.INSUFFICIENT_PERMISSIONS,
        title: 'Insufficient Permissions',
        message: `Insufficient access permissions for ${mcpName || 'MCP service'}`,
        userMessage: 'Your account does not have sufficient permissions to access this service',
        suggestions: [
          'Check if your account has the required access permissions',
          'Contact administrator to upgrade account permissions',
          'Verify if service subscription status is valid',
          'Check API usage scope and limitations'
        ],
        httpStatus: 403,
        originalError: message,
        mcpName,
        isRetryable: false,
        requiresUserAction: true
      };
    }
    
    // Generic authentication failure
    return {
      type: MCPErrorType.INVALID_API_KEY,
      title: 'Authentication Failed',
      message: `Authentication failed for ${mcpName || 'MCP service'}`,
      userMessage: 'Authentication verification failed. Please check your credentials',
      suggestions: [
        'Check if all authentication information is correct',
        'Verify account status is active',
        'Try regenerating authentication credentials',
        'Check if network connection is stable'
      ],
      httpStatus: 401,
      originalError: message,
      mcpName,
      isRetryable: false,
      requiresUserAction: true
    };
  }
  
  /**
   * Handle connection errors
   */
  private static async handleConnectionError(message: string, mcpName?: string): Promise<MCPErrorDetails> {
    if (/timeout/i.test(message)) {
      return {
        type: MCPErrorType.CONNECTION_TIMEOUT,
        title: 'Connection Timeout',
        message: `Connection to ${mcpName || 'MCP service'} timed out`,
        userMessage: 'Connection to server timed out, possibly due to network issues or server overload',
        suggestions: [
          'Check if network connection is stable',
          'Try connecting again later',
          'Try switching network environment',
          'Contact network administrator to check firewall settings'
        ],
        httpStatus: 408,
        originalError: message,
        mcpName,
        isRetryable: true,
        requiresUserAction: false
      };
    }
    
    if (/refused|econnrefused/i.test(message)) {
      return {
        type: MCPErrorType.CONNECTION_REFUSED,
        title: 'Connection Refused',
        message: `${mcpName || 'MCP service'} refused connection`,
        userMessage: 'Server refused connection, service may be temporarily unavailable',
        suggestions: [
          'Verify if the service is running',
          'Check if service port is correct',
          'Try connecting again later',
          'Contact service provider to confirm service status'
        ],
        httpStatus: 502,
        originalError: message,
        mcpName,
        isRetryable: true,
        requiresUserAction: false
      };
    }
    
    return {
      type: MCPErrorType.NETWORK_ERROR,
      title: 'Network Error',
      message: `${mcpName || 'MCP service'} network connection error`,
      userMessage: 'Network connection issues occurred, please check network settings',
      suggestions: [
        'Check if network connection is normal',
        'Try restarting network equipment',
        'Check DNS settings',
        'Contact network service provider'
      ],
      httpStatus: 503,
      originalError: message,
      mcpName,
      isRetryable: true,
      requiresUserAction: false
    };
  }
  
  /**
   * Handle configuration errors
   */
  private static async handleConfigurationError(message: string, mcpName?: string): Promise<MCPErrorDetails> {
    if (/command.*not.*found|npm.*not.*found|npx.*not.*found/i.test(message)) {
      return {
        type: MCPErrorType.MISSING_DEPENDENCIES,
        title: 'Missing Dependencies',
        message: `${mcpName || 'MCP service'} required dependencies are not installed`,
        userMessage: 'System lacks necessary dependencies, unable to start service',
        suggestions: [
          'Install Node.js and npm',
          'Run npm install to install dependencies',
          'Check system PATH environment variables',
          'Contact system administrator to install dependencies'
        ],
        httpStatus: 500,
        originalError: message,
        mcpName,
        isRetryable: false,
        requiresUserAction: true
      };
    }
    
    return {
      type: MCPErrorType.INVALID_CONFIGURATION,
      title: 'Configuration Error',
      message: `${mcpName || 'MCP service'} configuration is incorrect`,
      userMessage: 'Service configuration has issues, please check configuration settings',
      suggestions: [
        'Check service configuration parameters',
        'Verify if file paths are correct',
        'Validate environment variable settings',
        'Refer to official documentation to correct configuration'
      ],
      httpStatus: 500,
      originalError: message,
      mcpName,
      isRetryable: false,
      requiresUserAction: true
    };
  }
  
  /**
   * Handle server errors
   */
  private static async handleServerError(message: string, mcpName?: string): Promise<MCPErrorDetails> {
    if (/rate.*limit|too.*many.*requests/i.test(message)) {
      return {
        type: MCPErrorType.RATE_LIMIT_EXCEEDED,
        title: 'Rate Limit Exceeded',
        message: `${mcpName || 'MCP service'} request frequency exceeded limit`,
        userMessage: 'Requests are too frequent, please try again later',
        suggestions: [
          'Reduce request frequency',
          'Wait for a while and try again',
          'Upgrade account for higher limits',
          'Optimize usage to reduce unnecessary requests'
        ],
        httpStatus: 429,
        originalError: message,
        mcpName,
        isRetryable: true,
        requiresUserAction: false
      };
    }
    
    return {
      type: MCPErrorType.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      message: `${mcpName || 'MCP service'} encountered an internal error`,
              userMessage: 'Server encountered an internal error, please try again later',
      suggestions: [
                  'Try again later',
        'Check service status page',
        'Contact technical support',
        'Try using other features'
      ],
      httpStatus: 500,
      originalError: message,
      mcpName,
      isRetryable: true,
      requiresUserAction: false
    };
  }
  
  /**
   * Handle unknown errors
   */
  private static async handleUnknownError(message: string, mcpName?: string): Promise<MCPErrorDetails> {
    return {
      type: MCPErrorType.UNKNOWN_ERROR,
      title: 'Unknown Error',
              message: `${mcpName || 'MCP service'} encountered an unknown error`,
              userMessage: 'An unknown error occurred, please try the operation again',
      suggestions: [
        'Try reconnecting',
                  'Check network connection',
        'Clear browser cache',
        'Contact technical support with error information'
      ],
      httpStatus: 500,
      originalError: message,
      mcpName,
      isRetryable: true,
      requiresUserAction: false
    };
  }
  
  /**
   * Format error information for frontend use
   */
  static formatErrorForFrontend(errorDetails: MCPErrorDetails): any {
    return {
      error: {
        type: errorDetails.type,
        title: errorDetails.title,
        message: errorDetails.userMessage,
        suggestions: errorDetails.suggestions,
        isRetryable: errorDetails.isRetryable,
        requiresUserAction: errorDetails.requiresUserAction,
        mcpName: errorDetails.mcpName,
        authFieldsRequired: errorDetails.authFieldsRequired,
        llmAnalysis: errorDetails.llmAnalysis
      },
      technical: {
        originalError: errorDetails.originalError,
        httpStatus: errorDetails.httpStatus
      }
    };
  }
} 