// Test webhook payload with correct Coinbase Commerce structure
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
      expires_at: new Date(Date.now() + 900000).toISOString(), // 15 minutes from now
      timeline: [
        {
          time: new Date().toISOString(),
          status: "NEW"
        },
        {
          time: new Date().toISOString(),
          status: "COMPLETED"
        }
      ],
      metadata: {
        paymentId: "test-payment-id",
        userId: "test-user-id",
        membershipType: "pro",
        subscriptionType: "yearly"
      },
      payment_threshold: {
        overpayment_absolute_threshold: {
          amount: "1.00",
          currency: "USD"
        },
        overpayment_relative_threshold: "0.05",
        underpayment_absolute_threshold: {
          amount: "1.00",
          currency: "USD"
        },
        underpayment_relative_threshold: "0.05"
      },
      pricing: {
        local: {
          amount: "120.00",
          currency: "USD"
        },
        bitcoin: {
          amount: "0.00123456",
          currency: "BTC"
        }
      },
      payments: [
        {
          network: "ethereum",
          transaction_id: "0x123...",
          status: "CONFIRMED",
          value: {
            amount: "120.00",
            currency: "USDC"
          },
          block: {
            height: 12345678,
            hash: "0xabc...",
            confirmations: 10,
            confirmations_required: 3
          }
        }
      ],
      addresses: {
        bitcoin: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        ethereum: "0x742d35Cc6634C0532925a3b844Bc9e7595f7F84a"
      }
    },
    id: "webhook-event-id-123",
    resource: "event",
    type: "charge:confirmed"
  },
  id: "webhook-notification-id-456",
  scheduled_for: new Date().toISOString()
};

async function testWebhook() {
  try {
    console.log('Testing webhook with correct Coinbase Commerce structure...');
    console.log('Event type:', webhookPayload.event.type);
    console.log('Charge ID:', webhookPayload.event.data.id);
    console.log('Metadata:', webhookPayload.event.data.metadata);

    const response = await fetch(
      'http://localhost:3001/api/payment/webhooks/coinbase',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Webhook-Signature': 'test-signature' // This will fail verification but we'll see the structure
        },
        body: JSON.stringify(webhookPayload)
      }
    );

    const data = await response.json();
    console.log('Response:', data);
  } catch (error) {
    if (error instanceof Response) {
      const errorData = await error.json();
      console.error('Error:', errorData);
      
      // If it's a signature verification error, that's expected
      if (errorData?.error?.includes('signature')) {
        console.log('\nSignature verification failed as expected.');
        console.log('Check the server logs to see if the webhook structure was parsed correctly.');
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Test different event types
async function testAllEventTypes() {
  const eventTypes = ['charge:created', 'charge:pending', 'charge:confirmed', 'charge:failed', 'charge:resolved'];
  
  for (const eventType of eventTypes) {
    console.log(`\n--- Testing ${eventType} ---`);
    const payload = JSON.parse(JSON.stringify(webhookPayload));
    payload.event.type = eventType;
    
    try {
      await fetch(
        'http://localhost:3001/api/payment/webhooks/coinbase',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CC-Webhook-Signature': 'test-signature'
          },
          body: JSON.stringify(payload)
        }
      );
    } catch (error) {
      // Expected to fail due to signature
    }
    
    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

console.log('Starting webhook structure test...');
testWebhook().then(() => {
  console.log('\nTesting all event types...');
  return testAllEventTypes();
}).then(() => {
  console.log('\nTest complete. Check server logs for webhook parsing results.');
}); 