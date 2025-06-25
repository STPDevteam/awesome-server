const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 新的MCP服务列表
const NEW_MCPS = [
  // Chain RPC 服务
  { name: 'base-mcp', package: 'base-mcp', category: 'Chain PRC' },
  { name: 'evm-mcp', package: 'evm-mcp-server', category: 'Chain PRC' },
  
  // Market Data 服务
  { name: 'dexscreener-mcp', package: 'dexscreener-mcp-server', category: 'Market Data' },
  { name: 'coingecko-mcp', package: 'mcp-coingecko-server', category: 'Market Data' },
  { name: 'coinmarketcap-mcp', package: 'coinmarketcap-mcp', category: 'Market Data' },
  { name: 'defillama-mcp', package: 'mcp-server-defillama', category: 'Market Data' },
  { name: 'dune-mcp', package: 'dune-mcp-server', category: 'Market Data' },
  { name: 'rugcheck-mcp', package: 'rug-check-mcp', category: 'Market Data' },
  { name: 'chainlink-mcp', package: 'chainlink-feeds-mcp', category: 'Market Data' },
  { name: 'feargreed-mcp', package: 'crypto-feargreed-mcp', category: 'Market Data' },
  { name: 'whaletracker-mcp', package: 'whale-tracker-mcp', category: 'Market Data' },
  
  // Development Tools 服务
  { name: 'github-mcp', package: 'github-mcp-server', category: 'Dev Tool' },
  { name: 'langchain-mcp', package: 'langchain-mcp', category: 'Dev Tool' },
  { name: 'mindsdb-mcp', package: 'minds-mcp', category: 'Dev Tool' },
  { name: 'playwright-mcp', package: 'playwright-mcp', category: 'Dev Tool' },
  { name: 'blender-mcp', package: 'blender-mcp', category: 'Dev Tool' },
  { name: 'unity-mcp', package: 'unity-mcp', category: 'Dev Tool' },
  { name: 'unreal-mcp', package: 'unreal-mcp', category: 'Dev Tool' },
  { name: 'figma-mcp', package: 'figma-context-mcp', category: 'Dev Tool' },
  { name: 'aws-mcp', package: 'aws-mcp', category: 'Dev Tool' },
  { name: 'convex-mcp', package: 'convex-mcp', category: 'Dev Tool' },
  { name: 'cloudflare-mcp', package: 'mcp-server-cloudflare', category: 'Dev Tool' },
  { name: 'supabase-mcp', package: 'supabase-mcp', category: 'Dev Tool' },
  
  // Trading 服务
  { name: 'binance-mcp', package: 'binance-mcp', category: 'Trading' },
  { name: 'uniswap-mcp', package: 'uniswap-trader-mcp', category: 'Trading' },
  { name: 'hyperliquid-mcp', package: 'server-hyperliquid', category: 'Trading' },
  { name: 'pumpfun-mcp', package: 'pumpfun-mcp-server', category: 'Trading' },
  
  // Social 服务
  { name: 'discord-mcp', package: 'mcp-discord', category: 'Social' },
  { name: 'telegram-mcp', package: 'mcp-telegram', category: 'Social' },
  { name: 'x-mcp', package: 'x-mcp-server', category: 'Social' },
  { name: 'notion-mcp', package: 'notion-mcp-server', category: 'Social' }
];

/**
 * 测试单个MCP服务的可用性
 */
function testMCPAvailability(mcp) {
  return new Promise((resolve) => {
    console.log(`\n🔍 测试 ${mcp.name} (${mcp.package})...`);
    
    const child = spawn('npx', ['-y', mcp.package, '--help'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const result = {
        name: mcp.name,
        package: mcp.package,
        category: mcp.category,
        available: false,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: null
      };

      // 判断MCP是否可用
      if (code === 0 || stdout.includes('help') || stdout.includes('usage') || stdout.includes('command')) {
        result.available = true;
        console.log(`✅ ${mcp.name} - 可用`);
      } else {
        console.log(`❌ ${mcp.name} - 不可用 (退出码: ${code})`);
        if (stderr) {
          console.log(`   错误: ${stderr.substring(0, 200)}...`);
        }
      }

      resolve(result);
    });

    child.on('error', (error) => {
      console.log(`❌ ${mcp.name} - 执行错误: ${error.message}`);
      resolve({
        name: mcp.name,
        package: mcp.package,
        category: mcp.category,
        available: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: error.message
      });
    });

    // 超时处理
    setTimeout(() => {
      child.kill();
      console.log(`⏰ ${mcp.name} - 测试超时`);
      resolve({
        name: mcp.name,
        package: mcp.package,
        category: mcp.category,
        available: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: 'Timeout'
      });
    }, 30000);
  });
}

/**
 * 主测试函数
 */
async function testAllMCPs() {
  console.log('🚀 开始测试所有新的MCP服务...\n');
  console.log(`总共需要测试 ${NEW_MCPS.length} 个MCP服务\n`);

  const results = [];
  
  // 串行测试每个MCP（避免并发过多导致系统负载过高）
  for (const mcp of NEW_MCPS) {
    const result = await testMCPAvailability(mcp);
    results.push(result);
    
    // 每个测试之间稍微等待
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 生成测试报告
  console.log('\n📊 测试结果汇总:');
  console.log('='.repeat(80));

  const availableMCPs = results.filter(r => r.available);
  const unavailableMCPs = results.filter(r => !r.available);

  console.log(`\n✅ 可用的MCP服务 (${availableMCPs.length}/${NEW_MCPS.length}):`);
  availableMCPs.forEach(mcp => {
    console.log(`   - ${mcp.name} (${mcp.package}) [${mcp.category}]`);
  });

  console.log(`\n❌ 不可用的MCP服务 (${unavailableMCPs.length}/${NEW_MCPS.length}):`);
  unavailableMCPs.forEach(mcp => {
    console.log(`   - ${mcp.name} (${mcp.package}) [${mcp.category}]`);
    if (mcp.error) {
      console.log(`     错误: ${mcp.error}`);
    }
  });

  // 按类别分组统计
  console.log('\n📈 按类别统计:');
  const categoryStats = {};
  results.forEach(mcp => {
    if (!categoryStats[mcp.category]) {
      categoryStats[mcp.category] = { total: 0, available: 0 };
    }
    categoryStats[mcp.category].total++;
    if (mcp.available) {
      categoryStats[mcp.category].available++;
    }
  });

  Object.entries(categoryStats).forEach(([category, stats]) => {
    console.log(`   ${category}: ${stats.available}/${stats.total} 可用`);
  });

  // 保存详细结果到文件
  const outputPath = path.join(__dirname, '../test-output/new-mcps-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 详细测试结果已保存到: ${outputPath}`);

  // 生成可用MCP列表（用于更新predefinedMCPs.ts）
  const availableMCPsList = availableMCPs.map(mcp => ({
    name: mcp.name,
    package: mcp.package,
    category: mcp.category
  }));

  const availableListPath = path.join(__dirname, '../test-output/available-new-mcps.json');
  fs.writeFileSync(availableListPath, JSON.stringify(availableMCPsList, null, 2));
  console.log(`📝 可用MCP列表已保存到: ${availableListPath}`);

  console.log(`\n🎉 测试完成! 成功率: ${Math.round((availableMCPs.length / NEW_MCPS.length) * 100)}%`);
}

// 运行测试
if (require.main === module) {
  testAllMCPs().catch(console.error);
}

module.exports = { testAllMCPs, NEW_MCPS }; 