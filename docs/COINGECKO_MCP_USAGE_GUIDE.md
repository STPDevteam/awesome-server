# CoinGecko Official MCP Server 使用指南

## 概述

CoinGecko官方MCP服务器是CoinGecko提供的官方Model Context Protocol实现，提供全面的加密货币市场数据、历史价格和OHLC蜡烛图数据访问。

## 功能特性

### 🔥 核心功能
- ✅ **分页币种列表** - 获取支持的加密货币分页列表
- ✅ **币种ID查找** - 通过名称或符号查找CoinGecko ID  
- ✅ **历史数据** - 获取历史价格、市值和交易量数据
- ✅ **OHLC数据** - 获取开盘价、最高价、最低价、收盘价蜡烛图数据
- ✅ **本地缓存** - 带刷新功能的本地币种缓存
- ✅ **Pro API支持** - 支持CoinGecko Pro API密钥

### 📊 可用工具
1. **get-coins** - 获取分页的支持币种列表
2. **find-coin-ids** - 根据币种名称/符号查找CoinGecko ID
3. **get-historical-data** - 获取历史价格、市值和交易量数据
4. **get-ohlc-data** - 获取OHLC蜡烛图数据
5. **refresh-cache** - 刷新本地币种列表缓存

## 在项目中的配置

### ✅ 1. 预定义MCP配置 (predefinedMCPs.ts)
```typescript
{
  name: 'coingecko-mcp',
  description: 'CoinGecko official MCP server for cryptocurrency market data, historical prices, and OHLC candlestick data',
  command: 'npx',
  args: ['-y', '@coingecko/coingecko-mcp'],
  env: {
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || ''
  },
  connected: false,
  category: 'Market Data',
  imageUrl: 'https://www.coingecko.com/favicon.ico',
  githubUrl: 'https://docs.coingecko.com/reference/mcp-server'
}
```

### ✅ 2. MCP信息服务配置 (mcpInfoService.ts)
```typescript
{
  name: 'coingecko-server',
  description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data, historical prices, and OHLC candlestick data',
  capabilities: [
    'get-coins', 'find-coin-ids', 'get-historical-data', 'get-ohlc-data', 
    'refresh-cache', 'crypto-prices', 'market-data', 'coin-info',
    'price-history', 'market-cap-data', 'volume-data', 'candlestick-data'
  ],
  authRequired: true,
  authFields: ['COINGECKO_API_KEY'],
  category: 'Market Data',
  imageUrl: 'https://www.coingecko.com/favicon.ico',
  githubUrl: 'https://docs.coingecko.com/reference/mcp-server'
}
```

### ✅ 3. 任务分析服务配置 (taskAnalysisService.ts)
```typescript
{
  name: 'coingecko-server-service',
  description: 'CoinGecko official MCP server for comprehensive cryptocurrency market data, historical prices, and OHLC candlestick data',
  capabilities: [
    'get-coins', 'find-coin-ids', 'get-historical-data', 'get-ohlc-data', 
    'refresh-cache', 'crypto-prices', 'market-data', 'coin-info',
    'price-history', 'market-cap-data', 'volume-data', 'candlestick-data'
  ],
  authRequired: true,
  authFields: ['COINGECKO_API_KEY'],
  category: 'Market Data',
  imageUrl: 'https://www.coingecko.com/favicon.ico',
  githubUrl: 'https://docs.coingecko.com/reference/mcp-server',
  authParams: {
    apiKeyName: 'COINGECKO_API_KEY',
    apiKeyDescription: 'CoinGecko Pro API密钥'
  }
}
```

## 环境变量配置

### 必需环境变量
```bash
# CoinGecko Pro API密钥（推荐使用Pro版本获得更高速率限制）
COINGECKO_API_KEY=your_coingecko_pro_api_key_here
```

### 获取API密钥
1. 访问 [CoinGecko API](https://www.coingecko.com/en/api)
2. 注册CoinGecko Pro账户
3. 在仪表板中获取API密钥
4. 将密钥添加到环境变量中

## 数据类型

### OHLCData 接口
```typescript
interface OHLCData {
  timestamp: number;    // Unix时间戳
  open: number;        // 开盘价
  high: number;        // 最高价
  low: number;         // 最低价
  close: number;       // 收盘价
}
```

### HistoricalData 接口
```typescript
interface HistoricalData {
  prices: [number, number][];        // [时间戳, 价格]
  market_caps: [number, number][];   // [时间戳, 市值]
  total_volumes: [number, number][]; // [时间戳, 交易量]
}
```

### CoinInfo 接口
```typescript
interface CoinInfo {
  id: string;                           // CoinGecko ID
  symbol: string;                       // 币种符号
  name: string;                         // 币种名称
  platforms?: Record<string, string>;   // 平台合约地址
}
```

## 使用示例

### 1. 获取支持的币种列表
```javascript
const result = await mcpClient.callTool('coingecko-mcp', 'get-coins', {
  page: 1,
  per_page: 100
});
```

### 2. 查找币种ID
```javascript
const result = await mcpClient.callTool('coingecko-mcp', 'find-coin-ids', {
  query: 'bitcoin'
});
```

### 3. 获取历史价格数据
```javascript
const result = await mcpClient.callTool('coingecko-mcp', 'get-historical-data', {
  id: 'bitcoin',
  vs_currency: 'usd',
  from: '1640995200',  // 2022-01-01
  to: '1672531200',    // 2023-01-01
  interval: 'daily'
});
```

### 4. 获取OHLC蜡烛图数据
```javascript
const result = await mcpClient.callTool('coingecko-mcp', 'get-ohlc-data', {
  id: 'bitcoin',
  vs_currency: 'usd',
  days: 30
});
```

### 5. 刷新本地缓存
```javascript
const result = await mcpClient.callTool('coingecko-mcp', 'refresh-cache');
```

## 测试连接

### API测试端点
```bash
# 测试CoinGecko MCP连接
curl -X POST http://localhost:3001/api/task/test-coingecko-mcp \
  -H "Content-Type: application/json"
```

### 预期响应
```json
{
  "success": true,
  "data": {
    "connected": true,
    "tools": [
      "get-coins",
      "find-coin-ids", 
      "get-historical-data",
      "get-ohlc-data",
      "refresh-cache"
    ],
    "toolCount": 5
  }
}
```

## 速率限制

### 免费版API限制
- **每分钟**: 10-50次请求
- **每月**: 10,000次请求

### Pro版API限制
- **每分钟**: 500次请求
- **每月**: 无限制
- **额外功能**: 历史数据、高级端点访问

## 常见问题

### Q: 为什么需要Pro API密钥？
A: 虽然部分功能可以使用免费API，但Pro API提供更高的速率限制和更完整的历史数据访问。

### Q: 如何获取币种的CoinGecko ID？
A: 使用`find-coin-ids`工具，通过币种名称或符号查找对应的CoinGecko ID。

### Q: OHLC数据的时间间隔是什么？
A: 根据请求的天数自动确定：
- 1-2天: 30分钟间隔
- 3-30天: 4小时间隔
- 31天以上: 1天间隔

### Q: 如何处理API错误？
A: 服务器会自动处理常见错误，包括速率限制、无效参数和网络错误，并返回标准化的错误响应。

## 最佳实践

1. **使用缓存**: 定期调用`refresh-cache`来更新本地币种列表
2. **批量查询**: 一次查询多个币种以减少API调用
3. **合理间隔**: 遵守API速率限制，避免过于频繁的请求
4. **错误处理**: 实现适当的错误处理和重试机制
5. **数据验证**: 验证返回的数据格式和完整性

## 升级说明

从第三方CoinGecko MCP服务器升级到官方版本的主要变化：

### ✅ 优势
- **官方支持**: CoinGecko官方维护，更可靠
- **更多功能**: 支持OHLC数据、缓存管理等高级功能
- **更好的性能**: 优化的数据获取和缓存机制
- **完整文档**: 官方文档和支持

### 🔄 迁移步骤
1. 更新包名从 `mcp-coingecko-server` 到 `@coingecko/coingecko-mcp`
2. 配置`COINGECKO_API_KEY`环境变量
3. 更新工具调用，使用新的工具名称
4. 测试连接和功能

这个官方MCP服务器为您的项目提供了可靠、全面的CoinGecko数据访问能力！ 