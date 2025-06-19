#!/bin/bash

# 支付流程快速测试脚本
# 使用 curl 命令进行 API 测试

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
BASE_URL="http://localhost:3001"
WALLET_ADDRESS="0x1234567890123456789012345678901234567890"

echo -e "${GREEN}🚀 开始支付流程测试${NC}"
echo "================================"
echo "服务器地址: $BASE_URL"
echo "测试钱包: $WALLET_ADDRESS"
echo ""

# 步骤 1: 获取 Nonce
echo -e "${YELLOW}步骤 1: 获取 Nonce${NC}"
NONCE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/wallet/nonce" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$WALLET_ADDRESS\"}")

NONCE=$(echo $NONCE_RESPONSE | grep -o '"nonce":"[^"]*' | cut -d'"' -f4)

if [ -z "$NONCE" ]; then
  echo -e "${RED}❌ 获取 Nonce 失败${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Nonce: $NONCE${NC}"
echo ""

# 步骤 2: 创建 SIWE 消息
echo -e "${YELLOW}步骤 2: 创建 SIWE 消息${NC}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
MESSAGE="localhost:3001 wants you to sign in with your Ethereum account:
$WALLET_ADDRESS

Sign in with Ethereum to the app.

URI: http://localhost:3001
Version: 1
Chain ID: 1
Nonce: $NONCE
Issued At: $TIMESTAMP"

echo "$MESSAGE"
echo ""

# 模拟签名（实际应用需要真实签名）
MOCK_SIGNATURE="0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"

echo -e "${YELLOW}步骤 3: 模拟钱包登录${NC}"
echo -e "${RED}注意: 这里使用模拟签名，实际应用需要真实钱包签名${NC}"

# 步骤 3: 登录
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/wallet/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"$(echo "$MESSAGE" | sed 's/$/\\n/' | tr -d '\n' | sed 's/\\n$//')\",
    \"signature\": \"$MOCK_SIGNATURE\"
  }")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ 登录失败${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功!${NC}"
echo "Token: ${TOKEN:0:50}..."
echo ""

# 步骤 4: 创建支付订单
echo -e "${YELLOW}步骤 4: 创建支付订单 (Plus 月付 - 1 USDT)${NC}"

PAYMENT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/payment/create-payment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "membershipType": "plus",
    "subscriptionType": "monthly"
  }')

CHECKOUT_URL=$(echo $PAYMENT_RESPONSE | grep -o '"checkoutUrl":"[^"]*' | cut -d'"' -f4)
PAYMENT_ID=$(echo $PAYMENT_RESPONSE | grep -o '"paymentId":"[^"]*' | cut -d'"' -f4)

if [ -z "$CHECKOUT_URL" ]; then
  echo -e "${RED}❌ 创建支付订单失败${NC}"
  echo "响应: $PAYMENT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 支付订单创建成功!${NC}"
echo "支付 ID: $PAYMENT_ID"
echo ""
echo "======================================================================"
echo -e "${GREEN}💳 请访问以下链接完成支付:${NC}"
echo -e "${YELLOW}$CHECKOUT_URL${NC}"
echo "======================================================================"
echo ""

# 等待用户支付
echo -e "${YELLOW}请在 Coinbase Commerce 页面完成支付 (1 USDT)${NC}"
read -p "完成支付后按 Enter 键继续..."

# 步骤 5: 检查支付状态
echo ""
echo -e "${YELLOW}步骤 5: 检查支付状态${NC}"

PAYMENT_STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/payment/payment/$PAYMENT_ID" \
  -H "Authorization: Bearer $TOKEN")

PAYMENT_STATUS=$(echo $PAYMENT_STATUS_RESPONSE | grep -o '"status":"[^"]*' | cut -d'"' -f4)

echo "支付状态: $PAYMENT_STATUS"
echo ""

# 步骤 6: 检查会员状态
echo -e "${YELLOW}步骤 6: 检查会员状态${NC}"

MEMBERSHIP_RESPONSE=$(curl -s -X GET "$BASE_URL/api/payment/membership-status" \
  -H "Authorization: Bearer $TOKEN")

echo "会员状态响应:"
echo $MEMBERSHIP_RESPONSE | python3 -m json.tool 2>/dev/null || echo $MEMBERSHIP_RESPONSE
echo ""

# 检查支付历史
echo -e "${YELLOW}步骤 7: 查看支付历史${NC}"

PAYMENTS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/payment/payments" \
  -H "Authorization: Bearer $TOKEN")

echo "支付历史:"
echo $PAYMENTS_RESPONSE | python3 -m json.tool 2>/dev/null || echo $PAYMENTS_RESPONSE
echo ""

echo -e "${GREEN}✅ 测试完成!${NC}"
echo ""
echo "提示:"
echo "1. 如果支付状态仍为 'pending'，请等待区块链确认"
echo "2. Webhook 会在支付确认后自动更新会员状态"
echo "3. 可以查看服务器日志了解 webhook 处理情况" 