require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pg = require('pg');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mcp_server',
  user: process.env.DB_USER || 'pete',
  password: process.env.DB_PASSWORD || '',
};

async function createTestUser() {
  const client = new pg.Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // 测试用户数据
    const userId = 'test-user-001';
    const walletAddress = '0x1234567890123456789012345678901234567890';
    const username = 'test_user_' + Date.now();
    
    // 创建用户
    const createUserQuery = `
      INSERT INTO users (id, username, wallet_address, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username,
          wallet_address = EXCLUDED.wallet_address,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await client.query(createUserQuery, [userId, username, walletAddress, true]);
    const user = result.rows[0];
    
    console.log('\n✅ Test user created successfully!');
    console.log('\n📋 User Details:');
    console.log(`- User ID: ${user.id}`);
    console.log(`- Username: ${user.username}`);
    console.log(`- Wallet Address: ${user.wallet_address}`);
    console.log(`- Active: ${user.is_active}`);
    
    // 创建钱包登录方法
    const createLoginMethodQuery = `
      INSERT INTO user_login_methods (user_id, method_type, method_data, verified, created_at, updated_at)
      VALUES ($1, 'wallet', $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, method_type) DO UPDATE
      SET method_data = EXCLUDED.method_data,
          verified = EXCLUDED.verified,
          updated_at = CURRENT_TIMESTAMP
    `;
    
    const methodData = JSON.stringify({
      address: walletAddress,
      chainId: 1,
      lastSignedAt: new Date().toISOString()
    });
    
    await client.query(createLoginMethodQuery, [userId, methodData]);
    console.log('\n✅ Wallet login method created');
    
    // 生成测试代码
    console.log('\n📝 Use this code in your tests:');
    console.log(`
// In test-awe-payment.cjs
function createTestToken() {
  const payload = {
    userId: '${userId}',
    walletAddress: '${walletAddress}'
  };
  
  const secret = process.env.JWT_ACCESS_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}
    `);
    
    return user;
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// 运行创建测试用户
createTestUser()
  .then(() => {
    console.log('\n✅ Test setup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to create test user:', error);
    process.exit(1);
  }); 