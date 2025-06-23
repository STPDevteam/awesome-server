############################
# 1) 构建阶段：安装依赖并打包
############################
FROM node:20-alpine AS builder
WORKDIR /app

# 复制锁文件
COPY package.json package-lock.json* ./

# 切换到官方 registry 并优化超时重试
RUN npm config set registry https://registry.npmjs.org/ \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 10000 \
 && npm config set fetch-retry-maxtimeout 600000 \
 && npm config set fetch-timeout 300000 \
 && npm cache clean --force

# 安装生产依赖并跳过安全审计
RUN npm ci --omit=dev --no-audit

# 复制源码并构建
COPY . .
RUN npm run build

# 安装Playwright MCP到构建阶段
RUN npm install @playwright/mcp@latest

############################
# 2) 运行阶段：最小化运行时
############################
FROM node:20-alpine AS runner

# 安装curl和其他调试工具
RUN apk add --no-cache curl

# 创建一个非 root 用户
RUN addgroup -S appgroup && adduser -S -u 1001 -G appgroup appuser

WORKDIR /app

# 复制构建产物和生产依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 确保Playwright MCP被正确复制
RUN ls -la /app/node_modules/@playwright || echo "Playwright MCP not found"

# 切换到非 root 用户
USER appuser

# 默认命令
EXPOSE 3001
CMD ["node", "dist/index.js"]
