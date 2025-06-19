import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// AWS 配置
const config = {
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_REGION
};

async function verifyCredentials() {
    console.log('🔍 正在验证 AWS 凭证...');
    console.log(`Access Key ID: ${process.env.AWS_ACCESS_KEY_ID}`);
    console.log(`Region: ${process.env.AWS_REGION}`);
    
    try {
        const client = new S3Client(config);
        const command = new ListBucketsCommand({});
        const response = await client.send(command);
        
        console.log('\n✅ AWS 凭证验证成功！');
        console.log('可访问的存储桶列表:');
        response.Buckets.forEach(bucket => {
            console.log(`- ${bucket.Name}`);
        });
    } catch (error) {
        console.error('\n❌ AWS 凭证验证失败');
        console.error('错误信息:', error.message);
        if (error.$metadata) {
            console.error('HTTP 状态码:', error.$metadata.httpStatusCode);
        }
    }
}

verifyCredentials(); 