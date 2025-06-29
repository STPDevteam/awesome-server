#!/bin/bash

# MCP Server 部署脚本
# 使用方法: ./deploy.sh

set -e  # 遇到错误立即退出

echo "🚀 开始部署 MCP Server..."

# 1. 停止服务
echo "⏹️  停止服务..."
pm2 stop mcp-server || echo "服务未运行，跳过停止步骤"

# 2. 拉取最新代码（如果使用git）
if [ -d ".git" ]; then
    echo "📥 拉取最新代码..."
    git pull origin main
fi

# 3. 安装依赖
echo "📦 安装依赖..."
npm install

# 4. 编译代码
echo "🔨 编译代码..."
npm run build

# 5. 执行数据库迁移
echo "🗄️  执行数据库迁移..."
npm run migrate:up

# 6. 重启服务
echo "🔄 重启服务..."
pm2 restart mcp-server

# 7. 检查服务状态
echo "✅ 检查服务状态..."
pm2 status mcp-server

echo "🎉 部署完成！" 