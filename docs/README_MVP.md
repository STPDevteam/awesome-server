# MCP 项目 MVP 部署指南

## 🚀 快速开始 (3 分钟部署)

本指南专为 MVP 快速迭代设计，去除了复杂的微服务架构、监控和缓存，专注于核心功能。

## 📋 前置要求

```bash
# 必需：
- Node.js 18+
- Docker & Docker Compose
- OpenAI API Key

# 可选：
- PostgreSQL (Docker 会自动启动)
```

## 🎯 简化架构

```
本地开发: mcp-fe (dev) ←→ mcp-server ←→ MCP Services (stdio)
                ↓
          PostgreSQL (Docker)

容器部署: mcp-fe (static) ←→ mcp-server ←→ MCP Services (HTTP)
                ↓                  ↓
          Nginx (简化)      PostgreSQL (Docker)
```

### 去除的复杂组件 ✂️
- ❌ mcp-gateway (直接在 mcp-server 中处理)
- ❌ Redis 缓存 (MVP 阶段不需要)
- ❌ 复杂监控 (Prometheus + Grafana)
- ❌ 日志聚合 (Loki + Promtail)
- ❌ 负载均衡 (单实例足够)

## 🚀 一键部署

### 1. 环境配置

```bash
# 复制环境变量模板
cp env.template .env

# 编辑配置 (至少需要 OPENAI_API_KEY)
vim .env
```

### 2. 本地开发 (推荐)

```bash
# 启动开发环境
./deploy-simple.sh local

# 按照输出的指示操作：
# 1. 启动数据库
# 2. 启动后端服务
# 3. 启动前端服务
```

### 3. Docker 部署

```bash
# 一键 Docker 部署
./deploy-simple.sh docker

# 访问：
# 前端: http://localhost:8080  
# 后端: http://localhost:3001
```

## 📁 整理后的目录结构

```
project/
├── mcp-fe/                          # 前端项目
│   ├── src/                         # 源代码
│   ├── docs/                        # 文档（已整理）
│   ├── deployment/                  # 部署文件
│   │   ├── Dockerfile.simple        # 简化 Dockerfile
│   │   ├── Dockerfile.multi-stage   # 原复杂版本
│   │   ├── nginx.conf              # Nginx 配置
│   │   └── docker-entrypoint.sh    # 启动脚本
│   ├── config/                      # 环境配置
│   └── package.json
│
├── mcp-server/                      # 后端项目
│   ├── src/                         # 源代码
│   │   └── services/
│   │       ├── simpleMcpAdapter.ts # 📝 新增：简化适配器
│   │       ├── mcpManager.ts       # stdio 模式管理器
│   │       └── httpMcpAdapter.ts   # HTTP 模式适配器
│   ├── deployment/                  # 部署文件
│   │   └── Dockerfile              # 后端 Dockerfile
│   ├── config/                      # 环境配置
│   └── package.json
│
├── docker-compose.simple.yml       # 📝 新增：简化版编排
├── deploy-simple.sh                # 📝 新增：简化部署脚本
├── env.template                    # 📝 新增：环境变量模板
├── README_MVP.md                   # 📝 本文档
│
# 保留的原版本（可选）
├── docker-compose.test.yml         # 完整测试环境
├── docker-compose.production.yml   # 完整生产环境
├── deploy.sh                       # 完整部署脚本
└── README_DEPLOYMENT.md            # 完整部署文档
```

## 💡 核心改进

### 1. 🎯 直接 MCP 调用
```typescript
// 简化适配器根据环境自动切换
class SimpleMCPAdapter {
  constructor() {
    this.useHttpMode = process.env.MCP_MODE === 'http';
    // local: stdio, docker: http
  }
}
```

### 2. 🏗️ 去除不必要组件
- 不再需要 mcp-gateway
- 不再需要 Redis
- 不再需要复杂的 Nginx 配置
- 使用简单的静态文件服务器

### 3. 📦 简化部署
```bash
# 只有两种模式
./deploy-simple.sh local    # 本地开发
./deploy-simple.sh docker   # 容器部署
```

## 🔧 环境变量说明

### 必需配置
```bash
OPENAI_API_KEY=sk-your-key   # 必需
DB_PASSWORD=secure-password  # 数据库密码
```

### 可选配置（按需添加）
```bash
# Twitter 功能
TWITTER_API_KEY=...
TWITTER_API_SECRET=...

# GitHub 功能  
GITHUB_PERSONAL_ACCESS_TOKEN=...

# 区块链功能
COINBASE_API_KEY_NAME=...
ALCHEMY_API_KEY=...
```

## 📊 服务端点

### 本地开发
- 前端: http://localhost:5173 (Vite dev server)
- 后端: http://localhost:3001
- 数据库: localhost:5432

### Docker 部署
- 前端: http://localhost:8080 (静态文件服务)
- 后端: http://localhost:3001  
- 数据库: localhost:5432

## 🐛 故障排除

### 常见问题

1. **端口占用**
   ```bash
   sudo lsof -i :3001
   sudo lsof -i :8080
   ```

2. **数据库连接失败**
   ```bash
   docker ps | grep postgres
   docker logs mcp-postgres
   ```

3. **MCP 工具调用失败**
   - 检查 API 密钥是否正确
   - 确认环境变量设置
   - 查看后端日志

### 快速重启
```bash
# Docker 模式
docker-compose -f docker-compose.simple.yml restart

# 本地模式
# 重启对应的服务即可
```

## 🚀 从 MVP 到生产

当你的 MVP 验证成功，需要扩展时：

1. **添加监控**: 使用完整版的 `docker-compose.production.yml`
2. **添加缓存**: 启用 Redis
3. **微服务化**: 启用 mcp-gateway
4. **负载均衡**: 配置 Nginx 负载均衡

```bash
# 升级到完整版
./deploy.sh production
```

## 📝 开发建议

### MVP 阶段重点
- ✅ 核心功能验证
- ✅ 用户反馈收集  
- ✅ 快速迭代
- ❌ 不要过度优化
- ❌ 不要过早架构

### 代码组织
- 保持简单的文件结构
- 专注业务逻辑实现
- 延迟复杂的架构决策

---

## 🎉 总结

这个简化版本提供了：

✅ **2 分钟部署** - 简化的部署流程  
✅ **自动环境切换** - local (stdio) / docker (http)  
✅ **去除复杂性** - 无网关、缓存、监控  
✅ **保持扩展性** - 随时可升级到完整版  
✅ **开发友好** - 热重载、快速调试  

完美适合 MVP 快速验证和小团队开发！🚀 