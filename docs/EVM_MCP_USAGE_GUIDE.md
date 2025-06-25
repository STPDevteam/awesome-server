# EVM MCP Server 使用指南

## 概述

EVM MCP Server 是一个全面的模型上下文协议(MCP)服务器，支持30+个EVM兼容网络，包括以太坊、Optimism、Arbitrum、Base、Polygon等。它为AI代理提供统一的区块链交互接口。

## 功能特性

### 🌐 支持的网络

#### 主网
- **Ethereum (ETH)** - 以太坊主网
- **Optimism (OP)** - Optimism Layer 2
- **Arbitrum (ARB)** - Arbitrum One
- **Arbitrum Nova** - Arbitrum Nova
- **Base** - Coinbase Base网络
- **Polygon (MATIC)** - Polygon网络
- **Polygon zkEVM** - Polygon零知识EVM
- **Avalanche (AVAX)** - 雪崩网络
- **Binance Smart Chain (BSC)** - 币安智能链
- **zkSync Era** - zkSync Era网络
- **Linea** - ConsenSys Linea
- **Celo** - Celo网络
- **Gnosis (xDai)** - Gnosis链
- **Fantom (FTM)** - Fantom网络
- **Filecoin (FIL)** - Filecoin网络

#### 测试网
- **Sepolia** - 以太坊测试网
- **Optimism Sepolia** - Optimism测试网
- **Arbitrum Sepolia** - Arbitrum测试网
- **Base Sepolia** - Base测试网
- **Polygon Amoy** - Polygon测试网
- **Avalanche Fuji** - Avalanche测试网
- **BSC Testnet** - BSC测试网

### 🔧 核心功能

#### 区块链数据访问
- ✅ 多链支持30+个EVM兼容网络
- ✅ 链信息查询(blockNumber, chainId, RPC)
- ✅ 区块数据访问(按编号、哈希或最新)
- ✅ 交易详情和收据(带解码日志)
- ✅ 地址余额查询(原生代币和所有代币标准)
- ✅ ENS名称解析(支持人类可读地址)

#### 代币服务
- **ERC20代币**
  - 获取代币元数据(名称、符号、小数位、总供应量)
  - 查询代币余额
  - 代币转账
  - 批准支出额度

- **NFT (ERC721)**
  - 获取集合和代币元数据
  - 验证代币所有权
  - NFT转账
  - 检索代币URI和持有量统计

- **多代币 (ERC1155)**
  - 获取代币余额和元数据
  - 批量代币转账
  - 访问代币URI

#### 智能合约交互
- ✅ 通过view/pure函数读取合约状态
- ✅ 使用私钥签名执行写入操作
- ✅ 合约验证(区分EOA和合约地址)
- ✅ 事件日志检索和过滤

#### 交易支持
- ✅ 跨所有支持网络的原生代币转账
- ✅ 交易Gas估算
- ✅ 交易状态和收据信息
- ✅ 描述性错误处理

## 在项目中的配置

### 1. 预定义MCP配置

EVM MCP已经在系统中预配置，配置详情：

```typescript
{
  name: 'evm-mcp',
  description: 'Comprehensive EVM blockchain server supporting 30+ networks',
  command: 'npx',
  args: ['-y', '@mcpdotdirect/evm-mcp-server'],
  env: {},
  connected: false,
  category: 'Chain PRC',
  imageUrl: 'https://mcp-server-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
  githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server'
}
```

### 2. 服务信息配置

在 `mcpInfoService.ts` 中配置了详细的服务信息：

```typescript
{
  name: 'evm-mcp-server',
  description: 'Comprehensive EVM blockchain server supporting 30+ networks',
  capabilities: [
    'multi-chain-support', 'blockchain-data-access', 'token-services', 
    'nft-operations', 'smart-contract-interactions', 'transaction-support',
    'ens-resolution', 'balance-queries', 'token-transfers', 'contract-verification',
    'gas-estimation', 'event-logs', 'block-data', 'transaction-receipts',
    'ethereum', 'optimism', 'arbitrum', 'base', 'polygon', 'avalanche', 'bsc'
  ],
  authRequired: false, // 基础查询不需要认证
  authFields: ['private_key'], // 仅在需要发送交易时需要
  category: 'Chain PRC'
}
```

### 3. 任务分析服务配置

在 `taskAnalysisService.ts` 中配置了LLM分析时使用的信息：

```typescript
{
  name: 'evm-mcp-service',
  description: 'Comprehensive EVM blockchain server supporting 30+ networks',
  capabilities: [...], // 同上
  authRequired: false,
  authFields: ['PRIVATE_KEY'],
  authParams: {
    privateKeyName: 'PRIVATE_KEY',
    privateKeyDescription: '用于签名交易的以太坊私钥（仅在需要发送交易时使用）'
  }
}
```

## API接口使用

### 1. 测试EVM MCP连接

```bash
POST http://localhost:3001/api/task/test-evm-mcp
```

**使用curl测试：**
```bash
curl -X POST http://localhost:3001/api/task/test-evm-mcp -H "Content-Type: application/json"
```

**响应示例：**
```json
{
  "success": true,
  "message": "EVM MCP test successful",
  "tools": [
    {
      "name": "get-chain-info",
      "description": "Get network information"
    },
    {
      "name": "get-balance", 
      "description": "Get native token balance"
    },
    {
      "name": "get-token-info",
      "description": "Get ERC20 token metadata"
    }
    // ... 更多工具
  ],
  "supportedNetworks": [
    "ethereum", "optimism", "arbitrum", "base", "polygon", "avalanche", "bsc"
  ]
}
```

### 2. 获取所有MCP服务

```bash
GET http://localhost:3001/api/task/all-predefined-mcps
```

### 3. 按类别获取MCP

```bash
GET http://localhost:3001/api/task/mcp-by-category/Chain%20PRC
```

## 直接使用方法

### 1. 使用npx直接运行

```bash
# 运行stdio模式 (用于CLI工具)
npx @mcpdotdirect/evm-mcp-server

# 运行HTTP模式 (用于Web应用)
npx @mcpdotdirect/evm-mcp-server --http
```

### 2. 在Cursor中配置

创建 `.cursor/mcp.json` 文件：

```json
{
  "mcpServers": {
    "evm-mcp-server": {
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server"]
    },
    "evm-mcp-http": {
      "command": "npx",
      "args": ["-y", "@mcpdotdirect/evm-mcp-server", "--http"]
    }
  }
}
```

### 3. 使用Claude CLI

```bash
# 添加MCP服务器
claude mcp add evm-mcp-server npx @mcpdotdirect/evm-mcp-server

# 启动Claude
claude
```

## 使用示例

### 1. 查询ETH余额 (使用ENS名称)

```typescript
const result = await mcp.invokeTool("get-balance", {
  address: "vitalik.eth", // 支持ENS名称
  network: "ethereum"
});

console.log(result);
// {
//   address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
//   network: "ethereum", 
//   raw: "1000000000000000000",
//   formatted: "1.0",
//   symbol: "ETH",
//   decimals: 18
// }
```

### 2. 查询代币余额

```typescript
const result = await mcp.invokeTool("get-token-balance", {
  tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  ownerAddress: "vitalik.eth",
  network: "ethereum"
});

console.log(result);
// {
//   tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
//   owner: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
//   network: "ethereum",
//   raw: "1000000000",
//   formatted: "1000",
//   symbol: "USDC",
//   decimals: 6
// }
```

### 3. 解析ENS名称

```typescript
const result = await mcp.invokeTool("resolve-ens", {
  ensName: "vitalik.eth",
  network: "ethereum"
});

console.log(result);
// {
//   ensName: "vitalik.eth",
//   normalizedName: "vitalik.eth", 
//   resolvedAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
//   network: "ethereum"
// }
```

### 4. 发送ETH (需要私钥)

```typescript
const result = await mcp.invokeTool("transfer-eth", {
  privateKey: "0x...", // 发送方私钥
  to: "vitalik.eth",   // 接收方地址(支持ENS)
  amount: "0.1",       // 发送金额(ETH)
  network: "ethereum"
});
```

### 5. 读取智能合约

```typescript
const result = await mcp.invokeTool("read-contract", {
  contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: [...], // 合约ABI
  functionName: "balanceOf",
  args: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  network: "ethereum"
});
```

## 可用工具列表

### 区块链服务
- `get-chain-info` - 获取网络信息
- `get-balance` - 获取原生代币余额
- `transfer-eth` - 发送原生代币
- `get-transaction` - 获取交易详情
- `is-contract` - 检查地址是否为合约
- `resolve-ens` - 解析ENS名称

### 代币服务
- `get-token-info` - 获取ERC20代币信息
- `get-token-balance` - 查询ERC20代币余额
- `transfer-token` - 转移ERC20代币
- `approve-token-spending` - 批准代币支出

### NFT服务
- `get-nft-info` - 获取NFT元数据
- `check-nft-ownership` - 验证NFT所有权
- `transfer-nft` - 转移NFT
- `get-nft-balance` - 统计NFT持有量

### ERC1155服务
- `get-erc1155-token-uri` - 获取ERC1155元数据
- `get-erc1155-balance` - 查询ERC1155余额
- `transfer-erc1155` - 转移ERC1155代币

### 智能合约服务
- `read-contract` - 读取智能合约状态
- `write-contract` - 写入智能合约

## 资源URI

EVM MCP还提供资源URI访问：

```
evm://{network}/chain                              # 链信息
evm://{network}/block/{blockNumber}                # 区块数据
evm://{network}/address/{address}/balance          # 地址余额
evm://{network}/tx/{txHash}                        # 交易详情
evm://{network}/token/{tokenAddress}               # 代币信息
evm://{network}/nft/{tokenAddress}/{tokenId}       # NFT信息
```

## 安全注意事项

1. **私钥安全**
   - 私钥仅用于交易签名，不会被服务器存储
   - 生产环境中考虑实施额外的认证机制

2. **网络安全**
   - 生产环境中对HTTP服务器使用HTTPS
   - 实施速率限制防止滥用

3. **高价值操作**
   - 对于高价值服务，考虑添加确认步骤
   - 使用测试网进行测试

## 故障排除

### 1. 连接失败
- 检查网络连接
- 确认包名正确: `@mcpdotdirect/evm-mcp-server`
- 尝试手动安装: `npm install -g @mcpdotdirect/evm-mcp-server`

### 2. 工具调用失败
- 检查网络参数是否正确
- 验证地址格式或ENS名称
- 确认私钥格式(如果需要交易)

### 3. ENS解析失败
- 确认网络支持ENS(主要是以太坊主网)
- 检查ENS名称是否有效

## 更多信息

- GitHub仓库: https://github.com/mcpdotdirect/evm-mcp-server
- MCP协议文档: https://modelcontextprotocol.io/
- 以太坊开发文档: https://ethereum.org/developers/ 