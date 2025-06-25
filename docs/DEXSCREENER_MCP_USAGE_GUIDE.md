# DexScreener MCP Server 使用指南

## 概述

DexScreener MCP Server 是一个专业的去中心化交易所(DEX)数据服务，提供实时的交易对数据、代币信息和市场统计，支持多个区块链网络。

## 功能特性

### 🔥 核心功能
- ✅ **实时DEX数据** - 获取最新的交易对价格和交易量
- ✅ **代币分析** - 代币资料、推广代币、订单信息
- ✅ **多链支持** - 支持Solana、Ethereum、BSC等多个区块链
- ✅ **速率限制** - 内置API速率限制保护
- ✅ **搜索功能** - 按代币名称或地址搜索交易对
- ✅ **市场统计** - 交易量、流动性、价格变化等数据

### 📊 数据类型
- **代币资料** (Token Profiles) - 最新的代币信息和元数据
- **推广代币** (Boosted Tokens) - 正在推广的热门代币
- **交易对数据** (Pair Data) - DEX交易对的详细信息
- **订单信息** (Token Orders) - 特定代币的付费订单
- **市场统计** - 价格、交易量、流动性等指标

## 在项目中的配置

### ✅ 1. 预定义MCP配置 (predefinedMCPs.ts)
```typescript
{
  name: 'dexscreener-mcp',
  description: 'DexScreener real-time DEX pair data, token information, and market statistics across multiple blockchains',
  command: 'npx',
  args: ['-y', '@opensvm/dexscreener-mcp-server'],
  env: {},
  connected: false,
  category: 'Market Data',
  imageUrl: 'https://dexscreener.com/favicon.ico',
  githubUrl: 'https://github.com/opensvm/dexscreener-mcp-server'
}
```

### ✅ 2. 服务信息配置 (mcpInfoService.ts)
```typescript
{
  name: 'dexscreener-mcp-server',
  description: 'DexScreener real-time DEX pair data, token information, and market statistics across multiple blockchains',
  capabilities: [
    'latest-token-profiles', 'boosted-tokens', 'token-orders', 'pair-data',
    'multi-chain-support', 'real-time-prices', 'market-statistics',
    'token-search', 'dex-analytics', 'rate-limited-api'
  ],
  authRequired: false,
  category: 'Market Data'
}
```

### ✅ 3. 任务分析服务配置 (taskAnalysisService.ts)
- ✅ 支持LLM任务分析
- ✅ 无需认证（公开API）
- ✅ 中文描述和功能说明

## API接口使用

### 1. 测试DexScreener MCP连接

```bash
POST http://localhost:3001/api/task/test-dexscreener-mcp
```

**使用curl测试：**
```bash
curl -X POST http://localhost:3001/api/task/test-dexscreener-mcp -H "Content-Type: application/json"
```

**响应示例：**
```json
{
  "success": true,
  "message": "DexScreener MCP test successful",
  "tools": [...],
  "features": [
    "Real-time DEX pair data",
    "Token profiles and boosted tokens",
    "Multi-chain support",
    "Rate-limited API access",
    "Market statistics and analytics"
  ],
  "availableTools": [
    "get_latest_token_profiles",
    "get_latest_boosted_tokens",
    "get_top_boosted_tokens",
    "get_token_orders",
    "get_pairs_by_chain_and_address",
    "get_pairs_by_token_addresses",
    "search_pairs"
  ]
}
```

## 可用工具详解

### 📈 代币分析工具

#### 1. `get_latest_token_profiles`
获取最新的代币资料
```javascript
// 无需参数
const result = await mcpClient.callTool('dexscreener', 'get_latest_token_profiles');
```

#### 2. `get_latest_boosted_tokens`
获取最新的推广代币
```javascript
// 无需参数
const result = await mcpClient.callTool('dexscreener', 'get_latest_boosted_tokens');
```

#### 3. `get_top_boosted_tokens`
获取最活跃的推广代币
```javascript
// 无需参数
const result = await mcpClient.callTool('dexscreener', 'get_top_boosted_tokens');
```

### 🔍 交易对查询工具

#### 4. `get_pairs_by_chain_and_address`
根据链和交易对地址获取交易对信息
```javascript
const result = await mcpClient.callTool('dexscreener', 'get_pairs_by_chain_and_address', {
  chainId: 'solana',
  pairId: 'HxFLKUAmAMLz1jtT3hbvCMELwH5H9tpM2QugP8sKyfhc'
});
```

#### 5. `get_pairs_by_token_addresses`
根据代币地址获取交易对（最多30个）
```javascript
const result = await mcpClient.callTool('dexscreener', 'get_pairs_by_token_addresses', {
  tokenAddresses: 'So11111111111111111111111111111111111111112'
});
```

#### 6. `search_pairs`
搜索匹配查询的交易对
```javascript
const result = await mcpClient.callTool('dexscreener', 'search_pairs', {
  query: 'SOL'
});
```

### 💰 订单分析工具

#### 7. `get_token_orders`
检查特定代币的付费订单
```javascript
const result = await mcpClient.callTool('dexscreener', 'get_token_orders', {
  chainId: 'solana',
  tokenAddress: 'So11111111111111111111111111111111111111112'
});
```

## 使用示例

### 示例1：获取Solana上SOL的交易对信息
```javascript
// 搜索SOL相关的交易对
const searchResult = await mcpClient.callTool('dexscreener', 'search_pairs', {
  query: 'SOL'
});

// 获取特定SOL交易对的详细信息
const pairResult = await mcpClient.callTool('dexscreener', 'get_pairs_by_token_addresses', {
  tokenAddresses: 'So11111111111111111111111111111111111111112'
});
```

### 示例2：分析推广代币趋势
```javascript
// 获取最新推广代币
const latestBoosted = await mcpClient.callTool('dexscreener', 'get_latest_boosted_tokens');

// 获取最活跃推广代币
const topBoosted = await mcpClient.callTool('dexscreener', 'get_top_boosted_tokens');

// 对比分析推广趋势
console.log('Latest boosted tokens:', latestBoosted);
console.log('Top boosted tokens:', topBoosted);
```

### 示例3：代币深度分析
```javascript
// 获取代币资料
const profiles = await mcpClient.callTool('dexscreener', 'get_latest_token_profiles');

// 检查代币订单
const orders = await mcpClient.callTool('dexscreener', 'get_token_orders', {
  chainId: 'ethereum',
  tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC
});
```

## 支持的区块链网络

DexScreener支持多个主流区块链网络：

### 🔗 主要网络
- **Solana** - 高性能区块链
- **Ethereum** - 以太坊主网
- **BSC** - 币安智能链
- **Polygon** - Polygon网络
- **Arbitrum** - Arbitrum Layer 2
- **Optimism** - Optimism Layer 2
- **Avalanche** - 雪崩网络
- **Fantom** - Fantom网络

### 💡 使用建议
- **Solana**: 适合分析meme币和新兴代币
- **Ethereum**: 适合分析主流DeFi代币
- **BSC**: 适合分析BSC生态代币
- **Layer 2**: 适合分析低Gas费环境的代币

## 速率限制

DexScreener MCP Server内置了速率限制保护：

### 📊 限制规则
- **代币资料/推广端点**: 60 请求/分钟
- **DEX/交易对端点**: 300 请求/分钟

### 🛡️ 错误处理
服务器会处理各种错误情况：
- 速率限制超出
- 无效参数
- 网络错误
- API错误

所有错误都以标准化格式返回，包含适当的错误代码和消息。

## 实际应用场景

### 💼 DeFi分析
```javascript
// 分析特定代币的流动性和交易活动
const pairData = await mcpClient.callTool('dexscreener', 'get_pairs_by_token_addresses', {
  tokenAddresses: 'TOKEN_ADDRESS'
});

// 分析价格趋势和交易量
console.log('Price:', pairData.pairs[0].priceUsd);
console.log('Volume 24h:', pairData.pairs[0].volume.h24);
console.log('Liquidity:', pairData.pairs[0].liquidity.usd);
```

### 🔍 代币研究
```javascript
// 研究新兴代币和推广趋势
const boostedTokens = await mcpClient.callTool('dexscreener', 'get_latest_boosted_tokens');

// 分析代币推广活动
for (const token of boostedTokens.data) {
  console.log(`Token: ${token.name}, Chain: ${token.chainId}`);
}
```

### 📈 市场监控
```javascript
// 监控特定交易对的实时数据
const monitorPair = async (chainId, pairId) => {
  const result = await mcpClient.callTool('dexscreener', 'get_pairs_by_chain_and_address', {
    chainId,
    pairId
  });
  
  return {
    price: result.pair.priceUsd,
    volume24h: result.pair.volume.h24,
    priceChange24h: result.pair.priceChange.h24
  };
};
```

## 直接使用方法

### 1. 使用npx直接运行
```bash
# 直接运行DexScreener MCP Server
npx @opensvm/dexscreener-mcp-server
```

### 2. 一键安装到Claude Desktop
```bash
# 自动安装并添加到Claude Desktop
curl -L https://raw.githubusercontent.com/opensvm/dexscreener-mcp-server/main/install.sh | bash
```

### 3. 在Cursor中配置
创建 `.cursor/mcp.json` 文件：
```json
{
  "mcpServers": {
    "dexscreener-mcp": {
      "command": "npx",
      "args": ["-y", "@opensvm/dexscreener-mcp-server"]
    }
  }
}
```

## 故障排除

### 1. 连接失败
- 检查网络连接
- 确认包名正确: `@opensvm/dexscreener-mcp-server`
- 尝试手动安装: `npm install -g @opensvm/dexscreener-mcp-server`

### 2. 速率限制错误
- 等待一分钟后重试
- 减少请求频率
- 使用不同的端点分散请求

### 3. 数据返回空值
- 检查链ID和地址格式
- 确认代币在DexScreener上存在
- 尝试使用搜索功能查找正确的地址

## 最佳实践

### 🎯 高效使用建议

1. **合理使用速率限制**
   - 避免短时间内大量请求
   - 使用缓存减少重复请求
   - 分批处理多个代币查询

2. **数据验证**
   - 检查返回数据的完整性
   - 验证价格和交易量的合理性
   - 对比多个数据源

3. **错误处理**
   - 实现重试机制
   - 记录和监控API错误
   - 提供备用数据源

### 📊 性能优化

```javascript
// 批量查询多个代币（推荐）
const tokenAddresses = [
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
];

const batchResult = await mcpClient.callTool('dexscreener', 'get_pairs_by_token_addresses', {
  tokenAddresses: tokenAddresses.join(',')
});

// 避免单独查询每个代币（不推荐）
// for (const address of tokenAddresses) {
//   const result = await mcpClient.callTool('dexscreener', 'get_pairs_by_token_addresses', {
//     tokenAddresses: address
//   });
// }
```

## 更多信息

- **GitHub仓库**: https://github.com/opensvm/dexscreener-mcp-server
- **DexScreener官网**: https://dexscreener.com/
- **API文档**: docs/api-reference.md
- **测试接口**: `POST http://localhost:3001/api/task/test-dexscreener-mcp`
- **MCP协议**: https://modelcontextprotocol.io/

---

## 总结

DexScreener MCP Server为您提供了强大的DEX数据分析能力：

- ✅ **7个专业工具**覆盖代币分析、交易对查询、订单监控
- ✅ **多链支持**包括Solana、Ethereum、BSC等主流网络
- ✅ **实时数据**提供最新的价格、交易量、流动性信息
- ✅ **无需认证**公开API，即插即用
- ✅ **速率保护**内置限制机制，稳定可靠
- ✅ **易于集成**支持多种使用方式

这个集成为DeFi分析、代币研究和市场监控提供了专业级的数据支持！🚀 