# S3 Avatar Service 配置指南

本文档介绍如何配置和使用 AWS S3 存储桶来为新用户提供随机头像功能。

## 功能概述

当新用户通过钱包登录时，如果没有提供自定义头像，系统会自动从 AWS S3 存储桶中随机选择一张图片作为用户头像。

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# AWS 访问凭证
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY

# S3 存储桶配置
AWS_REGION=us-east-1                          # AWS 区域
AWS_S3_BUCKET_NAME=YOUR_BUCKET_NAME          # S3 存储桶名称
AWS_S3_AVATAR_PREFIX=avatars/                # 头像文件夹前缀（默认: avatars/）
AWS_CLOUDFRONT_DOMAIN=YOUR_CLOUDFRONT_DOMAIN # (可选) CloudFront 域名
```

### 配置说明

1. **AWS_ACCESS_KEY_ID** 和 **AWS_SECRET_ACCESS_KEY**
   - AWS IAM 用户的访问密钥
   - 如果在 EC2 实例上运行并使用 IAM 角色，可以不配置这两项

2. **AWS_REGION**
   - S3 存储桶所在的 AWS 区域
   - 例如：`us-east-1`、`ap-northeast-1` 等

3. **AWS_S3_BUCKET_NAME**
   - 存储头像图片的 S3 存储桶名称
   - 必须是已存在的存储桶

4. **AWS_S3_AVATAR_PREFIX**
   - 存储桶中头像文件夹的前缀
   - 默认值：`avatars/`
   - 系统会从这个前缀下的所有图片中随机选择

5. **AWS_CLOUDFRONT_DOMAIN** (可选)
   - 如果使用 CloudFront CDN，配置域名以加速图片访问
   - 格式：`d1234567890.cloudfront.net`

## S3 存储桶设置

### 1. 创建存储桶

```bash
aws s3 mb s3://your-bucket-name --region us-east-1
```

### 2. 上传头像图片

将头像图片上传到指定前缀下：

```bash
aws s3 cp ./avatars/ s3://your-bucket-name/avatars/ --recursive
```

### 3. 配置存储桶权限

#### 方案 A：公开读取（推荐用于头像）

创建存储桶策略允许公开读取：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/avatars/*"
    }
  ]
}
```

#### 方案 B：使用 IAM 权限

为 IAM 用户或角色添加以下权限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/avatars/*"
    }
  ]
}
```

## 支持的图片格式

系统支持以下图片格式：
- `.jpg` / `.jpeg`
- `.png`
- `.gif`
- `.webp`
- `.svg`

## 测试配置

运行测试脚本验证配置：

```bash
npm run test:s3-avatar
```

测试脚本会：
1. 验证 S3 配置是否正确
2. 尝试获取随机头像
3. 测试缓存功能

## 性能优化

### 缓存机制

- 头像列表会缓存 1 小时，避免频繁访问 S3 API
- 可以通过 `s3AvatarService.clearCache()` 手动清除缓存

### 建议

1. **使用 CloudFront CDN**
   - 配置 CloudFront 分发以加速全球访问
   - 减少 S3 直接访问的延迟

2. **优化图片大小**
   - 建议头像尺寸：200x200 到 500x500 像素
   - 使用 WebP 格式以减小文件大小

3. **合理的图片数量**
   - 建议准备 50-100 张不同的头像图片
   - 系统最多加载 1000 张图片

## 故障排除

### 1. S3 配置验证失败

检查：
- AWS 凭证是否正确
- 存储桶名称是否正确
- 存储桶区域是否匹配
- IAM 权限是否足够

### 2. 无法获取头像

检查：
- 存储桶中是否有图片文件
- 图片路径前缀是否正确
- 图片格式是否支持

### 3. 启动时的警告信息

如果看到以下信息：
```
ℹ️  S3 avatar service not configured - avatar randomization disabled
```

这表示未配置 S3 服务，系统将继续运行但不会提供随机头像功能。

## 禁用功能

如果不想使用随机头像功能，只需不配置 `AWS_S3_BUCKET_NAME` 环境变量即可。 