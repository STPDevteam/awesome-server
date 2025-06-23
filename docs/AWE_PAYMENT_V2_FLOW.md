# AWE Payment V2 Flow Documentation

## Overview

The improved AWE payment flow separates price calculation from payment confirmation, providing a better user experience and avoiding pending order expiration issues.

## New Payment Flow

### Step 1: Calculate Price
Frontend calls API to get AWE price information.

### Step 2: User Payment
User sends AWE tokens to the receiver address using their wallet.

### Step 3: Confirm Payment
Frontend submits transaction hash to confirm payment and activate membership.

## API Endpoints

### 1. Calculate AWE Price

```http
GET /api/payment/calculate-awe-price
Authorization: Bearer <token>

Query Parameters:
- membershipType: 'plus' | 'pro'
- subscriptionType: 'monthly' | 'yearly'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "membershipType": "plus",
    "subscriptionType": "monthly",
    "usdPrice": "0.01",
    "aweAmount": "0.100000",
    "aweAmountInWei": "100000000000000000",
    "aweUsdPrice": 0.1,
    "tokenAddress": "0x1B4617734C43F6159F3a70b7E06d883647512778",
    "receiverAddress": "0x1cAb57bDD051613214D761Ce1429f94975dD0116",
    "chainId": 8453,
    "chainName": "Base"
  }
}
```

### 2. Confirm AWE Payment

```http
POST /api/payment/confirm-awe-payment
Authorization: Bearer <token>
Content-Type: application/json

{
  "membershipType": "plus",
  "subscriptionType": "monthly",
  "transactionHash": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "uuid",
    "status": "confirmed",
    "amount": "0.100000",
    "transactionHash": "0x...",
    "confirmedAt": "2024-01-01T00:00:00.000Z",
    "membershipType": "plus",
    "subscriptionType": "monthly"
  }
}
```

## Frontend Integration Example

```javascript
// Step 1: Get price
async function getAwePrice(membershipType, subscriptionType) {
  const response = await fetch(
    `/api/payment/calculate-awe-price?membershipType=${membershipType}&subscriptionType=${subscriptionType}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }
  );
  return await response.json();
}

// Step 2: Send payment via Web3 wallet
async function sendAwePayment(priceInfo) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  
  // Switch to Base chain
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x2105' }], // 8453 in hex
  });
  
  // ERC20 transfer
  const abi = ['function transfer(address to, uint256 amount) returns (bool)'];
  const contract = new ethers.Contract(priceInfo.tokenAddress, abi, signer);
  
  const tx = await contract.transfer(
    priceInfo.receiverAddress,
    priceInfo.aweAmountInWei
  );
  
  // Wait for transaction
  const receipt = await tx.wait();
  return receipt.hash;
}

// Step 3: Confirm payment
async function confirmPayment(membershipType, subscriptionType, transactionHash) {
  const response = await fetch('/api/payment/confirm-awe-payment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      membershipType,
      subscriptionType,
      transactionHash
    })
  });
  return await response.json();
}

// Complete flow
async function purchaseMembership(membershipType, subscriptionType) {
  try {
    // Step 1: Get price
    const priceResult = await getAwePrice(membershipType, subscriptionType);
    if (!priceResult.success) throw new Error(priceResult.error);
    
    const priceInfo = priceResult.data;
    console.log(`Price: ${priceInfo.aweAmount} AWE ($${priceInfo.usdPrice})`);
    
    // Step 2: Send payment
    const txHash = await sendAwePayment(priceInfo);
    console.log('Transaction sent:', txHash);
    
    // Step 3: Confirm payment (wait for confirmations)
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
    
    const confirmResult = await confirmPayment(membershipType, subscriptionType, txHash);
    if (!confirmResult.success) throw new Error(confirmResult.error);
    
    console.log('Payment confirmed!', confirmResult.data);
    return confirmResult.data;
    
  } catch (error) {
    console.error('Purchase failed:', error);
    throw error;
  }
}
```

## Benefits of V2 Flow

1. **No Pending Orders**: Orders are created only after payment is confirmed
2. **Better UX**: Users know the exact price before paying
3. **Transaction Verification**: System verifies the transaction on-chain
4. **Supports Overpayment**: Accepts payments equal to or greater than required amount
5. **Idempotent**: Same transaction hash cannot be used twice

## Security Features

1. **Transaction Validation**:
   - Verifies receiver address
   - Checks transaction status
   - Requires minimum confirmations (3 blocks)
   - Validates AWE token transfer events

2. **Amount Verification**:
   - Ensures payment meets minimum requirement
   - Allows overpayment
   - Records actual amount paid

3. **Duplicate Prevention**:
   - Transaction hash can only be used once
   - Prevents double-spending

## Error Handling

Common errors and solutions:

1. **"Transaction not found"**
   - Transaction hash is invalid
   - Transaction is not yet indexed

2. **"Insufficient confirmations"**
   - Wait for at least 3 block confirmations
   - Retry after a few seconds

3. **"Invalid receiver address"**
   - Payment was sent to wrong address
   - Check the receiver address

4. **"Transaction already used"**
   - Transaction hash was already processed
   - Use a new transaction

5. **"Insufficient payment amount"**
   - Sent amount is less than required
   - Send at least the required amount

## Testing

Run the test script:
```bash
# Step 1: Get price
node test/test-awe-payment-v2.cjs

# Step 2: Make payment and get transaction hash

# Step 3: Confirm payment
node test/test-awe-payment-v2.cjs <transaction_hash>
``` 