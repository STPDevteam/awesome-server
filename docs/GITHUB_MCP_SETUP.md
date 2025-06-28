# GitHub MCP Server 配置指南

## 概述

GitHub MCP Server 是官方的 Model Context Protocol (MCP) 服务器，提供与 GitHub API 的无缝集成，支持高级自动化和交互功能。

## 配置要求

### 1. Docker 环境
确保您的系统已安装并运行 Docker：
```bash
# 检查 Docker 是否安装
docker --version

# 检查 Docker 是否运行
docker ps
```

### 2. GitHub Personal Access Token (PAT)
创建 GitHub Personal Access Token：

1. 访问 GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 "Generate new token (classic)"
3. 选择所需权限（建议权限）：
   - `repo` - 完整的仓库访问权限
   - `read:org` - 读取组织信息
   - `read:user` - 读取用户信息
   - `user:email` - 访问用户邮箱
   - `read:project` - 读取项目信息
   - `workflow` - 更新 GitHub Actions 工作流（如需要）

## 环境变量配置

在您的 `.env` 文件中添加以下配置：

```bash
# GitHub MCP 配置
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：指定工具集（默认包含常用工具）
# 可选值：context,repos,issues,pull_requests,actions,code_security,users,orgs,notifications,experiments,secret_protection
GITHUB_TOOLSETS=context,repos,issues,pull_requests,actions,code_security,users

# 可选：只读模式（1=只读，0=读写）
GITHUB_READ_ONLY=0

# 可选：GitHub Enterprise Server 或 ghe.com 主机名
# GITHUB_HOST=https://your-github-enterprise.com
```

## 工具集说明

| 工具集 | 描述 |
|--------|------|
| `context` | **强烈推荐**：提供当前用户和 GitHub 上下文信息 |
| `repos` | 仓库相关操作（创建、删除、管理等） |
| `issues` | GitHub Issues 相关工具 |
| `pull_requests` | Pull Request 相关工具 |
| `actions` | GitHub Actions 工作流和 CI/CD 操作 |
| `code_security` | 代码安全相关工具（如代码扫描） |
| `users` | GitHub 用户相关工具 |
| `orgs` | GitHub 组织相关工具 |
| `notifications` | GitHub 通知相关工具 |
| `experiments` | 实验性功能（不稳定） |
| `secret_protection` | 密钥保护相关工具（如密钥扫描） |

## 使用示例

### 基本配置（推荐）
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
GITHUB_TOOLSETS=context,repos,issues,pull_requests,actions,code_security,users
GITHUB_READ_ONLY=0
```

### 只读模式配置
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
GITHUB_TOOLSETS=context,repos,issues,pull_requests,users
GITHUB_READ_ONLY=1
```

### 完整功能配置
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
GITHUB_TOOLSETS=all
GITHUB_READ_ONLY=0
```

## 功能特性

### 支持的操作类型

1. **仓库管理**
   - 创建、删除、克隆仓库
   - 分支管理
   - 文件操作（读取、创建、更新、删除）
   - 提交历史查看

2. **Issues 管理**
   - 创建、更新、关闭 Issues
   - 添加评论和标签
   - 分配负责人

3. **Pull Request 管理**
   - 创建、更新、合并 PR
   - 代码审查
   - 添加评论

4. **GitHub Actions**
   - 查看工作流状态
   - 触发工作流
   - 查看运行日志

5. **用户和组织管理**
   - 查看用户信息
   - 组织成员管理
   - 权限管理

## 安全建议

1. **最小权限原则**：只授予必要的权限
2. **定期轮换 Token**：建议定期更新 Personal Access Token
3. **只读模式**：对于只需要查看信息的场景，使用只读模式
4. **环境隔离**：生产环境和开发环境使用不同的 Token

## 故障排除

### 常见问题

1. **Docker 拉取失败**
   ```bash
   # 如果遇到认证问题，尝试登出
   docker logout ghcr.io
   ```

2. **Token 权限不足**
   - 检查 Token 是否包含所需权限
   - 确认 Token 未过期

3. **网络连接问题**
   - 检查防火墙设置
   - 确认能访问 GitHub API

### 测试连接
```bash
# 测试 GitHub API 连接
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.github.com/user
```

## 更多信息

- [GitHub MCP Server 官方文档](https://github.com/github/github-mcp-server)
- [GitHub Personal Access Token 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [MCP 协议规范](https://modelcontextprotocol.io/) 