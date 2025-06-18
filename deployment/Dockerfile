############################
# 1) 构建阶段：安装依赖并打包
############################
FROM node:20-alpine AS builder
WORKDIR /app

# 安装构建时需要的工具（仅必需的）
RUN apk add --no-cache make g++

# 复制锁文件
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci --only=production --no-audit

# 复制源代码并构建
COPY . .
RUN npm run build

############################
# 2) 运行阶段：最小化运行时
############################
FROM node:20-alpine AS runner
WORKDIR /app

# 只安装运行时需要的用户（如果需要）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 复制构建产物和必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 设置用户权限
RUN chown -R nodejs:nodejs /app
USER nodejs

# 暴露端口并启动
EXPOSE 3001
CMD ["node", "dist/index.js"]
