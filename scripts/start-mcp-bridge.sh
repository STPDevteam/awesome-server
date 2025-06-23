#!/bin/sh

# 安装mcp-http-bridge
npm install -g mcp-http-bridge

# 设置环境变量
export MCP_HTTP_BRIDGE_PORT=3000
export MCP_HTTP_BRIDGE_COMMAND=npx
export MCP_HTTP_BRIDGE_ARGS="-y,@modelcontextprotocol/server-github@latest"
export MCP_HTTP_BRIDGE_ENV="GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN}"

# 启动桥接服务
echo "启动MCP HTTP桥接服务..."
echo "环境变量:"
echo "MCP_HTTP_BRIDGE_PORT=$MCP_HTTP_BRIDGE_PORT"
echo "MCP_HTTP_BRIDGE_COMMAND=$MCP_HTTP_BRIDGE_COMMAND"
echo "MCP_HTTP_BRIDGE_ARGS=$MCP_HTTP_BRIDGE_ARGS"
echo "MCP_HTTP_BRIDGE_ENV=$MCP_HTTP_BRIDGE_ENV"
exec mcp-http-bridge

# 脚本结束时的清理工作
function cleanup {
    echo "正在关闭MCP桥接器..."
    # 可以添加任何清理代码
}

# 注册信号处理
trap cleanup SIGINT SIGTERM

# 保持脚本运行
echo "MCP桥接器已启动，按Ctrl+C停止"
wait 