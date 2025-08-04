import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * 支持的语言列表
 */
export const SUPPORTED_LANGUAGES = {
  'zh': { name: '中文', nativeName: '中文' },
  'en': { name: 'English', nativeName: 'English' },
  'ja': { name: 'Japanese', nativeName: '日本語' },
  'ko': { name: 'Korean', nativeName: '한국어' },
  'es': { name: 'Spanish', nativeName: 'Español' },
  'fr': { name: 'French', nativeName: 'Français' },
  'de': { name: 'German', nativeName: 'Deutsch' },
  'it': { name: 'Italian', nativeName: 'Italiano' },
  'pt': { name: 'Portuguese', nativeName: 'Português' },
  'ru': { name: 'Russian', nativeName: 'Русский' },
  'ar': { name: 'Arabic', nativeName: 'العربية' }
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

/**
 * 语言检测结果
 */
export interface LanguageDetectionResult {
  detectedLanguage: SupportedLanguage;
  confidence: number;
  alternativeLanguages?: SupportedLanguage[];
}

/**
 * 语言检测器类
 */
export class LanguageDetector {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      model: "gpt-3.5-turbo",
      temperature: 0,
      maxTokens: 50
    });
  }

  /**
   * 🔍 快速语言检测 - 基于明显字符特征（仅用于性能优化）
   */
  public quickDetect(text: string): SupportedLanguage | null {
    if (!text || text.trim().length === 0) {
      return null; // 无法确定
    }

    // 仅检测明显的字符特征，避免误判
    
    // 中日韩文字检测 (需要进一步细分，返回null让LLM处理)
    if (/[\u4e00-\u9fff]/.test(text)) {
      // 如果明确包含日文假名，可以确定是日文
      if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
        return 'ja';
      }
      // 如果明确包含韩文，可以确定是韩文
      if (/[\uac00-\ud7af]/.test(text)) {
        return 'ko';
      }
      // 汉字可能是中文或日文，让LLM判断
      return null;
    }

    // 纯韩文检测
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    }

    // 纯日文假名检测
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja';
    }

    // 阿拉伯文检测
    if (/[\u0600-\u06ff]/.test(text)) {
      return 'ar';
    }

    // 俄文检测 (西里尔字母)
    if (/[\u0400-\u04ff]/.test(text)) {
      return 'ru';
    }

    // 其他语言让LLM判断，更准确
    return null;
  }

  /**
   * 🤖 AI驱动的精确语言检测 (主要检测方法)
   */
  public async aiDetect(text: string): Promise<LanguageDetectionResult> {
    try {
      // 🚀 优先尝试快速检测明显特征
      const quickResult = this.quickDetect(text);
      if (quickResult) {
        return {
          detectedLanguage: quickResult,
          confidence: 0.95,
          alternativeLanguages: []
        };
      }

      // 🤖 使用LLM进行精确检测
      const prompt = `You are a language detection expert. Analyze the following text and identify its language.

Text to analyze: "${text.slice(0, 300)}"

Instructions:
1. Identify the primary language of this text
2. Consider context, grammar, and vocabulary
3. Handle mixed languages by identifying the dominant one
4. For ambiguous cases, use your best judgment

Supported languages: Chinese (zh), English (en), Japanese (ja), Korean (ko), Spanish (es), French (fr), German (de), Italian (it), Portuguese (pt), Russian (ru), Arabic (ar)

Response format: Return ONLY the 2-letter ISO 639-1 language code, nothing else.
Examples: zh, en, ja, ko, etc.`;

      const response = await this.llm.invoke([new SystemMessage(prompt)]);
      const detectedLang = response.content.toString().trim().toLowerCase() as SupportedLanguage;

      // 验证检测结果
      if (detectedLang in SUPPORTED_LANGUAGES) {
        return {
          detectedLanguage: detectedLang,
          confidence: 0.9,
          alternativeLanguages: []
        };
      } else {
        // AI检测失败，默认英文
        return {
          detectedLanguage: 'en',
          confidence: 0.6,
          alternativeLanguages: []
        };
      }
    } catch (error) {
      // 发生错误时默认英文
      return {
        detectedLanguage: 'en',
        confidence: 0.5,
        alternativeLanguages: []
      };
    }
  }

  /**
   * 🔧 获取语言的本地化名称
   */
  public getLanguageName(langCode: SupportedLanguage, displayLang: SupportedLanguage = 'en'): string {
    const language = SUPPORTED_LANGUAGES[langCode];
    if (!language) return langCode;

    // 如果显示语言是同一种语言，返回本地名称
    if (displayLang === langCode) {
      return language.nativeName;
    }

    // 否则返回英文名称
    return language.name;
  }

  /**
   * 🌍 获取多语言指令字符串 (用于LLM提示词)
   */
  public getLanguageInstruction(targetLanguage: SupportedLanguage): string {
    const languageNames = {
      'zh': '中文',
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어',
      'es': 'Español',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Русский',
      'ar': 'العربية'
    };

    const langName = languageNames[targetLanguage] || 'English';
    
    return `\n\n🌍 **LANGUAGE INSTRUCTION**: Please respond in ${langName}. Use natural, fluent ${langName} throughout your response. Adapt your tone and style to be appropriate for ${langName} speakers.`;
  }

  /**
   * 🎯 判断是否需要语言检测 (避免不必要的检测)
   */
  public shouldDetectLanguage(text: string, currentLanguage?: SupportedLanguage): boolean {
    // 文本太短，不需要检测
    if (!text || text.trim().length < 10) {
      return false;
    }

    // 已经有语言设置且文本主要是ASCII字符，可能不需要重新检测
    if (currentLanguage && /^[a-zA-Z0-9\s\.,!?'"()-]*$/.test(text.trim())) {
      return false;
    }

    return true;
  }
}

/**
 * 🔧 全局语言检测器实例
 */
export const languageDetector = new LanguageDetector();

/**
 * 🚀 便捷函数：智能检测文本语言（首选LLM，备选快速检测）
 */
export async function detectLanguage(text: string): Promise<SupportedLanguage> {
  try {
    const result = await languageDetector.aiDetect(text);
    return result.detectedLanguage;
  } catch (error) {
    // 回退到快速检测
    const quickResult = languageDetector.quickDetect(text);
    return quickResult || 'en'; // 如果快速检测也失败，默认英文
  }
}

/**
 * 🚀 便捷函数：同步快速检测（仅用于性能敏感场景）
 */
export function detectLanguageSync(text: string): SupportedLanguage {
  const quickResult = languageDetector.quickDetect(text);
  return quickResult || 'en'; // 如果检测失败，默认英文
}

/**
 * 🚀 便捷函数：获取语言指令
 */
export function getLanguageInstruction(targetLanguage: SupportedLanguage): string {
  return languageDetector.getLanguageInstruction(targetLanguage);
}

/**
 * 🚀 便捷函数：检查语言代码是否有效
 */
export function isValidLanguageCode(langCode: string): langCode is SupportedLanguage {
  return langCode in SUPPORTED_LANGUAGES;
}

/**
 * 🚀 便捷函数：获取用户偏好语言 (从浏览器或用户输入)
 */
export function resolveUserLanguage(
  userInput?: string,
  agentLanguage?: string,
  conversationLanguage?: string,
  browserLanguage?: string
): SupportedLanguage {
  // 1. 优先级：对话设置 > Agent设置 > 用户输入检测 > 浏览器语言 > 默认英文
  
  if (conversationLanguage && isValidLanguageCode(conversationLanguage)) {
    return conversationLanguage;
  }
  
  if (agentLanguage && isValidLanguageCode(agentLanguage)) {
    return agentLanguage;
  }
  
  if (userInput && languageDetector.shouldDetectLanguage(userInput)) {
    return detectLanguageSync(userInput);
  }
  
  if (browserLanguage) {
    const browserLang = browserLanguage.split('-')[0] as SupportedLanguage;
    if (isValidLanguageCode(browserLang)) {
      return browserLang;
    }
  }
  
  return 'en'; // 默认英文
}

/**
 * 🎯 增强版语言解析：优先解析语言指令，然后检测输入语言
 * 这是推荐的主要入口函数
 */
export async function resolveUserLanguageWithInstruction(
  userInput: string,
  agentLanguage?: string,
  conversationLanguage?: string,
  browserLanguage?: string
): Promise<SupportedLanguage> {
  // 1. 最高优先级：用户在消息中明确指定的回复语言
  const instructedLanguage = await parseLanguageInstruction(userInput);
  if (instructedLanguage) {
    return instructedLanguage;
  }
  
  // 2. 次优先级：使用原有的语言解析逻辑
  return await resolveUserLanguageAsync(
    userInput,
    agentLanguage, 
    conversationLanguage,
    browserLanguage
  );
}

/**
 * 🎯 解析用户消息中的语言指令
 * 识别用户是否明确指定了回复语言，如："用英语回答"、"Please answer in Korean"等
 */
export async function parseLanguageInstruction(userMessage: string): Promise<SupportedLanguage | null> {
  try {
    const detector = new LanguageDetector();
    
    const prompt = `Analyze the following user message and determine if they specified which language they want the response in.

User message: "${userMessage}"

Your task:
1. Look for explicit language instructions in the message
2. Common patterns include:
   - "用[语言]回答" / "用[语言]回复" 
   - "Please answer in [language]" / "Reply in [language]"
   - "한국어로 답변해주세요" / "日本語で答えて"
   - "[language]로 대답해줘" / "[language]で回答して"
   - "Répondez en [language]" / "Responda en [language]"

3. If you find a language instruction, return the ISO 639-1 code
4. If no specific language is requested, return "none"

Supported languages and their codes:
${Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => `- ${code}: ${name}`).join('\n')}

Respond with ONLY the language code (e.g., "zh", "en", "ja") or "none".`;

    const response = await detector['llm'].invoke([{ role: 'user', content: prompt }]);
    const result = (response.content as string).trim().toLowerCase();
    
    if (result === 'none' || !result) {
      return null;
    }
    
    if (isValidLanguageCode(result)) {
      return result;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse language instruction:', error);
    return null;
  }
}

/**
 * 🚀 异步版本：智能解析用户偏好语言 (推荐使用，更准确)
 */
export async function resolveUserLanguageAsync(
  userInput?: string,
  agentLanguage?: string,
  conversationLanguage?: string,
  browserLanguage?: string
): Promise<SupportedLanguage> {
  // 1. 优先级：对话设置 > Agent设置 > 用户输入检测 > 浏览器语言 > 默认英文
  
  if (conversationLanguage && isValidLanguageCode(conversationLanguage)) {
    return conversationLanguage;
  }
  
  if (agentLanguage && isValidLanguageCode(agentLanguage)) {
    return agentLanguage;
  }
  
  if (userInput && languageDetector.shouldDetectLanguage(userInput)) {
    return await detectLanguage(userInput);
  }
  
  if (browserLanguage) {
    const browserLang = browserLanguage.split('-')[0] as SupportedLanguage;
    if (isValidLanguageCode(browserLang)) {
      return browserLang;
    }
  }
  
  return 'en'; // 默认英文
} 