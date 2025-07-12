const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function debugMCPConnectionIssue() {
  console.log('🔍 MCP Connection Issue Diagnostic Tool');
  console.log('=====================================\n');

  // 1. 检查环境变量
  console.log('1. 🔑 Environment Variables Check:');
  const envVars = [
    'COINGECKO_API_KEY',
    'COINMARKETCAP_API_KEY',
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'TWITTER_API_KEY',
    'BINANCE_API_KEY'
  ];
  
  envVars.forEach(envVar => {
    const value = process.env[envVar];
    if (value) {
      console.log(`   ✅ ${envVar}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`   ❌ ${envVar}: Not set`);
    }
  });
  console.log();

  // 2. 检查本地构建文件
  console.log('2. 📁 Local Build Files Check:');
  const localBuilds = [
    '/home/ubuntu/mcp-tools/dexscreener-mcp-server/build/index.js',
    '/home/ubuntu/mcp-tools/mcp-coingecko-server/build/index.js',
    '/home/ubuntu/mcp-tools/x-mcp-server/build/index.js',
    '/home/ubuntu/mcp-tools/binance-mcp/build/index.js',
    '/home/ubuntu/mcp-tools/uniswap-trader-mcp/index.js'
  ];

  for (const buildPath of localBuilds) {
    if (fs.existsSync(buildPath)) {
      const stats = fs.statSync(buildPath);
      console.log(`   ✅ ${path.basename(path.dirname(buildPath))}: ${buildPath} (${stats.size} bytes)`);
    } else {
      console.log(`   ❌ ${path.basename(path.dirname(buildPath))}: ${buildPath} - File not found`);
    }
  }
  console.log();

  // 3. 检查Node.js进程
  console.log('3. 🔄 Running Node.js Processes:');
  try {
    const { stdout } = await execAsync('ps aux | grep node | grep -v grep');
    const nodeProcesses = stdout.split('\n').filter(line => line.trim());
    
    if (nodeProcesses.length > 0) {
      nodeProcesses.forEach(process => {
        if (process.includes('mcp') || process.includes('dexscreener') || process.includes('coingecko')) {
          console.log(`   🔄 ${process}`);
        }
      });
    } else {
      console.log('   ℹ️  No MCP-related Node.js processes found');
    }
  } catch (error) {
    console.log(`   ❌ Error checking processes: ${error.message}`);
  }
  console.log();

  // 4. 测试MCP服务器启动
  console.log('4. 🧪 Testing MCP Server Startup:');
  
  // 测试DexScreener MCP
  console.log('   Testing DexScreener MCP...');
  try {
    const dexscreenerPath = '/home/ubuntu/mcp-tools/dexscreener-mcp-server/build/index.js';
    if (fs.existsSync(dexscreenerPath)) {
      const testProcess = exec(`timeout 5s node ${dexscreenerPath}`, (error, stdout, stderr) => {
        if (stdout) console.log(`   📤 DexScreener stdout: ${stdout.substring(0, 200)}...`);
        if (stderr) console.log(`   📥 DexScreener stderr: ${stderr.substring(0, 200)}...`);
      });
      
      // 给进程一些时间启动
      setTimeout(() => {
        testProcess.kill();
      }, 3000);
    } else {
      console.log('   ❌ DexScreener build file not found');
    }
  } catch (error) {
    console.log(`   ❌ DexScreener test error: ${error.message}`);
  }

  // 测试CoinGecko MCP
  console.log('   Testing CoinGecko MCP...');
  try {
    const coingeckoPath = '/home/ubuntu/mcp-tools/mcp-coingecko-server/build/index.js';
    if (fs.existsSync(coingeckoPath)) {
      const env = { ...process.env, COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || 'test-key' };
      const testProcess = exec(`timeout 5s node ${coingeckoPath}`, { env }, (error, stdout, stderr) => {
        if (stdout) console.log(`   📤 CoinGecko stdout: ${stdout.substring(0, 200)}...`);
        if (stderr) console.log(`   📥 CoinGecko stderr: ${stderr.substring(0, 200)}...`);
      });
      
      setTimeout(() => {
        testProcess.kill();
      }, 3000);
    } else {
      console.log('   ❌ CoinGecko build file not found');
    }
  } catch (error) {
    console.log(`   ❌ CoinGecko test error: ${error.message}`);
  }

  // 5. 检查网络连接
  console.log('\n5. 🌐 Network Connectivity Check:');
  try {
    const { stdout } = await execAsync('curl -s -o /dev/null -w "%{http_code}" https://api.coingecko.com/api/v3/ping');
    if (stdout.trim() === '200') {
      console.log('   ✅ CoinGecko API reachable');
    } else {
      console.log(`   ❌ CoinGecko API unreachable (HTTP ${stdout.trim()})`);
    }
  } catch (error) {
    console.log(`   ❌ Network check error: ${error.message}`);
  }

  console.log('\n6. 💡 Recommendations:');
  
  if (!process.env.COINGECKO_API_KEY) {
    console.log('   🔑 Set COINGECKO_API_KEY environment variable');
  }
  
  const missingBuilds = localBuilds.filter(build => !fs.existsSync(build));
  if (missingBuilds.length > 0) {
    console.log('   📦 Missing build files - run build scripts for:');
    missingBuilds.forEach(build => {
      console.log(`      - ${path.basename(path.dirname(build))}`);
    });
  }
  
  console.log('   🔄 Consider restarting the MCP server to clear connection issues');
  console.log('   🧹 Check for zombie processes that might be holding ports');
  
  console.log('\n✅ Diagnostic complete!');
}

// 运行诊断
debugMCPConnectionIssue().catch(console.error); 