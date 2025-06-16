import { db } from '../src/config/database.js';
import { migrationService } from '../src/scripts/migrate-database.js';
import { userService } from '../src/services/auth/userService.js';

async function testDatabase() {
  console.log('🧪 开始数据库测试...\n');
  
  try {
    // 1. 测试数据库连接
    console.log('1️⃣ 测试数据库连接...');
    const isConnected = await db.checkConnection();
    if (isConnected) {
      console.log('✅ 数据库连接成功');
    } else {
      throw new Error('数据库连接失败');
    }
    
    // 2. 运行迁移
    console.log('\n2️⃣ 运行数据库迁移...');
    await migrationService.runMigrations();
    console.log('✅ 数据库迁移完成');
    
    // 3. 测试用户创建
    console.log('\n3️⃣ 测试用户创建...');
    const testUser = await userService.createUser({
      username: 'Test User',
      walletAddress: '0x1234567890123456789012345678901234567890',
      loginMethod: 'wallet',
      loginData: { address: '0x1234567890123456789012345678901234567890' }
    });
    console.log('✅ 用户创建成功:', testUser.id);
    
    // 4. 测试用户查询
    console.log('\n4️⃣ 测试用户查询...');
    const foundUser = await userService.getUserById(testUser.id);
    if (foundUser) {
      console.log('✅ 用户查询成功:', foundUser.username);
    } else {
      throw new Error('用户查询失败');
    }
    
    // 5. 测试通过钱包地址查询用户
    console.log('\n5️⃣ 测试通过钱包地址查询用户...');
    const walletUser = await userService.getUserByWallet('0x1234567890123456789012345678901234567890');
    if (walletUser) {
      console.log('✅ 钱包地址查询成功:', walletUser.username);
    } else {
      throw new Error('钱包地址查询失败');
    }
    
    // 6. 测试用户更新
    console.log('\n6️⃣ 测试用户更新...');
    const updatedUser = await userService.updateUser(testUser.id, {
      username: 'Updated Test User'
    });
    if (updatedUser && updatedUser.username === 'Updated Test User') {
      console.log('✅ 用户更新成功:', updatedUser.username);
    } else {
      throw new Error('用户更新失败');
    }
    
    // 7. 测试用户统计
    console.log('\n7️⃣ 测试用户统计...');
    const stats = await userService.getUserStats();
    console.log('✅ 用户统计成功:', stats);
    
    // 8. 清理测试数据
    console.log('\n8️⃣ 清理测试数据...');
    const deleted = await userService.deleteUser(testUser.id);
    if (deleted) {
      console.log('✅ 测试数据清理成功');
    } else {
      throw new Error('测试数据清理失败');
    }
    
    console.log('\n🎉 所有数据库测试通过！');
    
  } catch (error) {
    console.error('❌ 数据库测试失败:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await db.close();
    console.log('\n🔌 数据库连接已关闭');
  }
}

// 运行测试
testDatabase(); 