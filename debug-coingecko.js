// 简化的CoinGecko MCP调试脚本
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const COINGECKO_MCP_PATH = '/home/ubuntu/mcp-tools/mcp-coingecko-server/build/index.js';
const TEST_API_KEY = '12c780a2-98f9-4b5d-8166-ae3188b2fa04';

console.log('🔍 CoinGecko MCP 调试工具\n');

// 1. 检查文件是否存在
console.log('1️⃣ 检查文件存在性...');
if (existsSync(COINGECKO_MCP_PATH)) {
  console.log(`✅ 文件存在: ${COINGECKO_MCP_PATH}`);
} else {
  console.log(`❌ 文件不存在: ${COINGECKO_MCP_PATH}`);
  process.exit(1);
}

// 2. 检查环境变量
console.log('\n2️⃣ 检查环境变量...');
const apiKey = process.env.COINGECKO_API_KEY || TEST_API_KEY;
console.log(`COINGECKO_API_KEY: ${apiKey ? '已设置' : '未设置'}`);

// 3. 尝试直接启动MCP服务
console.log('\n3️⃣ 尝试直接启动MCP服务...');

const env = {
  ...process.env,
  COINGECKO_API_KEY: apiKey
};

console.log('启动命令: node', COINGECKO_MCP_PATH);
console.log('环境变量:', { COINGECKO_API_KEY: apiKey ? '***设置***' : '未设置' });

const child = spawn('node', [COINGECKO_MCP_PATH], {
  env,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  const output = data.toString();
  stdout += output;
  console.log(`📤 STDOUT: ${output.trim()}`);
});

child.stderr.on('data', (data) => {
  const output = data.toString();
  stderr += output;
  console.log(`📥 STDERR: ${output.trim()}`);
});

child.on('error', (error) => {
  console.log(`❌ 进程启动错误: ${error.message}`);
});

child.on('close', (code) => {
  console.log(`\n🏁 进程结束，退出代码: ${code}`);
  
  if (code === 0) {
    console.log('✅ MCP服务启动成功');
  } else {
    console.log('❌ MCP服务启动失败');
    console.log('\n完整输出:');
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);
  }
});

// 5秒后终止进程
setTimeout(() => {
  console.log('\n⏰ 5秒测试时间到，终止进程...');
  child.kill('SIGTERM');
}, 5000); 