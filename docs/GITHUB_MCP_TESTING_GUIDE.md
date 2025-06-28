# GitHub MCP 测试指南

## 概述

本文档提供了测试GitHub MCP集成的完整指南，包括环境准备、配置设置和测试执行。

## 前置条件

### 1. 环境要求

- **Docker**: 已安装并运行
- **Node.js**: 版本 16+ 
- **GitHub Personal Access Token**: 有效的GitHub访问令牌
- **MCP LangChain 服务**: 正在运行

### 2. GitHub Token 设置

#### 创建 Personal Access Token

1. 访问 [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. 点击 "Generate new token (classic)"
3. 设置Token名称，如 "MCP LangChain Integration"
4. 选择所需权限：

**推荐权限设置**：
```
✅ repo                    # 完整的仓库访问权限
✅ read:org                # 读取组织信息  
✅ read:user               # 读取用户信息
✅ user:email              # 访问用户邮箱
✅ read:project            # 读取项目信息
✅ workflow                # GitHub Actions工作流（可选）
```

5. 点击 "Generate token" 并复制生成的token

#### 设置环境变量

```bash
# 设置GitHub Token
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：设置其他配置
export GITHUB_TOOLSETS=context,repos,issues,pull_requests,actions,code_security,users
export GITHUB_READ_ONLY=0
```

## 测试方法

### 方法一：快速测试脚本（推荐）

最简单的测试方法，自动化完成所有基础测试：

```bash
# 1. 设置环境变量
export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here

# 2. 给脚本执行权限
chmod +x test/quick-github-mcp-test.sh

# 3. 运行快速测试
./test/quick-github-mcp-test.sh
```

**测试内容包括**：
- ✅ Docker环境检查
- ✅ GitHub Token验证
- ✅ MCP配置检查  
- ✅ MCP连接测试
- ✅ 工具列表获取
- ✅ 基础工具调用
- ✅ 任务创建和执行

### 方法二：详细测试脚本

更详细的测试，包含完整的工具测试和报告生成：

```bash
# 1. 安装依赖
npm install

# 2. 设置环境变量
export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
export BASE_URL=http://localhost:3000

# 3. 运行详细测试
node test/test-github-mcp.js
```

**测试内容包括**：
- 🔧 所有可用工具的详细测试
- 📊 测试结果报告生成
- 🎯 任务工作流完整测试
- 📋 错误诊断和建议

### 方法三：手动API测试

#### 1. 检查MCP配置

```bash
curl -X GET "http://localhost:3000/api/mcp/list" | jq .
```

应该返回包含 `github-mcp` 的配置。

#### 2. 连接GitHub MCP

```bash
curl -X POST "http://localhost:3000/api/mcp/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github-mcp",
    "userId": "test-user"
  }' | jq .
```

#### 3. 获取工具列表

```bash
curl -X GET "http://localhost:3000/api/mcp/github-mcp/tools?userId=test-user" | jq .
```

#### 4. 测试工具调用

```bash
# 获取用户信息
curl -X POST "http://localhost:3000/api/mcp/github-mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_authenticated_user",
    "input": {},
    "userId": "test-user"
  }' | jq .

# 列出仓库
curl -X POST "http://localhost:3000/api/mcp/github-mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "list_repositories_for_authenticated_user", 
    "input": {"per_page": 5, "sort": "updated"},
    "userId": "test-user"
  }' | jq .
```

## 常见工具和用法

### 用户相关工具

```bash
# 获取当前用户信息
{
  "tool": "get_authenticated_user",
  "input": {}
}

# 获取指定用户信息
{
  "tool": "get_user",
  "input": {"username": "octocat"}
}
```

### 仓库相关工具

```bash
# 列出用户仓库
{
  "tool": "list_repositories_for_authenticated_user",
  "input": {
    "visibility": "all",
    "sort": "updated", 
    "per_page": 10
  }
}

# 获取仓库信息
{
  "tool": "get_repository",
  "input": {
    "owner": "username",
    "repo": "repository-name"
  }
}

# 创建仓库
{
  "tool": "create_repository",
  "input": {
    "name": "new-repo",
    "description": "A test repository",
    "private": false
  }
}
```

### Issues 相关工具

```bash
# 列出Issues
{
  "tool": "list_issues_for_repository",
  "input": {
    "owner": "username",
    "repo": "repository-name",
    "state": "open",
    "per_page": 10
  }
}

# 创建Issue
{
  "tool": "create_issue",
  "input": {
    "owner": "username",
    "repo": "repository-name", 
    "title": "Bug report",
    "body": "Description of the issue"
  }
}
```

### Pull Request 相关工具

```bash
# 列出Pull Requests
{
  "tool": "list_pull_requests",
  "input": {
    "owner": "username",
    "repo": "repository-name",
    "state": "open"
  }
}

# 创建Pull Request
{
  "tool": "create_pull_request",
  "input": {
    "owner": "username",
    "repo": "repository-name",
    "title": "Feature: Add new functionality",
    "head": "feature-branch",
    "base": "main",
    "body": "Description of changes"
  }
}
```

## 故障排除

### 常见问题

#### 1. Docker相关错误

**问题**: `Docker未运行`
**解决方案**:
```bash
# macOS/Windows
# 启动Docker Desktop

# Linux
sudo systemctl start docker
```

#### 2. Token权限不足

**问题**: `403 Forbidden` 或权限错误
**解决方案**:
- 检查Token是否包含必要权限
- 重新生成Token并设置正确权限
- 确认Token未过期

#### 3. MCP连接失败

**问题**: `MCP connection failed`
**解决方案**:
```bash
# 检查Docker镜像
docker pull ghcr.io/github/github-mcp-server

# 检查环境变量
echo $GITHUB_PERSONAL_ACCESS_TOKEN

# 查看服务器日志
docker logs <container_id>
```

#### 4. 工具调用失败

**问题**: 工具调用返回错误
**解决方案**:
- 检查输入参数格式
- 验证必需参数是否提供
- 查看工具的输入模式要求

### 调试技巧

#### 1. 启用详细日志

```bash
# 设置日志级别
export LOG_LEVEL=debug

# 查看MCP调用详情
export MCP_DEBUG=true
```

#### 2. 检查网络连接

```bash
# 测试GitHub API连接
curl -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" \
     https://api.github.com/user

# 测试本地服务器
curl http://localhost:3000/health
```

#### 3. 验证Docker容器

```bash
# 查看运行中的容器
docker ps

# 查看容器日志
docker logs <github-mcp-container>

# 进入容器调试
docker exec -it <container_id> /bin/sh
```

## 性能优化

### 1. 工具集配置

根据需要选择特定的工具集以提高性能：

```bash
# 只启用基础功能
export GITHUB_TOOLSETS=context,repos,users

# 启用完整功能
export GITHUB_TOOLSETS=all
```

### 2. 只读模式

对于只需要查看信息的场景：

```bash
export GITHUB_READ_ONLY=1
```

### 3. 请求限制

GitHub API有速率限制，建议：
- 使用适当的 `per_page` 参数
- 避免频繁的大量请求
- 实现适当的错误重试机制

## 测试报告

测试完成后，详细测试脚本会生成报告：

```
test-output/github-mcp-test-report.json
```

报告包含：
- 测试执行时间
- 成功/失败统计
- 详细的测试结果
- 错误信息和建议

## 最佳实践

### 1. 安全考虑

- 使用最小权限原则设置Token权限
- 定期轮换Personal Access Token
- 不要在代码中硬编码Token
- 使用环境变量管理敏感信息

### 2. 错误处理

- 实现适当的重试机制
- 处理API速率限制
- 提供有意义的错误消息
- 记录详细的调试信息

### 3. 性能优化

- 合理设置工具集范围
- 使用分页参数控制返回数据量
- 缓存不经常变化的数据
- 监控API使用量

## 更多资源

- [GitHub MCP Server 官方文档](https://github.com/github/github-mcp-server)
- [GitHub API 文档](https://docs.github.com/en/rest)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Docker 安装指南](https://docs.docker.com/get-docker/) 