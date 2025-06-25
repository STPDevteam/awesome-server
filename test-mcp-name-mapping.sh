#!/bin/bash

# 测试MCP名称映射功能
echo "测试MCP名称映射功能..."

# 设置 MCP Server 的地址
MCP_SERVER_URL="http://localhost:3001/api"

# 测试不同名称的MCP连接和调用
test_mcp_name_mapping() {
  local original_name=$1
  local normalized_name=$2
  local tool_name=$3
  local input=$4
  
  echo "测试MCP名称映射: ${original_name} -> ${normalized_name}"
  
  # 1. 先尝试连接
  echo "1. 连接 ${original_name}"
  curl -s -X POST "${MCP_SERVER_URL}/mcp/connect" \
    -H "Content-Type: application/json" \
    -d "{
      \"mcpName\": \"${original_name}\"
    }" | jq .
  
  echo ""
  echo "等待 3 秒..."
  sleep 3
  
  # 2. 创建测试任务
  echo "2. 创建测试任务"
  TASK_RESPONSE=$(curl -s -X POST "${MCP_SERVER_URL}/task" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"test-user\",
      \"title\": \"Test ${original_name}\",
      \"content\": \"Test ${original_name} with tool ${tool_name}\"
    }")
  
  # 提取任务ID
  TASK_ID=$(echo $TASK_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$TASK_ID" ]; then
    echo "无法获取任务ID，请检查服务器是否运行"
    return 1
  fi
  echo "任务ID: $TASK_ID"
  
  echo ""
  echo "等待 2 秒..."
  sleep 2
  
  # 3. 执行任务
  echo "3. 执行任务，使用原始名称 ${original_name}"
  curl -s -X POST "${MCP_SERVER_URL}/task/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"taskId\": \"${TASK_ID}\",
      \"userId\": \"test-user\",
      \"steps\": [
        {
          \"step\": 1,
          \"mcp\": \"${original_name}\",
          \"action\": \"${tool_name}\",
          \"input\": ${input}
        }
      ]
    }" | jq .
  
  echo ""
  echo "测试完成: ${original_name} -> ${normalized_name}"
  echo "----------------------------------------"
}

# 测试 CoinGecko MCP (coingecko-server -> coingecko-mcp)
test_mcp_name_mapping "coingecko-server" "coingecko-mcp" "get_simple_price" '{"ids": "bitcoin", "vs_currencies": "usd"}'

# 测试 X MCP (x-mcp-server -> x-mcp)
test_mcp_name_mapping "x-mcp-server" "x-mcp" "get_home_timeline" '{"count": 5}'

# 测试 Playwright MCP (playwright-mcp-service -> playwright)
test_mcp_name_mapping "playwright-mcp-service" "playwright" "search" '{"text": "cryptocurrency news"}'

echo "所有测试完成" 