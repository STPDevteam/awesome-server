#!/bin/bash

# 测试 CoinGecko MCP 服务
echo "测试 CoinGecko MCP 服务..."

# 第一步：测试连接 CoinGecko MCP 并获取可用工具列表
echo "1. 测试连接 CoinGecko MCP 并获取工具列表"
curl -X POST http://localhost:3001/api/task/test-coingecko-mcp \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

echo ""
echo "等待 5 秒..."
sleep 5

# 第二步：测试获取比特币价格
echo "2. 测试获取比特币价格"
curl -X POST http://localhost:3001/api/task/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-coingecko-task",
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
echo "等待 5 秒..."
sleep 5

# 第三步：测试获取币种列表
echo "3. 测试获取币种列表"
curl -X POST http://localhost:3001/api/task/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-coingecko-task",
    "userId": "test-user",
    "steps": [
      {
        "step": 1,
        "mcp": "coingecko-mcp",
        "action": "get_coins_list",
        "input": {
          "include_platform": "false"
        }
      }
    ]
  }' | jq .

echo ""
echo "等待 5 秒..."
sleep 5

# 第四步：测试获取市场数据
echo "4. 测试获取市场数据"
curl -X POST http://localhost:3001/api/task/execute \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-coingecko-task",
    "userId": "test-user",
    "steps": [
      {
        "step": 1,
        "mcp": "coingecko-mcp",
        "action": "get_coins_markets",
        "input": {
          "vs_currency": "usd",
          "order": "market_cap_desc",
          "per_page": "5",
          "page": "1"
        }
      }
    ]
  }' | jq .

echo ""
echo "测试完成！" 