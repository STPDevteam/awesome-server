const axios = require('axios');
const { ethers } = require('ethers');

// 测试钱包登录流程
async function testWalletLoginFlow() {
  const baseURL = 'https://api-test.awenetwork.ai';
  const walletAddress = '0x6Bb726C1A5c6a629911ecE7657D2fb3414a5B200';
  
  console.log('🔐 测试钱包登录流程...\n');

  try {
    // 1. 获取nonce
    console.log('📝 1. 获取登录nonce...');
    const nonceResponse = await axios.post(`${baseURL}/api/auth/wallet/nonce`, {
      address: walletAddress,
      origin: 'http://localhost:3000'
    });
    
    if (!nonceResponse.data.success) {
      console.log('❌ 获取nonce失败');
      return;
    }
    
    const { nonce, message, domain, uri } = nonceResponse.data.data;
    console.log(`✅ Nonce获取成功: ${nonce}`);
    console.log(`📄 消息内容:\n${message}`);
    
    // 2. 创建测试钱包（用于签名）
    console.log('\n🔑 2. 创建测试钱包进行签名...');
    
    // 使用一个测试私钥（注意：这只是用于测试，实际使用中不要硬编码私钥）
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const testWallet = new ethers.Wallet(testPrivateKey);
    
    console.log(`🏦 测试钱包地址: ${testWallet.address}`);
    
    // 检查地址是否匹配
    if (testWallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      console.log('⚠️  注意：测试钱包地址与目标地址不匹配');
      console.log(`   目标地址: ${walletAddress}`);
      console.log(`   测试地址: ${testWallet.address}`);
      console.log('   将使用测试地址进行演示...');
      
      // 重新获取正确地址的nonce
      const correctNonceResponse = await axios.post(`${baseURL}/api/auth/wallet/nonce`, {
        address: testWallet.address,
        origin: 'http://localhost:3000'
      });
      
      if (correctNonceResponse.data.success) {
        const correctData = correctNonceResponse.data.data;
        console.log(`✅ 为测试地址重新获取nonce: ${correctData.nonce}`);
        console.log(`📄 新消息内容:\n${correctData.message}`);
        
        // 更新变量
        Object.assign({ nonce, message, domain, uri }, correctData);
      }
    }
    
    // 3. 对消息进行签名
    console.log('\n✍️  3. 对消息进行签名...');
    const signature = await testWallet.signMessage(message);
    console.log(`✅ 签名成功: ${signature}`);
    console.log(`📏 签名长度: ${signature.length} 字符`);
    
    // 4. 验证签名（本地验证）
    console.log('\n🔍 4. 本地验证签名...');
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      console.log(`✅ 签名验证成功`);
      console.log(`📍 恢复的地址: ${recoveredAddress}`);
      console.log(`📍 钱包地址: ${testWallet.address}`);
      console.log(`✅ 地址匹配: ${recoveredAddress.toLowerCase() === testWallet.address.toLowerCase()}`);
    } catch (error) {
      console.log(`❌ 本地签名验证失败: ${error.message}`);
    }
    
    // 5. 发送登录请求
    console.log('\n🚀 5. 发送钱包登录请求...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/wallet/login`, {
      message: message,
      signature: signature,
      username: 'TestUser_' + Date.now(),
      avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=test'
    }).catch(err => {
      console.log('❌ 登录请求失败:', err.response?.data?.message || err.message);
      if (err.response?.data) {
        console.log('📝 错误详情:', JSON.stringify(err.response.data, null, 2));
      }
      return null;
    });
    
    if (loginResponse && loginResponse.data.success) {
      console.log('✅ 钱包登录成功！');
      console.log(`👤 用户ID: ${loginResponse.data.data.user.id}`);
      console.log(`👤 用户名: ${loginResponse.data.data.user.username}`);
      console.log(`💳 钱包地址: ${loginResponse.data.data.user.walletAddress}`);
      console.log(`🔑 访问令牌: ${loginResponse.data.data.tokens.accessToken.substring(0, 50)}...`);
      console.log(`🔄 刷新令牌: ${loginResponse.data.data.tokens.refreshToken.substring(0, 50)}...`);
      
      // 6. 测试使用新令牌访问API
      console.log('\n🧪 6. 测试使用新令牌访问API...');
      const meResponse = await axios.get(`${baseURL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${loginResponse.data.data.tokens.accessToken}`
        }
      }).catch(err => {
        console.log('❌ 令牌验证失败:', err.response?.data?.message || err.message);
        return null;
      });
      
      if (meResponse && meResponse.data.success) {
        console.log('✅ 新令牌验证成功！');
        console.log(`👤 验证用户: ${meResponse.data.data.user.username}`);
        console.log(`💰 余额: ${meResponse.data.data.user.balance} ETH`);
      }
      
    } else {
      console.log('❌ 钱包登录失败');
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', error.response.data);
    }
  }
}

// 运行测试
testWalletLoginFlow(); 