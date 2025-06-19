#!/bin/bash

# LangChain + MCP 后端服务快速设置脚本

echo "=== LangChain + MCP 后端服务设置 ==="
echo ""

# 创建后端目录
echo "1. 创建后端服务目录..."
mkdir -p backend-langchain-mcp/src/{routes,services,utils}

# 创建 package.json
echo "2. 创建 package.json..."
cat > backend-langchain-mcp/package.json << 'EOF'
{
  "name": "mcp-langchain-backend",
  "version": "1.0.0",
  "description": "Backend service for LangChain and MCP integration",
  "main": "dist/index.js",
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "langchain": "^0.1.0",
    "@langchain/openai": "^0.0.25",
    "@langchain/community": "^0.0.40",
    "@modelcontextprotocol/sdk": "^0.5.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.5",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.3",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2"
  }
}
EOF

# 创建 tsconfig.json
echo "3. 创建 tsconfig.json..."
cat > backend-langchain-mcp/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# 创建 .env 模板
echo "4. 创建 .env 模板..."
cat > backend-langchain-mcp/.env.example << 'EOF'
PORT=3001
OPENAI_API_KEY=your_openai_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langchain_api_key_here
NODE_ENV=development
LOG_LEVEL=info
EOF

# 创建简化的服务器文件
echo "5. 创建简化的服务器文件..."
cat > backend-langchain-mcp/src/index.ts << 'EOF'
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 基本的聊天端点
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // 这里可以集成 LangChain
    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: 'LangChain backend is ready for integration!'
        }
      }]
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF

# 更新前端环境变量
echo "6. 创建前端环境变量文件..."
cat > .env.local << 'EOF'
VITE_LANGCHAIN_BACKEND_URL=http://localhost:3001
EOF

echo ""
echo "=== 设置完成！==="
echo ""
echo "下一步操作："
echo "1. 进入后端目录: cd backend-langchain-mcp"
echo "2. 安装依赖: npm install"
echo "3. 复制环境变量: cp .env.example .env"
echo "4. 编辑 .env 文件，添加你的 OpenAI API Key"
echo "5. 启动后端服务: npm run dev"
echo ""
echo "在另一个终端中："
echo "1. 回到前端根目录"
echo "2. 启动前端: npm run dev"
echo ""
echo "完整的实施指南请查看: LANGCHAIN_MCP_INTEGRATION_GUIDE.md" 