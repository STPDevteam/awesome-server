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
 && npm config set fetch-timeout 300000

# 安装生产依赖并跳过安全审计
RUN npm ci --omit=dev --no-audit

# 复制源码并构建
COPY . .
RUN npm run build

############################
# 2) 运行阶段：最小化运行时
############################
FROM node:20-alpine AS runner
WORKDIR /app

# 创建非 root 用户（可选）
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nodejs -G nodejs

# 复制构建产物和生产依赖
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json   ./package.json

# 切换用户并启动
USER nodejs
EXPOSE 3001
CMD ["node", "dist/index.js"]
