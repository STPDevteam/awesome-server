#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const filePath = './src/services/mcpErrorHandler.ts';

// 中文到英文的映射
const translations = {
  // Titles
  '连接超时': 'Connection Timeout',
  '连接被拒绝': 'Connection Refused', 
  '网络错误': 'Network Error',
  '依赖缺失': 'Missing Dependencies',
  '配置错误': 'Configuration Error',
  '请求频率超限': 'Rate Limit Exceeded',
  '未知错误': 'Unknown Error',
  
  // Messages
  '连接服务器超时，可能是网络问题或服务器繁忙': 'Connection to server timed out, possibly due to network issues or server overload',
  '服务器拒绝连接，可能是服务暂时不可用': 'Server refused connection, service may be temporarily unavailable',
  '网络连接出现问题，请检查网络设置': 'Network connection issues occurred, please check network settings',
  '系统缺少必要的依赖程序，无法启动服务': 'System lacks necessary dependencies, unable to start service',
  '服务配置存在问题，请检查配置信息': 'Service configuration has issues, please check configuration settings',
  '请求过于频繁，请稍后再试': 'Requests are too frequent, please try again later',
  '发生了未知错误，请尝试重新操作': 'An unknown error occurred, please try the operation again',
  
  // Suggestions
  '检查网络连接是否稳定': 'Check if network connection is stable',
  '稍后重试连接': 'Try connecting again later',
  '尝试切换网络环境': 'Try switching network environment',
  '联系网络管理员检查防火墙设置': 'Contact network administrator to check firewall settings',
  '确认服务是否正在运行': 'Verify if the service is running',
  '检查服务端口是否正确': 'Check if service port is correct',
  '联系服务提供商确认服务状态': 'Contact service provider to confirm service status',
  '检查网络连接是否正常': 'Check if network connection is normal',
  '尝试重启网络设备': 'Try restarting network equipment',
  '检查DNS设置': 'Check DNS settings',
  '联系网络服务提供商': 'Contact network service provider',
  '安装Node.js和npm': 'Install Node.js and npm',
  '运行npm install安装依赖': 'Run npm install to install dependencies',
  '检查系统PATH环境变量': 'Check system PATH environment variables',
  '联系系统管理员安装依赖': 'Contact system administrator to install dependencies',
  '检查服务配置参数': 'Check service configuration parameters',
  '确认文件路径是否正确': 'Verify if file paths are correct',
  '验证环境变量设置': 'Validate environment variable settings',
  '参考官方文档修正配置': 'Refer to official documentation to correct configuration',
  '减少请求频率': 'Reduce request frequency',
  '等待一段时间后重试': 'Wait for a while and try again',
  '升级账户以获得更高限额': 'Upgrade account for higher limits',
  '优化使用方式减少不必要的请求': 'Optimize usage to reduce unnecessary requests',
  '尝试重新连接': 'Try reconnecting',
  '清除浏览器缓存': 'Clear browser cache',
  '联系技术支持并提供错误信息': 'Contact technical support with error information',
  '检查服务状态页面': 'Check service status page',
  '联系技术支持': 'Contact technical support',
  '尝试使用其他功能': 'Try using other features',

  // Error message patterns
  '的API Key无效或格式错误': ' API Key is invalid or incorrectly formatted',
  '出现内部错误': ' encountered an internal error',
  '请求频率超过限制': ' request frequency exceeded limit',
  '所需的依赖程序未安装': ' required dependencies are not installed',
  '配置有误': ' configuration is incorrect',
  '网络连接错误': ' network connection error',
  '拒绝连接': ' refused connection',
  'MCP服务': 'MCP service',
  'MCP服务': 'MCP service',
  '发生未知错误': ' unknown error occurred'
};

// 读取文件
let content = fs.readFileSync(filePath, 'utf8');

// 替换所有中文内容
for (const [chinese, english] of Object.entries(translations)) {
  content = content.replace(new RegExp(chinese, 'g'), english);
}

// 写回文件
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Successfully replaced all Chinese text with English in MCPErrorHandler');
console.log('📝 Updated file:', filePath); 