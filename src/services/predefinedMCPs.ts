import { MCPService } from './mcpManager.js';
import { logger } from '../utils/logger.js';

/**
 * 预定义的MCP服务列表
 * 这些服务将在应用启动时自动连接
 */
export const predefinedMCPs: MCPService[] = [
    {
        name: 'playwright',
        description: 'Playwright Tools for MCP.',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
        env: {},
        connected: false,
        category: '自动化工具',
        imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
        githubUrl: 'https://github.com/microsoft/playwright'
    }
];

/**
 * 获取预定义的MCP服务
 * @param name MCP名称
 * @returns MCP服务配置
 */
export function getPredefinedMCP(name: string): MCPService | undefined {
    if (name === 'playwright' || name === 'playwright-mcp-service') {
        // 记录更多调试信息
        logger.info(`【MCP调试】获取Playwright MCP配置，请求名称: ${name}`);
        
        // 使用npx直接运行，这在Docker中应该更可靠
        return {
            name: 'playwright',
            description: 'Playwright Tools for MCP (Direct npx).',
            command: 'npx',
            args: ['@playwright/mcp@latest'],
            env: {},
            connected: false,
            category: '自动化工具',
            imageUrl: 'https://playwright.dev/img/playwright-logo.svg',
            githubUrl: 'https://github.com/microsoft/playwright'
        };
    }
    
    return predefinedMCPs.find(mcp => mcp.name === name);
}

/**
 * 获取所有预定义的MCP服务
 * @returns MCP服务配置列表
 */
export function getAllPredefinedMCPs(): MCPService[] {
    return [...predefinedMCPs];
} 