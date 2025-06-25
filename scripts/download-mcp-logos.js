#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { mcpInfoService } from '../src/services/mcpInfoService.js';

// 获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建目标目录
const logoDir = path.join(__dirname, '../mcp-logos');
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir);
  console.log(`Created directory: ${logoDir}`);
}

// 获取所有MCP信息
const mcps = mcpInfoService.getAllMCPs();

// 下载单个logo
async function downloadLogo(url, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(logoDir, filename);
    const file = fs.createWriteStream(filePath);
    
    console.log(`Downloading ${url} to ${filePath}`);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${url}`);
        resolve(filePath);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file if download failed
      reject(err);
    });
  });
}

// 获取文件扩展名
function getFileExtension(url) {
  // 解析URL路径
  const pathname = new URL(url).pathname;
  // 获取文件名
  const filename = pathname.split('/').pop() || '';
  // 获取扩展名
  const ext = path.extname(filename);
  return ext || '.png'; // 如果没有扩展名，默认为.png
}

// 主函数
async function main() {
  console.log('Starting MCP logo download process...');
  console.log(`Logos will be saved to: ${logoDir}`);
  
  // 用于存储下载信息
  const downloadInfo = [];
  
  for (const mcp of mcps) {
    try {
      if (!mcp.imageUrl) {
        console.log(`Skipping ${mcp.name}: No image URL`);
        continue;
      }
      
      // 获取文件扩展名
      const ext = getFileExtension(mcp.imageUrl);
      const filename = `${mcp.name}${ext}`;
      
      // 下载logo
      await downloadLogo(mcp.imageUrl, filename);
      
      downloadInfo.push({
        name: mcp.name,
        originalUrl: mcp.imageUrl,
        filename: filename,
        s3Key: `mcp-logos/${filename}`
      });
    } catch (err) {
      console.error(`Error processing ${mcp.name} logo:`, err);
    }
  }
  
  // 生成上传信息文件
  const infoPath = path.join(logoDir, 'upload-info.json');
  fs.writeFileSync(infoPath, JSON.stringify(downloadInfo, null, 2));
  console.log(`\nDownload information saved to: ${infoPath}`);
  
  console.log('\nDownload process completed successfully!');
  console.log(`\nTotal logos downloaded: ${downloadInfo.length}`);
  console.log('\nNext steps:');
  console.log('1. Upload the logo files to your S3 bucket under the "mcp-logos/" prefix');
  console.log('2. Set the environment variables:');
  console.log('   - AWS_S3_BUCKET_NAME: Your S3 bucket name');
  console.log('   - AWS_REGION: Your AWS region');
  console.log('   - AWS_S3_MCP_LOGO_PREFIX: "mcp-logos/" (or your custom prefix)');
  console.log('   - AWS_CLOUDFRONT_DOMAIN: Your CloudFront domain (if applicable)');
}

main().catch(err => {
  console.error('Error in main process:', err);
  process.exit(1);
}); 