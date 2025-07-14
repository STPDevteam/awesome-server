/**
 * Test Avatar Generation Utility
 * 验证头像生成工具是否符合DiceBear API文档要求
 */

import { 
  generateAgentAvatarUrl, 
  generateAgentAvatarUrlWithOptions,
  generateAvatarSeed,
  generateAgentAvatar,
  getRecommendedAvatarStyle,
  isValidAvatarStyle,
  getAvatarPreviewUrl,
  AGENT_AVATAR_STYLES
} from '../src/utils/avatarGenerator.js';

console.log('🧪 Testing Avatar Generation Utility\n');

// Test 1: Basic avatar URL generation
console.log('1️⃣ Basic Avatar URL Generation:');
const basicUrl = generateAgentAvatarUrl('TestAgent');
console.log(`   Input: 'TestAgent'`);
console.log(`   Output: ${basicUrl}`);
console.log(`   Expected format: https://api.dicebear.com/9.x/bottts/svg?seed=testagent`);
console.log(`   ✅ Matches expected format: ${basicUrl.includes('https://api.dicebear.com/9.x/bottts/svg?seed=testagent')}\n`);

// Test 2: Seed generation
console.log('2️⃣ Seed Generation:');
const testCases = [
  'My Test Agent',
  'Agent_With_Underscores',
  'Agent-With-Dashes',
  'Agent123',
  'Agent with Special!@#$%^&*()Characters',
  '',
  '   ',
  'UPPERCASE_AGENT'
];

testCases.forEach(testCase => {
  const seed = generateAvatarSeed(testCase);
  console.log(`   Input: '${testCase}' → Seed: '${seed}'`);
});
console.log();

// Test 3: Avatar URL with options
console.log('3️⃣ Avatar URL with Options:');
const urlWithOptions = generateAgentAvatarUrlWithOptions('TestAgent', {
  style: 'bottts',
  backgroundColor: ['ff0000', '00ff00'],
  size: 256,
  format: 'png',
  flip: true,
  rotate: 45
});
console.log(`   URL with options: ${urlWithOptions}`);
console.log(`   Should include: backgroundColor, size, format, flip, rotate parameters\n`);

// Test 4: Style validation
console.log('4️⃣ Style Validation:');
console.log(`   Available styles: ${AGENT_AVATAR_STYLES.join(', ')}`);
console.log(`   'bottts' is valid: ${isValidAvatarStyle('bottts')}`);
console.log(`   'invalid-style' is valid: ${isValidAvatarStyle('invalid-style')}`);
console.log();

// Test 5: Recommended style
console.log('5️⃣ Recommended Style:');
const categories = ['Development Tools', 'Market Data', 'Social'];
categories.forEach(category => {
  const style = getRecommendedAvatarStyle([category]);
  console.log(`   Category '${category}' → Style: '${style}'`);
});
console.log(`   No category → Style: '${getRecommendedAvatarStyle()}'`);
console.log();

// Test 6: Complete avatar generation
console.log('6️⃣ Complete Avatar Generation:');
const completeAvatar = generateAgentAvatar('My AI Assistant', ['Development Tools']);
console.log(`   Agent: 'My AI Assistant'`);
console.log(`   Categories: ['Development Tools']`);
console.log(`   Generated URL: ${completeAvatar}`);
console.log();

// Test 7: Preview URL
console.log('7️⃣ Preview URL Generation:');
const previewUrl = getAvatarPreviewUrl('preview-test', 'avataaars');
console.log(`   Preview URL: ${previewUrl}`);
console.log();

// Test 8: Edge cases
console.log('8️⃣ Edge Cases:');
console.log(`   Empty name: ${generateAgentAvatarUrl('')}`);
console.log(`   Null/undefined handling: ${generateAvatarSeed(null)}`);
console.log(`   Very long name: ${generateAvatarSeed('This is a very long agent name that should be handled properly by the seed generation function')}`);
console.log();

// Test 9: URL validation
console.log('9️⃣ URL Validation:');
const testUrls = [
  generateAgentAvatarUrl('SimpleAgent'),
  generateAgentAvatarUrl('Agent With Spaces'),
  generateAgentAvatarUrl('Agent_With_Special_Characters!@#$%')
];

testUrls.forEach((url, index) => {
  try {
    new URL(url);
    console.log(`   URL ${index + 1}: ✅ Valid`);
  } catch (error) {
    console.log(`   URL ${index + 1}: ❌ Invalid - ${error.message}`);
  }
});
console.log();

// Test 10: DiceBear API compliance
console.log('🔟 DiceBear API Compliance Check:');
const complianceUrl = generateAgentAvatarUrl('ComplianceTest');
const urlParts = complianceUrl.split('/');
console.log(`   Base URL: https://api.dicebear.com`);
console.log(`   Version: ${urlParts[3]} (should be 9.x)`);
console.log(`   Style: ${urlParts[4]} (should be bottts)`);
console.log(`   Format: ${urlParts[5].split('?')[0]} (should be svg)`);
console.log(`   Seed parameter: ${complianceUrl.includes('seed=')} (should be true)`);
console.log();

console.log('✅ Avatar Generation Utility Test Complete'); 