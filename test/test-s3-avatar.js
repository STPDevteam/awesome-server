import dotenv from 'dotenv';

// 确保在其他导入之前加载环境变量
dotenv.config();

import { getS3AvatarService } from '../dist/services/s3AvatarService.js';

console.log('🧪 Testing S3 Avatar Service\n');

async function testS3AvatarService() {
  try {
    // 获取 S3 头像服务实例
    const s3AvatarService = getS3AvatarService();
    
    // 1. 验证配置
    console.log('1️⃣ Validating S3 configuration...');
    const isValid = await s3AvatarService.validateConfiguration();
    
    if (!isValid) {
      console.error('❌ S3 configuration is invalid');
      console.log('\nPlease check your environment variables:');
      console.log('- AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || 'NOT SET');
      console.log('- AWS_REGION:', process.env.AWS_REGION || 'NOT SET');
      console.log('- AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET');
      console.log('- AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET');
      console.log('- AWS_S3_AVATAR_PREFIX:', process.env.AWS_S3_AVATAR_PREFIX || 'avatars/');
      return;
    }
    
    console.log('✅ S3 configuration validated successfully\n');
    
    // 2. 获取随机头像
    console.log('2️⃣ Getting random avatars...');
    
    for (let i = 0; i < 5; i++) {
      const avatar = await s3AvatarService.getRandomAvatar();
      
      if (avatar) {
        console.log(`  Avatar ${i + 1}: ${avatar}`);
      } else {
        console.log(`  Avatar ${i + 1}: No avatar returned`);
      }
    }
    
    console.log('\n3️⃣ Testing cache functionality...');
    
    // 清除缓存
    s3AvatarService.clearCache();
    console.log('  Cache cleared');
    
    // 第一次调用（应该从S3加载）
    console.time('  First call (from S3)');
    const avatar1 = await s3AvatarService.getRandomAvatar();
    console.timeEnd('  First call (from S3)');
    
    // 第二次调用（应该从缓存加载）
    console.time('  Second call (from cache)');
    const avatar2 = await s3AvatarService.getRandomAvatar();
    console.timeEnd('  Second call (from cache)');
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error(error.stack);
  }
}

// 运行测试
testS3AvatarService()
  .then(() => process.exit(0))
  .catch(() => process.exit(1)); 