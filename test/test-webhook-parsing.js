// Test webhook parsing without signature verification
// This test temporarily removes the webhook signature to test event parsing

const webhookPayload = {
  attempt_number: 1,
  event: {
    api_version: "2018-03-22",
    created_at: new Date().toISOString(),
    data: {
      id: "test-charge-id",
      code: "TEST123",
      name: "PRO yearly 会员",
      description: "PRO 会员 - 年付",
      hosted_url: "https://commerce.coinbase.com/charges/TEST123",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 900000).toISOString(),
      metadata: {
        paymentId: "test-payment-id",
        userId: "test-user-id",
        membershipType: "pro",
        subscriptionType: "yearly"
      }
    },
    id: "webhook-event-id-123",
    resource: "event",
    type: "charge:confirmed"
  },
  id: "webhook-notification-id-456",
  scheduled_for: new Date().toISOString()
};

async function testWebhookParsing() {
  console.log('Testing webhook parsing...');
  console.log('Payload structure:');
  console.log('- event.type:', webhookPayload.event.type);
  console.log('- event.data.id:', webhookPayload.event.data.id);
  console.log('- event.data.metadata:', webhookPayload.event.data.metadata);
  
  try {
    // Test without signature (will use the code path for when webhook secret is not configured)
    const response = await fetch(
      'http://localhost:3001/api/payment/webhooks/coinbase',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No X-CC-Webhook-Signature header
        },
        body: JSON.stringify(webhookPayload)
      }
    );

    const data = await response.json();
    console.log('\nResponse:', data);
    
    if (!response.ok) {
      console.log('Status:', response.status);
      console.log('This is expected if webhook secret is configured.');
      console.log('Check server logs to see if event type was parsed correctly.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testWebhookParsing().then(() => {
  console.log('\nTest complete. Check server logs for:');
  console.log('- "Webhook event received: charge:confirmed webhook-event-id-123"');
  console.log('- Instead of "Webhook event received: undefined undefined"');
}); 