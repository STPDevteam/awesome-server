import dotenv from 'dotenv';
import { Sequelize, DataTypes } from 'sequelize';
import { getS3AvatarService } from '../dist/services/s3AvatarService.js';
import { logger } from '../dist/utils/logger.js';

dotenv.config();

// 初始化 Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME || 'mcp_server',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false
  }
);

// 定义 User 模型
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nonce: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

async function testUserAvatarAssignment() {
  console.log('🧪 Testing User Avatar Assignment\n');

  try {
    // 1. 测试数据库连接
    console.log('1️⃣ Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // 1.1 同步数据库模型
    console.log('1️⃣.1️⃣ Syncing database models...');
    await sequelize.sync({ force: true }); // 在测试环境中使用 force: true 来重新创建表
    console.log('✅ Database models synced\n');

    // 2. 获取头像服务实例
    console.log('2️⃣ Initializing S3 Avatar Service...');
    const avatarService = getS3AvatarService();
    const avatars = await avatarService.getRandomAvatars(5);
    console.log(`✅ Found ${avatars.length} avatars in S3\n`);

    // 3. 创建测试用户
    console.log('3️⃣ Creating test users...');
    const testUsers = [];
    for (let i = 0; i < 5; i++) {
      const address = `0x${Math.random().toString(16).slice(2)}`;
      const user = await User.create({
        address,
        nonce: Math.floor(Math.random() * 1000000),
        username: `test_user_${Date.now()}_${i}`,
        avatarUrl: await avatarService.getRandomAvatar()
      });
      testUsers.push(user);
      console.log(`  Created user ${i + 1}: ${user.username}`);
      console.log(`  Avatar URL: ${user.avatarUrl}`);
      
      // 验证头像URL是否有效
      if (!user.avatarUrl) {
        console.log('❌ User has no avatar URL');
        continue;
      }

      // 从URL中提取key
      const key = user.avatarUrl.split('/').pop();
      console.log(`  Avatar key: ${key}\n`);
    }

    // 4. 验证每个用户的头像是否不同
    console.log('4️⃣ Verifying avatar uniqueness...');
    const avatarUrls = testUsers.map(user => user.avatarUrl);
    const uniqueAvatars = new Set(avatarUrls);
    console.log(`  Total users: ${testUsers.length}`);
    console.log(`  Unique avatars: ${uniqueAvatars.size}`);
    if (uniqueAvatars.size < testUsers.length) {
      console.log('⚠️  Some users have the same avatar');
    } else {
      console.log('✅ All users have different avatars\n');
    }

    // 5. 清理测试数据
    console.log('5️⃣ Cleaning up test data...');
    for (const user of testUsers) {
      await user.destroy();
    }
    console.log('✅ Test data cleaned up\n');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
  }
}

// 运行测试
testUserAvatarAssignment(); 