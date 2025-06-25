import { logger } from '../utils/logger.js';

/**
 * Service for handling MCP logos
 * Provides functionality to get logo URLs from S3/CloudFront
 */
export class MCPLogoService {
  private static instance: MCPLogoService | null = null;
  private bucketName: string;
  private region: string;
  private logoPrefix: string;
  private cloudFrontDomain: string | null;

  private constructor() {
    // Get configuration from environment variables
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.logoPrefix = process.env.AWS_S3_MCP_LOGO_PREFIX || 'mcp-logos/';
    
    // Ensure logoPrefix ends with a slash
    if (this.logoPrefix && !this.logoPrefix.endsWith('/')) {
      this.logoPrefix += '/';
    }
    
    // Get CloudFront domain if available
    this.cloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN && 
                           process.env.AWS_CLOUDFRONT_DOMAIN !== 'YOUR_CLOUDFRONT_DOMAIN' &&
                           process.env.AWS_CLOUDFRONT_DOMAIN.includes('.') 
                           ? process.env.AWS_CLOUDFRONT_DOMAIN 
                           : null;

    logger.info(`MCPLogoService initialized with bucket: ${this.bucketName}, prefix: ${this.logoPrefix}`);
    if (this.cloudFrontDomain) {
      logger.info(`Using CloudFront domain: ${this.cloudFrontDomain}`);
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MCPLogoService {
    if (!MCPLogoService.instance) {
      MCPLogoService.instance = new MCPLogoService();
    }
    return MCPLogoService.instance;
  }

  /**
   * Get logo URL for an MCP
   * @param mcpName Name of the MCP
   * @param extension File extension (default: .png)
   * @returns Full URL to the logo
   */
  public getLogoUrl(mcpName: string, extension: string = '.png'): string {
    // Sanitize MCP name for use in file paths
    const sanitizedName = mcpName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    // Ensure extension starts with a dot
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    
    // Build the S3 key
    const key = `${this.logoPrefix}${sanitizedName}${ext}`;
    
    // Return the URL
    return this.getS3ObjectUrl(key);
  }

  /**
   * Get URL for an S3 object
   * @param key S3 object key
   * @returns Full URL to the object
   */
  private getS3ObjectUrl(key: string): string {
    // If CloudFront is configured, use it
    if (this.cloudFrontDomain) {
      return `https://${this.cloudFrontDomain}/${key}`;
    }
    
    // Otherwise use direct S3 URL
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Check if the service is properly configured
   * @returns True if configured, false otherwise
   */
  public isConfigured(): boolean {
    return !!this.bucketName;
  }

  /**
   * Get a fallback logo URL if S3 is not configured
   * @param mcpName Name of the MCP
   * @returns A generic logo URL
   */
  public getFallbackLogoUrl(mcpName: string): string {
    // Generate a color based on the MCP name for consistent colors
    const hash = Array.from(mcpName).reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash) % 360;
    
    // Return a URL to a placeholder image service
    return `https://via.placeholder.com/150/${this.hslToHex(hue, 70, 60)}/FFFFFF?text=${encodeURIComponent(mcpName)}`;
  }

  /**
   * Convert HSL color to hex
   * @param h Hue (0-360)
   * @param s Saturation (0-100)
   * @param l Lightness (0-100)
   * @returns Hex color code without #
   */
  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `${f(0)}${f(8)}${f(4)}`;
  }
}

// Export singleton getter
export const getMCPLogoService = (): MCPLogoService => MCPLogoService.getInstance(); 