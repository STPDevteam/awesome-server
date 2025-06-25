import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxy);
/**
 * Task Title Generation Service
 * Uses LLM to generate concise and clear task titles based on user input task content
 */
export class TitleGeneratorService {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo', // 可以使用更轻量级的模型来节省成本
      temperature: 0.3, // 较低的温度，保证生成稳定的标题
      // configuration: {
      //   httpAgent: agent, // ✅ 使用代理关键设置
      // },
    });
  }

  /**
   * 根据用户输入的任务内容生成标题
   * @param content 用户输入的任务内容
   * @returns 生成的任务标题
   */
  async generateTitle(content: string): Promise<string> {
    try {
      logger.info('Generating title for task content');
      
      const response = await this.llm.invoke([
        new SystemMessage(`You are a professional task title generator. Your responsibility is to generate a concise, clear, and descriptive title based on the user's task description.
        The title should meet the following requirements:
        1. Length should not exceed 40 characters
        2. Clearly express the core objective of the task
        3. Start with a verb, such as "Develop", "Analyze", "Design", etc.
        4. Avoid overly technical terminology, keep it easy to understand
        5. Return only the title, no additional explanation`),
        new HumanMessage(content)
      ]);

      // 提取并返回标题文本
      return response.content.toString().trim();
    } catch (error) {
      logger.error('Error generating title:', error);
      throw new Error('Title generation failed');
    }
  }
}

// 创建服务实例
export const titleGeneratorService = new TitleGeneratorService(); 