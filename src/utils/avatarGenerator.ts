/**
 * Avatar Generator Utility
 * 使用DiceBear API为Agent生成头像
 * 文档: https://www.dicebear.com/how-to-use/http-api/
 * Bottts样式文档: https://www.dicebear.com/styles/bottts/
 */

/**
 * 生成Agent头像URL
 * @param seed 种子值，通常使用Agent名称
 * @param style DiceBear样式，默认为bottts
 * @returns 头像URL
 */
export function generateAgentAvatarUrl(seed: string, style: string = 'bottts'): string {
  // 清理种子值：移除特殊字符，确保URL安全
  const cleanSeed = encodeURIComponent(seed.replace(/[^a-zA-Z0-9\-_]/g, ''));
  
  // 如果清理后的种子值为空，使用默认值
  const finalSeed = cleanSeed || 'default-agent';
  
  // 构建DiceBear API URL (使用9.x版本)
  const baseUrl = 'https://api.dicebear.com/9.x';
  const avatarUrl = `${baseUrl}/${style}/svg?seed=${finalSeed}`;
  
  return avatarUrl;
}

/**
 * 生成带额外参数的Agent头像URL
 * @param seed 种子值
 * @param options 额外的DiceBear参数
 * @returns 头像URL
 */
export function generateAgentAvatarUrlWithOptions(
  seed: string, 
  options: {
    style?: string;
    backgroundColor?: string[];
    size?: number;
    format?: 'svg' | 'png' | 'jpg' | 'webp' | 'avif';
    flip?: boolean;
    rotate?: number;
    scale?: number;
    radius?: number;
    translateX?: number;
    translateY?: number;
    [key: string]: any;
  } = {}
): string {
  const {
    style = 'bottts',
    format = 'svg',
    backgroundColor,
    ...otherOptions
  } = options;
  
  // 清理种子值
  const cleanSeed = encodeURIComponent(seed.replace(/[^a-zA-Z0-9\-_]/g, ''));
  const finalSeed = cleanSeed || 'default-agent';
  
  // 构建基础URL
  const baseUrl = 'https://api.dicebear.com/9.x';
  let avatarUrl = `${baseUrl}/${style}/${format}?seed=${finalSeed}`;
  
  // 处理backgroundColor数组参数
  if (backgroundColor && Array.isArray(backgroundColor)) {
    avatarUrl += `&backgroundColor=${backgroundColor.join(',')}`;
  }
  
  // 添加其他参数
  Object.entries(otherOptions).forEach(([key, value]) => {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        avatarUrl += `&${key}=${value.join(',')}`;
      } else {
        avatarUrl += `&${key}=${encodeURIComponent(value)}`;
      }
    }
  });
  
  return avatarUrl;
}

/**
 * 为Agent名称生成合适的头像种子值
 * @param agentName Agent名称
 * @returns 处理后的种子值
 */
export function generateAvatarSeed(agentName: string): string {
  if (!agentName || agentName.trim().length === 0) {
    return 'default-agent';
  }
  
  // 移除特殊字符，保留字母、数字、连字符和下划线
  let seed = agentName.replace(/[^a-zA-Z0-9\-_\s]/g, '');
  
  // 替换空格为连字符
  seed = seed.replace(/\s+/g, '-');
  
  // 转换为小写
  seed = seed.toLowerCase();
  
  // 移除开头和结尾的连字符
  seed = seed.replace(/^-+|-+$/g, '');
  
  // 如果种子值为空，使用默认值
  if (!seed || seed.length === 0) {
    seed = 'default-agent';
  }
  
  return seed;
}

/**
 * 预定义的Agent头像样式列表 (基于DiceBear官方文档)
 */
export const AGENT_AVATAR_STYLES = [
  'bottts',              // 机器人风格 (推荐用于技术类Agent)
  'bottts-neutral',      // 中性机器人风格
  'avataaars',           // 卡通人物风格
  'avataaars-neutral',   // 中性卡通人物风格
  'adventurer',          // 冒险者风格
  'adventurer-neutral',  // 中性冒险者风格
  'personas',            // 人物角色风格
  'lorelei',             // 现代人物风格
  'lorelei-neutral',     // 中性现代人物风格
  'micah',               // 简约人物风格
  'pixel-art',           // 像素艺术风格
  'pixel-art-neutral'    // 中性像素艺术风格
] as const;

export type AgentAvatarStyle = typeof AGENT_AVATAR_STYLES[number];

/**
 * 根据Agent类别选择合适的头像样式
 * @param categories Agent的类别列表
 * @returns 推荐的头像样式
 */
export function getRecommendedAvatarStyle(categories: string[] = []): AgentAvatarStyle {
  // 统一使用bottts样式，符合机器人/AI助手的定位
  return 'bottts';
}

/**
 * 根据Agent类别和名称生成完整的头像URL
 * @param agentName Agent名称
 * @param categories Agent类别列表
 * @param customStyle 自定义样式（可选）
 * @returns 完整的头像URL
 */
export function generateAgentAvatar(
  agentName: string, 
  categories: string[] = [], 
  customStyle?: AgentAvatarStyle
): string {
  const seed = generateAvatarSeed(agentName);
  const style = customStyle || getRecommendedAvatarStyle(categories);
  return generateAgentAvatarUrl(seed, style);
}

/**
 * 验证DiceBear样式是否有效
 * @param style 样式名称
 * @returns 是否为有效样式
 */
export function isValidAvatarStyle(style: string): style is AgentAvatarStyle {
  return AGENT_AVATAR_STYLES.includes(style as AgentAvatarStyle);
}

/**
 * 获取Agent头像的预览URL（用于测试）
 * @param seed 种子值
 * @param style 样式
 * @returns 预览URL
 */
export function getAvatarPreviewUrl(seed: string, style: AgentAvatarStyle = 'bottts'): string {
  return generateAgentAvatarUrl(seed, style);
} 