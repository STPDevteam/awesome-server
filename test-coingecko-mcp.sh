#!/bin/bash

# 测试 CoinGecko MCP 服务 (通过 mcp-server API)
echo "测试 CoinGecko MCP 服务..."

# 设置 MCP Server 的地址
MCP_SERVER_URL="http://localhost:3001/api"

# 第一步：测试连接 CoinGecko MCP
echo "1. 测试连接 CoinGecko MCP"
curl -s -X POST "${MCP_SERVER_URL}/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "mcpName": "coingecko-mcp"
  }' | jq .

echo ""
echo "等待 5 秒..."
sleep 5

# 第二步：获取MCP列表，确认连接状态
echo "2. 获取MCP列表，确认连接状态"
curl -s "${MCP_SERVER_URL}/mcp/list" | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第三步：创建一个测试任务
echo "3. 创建测试任务"
TASK_RESPONSE=$(curl -s -X POST "${MCP_SERVER_URL}/task" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "title": "Test CoinGecko MCP",
    "content": "获取比特币当前价格"
  }')

# 提取任务ID
TASK_ID=$(echo $TASK_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TASK_ID" ]; then
  echo "无法获取任务ID，请检查服务器是否运行"
  exit 1
fi
echo "任务ID: $TASK_ID"

echo ""
echo "等待 2 秒..."
sleep 2

# 第四步：分析任务
echo "4. 分析任务"
curl -s -X POST "${MCP_SERVER_URL}/task/${TASK_ID}/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user"
  }' | jq .

echo ""
echo "等待 5 秒..."
sleep 5

# 第五步：直接执行一个比特币价格查询任务
echo "5. 直接执行比特币价格查询"
curl -s -X POST "${MCP_SERVER_URL}/task/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-coingecko-direct",
    "userId": "test-user",
    "steps": [
      {
        "step": 1,
        "mcp": "coingecko-mcp",
        "action": "get_simple_price",
        "input": {
          "ids": "bitcoin",
          "vs_currencies": "usd"
        }
      }
    ]
  }' | jq .

echo ""
echo "测试完成" 