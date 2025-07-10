/**
 * 测试Agent头像生成功能
 */

import { generateAgentAvatarUrl, generateAvatarSeed, getRecommendedAvatarStyle } from '../dist/utils/avatarGenerator.js';

async function testAvatarGeneration() {
  console.log('🎨 测试Agent头像生成功能\n');

  // 测试基本头像生成
  console.log('1. 测试基本头像生成：');
  const testNames = [
    'GitHub代码分析专家',
    'CoinGecko市场数据助手',
    'Playwright自动化测试员',
    'X社交媒体管理员',
    'Notion笔记整理助手',
    'TokenInvestmentAnalyst',
    'Data Scientist Helper',
    'Web Scraping Bot'
  ];

  testNames.forEach(name => {
    const seed = generateAvatarSeed(name);
    const avatarUrl = generateAgentAvatarUrl(seed);
    console.log(`  ${name}`);
    console.log(`    种子: ${seed}`);
    console.log(`    头像: ${avatarUrl}`);
    console.log('');
  });

  // 测试根据类别推荐头像样式
  console.log('2. 测试根据类别推荐头像样式：');
  const testCategories = [
    ['Development Tools'],
    ['Market Data'],
    ['Social'],
    ['Automation'],
    ['Productivity'],
    ['General'],
    ['Development Tools', 'Market Data']
  ];

  testCategories.forEach(categories => {
    const style = getRecommendedAvatarStyle(categories);
    console.log(`  类别: ${categories.join(', ')} -> 样式: ${style}`);
  });

  // 测试特殊字符处理
  console.log('\n3. 测试特殊字符处理：');
  const specialNames = [
    'Agent@#$%^&*()',
    '中文名称测试',
    'Agent with spaces',
    'Agent-with-hyphens',
    'Agent_with_underscores',
    '',
    '12345'
  ];

  specialNames.forEach(name => {
    const seed = generateAvatarSeed(name);
    const avatarUrl = generateAgentAvatarUrl(seed);
    console.log(`  "${name}" -> 种子: "${seed}" -> ${avatarUrl}`);
  });

  // 测试头像URL验证
  console.log('\n4. 测试头像URL验证：');
  const sampleUrl = generateAgentAvatarUrl('test-agent');
  console.log(`  样例URL: ${sampleUrl}`);
  console.log(`  URL格式正确: ${sampleUrl.startsWith('https://api.dicebear.com/9.x/bottts-neutral/svg?seed=')}`);
  
  // 验证URL中的seed参数
  const urlParams = new URLSearchParams(sampleUrl.split('?')[1]);
  console.log(`  提取的seed参数: ${urlParams.get('seed')}`);
  
  console.log('\n✅ 头像生成功能测试完成！');
  
  // 显示一些实际的头像URL，用户可以在浏览器中查看
  console.log('\n🖼️  可以在浏览器中查看以下头像：');
  console.log(`  机器人风格: ${generateAgentAvatarUrl('robot-assistant')}`);
  console.log(`  数据分析师: ${generateAgentAvatarUrl('data-analyst')}`);
  console.log(`  代码助手: ${generateAgentAvatarUrl('code-helper')}`);
}

// 运行测试
testAvatarGeneration().catch(console.error); 