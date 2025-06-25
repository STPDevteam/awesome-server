#!/bin/bash

# 测试 CoinGecko MCP 服务 (通过 mcp-server API)
echo "测试 CoinGecko MCP 服务..."

# 设置 MCP Server 的地址
MCP_SERVER_URL="http://localhost:3001/api"

# 第一步：创建一个测试任务
echo "1. 创建测试任务"
TASK_RESPONSE=$(curl -s -X POST "${MCP_SERVER_URL}/task" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "title": "Test CoinGecko MCP",
    "content": "Test CoinGecko MCP API"
  }')

# 提取任务ID
TASK_ID=$(echo $TASK_RESPONSE | jq -r '.data.task.id')
echo "任务ID: $TASK_ID"

echo ""
echo "等待 2 秒..."
sleep 2

# 第二步：测试连接 CoinGecko MCP
echo "2. 测试连接 CoinGecko MCP"
curl -s -X POST "${MCP_SERVER_URL}/task/test-coingecko-mcp" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

echo ""
echo "等待 5 秒..."
sleep 5

# 第三步：执行 CoinGecko MCP 获取比特币价格
echo "3. 获取比特币价格"
curl -s -X POST "${MCP_SERVER_URL}/task/${TASK_ID}/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user"
  }' | jq .

echo ""
echo "测试完成！" 