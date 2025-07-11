import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAgentConversationService } from '../services/agentConversationService.js';
import { TaskExecutorService } from '../services/taskExecutorService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Initialize agentConversationService with TaskExecutorService dependency
let agentConversationService: ReturnType<typeof getAgentConversationService>;

// Middleware: Ensure agentConversationService is initialized
router.use((req, res, next) => {
  if (!agentConversationService) {
    // Get TaskExecutorService instance from app
    const taskExecutorService = req.app.get('taskExecutorService') as TaskExecutorService;
    if (!taskExecutorService) {
      logger.error('TaskExecutorService not found in app context');
      return res.status(500).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'Task executor service not available'
      });
    }
    agentConversationService = getAgentConversationService(taskExecutorService);
    logger.info('AgentConversationService initialized successfully');
  }
  next();
});

/**
 * Send message to Agent conversation (non-streaming)
 * POST /api/agent-conversation/:conversationId/message
 */
router.post('/:conversationId/message', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { conversationId } = req.params;
    const { content } = req.body;

    // Validate input
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT',
        message: 'Content is required and must be a string'
      });
    }

    // Check if this is an Agent conversation
    const isAgentConv = await agentConversationService.isAgentConversation(conversationId);
    if (!isAgentConv) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONVERSATION',
        message: 'This is not an Agent conversation'
      });
    }

    // Process Agent message
    const result = await agentConversationService.processAgentMessage(
      conversationId,
      userId,
      content
    );

    res.json({
      success: true,
      data: {
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        intent: result.intent,
        taskId: result.taskId
      }
    });
  } catch (error) {
    logger.error(`Failed to process Agent message [Conversation: ${req.params.conversationId}]:`, error);
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to process Agent message'
    });
  }
});

/**
 * Send message to Agent conversation (streaming)
 * POST /api/agent-conversation/:conversationId/message/stream
 */
router.post('/:conversationId/message/stream', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { conversationId } = req.params;
    const { content } = req.body;

    // Validate input
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT',
        message: 'Content is required and must be a string'
      });
    }

    // Check if this is an Agent conversation
    const isAgentConv = await agentConversationService.isAgentConversation(conversationId);
    if (!isAgentConv) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONVERSATION',
        message: 'This is not an Agent conversation'
      });
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
      event: 'connection_established', 
      data: { conversationId, status: 'connected' } 
    })}\n\n`);

    let processingComplete = false;
    let result: any = null;

    try {
      // Process Agent message with streaming
      result = await agentConversationService.processAgentMessageStream(
        conversationId,
        userId,
        content,
        (chunk) => {
          if (!processingComplete) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        }
      );

      processingComplete = true;

      // Send final result
      res.write(`data: ${JSON.stringify({ 
        event: 'final_result', 
        data: result 
      })}\n\n`);

      // Send completion message
      res.write(`data: ${JSON.stringify({ 
        event: 'stream_complete', 
        data: { status: 'completed' } 
      })}\n\n`);

    } catch (streamError) {
      processingComplete = true;
      
      logger.error(`Agent message streaming failed [Conversation: ${conversationId}]:`, streamError);
      
      // Send error event
      res.write(`data: ${JSON.stringify({ 
        event: 'error', 
        data: { 
          message: streamError instanceof Error ? streamError.message : 'Streaming failed',
          conversationId 
        } 
      })}\n\n`);
    }

    // Close the connection
    res.end();

  } catch (error) {
    logger.error(`Failed to setup Agent message streaming [Conversation: ${req.params.conversationId}]:`, error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to setup streaming'
      });
    }
  }
});

/**
 * Get Agent conversation details
 * GET /api/agent-conversation/:conversationId
 */
router.get('/:conversationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { conversationId } = req.params;

    // Check if this is an Agent conversation
    const isAgentConv = await agentConversationService.isAgentConversation(conversationId);
    if (!isAgentConv) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONVERSATION',
        message: 'This is not an Agent conversation'
      });
    }

    // Get Agent from conversation
    const agent = await agentConversationService.getAgentFromConversation(conversationId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'AGENT_NOT_FOUND',
        message: 'Agent not found for this conversation'
      });
    }

    res.json({
      success: true,
      data: {
        conversationId,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          status: agent.status,
          categories: agent.categories,
          mcpWorkflow: agent.mcpWorkflow,
          relatedQuestions: agent.relatedQuestions
        }
      }
    });
  } catch (error) {
    logger.error(`Failed to get Agent conversation details [Conversation: ${req.params.conversationId}]:`, error);
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get conversation details'
    });
  }
});

/**
 * Clear Agent conversation memory
 * DELETE /api/agent-conversation/:conversationId/memory
 */
router.delete('/:conversationId/memory', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'User not authenticated'
      });
    }

    const { conversationId } = req.params;

    // Check if this is an Agent conversation
    const isAgentConv = await agentConversationService.isAgentConversation(conversationId);
    if (!isAgentConv) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONVERSATION',
        message: 'This is not an Agent conversation'
      });
    }

    // Clear conversation memory
    await agentConversationService.clearConversationMemory(conversationId);

    res.json({
      success: true,
      message: 'Agent conversation memory cleared successfully'
    });
  } catch (error) {
    logger.error(`Failed to clear Agent conversation memory [Conversation: ${req.params.conversationId}]:`, error);
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to clear conversation memory'
    });
  }
});

export default router; 