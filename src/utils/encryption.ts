import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * AES加密工具类
 * 使用AES-256-CBC算法进行对称加密
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly keyLength = 32; // 256位密钥
  private readonly ivLength = 16; // 128位初始化向量
  private readonly encryptionKey: Buffer;

  constructor() {
    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      throw new Error('ENCRYPTION_SECRET环境变量未设置');
    }

    // 使用PBKDF2从密钥字符串派生固定长度的密钥
    this.encryptionKey = crypto.pbkdf2Sync(
      encryptionSecret,
      'mcp-server-salt', // 固定盐值
      100000, // 迭代次数
      this.keyLength,
      'sha256'
    );
  }

  /**
   * 加密数据
   * @param plaintext 要加密的明文
   * @returns 加密后的数据（Base64编码）
   */
  encrypt(plaintext: string): string {
    try {
      // 生成随机初始化向量
      const iv = crypto.randomBytes(this.ivLength);
      
      // 创建加密器
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // 加密数据
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 组合IV和加密数据
      const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
      
      // 返回Base64编码的结果
      return combined.toString('base64');
    } catch (error) {
      logger.error('加密失败:', error);
      throw new Error('数据加密失败');
    }
  }

  /**
   * 解密数据
   * @param encryptedData 加密的数据（Base64编码）
   * @returns 解密后的明文
   */
  decrypt(encryptedData: string): string {
    try {
      // 解码Base64数据
      const combined = Buffer.from(encryptedData, 'base64');
      
      // 提取IV（前16字节）
      const iv = combined.subarray(0, this.ivLength);
      
      // 提取加密数据（剩余部分）
      const encrypted = combined.subarray(this.ivLength);
      
      // 创建解密器
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      
      // 解密数据
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('解密失败:', error);
      throw new Error('数据解密失败');
    }
  }

  /**
   * 加密对象（将对象转为JSON后加密）
   * @param obj 要加密的对象
   * @returns 加密后的数据（Base64编码）
   */
  encryptObject(obj: any): string {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  /**
   * 解密对象（解密后解析为JSON对象）
   * @param encryptedData 加密的数据（Base64编码）
   * @returns 解密后的对象
   */
  decryptObject<T = any>(encryptedData: string): T {
    const jsonString = this.decrypt(encryptedData);
    return JSON.parse(jsonString);
  }

  /**
   * 生成新的加密密钥（用于初始化）
   * @returns Base64编码的随机密钥
   */
  static generateEncryptionSecret(): string {
    return crypto.randomBytes(64).toString('base64');
  }
}

// 创建单例实例
let encryptionService: EncryptionService | null = null;

/**
 * 获取加密服务实例
 */
export function getEncryptionService(): EncryptionService {
  if (!encryptionService) {
    encryptionService = new EncryptionService();
  }
  return encryptionService;
}

/**
 * 生成加密密钥的辅助函数
 */
export function generateEncryptionSecret(): string {
  return EncryptionService.generateEncryptionSecret();
} 