import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Task Title Generation Service
 * Uses LLM to generate concise and clear task titles based on user input task content
 */
export class TitleGeneratorService {
  private llm: ChatOpenAI;

  constructor() {
    // 检查是否有OpenAI API Key
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('No OpenAI API Key found, title generation will use fallback method');
      // 即使没有API密钥也初始化LLM实例，但不会实际调用
      this.llm = new ChatOpenAI({
        openAIApiKey: 'dummy', // 占位符
        modelName: 'gpt-3.5-turbo',
        temperature: 0.3,
        timeout: 10000,
        maxRetries: 1,
      });
    } else {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.3,
      timeout: 10000, // 10秒超时
      maxRetries: 1, // 最多重试1次
      // 如果需要代理，可以取消注释下面的行
      // configuration: {
      //   httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890'),
      // },
    });
    }
  }

  /**
   * 根据用户输入的任务内容生成标题
   * @param content 用户输入的任务内容
   * @returns 生成的任务标题
   */
  async generateTitle(content: string): Promise<string> {
    try {
      // 如果没有API Key，直接返回简化标题
      if (!process.env.OPENAI_API_KEY) {
        logger.info('No OpenAI API Key, using content as title');
        return content.length > 30 ? content.substring(0, 30) + '...' : content;
      }
      
      logger.info('Generating title for task content');
      
      // 设置超时Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Title generation timeout')), 8000);
      });
      
      // LLM调用Promise
      const llmPromise = this.llm.invoke([
        new SystemMessage(`You are a professional task title generator. Your responsibility is to generate a concise, clear, and descriptive title based on the user's task description.
        The title should meet the following requirements:
        1. Length should not exceed 40 characters
        2. Clearly express the core objective of the task
        3. Start with a verb, such as "Develop", "Analyze", "Design", etc.
        4. Avoid overly technical terminology, keep it easy to understand
        5. Return only the title, no additional explanation`),
        new HumanMessage(content)
      ]);

      // 使用Promise.race实现超时
      const response = await Promise.race([llmPromise, timeoutPromise]);
      
      // 提取并返回标题文本
      const title = response.content.toString().trim();
      logger.info(`Successfully generated title: ${title}`);
      return title;
      
    } catch (error) {
      logger.error('Error generating title:', error);
      
      // 如果生成失败，返回内容的前30个字符作为标题
      const fallbackTitle = content.length > 30 ? content.substring(0, 30) + '...' : content;
      logger.info(`Using fallback title: ${fallbackTitle}`);
      return fallbackTitle;
    }
  }
}

// 创建服务实例
export const titleGeneratorService = new TitleGeneratorService(); 