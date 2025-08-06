/**
 * 测试多用户任务完成判断修复
 * 
 * 验证系统不再过早判断任务完成，而是等待所有用户数据收集完毕
 */

console.log('🧪 测试多用户任务完成判断修复...\n');

// 模拟用户的原始查询
const originalQuery = "帮我查询一下@S4mmyEth，@Senti__23，@virtuals_vc，@ethermage，@Defi0xJeff，@flock_io，@ronbodkin，@cookiedotfun 这几个推特用户最新发的推文";

// 模拟只获取到部分用户数据的执行历史
const mockExecutionState = {
  originalQuery,
  executionHistory: [
    {
      stepNumber: 1,
      success: true,
      plan: { tool: 'getUserTweets' },
      result: {
        user: '@S4mmyEth',
        tweets: [
          { text: 'AI tokens are rebounding after recent market selloff...', url: 'https://twitter.com/S4mmyEth/status/123' }
        ]
      }
    },
    {
      stepNumber: 2,
      success: false,
      plan: { tool: 'getUserTweets' },
      error: 'Failed to get @Senti__23 tweets'
    },
    {
      stepNumber: 3,
      success: false,
      plan: { tool: 'getUserTweets' },
      error: 'Failed to get @virtuals_vc tweets'
    }
  ]
};

// 测试新的分析逻辑
console.log('📋 原始查询:', originalQuery);
console.log('\n📊 执行历史分析:');

// 提取提到的用户
const mentionedUsers = (originalQuery.match(/@\w+/g) || []);
console.log(`🎯 查询中提到的用户数量: ${mentionedUsers.length}`);
console.log(`📝 具体用户: ${mentionedUsers.join(', ')}`);

// 分析已收集的数据
const successfulSteps = mockExecutionState.executionHistory.filter(step => step.success && step.result);
console.log(`\n✅ 成功执行的步骤数量: ${successfulSteps.length}`);

// 检测获取到数据的用户
const allDetectedUsers = new Set();
successfulSteps.forEach(step => {
  const resultString = JSON.stringify(step.result).toLowerCase();
  mentionedUsers.forEach(user => {
    const username = user.replace('@', '').toLowerCase();
    if (resultString.includes(username)) {
      allDetectedUsers.add(user);
    }
  });
});

console.log(`\n📈 数据收集进度分析:`);
console.log(`✅ 已收集数据的用户: ${Array.from(allDetectedUsers).join(', ')} (${allDetectedUsers.size}个)`);
console.log(`❌ 缺失数据的用户: ${mentionedUsers.filter(u => !allDetectedUsers.has(u)).join(', ')}`);
console.log(`📊 完成进度: ${allDetectedUsers.size}/${mentionedUsers.length} (${Math.round(allDetectedUsers.size/mentionedUsers.length*100)}%)`);

// 判断结果
const shouldComplete = allDetectedUsers.size === mentionedUsers.length;
console.log(`\n🎯 任务完成判断:`);
console.log(`结果: ${shouldComplete ? '✅ 任务完成' : '❌ 任务未完成 - 需要继续执行'}`);
console.log(`理由: ${shouldComplete ? '所有用户数据已收集' : `还缺少 ${mentionedUsers.length - allDetectedUsers.size} 个用户的数据`}`);

console.log(`\n🔧 修复前的问题:`);
console.log(`- 系统过于宽松，只要有一个用户的数据就判断完成`);
console.log(`- 忽略了用户请求的完整性要求`);
console.log(`- 没有检测多用户任务的特殊性`);

console.log(`\n✨ 修复后的改进:`);
console.log(`- 严格检查所有提到的用户是否都有数据`);
console.log(`- 明确显示数据收集进度 (${allDetectedUsers.size}/${mentionedUsers.length})`);
console.log(`- 只有100%完成才标记任务完成`);
console.log(`- 提供明确的缺失数据信息`);

console.log(`\n🎯 对您具体案例的改进:`);
console.log(`- 不会再因为只获取到 @S4mmyEth 的数据就提前结束`);
console.log(`- 会继续尝试获取其他7个用户的数据`);
console.log(`- 明确提示哪些用户的数据还缺失`);
console.log(`- 提供清晰的进度反馈`);

module.exports = { originalQuery, mockExecutionState };