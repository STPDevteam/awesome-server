import dotenv from 'dotenv';
import fetch from 'node-fetch';
import crypto from 'crypto';

dotenv.config();

const SERVER_URL = 'http://localhost:3001';
const WEBHOOK_URL = `${SERVER_URL}/api/payment/webhooks/coinbase`;

// 模拟 Coinbase Commerce webhook 数据
const mockWebhookData = {
  id: "test-event-123",
  type: "charge:confirmed",
  api_version: "2018-03-22",
  created_at: new Date().toISOString(),
  data: {
    id: "test-charge-456",
    code: "TEST123",
    name: "PRO yearly 会员",
    description: "PRO 会员 - 年付",
    hosted_url: "https://commerce.coinbase.com/charges/TEST123",
    created_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    timeline: [
      {
        time: new Date().toISOString(),
        status: "NEW"
      },
      {
        time: new Date().toISOString(),
        status: "CONFIRMED"
      }
    ],
    metadata: {
      paymentId: "test-payment-789",
      userId: "test-user-123",
      membershipType: "pro",
      subscriptionType: "yearly"
    },
    pricing_type: "fixed_price",
    payments: [
      {
        network: "ethereum",
        transaction_id: "0x123...",
        status: "CONFIRMED",
        value: {
          local: { amount: "2000", currency: "USD" },
          crypto: { amount: "2000.00", currency: "USDC" }
        }
      }
    ],
    addresses: {
      ethereum: "0xtest..."
    }
  }
};

// 生成 HMAC 签名
function generateSignature(payload, secret) {
  if (!secret) {
    console.log('No webhook secret configured, skipping signature generation');
    return 'no-signature';
  }
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return hmac.digest('hex');
}

async function testWebhook() {
  console.log('🧪 Testing Webhook Processing\n');

  try {
    // 1. 检查服务器是否运行
    console.log('1️⃣ Checking if server is running...');
    try {
      const healthResponse = await fetch(`${SERVER_URL}/health`);
      if (!healthResponse.ok) {
        throw new Error(`Server health check failed: ${healthResponse.status}`);
      }
      console.log('✅ Server is running\n');
    } catch (error) {
      console.error('❌ Server is not running. Please start the server first.');
      console.error('Run: npm start');
      return;
    }

    // 2. 准备 webhook 数据
    console.log('2️⃣ Preparing webhook data...');
    const payload = JSON.stringify(mockWebhookData);
    const webhookSecret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    const signature = generateSignature(payload, webhookSecret);
    
    console.log('Webhook payload:', {
      eventType: mockWebhookData.type,
      chargeId: mockWebhookData.data.id,
      payloadSize: payload.length,
      hasSecret: !!webhookSecret
    });

    // 3. 发送 webhook 请求
    console.log('\n3️⃣ Sending webhook request...');
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Webhook-Signature': signature,
        'User-Agent': 'Coinbase-Webhook/1.0'
      },
      body: payload
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const responseData = await response.text();
    console.log('Response body:', responseData);

    // 4. 分析结果
    console.log('\n4️⃣ Analyzing results...');
    if (response.ok) {
      console.log('✅ Webhook processed successfully');
      try {
        const jsonResponse = JSON.parse(responseData);
        if (jsonResponse.success) {
          console.log('✅ Webhook processing completed successfully');
        } else {
          console.log('⚠️  Webhook processed but with errors:', jsonResponse.error);
        }
      } catch (e) {
        console.log('✅ Webhook processed (non-JSON response)');
      }
    } else {
      console.log('❌ Webhook processing failed');
      if (response.status === 400) {
        console.log('This might be due to signature verification issues');
      }
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// 运行测试
testWebhook(); 