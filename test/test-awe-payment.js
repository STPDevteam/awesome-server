require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// 创建测试用的JWT token
function createTestToken(userId = 'test-user-123') {
  const payload = {
    userId,
    walletAddress: '0x1234567890123456789012345678901234567890'
  };
  
  // 使用正确的JWT_ACCESS_SECRET
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.error('❌ JWT_ACCESS_SECRET not found in environment variables');
    process.exit(1);
  }
  
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// 测试创建AWE支付
async function testCreateAwePayment() {
  console.log('\n=== Testing AWE Payment Creation ===\n');
  
  const token = createTestToken();
  
  try {
    const response = await fetch(`${BASE_URL}/api/payment/create-awe-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        membershipType: 'plus',
        subscriptionType: 'monthly'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ AWE payment created successfully!');
      console.log('\n📋 Payment Details:');
      console.log(`- Payment ID: ${data.data.paymentId}`);
      console.log(`- Token Address: ${data.data.tokenAddress}`);
      console.log(`- Receiver Address: ${data.data.receiverAddress}`);
      console.log(`- Amount: ${data.data.amount} AWE`);
      console.log(`- USD Value: $${data.data.usdValue}`);
      console.log(`- Chain: ${data.data.chainName} (ID: ${data.data.chainId})`);
      console.log(`- Expires At: ${new Date(data.data.expiresAt).toLocaleString()}`);
      console.log(`\n🔗 Explorer URL: ${data.data.explorerUrl}`);
      console.log(`\n📱 QR Data for Wallet: ${data.data.qrData}`);
      
      return data.data.paymentId;
    } else {
      console.error('❌ Failed to create payment:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error creating payment:', error.message);
    return null;
  }
}

// 测试查询AWE支付状态
async function testGetAwePaymentStatus(paymentId) {
  console.log('\n=== Testing AWE Payment Status Check ===\n');
  
  const token = createTestToken();
  
  try {
    const response = await fetch(`${BASE_URL}/api/payment/awe-payment/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Payment status retrieved successfully!');
      console.log('\n📋 Status Details:');
      console.log(`- Status: ${data.data.status}`);
      console.log(`- Amount: ${data.data.amount} AWE`);
      console.log(`- Transaction Hash: ${data.data.transactionHash || 'Not yet confirmed'}`);
      console.log(`- From Address: ${data.data.fromAddress || 'Not yet confirmed'}`);
      
      if (data.data.status === 'confirmed') {
        console.log(`- Confirmed At: ${new Date(data.data.confirmedAt).toLocaleString()}`);
        console.log(`- Block Number: ${data.data.blockNumber}`);
      }
    } else {
      console.error('❌ Failed to get payment status:', data.error);
    }
  } catch (error) {
    console.error('❌ Error getting payment status:', error.message);
  }
}

// 测试获取用户的AWE支付历史
async function testGetAwePaymentHistory() {
  console.log('\n=== Testing AWE Payment History ===\n');
  
  const token = createTestToken();
  
  try {
    const response = await fetch(`${BASE_URL}/api/payment/awe-payments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Payment history retrieved successfully!');
      console.log(`\n📋 Total payments: ${data.data.length}`);
      
      data.data.forEach((payment, index) => {
        console.log(`\n--- Payment ${index + 1} ---`);
        console.log(`- ID: ${payment.id}`);
        console.log(`- Status: ${payment.status}`);
        console.log(`- Amount: ${payment.amount} AWE ($${payment.usdValue})`);
        console.log(`- Type: ${payment.membershipType} ${payment.subscriptionType}`);
        console.log(`- Created: ${new Date(payment.createdAt).toLocaleString()}`);
      });
    } else {
      console.error('❌ Failed to get payment history:', data.error);
    }
  } catch (error) {
    console.error('❌ Error getting payment history:', error.message);
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 Starting AWE Payment Tests...\n');
  console.log('📍 API Base URL:', BASE_URL);
  console.log('🔗 Base Chain RPC:', process.env.BASE_RPC_URL || 'Not configured');
  
  // 测试创建支付
  const paymentId = await testCreateAwePayment();
  
  if (paymentId) {
    // 等待一下再查询状态
    console.log('\n⏳ Waiting 3 seconds before checking status...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 测试查询支付状态
    await testGetAwePaymentStatus(paymentId);
  }
  
  // 测试获取支付历史
  await testGetAwePaymentHistory();
  
  console.log('\n✅ All tests completed!');
  console.log('\n💡 To complete the payment:');
  console.log('1. Send the exact AWE amount to the receiver address');
  console.log('2. Use the Base chain (Chain ID: 8453)');
  console.log('3. The payment will be automatically detected and confirmed');
}

// 运行测试
runTests().catch(console.error); 