// Test with real Coinbase Commerce webhook payload structure
// Based on the actual webhook logs

const realWebhookPayload = {
  "attempt_number": 1,
  "event": {
    "api_version": "2018-03-22",
    "created_at": "2025-06-20T02:58:01Z",
    "data": {
      "id": "6f717867-2203-4816-82db-5b9594c4114e",
      "code": "Q3YR2F8P",
      "name": "PLUS monthly 会员",
      "description": "PLUS 会员 - 月付",
      "hosted_url": "https://commerce.coinbase.com/pay/6f717867-2203-4816-82db-5b9594c4114e",
      "created_at": "2025-06-20T02:57:32Z",
      "expires_at": "2025-06-22T02:57:32Z",
      "metadata": {
        "paymentId": "cad53ee3-bc3c-4fb6-96cd-380e7524432f",
        "userId": "user_1750317505735_vev7qqxwa",
        "membershipType": "plus",
        "subscriptionType": "monthly"
      },
      "timeline": [
        { "status": "NEW", "time": "2025-06-20T02:57:32Z" },
        { "status": "COMPLETED", "time": "2025-06-20T02:58:01Z" }
      ]
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
    // Test with dummy signature (will fail verification but we'll see parsing attempt)
    console.log('\nTesting webhook with dummy signature...');
    const response = await fetch(
      'http://localhost:3001/api/payment/webhooks/coinbase',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Webhook-Signature': 'dummy-signature-for-testing'
        },
        body: JSON.stringify(realWebhookPayload)
      }
    );

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRealWebhook().then(() => {
  console.log('\n✅ Test complete. Check the server logs for webhook processing results.');
}); 