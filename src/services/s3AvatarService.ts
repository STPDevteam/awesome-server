import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger.js';

class S3AvatarService {
  private static instance: S3AvatarService | null = null;
  private s3Client: S3Client;
  private bucketName: string;
  private avatarPrefix: string;
  private region: string;
  private avatarCache: string[] | null = null;
  private cacheExpiryTime: number = 0;
  private cacheDuration: number = 3600000; // 1小时缓存

  private constructor() {
    // 从环境变量获取配置
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';
    // 处理前缀：确保不以 / 开头，但以 / 结尾（如果不为空）
    this.avatarPrefix = process.env.AWS_S3_AVATAR_PREFIX || '';
    if (this.avatarPrefix.startsWith('/')) {
      this.avatarPrefix = this.avatarPrefix.substring(1);
    }
    if (this.avatarPrefix && !this.avatarPrefix.endsWith('/')) {
      this.avatarPrefix += '/';
    }
    this.region = process.env.AWS_REGION || 'us-east-1';

    // 初始化S3客户端
    this.s3Client = new S3Client({
      region: this.region,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      } : undefined // 如果没有配置，使用默认凭证链（如EC2实例角色）
    });

    if (!this.bucketName) {
      logger.warn('AWS S3 bucket name not configured for avatar service');
    }
  }

  public static getInstance(): S3AvatarService {
    if (!S3AvatarService.instance) {
      S3AvatarService.instance = new S3AvatarService();
    }
    return S3AvatarService.instance;
  }

  /**
   * 获取S3中的所有头像URL列表
   */
  private async getAvatarList(): Promise<string[]> {
    // 检查缓存是否有效
    if (this.avatarCache && Date.now() < this.cacheExpiryTime) {
      logger.info('Using cached avatar list');
      return this.avatarCache;
    }

    try {
      logger.info(`Listing objects in bucket: ${this.bucketName} with prefix: "${this.avatarPrefix}"`);
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.avatarPrefix,
        MaxKeys: 1000 // 最多获取1000个头像
      });

      const response = await this.s3Client.send(command);
      logger.info(`S3 ListObjects response received. Found ${response.Contents?.length || 0} objects`);
      
      const avatarUrls: string[] = [];

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            logger.info(`Processing object: ${object.Key}`);
            if (this.isImageFile(object.Key)) {
              // 构建公共URL或签名URL
              const avatarUrl = this.getS3ObjectUrl(object.Key);
              avatarUrls.push(avatarUrl);
              logger.info(`Added avatar URL: ${avatarUrl}`);
            } else {
              logger.info(`Skipping non-image file: ${object.Key}`);
            }
          }
        }
      }

      // 更新缓存
      this.avatarCache = avatarUrls;
      this.cacheExpiryTime = Date.now() + this.cacheDuration;

      logger.info(`Loaded ${avatarUrls.length} avatars from S3`);
      return avatarUrls;
    } catch (error) {
      logger.error('Failed to list avatars from S3:', error);
      return [];
    }
  }

  /**
   * 检查文件是否为图片文件
   */
  private isImageFile(key: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const lowerKey = key.toLowerCase();
    const isImage = imageExtensions.some(ext => lowerKey.endsWith(ext));
    logger.info(`Checking if ${key} is an image: ${isImage}`);
    return isImage;
  }

  /**
   * 构建S3对象的URL
   */
  private getS3ObjectUrl(key: string): string {
    // 如果配置了CloudFront域名并且是有效的域名，使用CloudFront
    if (process.env.AWS_CLOUDFRONT_DOMAIN && 
        process.env.AWS_CLOUDFRONT_DOMAIN !== 'YOUR_CLOUDFRONT_DOMAIN' &&
        process.env.AWS_CLOUDFRONT_DOMAIN.includes('.')) {
      return `https://${process.env.AWS_CLOUDFRONT_DOMAIN}/${key}`;
    }
    
    // 否则使用S3公共URL
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * 随机获取一个头像URL
   */
  async getRandomAvatar(): Promise<string | null> {
    try {
      // 如果没有配置bucket，返回null
      if (!this.bucketName) {
        return null;
      }

      const avatarList = await this.getAvatarList();
      
      if (avatarList.length === 0) {
        logger.warn('No avatars found in S3');
        return null;
      }

      // 随机选择一个头像
      const randomIndex = Math.floor(Math.random() * avatarList.length);
      return avatarList[randomIndex];
    } catch (error) {
      logger.error('Error getting random avatar:', error);
      return null;
    }
  }

  /**
   * 获取多个随机头像URL
   */
  async getRandomAvatars(count: number): Promise<string[]> {
    try {
      // 如果没有配置bucket，返回空数组
      if (!this.bucketName) {
        return [];
      }

      const avatarList = await this.getAvatarList();
      
      if (avatarList.length === 0) {
        logger.warn('No avatars found in S3');
        return [];
      }

      // 如果请求的数量大于可用的头像数量，返回所有头像
      if (count >= avatarList.length) {
        return avatarList;
      }

      // 随机选择指定数量的头像
      const selectedAvatars: string[] = [];
      const usedIndices = new Set<number>();

      while (selectedAvatars.length < count) {
        const randomIndex = Math.floor(Math.random() * avatarList.length);
        if (!usedIndices.has(randomIndex)) {
          usedIndices.add(randomIndex);
          selectedAvatars.push(avatarList[randomIndex]);
        }
      }

      return selectedAvatars;
    } catch (error) {
      logger.error('Error getting random avatars:', error);
      return [];
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.avatarCache = null;
    this.cacheExpiryTime = 0;
  }

  /**
   * 验证S3配置是否正确
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      if (!this.bucketName) {
        logger.error('S3 bucket name not configured');
        return false;
      }

      // 尝试列出对象以验证配置
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.avatarPrefix,
        MaxKeys: 1
      });

      await this.s3Client.send(command);
      logger.info('S3 avatar service configuration validated successfully');
      return true;
    } catch (error) {
      logger.error('S3 avatar service configuration validation failed:', error);
      return false;
    }
  }
}

// 导出类和获取实例的方法
export { S3AvatarService };
export const getS3AvatarService = () => S3AvatarService.getInstance(); 