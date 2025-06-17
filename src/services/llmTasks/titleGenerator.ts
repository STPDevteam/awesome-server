import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from '../../utils/logger.js';

/**
 * 任务标题生成服务
 * 根据用户输入的任务内容，使用LLM生成简洁明了的任务标题
 */
export class TitleGeneratorService {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo', // 可以使用更轻量级的模型来节省成本
      temperature: 0.3, // 较低的温度，保证生成稳定的标题
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
        new SystemMessage(`你是一个专业的任务标题生成器。你的职责是基于用户描述的任务内容，生成一个简洁、明确、有描述性的标题。
        标题需要满足以下要求：
        1. 长度不超过20个汉字或40个英文字符
        2. 能够清晰表达任务的核心目标
        3. 使用动词开头，如"开发"、"分析"、"设计"等
        4. 不要使用过于技术性的术语，保持通俗易懂
        5. 只返回标题，无需其他解释`),
        new HumanMessage(content)
      ]);

      // 提取并返回标题文本
      return response.content.toString().trim();
    } catch (error) {
      logger.error('Error generating title:', error);
      throw new Error('标题生成失败');
    }
  }
}

// 创建服务实例
export const titleGeneratorService = new TitleGeneratorService(); 