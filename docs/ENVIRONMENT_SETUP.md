# MCP Server 环境变量设置指南

## 🔧 快速设置

1. **复制环境变量模板**:
   ```bash
   cp .env.example .env
   ```

2. **编辑 `.env` 文件，填入你的配置**:
   ```bash
   vim .env
   ```

## 🔑 必需的配置

### 核心服务配置
- `PORT`: 服务器端口 (默认: 3001)
- `NODE_ENV`: 运行环境 (development/production)
- `OPENAI_API_KEY`: OpenAI API 密钥 (必需)

### 数据库配置
- `DB_HOST`: 数据库主机地址
- `DB_PORT`: 数据库端口 (默认: 5432)
- `DB_NAME`: 数据库名称
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码

### JWT 令牌配置
- `JWT_ACCESS_SECRET`: 访问令牌密钥
- `JWT_REFRESH_SECRET`: 刷新令牌密钥

## 🚀 数据库设置

### PostgreSQL 本地安装
```bash
# macOS (使用 Homebrew)
brew install postgresql
brew services start postgresql

# 创建数据库
createdb mcp_server

# 创建用户 (可选)
createuser -P peteren
```

### Docker 方式
```bash
# 启动 PostgreSQL 容器
docker run --name mcp-postgres \
  -e POSTGRES_DB=mcp_server \
  -e POSTGRES_USER=peteren \
  -e POSTGRES_PASSWORD=your-password \
  -p 5432:5432 \
  -d postgres:15-alpine
```

## 🔐 JWT 密钥生成

如果需要生成新的 JWT 密钥：

```bash
# 生成安全的随机密钥
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

## 🛠️ MCP 配置说明

MCP 服务的 API 密钥已在前端 (mcp-fe) 配置，后端不需要重复配置。

后端的 MCP 相关配置：
- `USE_OFFICIAL_MCP_ADAPTER=true`: 使用官方 MCP 适配器

## 🔒 安全注意事项

- ✅ `.env` 文件已添加到 `.gitignore`
- ✅ 使用强密码和安全的 JWT 密钥
- ❌ 不要将真实的密钥分享或提交到代码仓库
- ❌ 生产环境不要使用默认密钥

## 🛠️ 验证配置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 检查健康状态
curl http://localhost:3001/health
```

## 📊 环境变量优先级

1. 环境变量 (最高优先级)
2. `.env` 文件
3. 默认值 (最低优先级)

## 🐛 常见问题

### 数据库连接失败
- 检查 PostgreSQL 是否运行
- 验证数据库连接参数
- 确认用户权限

### JWT 令牌错误
- 确认 JWT 密钥已正确设置
- 检查密钥长度和格式

### MCP 服务问题
- MCP 相关问题请检查前端 (mcp-fe) 的 API 密钥配置
- 检查 MCP 适配器配置: `USE_OFFICIAL_MCP_ADAPTER=true` 