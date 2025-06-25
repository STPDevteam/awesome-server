#!/bin/bash

# 直接测试 CoinGecko MCP 服务
echo "直接测试 CoinGecko MCP 服务..."

# 设置 MCP 服务的地址
# 注意：这里假设 CoinGecko MCP 服务运行在本地 8080 端口
# 如果端口不同，请修改这个地址
MCP_URL="http://localhost:8080"

# 第一步：获取 MCP 服务的元数据
echo "1. 获取 MCP 服务元数据"
curl -s "${MCP_URL}/meta" | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第二步：获取可用工具列表
echo "2. 获取可用工具列表"
curl -s "${MCP_URL}/tools" | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第三步：直接调用 get_simple_price 工具获取比特币价格
echo "3. 获取比特币价格"
curl -s -X POST "${MCP_URL}/tools/get_simple_price" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": "bitcoin",
    "vs_currencies": "usd"
  }' | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第四步：获取前 5 个市值最高的加密货币
echo "4. 获取市场数据 (前 5 个市值最高的加密货币)"
curl -s -X POST "${MCP_URL}/tools/get_coins_markets" \
  -H "Content-Type: application/json" \
  -d '{
    "vs_currency": "usd",
    "order": "market_cap_desc",
    "per_page": "5",
    "page": "1"
  }' | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第五步：获取比特币的历史价格图表数据
echo "5. 获取比特币历史价格图表数据 (最近 7 天)"
curl -s -X POST "${MCP_URL}/tools/get_coin_market_chart" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "bitcoin",
    "vs_currency": "usd",
    "days": "7"
  }' | jq .

echo ""
echo "等待 2 秒..."
sleep 2

# 第六步：搜索加密货币
echo "6. 搜索加密货币 (以太坊)"
curl -s -X POST "${MCP_URL}/tools/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ethereum"
  }' | jq .

echo ""
echo "测试完成！" 