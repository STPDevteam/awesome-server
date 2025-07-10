/**
 * Avatar Generator Utility
 * 使用DiceBear API为Agent生成头像
 * 文档: https://www.dicebear.com/how-to-use/http-api/
 */

/**
 * 生成Agent头像URL
 * @param seed 种子值，通常使用Agent名称
 * @param style DiceBear样式，默认为bottts-neutral
 * @returns 头像URL
 */
export function generateAgentAvatarUrl(seed: string, style: string = 'bottts-neutral'): string {
  // 清理种子值：移除特殊字符，确保URL安全
  const cleanSeed = encodeURIComponent(seed.replace(/[^a-zA-Z0-9\-_]/g, ''));
  
  // 构建DiceBear API URL
  const baseUrl = 'https://api.dicebear.com/9.x';
  const avatarUrl = `${baseUrl}/${style}/svg?seed=${cleanSeed}`;
  
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
    backgroundColor?: string;
    size?: number;
    format?: 'svg' | 'png' | 'jpg' | 'webp';
    [key: string]: any;
  } = {}
): string {
  const {
    style = 'bottts-neutral',
    format = 'svg',
    ...otherOptions
  } = options;
  
  // 清理种子值
  const cleanSeed = encodeURIComponent(seed.replace(/[^a-zA-Z0-9\-_]/g, ''));
  
  // 构建基础URL
  const baseUrl = 'https://api.dicebear.com/9.x';
  let avatarUrl = `${baseUrl}/${style}/${format}?seed=${cleanSeed}`;
  
  // 添加额外参数
  Object.entries(otherOptions).forEach(([key, value]) => {
    if (value !== undefined) {
      avatarUrl += `&${key}=${encodeURIComponent(value)}`;
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
  // 移除特殊字符，保留字母、数字、连字符和下划线
  let seed = agentName.replace(/[^a-zA-Z0-9\-_\s]/g, '');
  
  // 替换空格为连字符
  seed = seed.replace(/\s+/g, '-');
  
  // 转换为小写（可选）
  seed = seed.toLowerCase();
  
  // 如果种子值为空，使用默认值
  if (!seed || seed.length === 0) {
    seed = 'default-agent';
  }
  
  return seed;
}

/**
 * 预定义的Agent头像样式列表
 */
export const AGENT_AVATAR_STYLES = [
  'bottts-neutral',  // 默认推荐样式
  'bottts',
  'avataaars-neutral',
  'avataaars',
  'adventurer-neutral',
  'adventurer',
  'personas'
] as const;

export type AgentAvatarStyle = typeof AGENT_AVATAR_STYLES[number];

/**
 * 根据Agent类别选择合适的头像样式
 * @param categories Agent的类别列表
 * @returns 推荐的头像样式
 */
export function getRecommendedAvatarStyle(categories: string[] = []): AgentAvatarStyle {
  // 根据类别推荐不同的头像样式
  if (categories.includes('Development Tools')) {
    return 'bottts-neutral';
  } else if (categories.includes('Market Data')) {
    return 'avataaars-neutral';
  } else if (categories.includes('Social')) {
    return 'adventurer-neutral';
  } else {
    return 'bottts-neutral'; // 默认样式
  }
} 