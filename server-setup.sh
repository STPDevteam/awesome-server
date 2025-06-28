#!/bin/bash

# 服务器部署脚本 - GitHub MCP配置

echo "🚀 开始配置服务器环境..."

# 1. 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，正在安装..."
    sudo apt update
    sudo apt install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "✅ Docker安装完成，请重新登录以使权限生效"
    exit 1
fi

echo "✅ Docker已安装"

# 2. 拉取GitHub MCP镜像
echo "📦 拉取GitHub MCP Docker镜像..."
docker pull ghcr.io/github/github-mcp-server:latest

# 3. 创建环境变量文件
echo "📝 创建环境变量配置..."

# 提示用户输入GitHub Token
read -p "请输入您的GitHub Personal Access Token: " GITHUB_TOKEN

# 创建.env文件
cat > .env << EOF
# GitHub MCP 配置
GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}

# 其他可选的环境变量
JWT_ACCESS_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-jwt-refresh-secret-here
DATABASE_URL=your-database-url-here

# 如果需要AWS S3
# AWS_ACCESS_KEY_ID=your-aws-access-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret-key
# AWS_S3_BUCKET_NAME=your-bucket-name
EOF

echo "✅ 环境变量配置完成"

# 4. 测试GitHub MCP Docker容器
echo "🧪 测试GitHub MCP容器..."
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"roots": {"listChanged": true}, "sampling": {}}}}' | \
docker run -i --rm \
  -e GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN} \
  -e GITHUB_TOOLSETS=repos,issues,pull_requests \
  -e GITHUB_READ_ONLY=0 \
  ghcr.io/github/github-mcp-server

if [ $? -eq 0 ]; then
    echo "✅ GitHub MCP容器测试成功"
else
    echo "❌ GitHub MCP容器测试失败"
    exit 1
fi

# 5. 创建systemd服务文件（可选）
echo "📋 创建systemd服务配置..."
sudo tee /etc/systemd/system/mcp-server.service > /dev/null << EOF
[Unit]
Description=MCP Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
EnvironmentFile=$(pwd)/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "✅ 服务器配置完成！"
echo ""
echo "📋 下一步操作："
echo "1. 启动服务: npm run dev 或 npm start"
echo "2. 或者使用systemd: sudo systemctl enable mcp-server && sudo systemctl start mcp-server"
echo "3. 检查服务状态: curl http://localhost:3001/health"
echo ""
echo "🔧 GitHub MCP连接测试："
echo "curl -X POST http://localhost:3001/api/mcp/connect \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \\"
echo "  -d '{\"name\": \"github-mcp\", \"command\": \"docker\", \"args\": [\"run\", \"-i\", \"--rm\", \"-e\", \"GITHUB_PERSONAL_ACCESS_TOKEN\", \"-e\", \"GITHUB_TOOLSETS\", \"-e\", \"GITHUB_READ_ONLY\", \"ghcr.io/github/github-mcp-server\"], \"env\": {\"GITHUB_PERSONAL_ACCESS_TOKEN\": \"${GITHUB_TOKEN}\", \"GITHUB_TOOLSETS\": \"repos,issues,pull_requests\", \"GITHUB_READ_ONLY\": \"0\"}}'" 