import { SiweMessage, generateNonce } from 'siwe';
import { ethers } from 'ethers';

export interface NonceData {
  nonce: string;
  expiresAt: Date;
  address: string;
}

export interface WalletLoginRequest {
  message: string;
  signature: string;
}

export interface WalletLoginResult {
  isValid: boolean;
  address?: string;
  error?: string;
}

class WalletAuthService {
  private nonces: Map<string, NonceData> = new Map();
  private readonly NONCE_EXPIRY_MINUTES = 10;

  /**
   * 生成登录随机数
   */
  generateLoginNonce(address: string): string {
    // 清理过期的nonce
    this.cleanExpiredNonces();

    // 确保地址是校验和格式（EIP-55）
    const checksumAddress = ethers.getAddress(address);

    const nonce = generateNonce();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.NONCE_EXPIRY_MINUTES);

    this.nonces.set(nonce, {
      nonce,
      expiresAt,
      address: checksumAddress
    });

    return nonce;
  }

  /**
   * 创建SIWE消息
   */
  createSiweMessage(params: {
    address: string;
    domain: string;
    uri: string;
    nonce: string;
    chainId?: number;
    version?: string;
    statement?: string;
  }): string {
    // 确保地址是校验和格式（EIP-55）
    const checksumAddress = ethers.getAddress(params.address);
    
    const now = new Date();
    const expirationTime = new Date(Date.now() + this.NONCE_EXPIRY_MINUTES * 60 * 1000);
    
    const siweMessage = new SiweMessage({
      domain: params.domain,
      address: checksumAddress,
      statement: params.statement || 'Sign in to MCP LangChain Service',
      uri: params.uri,
      version: params.version || '1',
      chainId: params.chainId || 1,
      nonce: params.nonce,
      issuedAt: now.toISOString(),
      expirationTime: expirationTime.toISOString()
    });

    return siweMessage.prepareMessage();
  }

  /**
   * 验证钱包签名
   */
  async verifyWalletSignature(request: WalletLoginRequest): Promise<WalletLoginResult> {
    try {
      // 解析SIWE消息
      const siweMessage = new SiweMessage(request.message);
      
      // 验证nonce是否存在且未过期
      const nonceData = this.nonces.get(siweMessage.nonce);
      if (!nonceData) {
        return { isValid: false, error: '无效的nonce' };
      }

      if (new Date() > nonceData.expiresAt) {
        this.nonces.delete(siweMessage.nonce);
        return { isValid: false, error: 'nonce已过期' };
      }

      // 验证地址匹配（使用校验和格式比较）
      const messageAddress = ethers.getAddress(siweMessage.address);
      if (messageAddress !== nonceData.address) {
        return { isValid: false, error: '地址不匹配' };
      }

      // 验证消息和签名
      const verificationResult = await siweMessage.verify({
        signature: request.signature
      });

      if (!verificationResult.success) {
        return { 
          isValid: false, 
          error: verificationResult.error?.type || '签名验证失败' 
        };
      }

      // 验证成功，清理使用过的nonce
      this.nonces.delete(siweMessage.nonce);

      return {
        isValid: true,
        address: siweMessage.address
      };

    } catch (error) {
      console.error('钱包签名验证错误:', error);
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : '签名验证失败' 
      };
    }
  }

  /**
   * 验证以太坊地址格式
   */
  isValidEthereumAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  /**
   * 获取钱包余额（这里只是示例，实际应该连接到区块链）
   */
  async getWalletBalance(address: string, rpcUrl?: string): Promise<string> {
    try {
      if (!this.isValidEthereumAddress(address)) {
        throw new Error('无效的以太坊地址');
      }

      // 如果提供了RPC URL，查询实际余额
      if (rpcUrl) {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const balance = await provider.getBalance(address);
        return ethers.formatEther(balance);
      }

      // 否则返回模拟余额
      return '0.0';
    } catch (error) {
      console.error('获取钱包余额错误:', error);
      return '0.0';
    }
  }

  /**
   * 清理过期的nonce
   */
  private cleanExpiredNonces(): void {
    const now = new Date();
    for (const [nonce, data] of this.nonces.entries()) {
      if (now > data.expiresAt) {
        this.nonces.delete(nonce);
      }
    }
  }

  /**
   * 获取nonce统计信息
   */
  getNonceStats(): { active: number; total: number } {
    this.cleanExpiredNonces();
    return {
      active: this.nonces.size,
      total: this.nonces.size
    };
  }
}

export const walletAuthService = new WalletAuthService(); 