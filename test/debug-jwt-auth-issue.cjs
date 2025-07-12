const axios = require('axios');
const jwt = require('jsonwebtoken');

// 诊断JWT认证问题
async function debugJWTAuthIssue() {
  const baseURL = 'https://api-test.awenetwork.ai';
  
  console.log('🔍 开始诊断JWT认证问题...\n');

  try {
    // 1. 检查服务器状态
    console.log('📡 1. 检查服务器状态...');
    const healthResponse = await axios.get(`${baseURL}/api/health`).catch(err => {
      console.log('   ❌ 健康检查失败，尝试基本连接...');
      return null;
    });
    
    if (healthResponse) {
      console.log('   ✅ 服务器运行正常');
    } else {
      console.log('   ⚠️  健康检查端点不存在，但服务器可访问');
    }

    // 2. 测试获取nonce
    console.log('\n🔑 2. 测试获取钱包登录nonce...');
    const walletAddress = '0x6Bb726C1A5c6a629911ecE7657D2fb3414a5B200';
    const nonceResponse = await axios.post(`${baseURL}/api/auth/wallet/nonce`, {
      address: walletAddress,
      origin: 'http://localhost:3000'
    });
    
    if (nonceResponse.data.success) {
      console.log('   ✅ Nonce获取成功');
      console.log(`   📝 Nonce: ${nonceResponse.data.data.nonce}`);
      console.log(`   📝 Domain: ${nonceResponse.data.data.domain}`);
    } else {
      console.log('   ❌ Nonce获取失败');
      return;
    }

    // 3. 检查数据库连接（通过创建测试用户）
    console.log('\n🗄️  3. 检查数据库连接...');
    const testUserId = `test_user_${Date.now()}`;
    const testUserResponse = await axios.post(`${baseURL}/api/auth/create-test-user`, {
      userId: testUserId,
      username: `TestUser_${Date.now()}`
    }).catch(err => {
      console.log('   ❌ 测试用户创建失败:', err.response?.data?.error || err.message);
      return null;
    });
    
    if (testUserResponse && testUserResponse.data.success) {
      console.log('   ✅ 数据库连接正常');
      console.log(`   👤 测试用户创建成功: ${testUserResponse.data.user.username}`);
    } else {
      console.log('   ❌ 数据库连接可能有问题');
    }

    // 4. 检查JWT配置
    console.log('\n🔐 4. 检查JWT配置...');
    
    // 模拟JWT令牌生成（使用默认密钥）
    const testPayload = {
      userId: 'test-user-123',
      walletAddress: walletAddress,
      email: null
    };
    
    const defaultAccessSecret = 'your-access-secret-key';
    const defaultRefreshSecret = 'your-refresh-secret-key';
    
    try {
      const testAccessToken = jwt.sign(testPayload, defaultAccessSecret, { expiresIn: '10h' });
      const testRefreshToken = jwt.sign({ userId: 'test-user-123' }, defaultRefreshSecret, { expiresIn: '7d' });
      
      console.log('   ✅ JWT令牌生成测试成功');
      console.log(`   🔑 测试访问令牌长度: ${testAccessToken.length}`);
      console.log(`   🔑 测试刷新令牌长度: ${testRefreshToken.length}`);
      
      // 验证令牌
      const decodedAccess = jwt.verify(testAccessToken, defaultAccessSecret);
      const decodedRefresh = jwt.verify(testRefreshToken, defaultRefreshSecret);
      
      console.log('   ✅ JWT令牌验证测试成功');
      console.log(`   📅 访问令牌过期时间: ${new Date(decodedAccess.exp * 1000).toISOString()}`);
      console.log(`   📅 刷新令牌过期时间: ${new Date(decodedRefresh.exp * 1000).toISOString()}`);
      
    } catch (error) {
      console.log('   ❌ JWT令牌生成/验证失败:', error.message);
    }

    // 5. 测试现有令牌验证
    console.log('\n🔍 5. 测试现有令牌验证...');
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzE3NTAzMzY5NTM3OTNfMmFvOTlyd2hoIiwid2FsbGV0QWRkcmVzcyI6IjB4NkJiNzI2QzFBNWM2YTYyOTkxMWVjRTc2NTdEMmZiMzQxNGE1QjIwMCIsImVtYWlsIjpudWxsLCJpYXQiOjE3NTIyMTUxNTcsImV4cCI6MTc1MjI1MTE1N30.dZtKGUVWDAXinO6ujKZ-CPW5Me1WKlddsALrXrfpbdM';
    
    try {
      const decoded = jwt.decode(expiredToken, { complete: true });
      if (decoded && decoded.payload) {
        console.log('   📝 令牌解码成功（未验证签名）');
        console.log(`   👤 用户ID: ${decoded.payload.userId}`);
        console.log(`   💳 钱包地址: ${decoded.payload.walletAddress}`);
        console.log(`   📅 签发时间: ${new Date(decoded.payload.iat * 1000).toISOString()}`);
        console.log(`   📅 过期时间: ${new Date(decoded.payload.exp * 1000).toISOString()}`);
        console.log(`   ⏰ 当前时间: ${new Date().toISOString()}`);
        
        const isExpired = Date.now() > decoded.payload.exp * 1000;
        console.log(`   ${isExpired ? '❌' : '✅'} 令牌${isExpired ? '已过期' : '未过期'}`);
      }
    } catch (error) {
      console.log('   ❌ 令牌解码失败:', error.message);
    }

    // 6. 测试用户信息获取
    console.log('\n👤 6. 测试用户信息获取...');
    const userInfoResponse = await axios.get(`${baseURL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${expiredToken}`
      }
    }).catch(err => {
      console.log('   ❌ 用户信息获取失败:', err.response?.data?.message || err.message);
      return null;
    });
    
    if (userInfoResponse && userInfoResponse.data.success) {
      console.log('   ✅ 用户信息获取成功');
    } else {
      console.log('   ❌ 用户信息获取失败（预期结果，因为令牌过期）');
    }

    // 7. 提供解决建议
    console.log('\n💡 解决建议:');
    console.log('   1. 确保前端清除了所有过期的令牌缓存');
    console.log('   2. 使用有效的钱包签名重新登录');
    console.log('   3. 检查数据库连接是否正常');
    console.log('   4. 确保JWT环境变量配置正确');
    console.log('   5. 如果问题持续，考虑清理数据库中的过期令牌');
    
  } catch (error) {
    console.error('❌ 诊断过程中发生错误:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }
}

// 运行诊断
debugJWTAuthIssue(); 