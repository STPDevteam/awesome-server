// Test with real Coinbase Commerce webhook payload structure
// Based on the actual webhook logs

const realWebhookPayload = {
  "attempt_number": 1,
  "event": {
    "api_version": "2018-03-22",
    "created_at": "2025-06-20T02:58:01Z",
    "data": {
      "brand_color": "#122332",
      "brand_logo_url": "",
      "charge_kind": "WEB3",
      "code": "Q3YR2F8P",
      "collected_email": false,
      "created_at": "2025-06-20T02:57:32Z",
      "description": "PLUS 会员 - 月付",
      "expires_at": "2025-06-22T02:57:32Z",
      "hosted_url": "https://commerce.coinbase.com/pay/6f717867-2203-4816-82db-5b9594c4114e",
      "id": "6f717867-2203-4816-82db-5b9594c4114e",
      "metadata": {
        "paymentId": "cad53ee3-bc3c-4fb6-96cd-380e7524432f",
        "userId": "user_1750317505735_vev7qqxwa",
        "membershipType": "plus",
        "subscriptionType": "monthly"
      },
      "name": "PLUS monthly 会员",
      "organization_name": "dn2.life",
      "payments": [
        {
          "block": {
            "confirmations": 10,
            "confirmations_required": 3,
            "hash": "0xabc123...",
            "height": 12345678
          },
          "network": "ethereum",
          "status": "CONFIRMED",
          "transaction_id": "0x123456...",
          "value": {
            "amount": "0.01",
            "currency": "USDC"
          }
        }
      ],
      "pricing": {
        "local": { "amount": "0.01", "currency": "USD" },
        "settlement": { "amount": "0.01", "currency": "USDC" }
      },
      "pricing_type": "fixed_price",
      "support_email": "r18537936420@gmail.com",
      "timeline": [
        { "status": "NEW", "time": "2025-06-20T02:57:32Z" },
        { "status": "PENDING", "time": "2025-06-20T02:58:00Z" },
        { "status": "COMPLETED", "time": "2025-06-20T02:58:01Z" }
      ],
      "web3_data": {
        "contract_addresses": {
          "1": "0x1FA57f879417e029Ef57D7Ce915b0aA56A507C31",
          "137": "0x288844216a63638381784E0C1081A3826fD5a2E4",
          "8453": "0x03059433BCdB6144624cC2443159D9445C32b7a8"
        }
      }
    },
    "id": "webhook-event-123",
    "resource": "event",
    "type": "charge:confirmed"
  },
  "id": "webhook-notification-456",
  "scheduled_for": "2025-06-20T02:58:01Z"
};

async function testRealWebhook() {
  console.log('Testing with real Coinbase Commerce webhook structure...');
  console.log('Event type:', realWebhookPayload.event.type);
  console.log('Charge ID:', realWebhookPayload.event.data.id);
  console.log('Payment metadata:', realWebhookPayload.event.data.metadata);

  try {
    // First, test without signature to see parsing
    console.log('\n1. Testing without signature (will use unverified path)...');
    const response1 = await fetch(
      'http://localhost:3001/api/payment/webhooks/coinbase',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(realWebhookPayload)
      }
    );

    const data1 = await response1.json();
    console.log('Response:', data1);

    // Then test with signature (will fail but we'll see the parsing attempt)
    console.log('\n2. Testing with signature header...');
    const response2 = await fetch(
      'http://localhost:3001/api/payment/webhooks/coinbase',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Webhook-Signature': 'test-signature'
        },
        body: JSON.stringify(realWebhookPayload)
      }
    );

    const data2 = await response2.json();
    console.log('Response:', data2);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Start the server first
console.log('Starting server...');
import { spawn } from 'child_process';

const server = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  detached: true,
  stdio: 'inherit'
});

// Wait for server to start
setTimeout(async () => {
  console.log('\n');
  await testRealWebhook();
  
  console.log('\n✅ Test complete. Check the server logs above for:');
  console.log('   - "Webhook event received: charge:confirmed webhook-event-123"');
  console.log('   - "Payment confirmed for user user_1750317505735_vev7qqxwa: plus monthly"');
  
  // Kill the server
  process.kill(-server.pid);
  process.exit(0);
}, 5000); 