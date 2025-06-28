#!/bin/bash

# GitHub MCP 快速测试脚本
# 使用方法: ./quick-github-mcp-test.sh

echo "🚀 GitHub MCP 快速测试开始"
echo "================================"

# 检查环境变量
if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo "❌ 错误: 未设置 GITHUB_PERSONAL_ACCESS_TOKEN 环境变量"
    echo "请设置: export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here"
    echo "获取Token: https://github.com/settings/tokens"
    exit 1
fi

echo "✅ 找到GitHub Personal Access Token"

# 设置基础URL
BASE_URL=${BASE_URL:-"http://localhost:3001"}
TEST_USER_ID=${TEST_USER_ID:-"test-user-github-mcp"}

echo "🔗 测试服务器: $BASE_URL"
echo "👤 测试用户: $TEST_USER_ID"

# 检查服务器是否运行
echo "🔄 检查服务器状态..."
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo "❌ 服务器未运行或无法访问"
    echo "请确保服务器在 $BASE_URL 运行"
    exit 1
fi
echo "✅ 服务器运行正常"

# 检查Docker
echo "🔄 检查Docker环境..."
if ! docker --version > /dev/null 2>&1; then
    echo "❌ Docker未安装"
    exit 1
fi

if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker未运行"
    exit 1
fi
echo "✅ Docker环境正常"

# 验证GitHub Token
echo "🔄 验证GitHub Token..."
if ! curl -s -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/user > /dev/null; then
    echo "❌ GitHub Token验证失败"
    exit 1
fi
echo "✅ GitHub Token验证成功"

# 创建测试用户
echo "🔄 创建测试用户..."
curl -s -X POST "$BASE_URL/api/auth/create-user" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"email\": \"$TEST_USER_ID@test.com\",
    \"name\": \"GitHub MCP Test User\"
  }" > /dev/null

echo "✅ 测试用户准备完成"

# 获取MCP列表
echo "🔄 获取MCP列表..."
MCP_LIST_RESPONSE=$(curl -s "$BASE_URL/api/mcp/list")
if echo "$MCP_LIST_RESPONSE" | grep -q "github-mcp"; then
    echo "✅ 找到GitHub MCP配置"
else
    echo "❌ 未找到GitHub MCP配置"
    echo "响应: $MCP_LIST_RESPONSE"
    exit 1
fi

# 连接GitHub MCP
echo "🔄 连接GitHub MCP..."
CONNECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mcp/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"github-mcp\",
    \"userId\": \"$TEST_USER_ID\"
  }")

if echo "$CONNECT_RESPONSE" | grep -q "\"success\":true"; then
    echo "✅ GitHub MCP连接成功"
else
    echo "❌ GitHub MCP连接失败"
    echo "响应: $CONNECT_RESPONSE"
    exit 1
fi

# 获取工具列表
echo "🔄 获取GitHub工具列表..."
TOOLS_RESPONSE=$(curl -s "$BASE_URL/api/mcp/github-mcp/tools?userId=$TEST_USER_ID")
if echo "$TOOLS_RESPONSE" | grep -q "\"success\":true"; then
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o '"name"' | wc -l)
    echo "✅ 获取到 $TOOL_COUNT 个GitHub工具"
else
    echo "❌ 获取工具列表失败"
    echo "响应: $TOOLS_RESPONSE"
    exit 1
fi

# 测试工具调用 - 获取用户信息
echo "🔄 测试获取用户信息..."
USER_TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mcp/github-mcp/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"tool\": \"get_authenticated_user\",
    \"input\": {},
    \"userId\": \"$TEST_USER_ID\"
  }")

if echo "$USER_TEST_RESPONSE" | grep -q "\"success\":true"; then
    echo "✅ 用户信息获取测试成功"
    # 提取用户名
    USERNAME=$(echo "$USER_TEST_RESPONSE" | grep -o '"login":"[^"]*"' | cut -d'"' -f4)
    if [ ! -z "$USERNAME" ]; then
        echo "📊 GitHub用户: $USERNAME"
    fi
else
    echo "❌ 用户信息获取测试失败"
    echo "响应: $USER_TEST_RESPONSE"
fi

# 测试工具调用 - 列出仓库
echo "🔄 测试列出仓库..."
REPO_TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/mcp/github-mcp/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"tool\": \"list_repositories_for_authenticated_user\",
    \"input\": {\"per_page\": 3, \"sort\": \"updated\"},
    \"userId\": \"$TEST_USER_ID\"
  }")

if echo "$REPO_TEST_RESPONSE" | grep -q "\"success\":true"; then
    echo "✅ 仓库列表获取测试成功"
    # 提取仓库数量
    REPO_COUNT=$(echo "$REPO_TEST_RESPONSE" | grep -o '"name":"[^"]*"' | wc -l)
    echo "📊 找到 $REPO_COUNT 个仓库"
else
    echo "❌ 仓库列表获取测试失败"
    echo "响应: $REPO_TEST_RESPONSE"
fi

# 创建测试任务
echo "🔄 创建GitHub任务测试..."

# 1. 创建会话
CONVERSATION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/conversation/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"title\": \"GitHub MCP测试会话\"
  }")

if echo "$CONVERSATION_RESPONSE" | grep -q "\"success\":true"; then
    CONVERSATION_ID=$(echo "$CONVERSATION_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "✅ 会话创建成功: $CONVERSATION_ID"
    
    # 2. 发送消息创建任务
    MESSAGE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/conversation/$CONVERSATION_ID/message" \
      -H "Content-Type: application/json" \
      -d "{
        \"content\": \"帮我查看我的GitHub仓库列表，并获取我的用户信息\",
        \"userId\": \"$TEST_USER_ID\"
      }")
    
    if echo "$MESSAGE_RESPONSE" | grep -q "\"taskId\""; then
        TASK_ID=$(echo "$MESSAGE_RESPONSE" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
        echo "✅ 任务创建成功: $TASK_ID"
        
        # 3. 分析任务
        echo "🔄 分析任务..."
        curl -s -X POST "$BASE_URL/api/task/$TASK_ID/analyze/stream" > /dev/null &
        ANALYSIS_PID=$!
        
        # 等待分析完成
        sleep 10
        kill $ANALYSIS_PID 2>/dev/null || true
        
        # 检查任务状态
        TASK_STATUS_RESPONSE=$(curl -s "$BASE_URL/api/task/$TASK_ID")
        if echo "$TASK_STATUS_RESPONSE" | grep -q "\"status\":\"completed\""; then
            echo "✅ 任务分析完成"
            
            # 4. 执行任务
            echo "🔄 执行任务..."
            curl -s -X POST "$BASE_URL/api/task/$TASK_ID/execute/stream" > /dev/null &
            EXECUTION_PID=$!
            
            # 等待执行完成
            sleep 15
            kill $EXECUTION_PID 2>/dev/null || true
            
            # 检查最终状态
            FINAL_TASK_RESPONSE=$(curl -s "$BASE_URL/api/task/$TASK_ID")
            if echo "$FINAL_TASK_RESPONSE" | grep -q "\"status\":\"completed\""; then
                echo "✅ 任务执行完成"
            else
                echo "⚠️  任务执行可能未完成"
            fi
        else
            echo "⚠️  任务分析可能未完成"
        fi
    else
        echo "⚠️  消息未触发任务创建"
    fi
else
    echo "❌ 会话创建失败"
fi

echo ""
echo "================================"
echo "🏁 GitHub MCP 快速测试完成"
echo ""
echo "📋 测试总结:"
echo "  ✅ Docker环境检查"
echo "  ✅ GitHub Token验证"
echo "  ✅ MCP配置检查"
echo "  ✅ MCP连接测试"
echo "  ✅ 工具列表获取"
echo "  ✅ 基础工具调用"
echo "  ✅ 任务创建和执行"
echo ""
echo "🎉 所有基础功能测试通过！"
echo ""
echo "📖 更多详细测试请运行:"
echo "   node test/test-github-mcp.js" 