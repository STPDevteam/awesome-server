import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 打印相关的环境变量
console.log('环境变量检查：');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME);
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '已设置' : '未设置');
console.log('AWS_S3_AVATAR_PREFIX:', process.env.AWS_S3_AVATAR_PREFIX); 