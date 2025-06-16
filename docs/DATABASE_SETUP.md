# 数据库设置指南

## 前置要求

1. **安装 PostgreSQL**
   - macOS: `brew install postgresql`
   - Ubuntu: `sudo apt-get install postgresql postgresql-contrib`
   - 或使用 Docker: `docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`

2. **创建数据库**
   ```bash
   # 进入 PostgreSQL 命令行
   psql -U postgres
   
   # 创建数据库
   CREATE DATABASE mcp_server;
   
   # 退出
   \q
   ```

## 环境变量配置

创建 `.env` 文件在项目根目录，包含以下配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_server
DB_USER=postgres
DB_PASSWORD=password

# JWT配置
JWT_ACCESS_SECRET=your-super-secret-access-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# 服务器配置
PORT=3000
NODE_ENV=development

# 其他配置
CORS_ORIGIN=http://localhost:3000
```

⚠️ **重要**: 在生产环境中，请务必更改JWT密钥为强密码！

## 数据库迁移

1. **安装依赖**
   ```bash
   npm install
   ```

2. **运行数据库迁移**
   ```bash
   npm run db:setup
   ```

3. **验证数据库表**
   ```bash
   psql -U postgres -d mcp_server
   \dt  # 查看所有表
   ```

## 数据库表结构

迁移完成后，将创建以下表：

### `users` 表
- 存储用户基本信息（用户名、头像、钱包地址、邮箱等）

### `user_login_methods` 表
- 存储用户的登录方式（钱包、Google、GitHub）
- 使用 JSONB 字段存储不同登录方式的特定数据

### `refresh_tokens` 表
- 存储刷新令牌的哈希值
- 支持令牌撤销和过期管理

### `migrations` 表
- 跟踪数据库迁移版本

## 数据库管理命令

- **运行迁移**: `npm run migrate:up`
- **回滚迁移**: `npm run migrate:down <版本号>`
- **重新设置数据库**: `npm run db:setup`

## 安全最佳实践

1. **生产环境配置**:
   - 使用强密码
   - 启用 SSL 连接
   - 限制数据库访问权限

2. **JWT 密钥**:
   - 使用长度至少 32 字符的随机字符串
   - 定期轮换密钥

3. **数据库连接**:
   - 使用连接池限制并发连接
   - 设置合适的超时时间

## 故障排除

1. **连接失败**:
   - 检查 PostgreSQL 服务是否运行
   - 验证连接配置
   - 检查防火墙设置

2. **迁移失败**:
   - 检查数据库权限
   - 查看错误日志
   - 确保表不存在冲突

3. **性能优化**:
   - 定期运行 `VACUUM` 和 `ANALYZE`
   - 监控查询性能
   - 调整连接池配置 