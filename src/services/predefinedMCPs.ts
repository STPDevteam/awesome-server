import { MCPService } from './mcpManager.js';
import { logger } from '../utils/logger.js';

/**
 * 预定义的MCP服务列表
 * 这些服务将在应用启动时自动连接
 */
export const predefinedMCPs: MCPService[] = [
    // 现有服务
    {
        name: 'playwright',
        description: 'Playwright Tools for MCP.',
        command: 'npx',
        args: ['@playwright/mcp@latest'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
        githubUrl: 'https://github.com/microsoft/playwright',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于Playwright浏览器自动化的预定义工具信息
        predefinedTools: [
            {
                name: 'navigate_to_page',
                description: 'Navigate to a specific URL',
                parameters: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'URL to navigate to',
                            required: true
                        },
                        wait_until: {
                            type: 'string',
                            description: 'When to consider navigation complete',
                            enum: ['load', 'domcontentloaded', 'networkidle'],
                            required: false,
                            default: 'load'
                        },
                        timeout: {
                            type: 'number',
                            description: 'Navigation timeout in milliseconds',
                            required: false,
                            default: 30000
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'click_element',
                description: 'Click on an element using CSS selector or text',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector or text to locate element',
                            required: true
                        },
                        button: {
                            type: 'string',
                            description: 'Mouse button to click',
                            enum: ['left', 'right', 'middle'],
                            required: false,
                            default: 'left'
                        },
                        click_count: {
                            type: 'number',
                            description: 'Number of clicks',
                            required: false,
                            default: 1
                        },
                        timeout: {
                            type: 'number',
                            description: 'Timeout in milliseconds',
                            required: false,
                            default: 30000
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'fill_input',
                description: 'Fill text into an input field',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the input field',
                            required: true
                        },
                        text: {
                            type: 'string',
                            description: 'Text to fill into the input',
                            required: true
                        },
                        clear_first: {
                            type: 'boolean',
                            description: 'Clear the field before filling',
                            required: false,
                            default: true
                        }
                    },
                    required: ['selector', 'text']
                }
            },
            {
                name: 'take_screenshot',
                description: 'Take a screenshot of the current page or element',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for element screenshot (optional)',
                            required: false
                        },
                        full_page: {
                            type: 'boolean',
                            description: 'Capture full scrollable page',
                            required: false,
                            default: false
                        },
                        path: {
                            type: 'string',
                            description: 'File path to save screenshot',
                            required: false
                        },
                        format: {
                            type: 'string',
                            description: 'Image format',
                            enum: ['png', 'jpeg'],
                            required: false,
                            default: 'png'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'wait_for_element',
                description: 'Wait for an element to be visible, hidden, or exist',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element',
                            required: true
                        },
                        state: {
                            type: 'string',
                            description: 'Element state to wait for',
                            enum: ['visible', 'hidden', 'attached', 'detached'],
                            required: false,
                            default: 'visible'
                        },
                        timeout: {
                            type: 'number',
                            description: 'Timeout in milliseconds',
                            required: false,
                            default: 30000
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'get_text_content',
                description: 'Get text content from an element',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element',
                            required: true
                        },
                        trim: {
                            type: 'boolean',
                            description: 'Trim whitespace from text',
                            required: false,
                            default: true
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'get_element_attribute',
                description: 'Get attribute value from an element',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element',
                            required: true
                        },
                        attribute: {
                            type: 'string',
                            description: 'Attribute name to get',
                            required: true
                        }
                    },
                    required: ['selector', 'attribute']
                }
            },
            {
                name: 'select_option',
                description: 'Select option from a dropdown',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the select element',
                            required: true
                        },
                        value: {
                            type: 'string',
                            description: 'Option value to select',
                            required: false
                        },
                        label: {
                            type: 'string',
                            description: 'Option label to select',
                            required: false
                        },
                        index: {
                            type: 'number',
                            description: 'Option index to select',
                            required: false
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'upload_file',
                description: 'Upload file to a file input element',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for file input',
                            required: true
                        },
                        file_path: {
                            type: 'string',
                            description: 'Path to file to upload',
                            required: true
                        }
                    },
                    required: ['selector', 'file_path']
                }
            },
            {
                name: 'scroll_to_element',
                description: 'Scroll to bring an element into view',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element',
                            required: true
                        },
                        behavior: {
                            type: 'string',
                            description: 'Scroll behavior',
                            enum: ['auto', 'smooth'],
                            required: false,
                            default: 'auto'
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'execute_javascript',
                description: 'Execute JavaScript code in the page context',
                parameters: {
                    type: 'object',
                    properties: {
                        script: {
                            type: 'string',
                            description: 'JavaScript code to execute',
                            required: true
                        },
                        args: {
                            type: 'array',
                            description: 'Arguments to pass to the script',
                            required: false
                        }
                    },
                    required: ['script']
                }
            },
            {
                name: 'wait_for_load_state',
                description: 'Wait for page to reach a specific load state',
                parameters: {
                    type: 'object',
                    properties: {
                        state: {
                            type: 'string',
                            description: 'Load state to wait for',
                            enum: ['load', 'domcontentloaded', 'networkidle'],
                            required: false,
                            default: 'load'
                        },
                        timeout: {
                            type: 'number',
                            description: 'Timeout in milliseconds',
                            required: false,
                            default: 30000
                        }
                    },
                    required: []
                }
            },
            {
                name: 'check_element_exists',
                description: 'Check if an element exists on the page',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element',
                            required: true
                        },
                        timeout: {
                            type: 'number',
                            description: 'Timeout in milliseconds',
                            required: false,
                            default: 5000
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'generate_pdf',
                description: 'Generate PDF from the current page',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'File path to save PDF',
                            required: false
                        },
                        format: {
                            type: 'string',
                            description: 'Page format',
                            enum: ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid'],
                            required: false,
                            default: 'A4'
                        },
                        print_background: {
                            type: 'boolean',
                            description: 'Include background graphics',
                            required: false,
                            default: false
                        }
                    },
                    required: []
                }
            }
        ]
    },
    // Chain RPC 服务
    {
        name: 'base-mcp',
        description: 'Base Chain RPC integration for blockchain operations (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/base-mcp/build/index.js`],
        env: {
            COINBASE_API_KEY_NAME: process.env.COINBASE_API_KEY_NAME || '',
            COINBASE_API_PRIVATE_KEY: process.env.COINBASE_API_PRIVATE_KEY || '',
            SEED_PHRASE: process.env.SEED_PHRASE || '',
            COINBASE_PROJECT_ID: process.env.COINBASE_PROJECT_ID || '',
            ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || '',
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
            CHAIN_ID: process.env.CHAIN_ID || '',
        },
        connected: false,
        category: 'Chain RPC',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/base.ico',
        githubUrl: 'https://github.com/base/base-mcp',
        authRequired: true,
        authParams: {
            COINBASE_API_KEY_NAME: "COINBASE_API_KEY_NAME",
            COINBASE_API_PRIVATE_KEY: "COINBASE_API_PRIVATE_KEY",
            SEED_PHRASE: "SEED_PHRASE",
            COINBASE_PROJECT_ID: "COINBASE_PROJECT_ID",
            ALCHEMY_API_KEY: "ALCHEMY_API_KEY",
            OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
            CHAIN_ID: "CHAIN_ID"
        },
        // 🔧 新增：基于Base Chain和Coinbase CDP的预定义工具信息
        predefinedTools: [
            {
                name: 'create_wallet',
                description: 'Create a new server-side wallet on Base chain',
                parameters: {
                    type: 'object',
                    properties: {
                        network_id: {
                            type: 'string',
                            description: 'Network ID (base-mainnet, base-sepolia)',
                            required: false,
                            default: 'base-mainnet'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_wallet_balance',
                description: 'Get wallet balance for ETH and tokens',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        asset_id: {
                            type: 'string',
                            description: 'Asset ID (eth, usdc, etc.)',
                            required: false,
                            default: 'eth'
                        }
                    },
                    required: ['wallet_id']
                }
            },
            {
                name: 'transfer_funds',
                description: 'Transfer ETH or tokens to another address',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Source wallet ID',
                            required: true
                        },
                        destination_address: {
                            type: 'string',
                            description: 'Destination address (0x...)',
                            required: true
                        },
                        amount: {
                            type: 'string',
                            description: 'Amount to transfer',
                            required: true
                        },
                        asset_id: {
                            type: 'string',
                            description: 'Asset ID (eth, usdc, etc.)',
                            required: false,
                            default: 'eth'
                        },
                        gasless: {
                            type: 'boolean',
                            description: 'Use gasless transfers for USDC/EURC/cbBTC',
                            required: false,
                            default: false
                        }
                    },
                    required: ['wallet_id', 'destination_address', 'amount']
                }
            },
            {
                name: 'deploy_contract',
                description: 'Deploy a smart contract to Base chain',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID for deployment',
                            required: true
                        },
                        contract_bytecode: {
                            type: 'string',
                            description: 'Contract bytecode (0x...)',
                            required: true
                        },
                        constructor_args: {
                            type: 'array',
                            description: 'Constructor arguments',
                            required: false
                        },
                        gas_limit: {
                            type: 'string',
                            description: 'Gas limit for deployment',
                            required: false
                        }
                    },
                    required: ['wallet_id', 'contract_bytecode']
                }
            },
            {
                name: 'invoke_contract',
                description: 'Call a smart contract method',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        contract_address: {
                            type: 'string',
                            description: 'Contract address (0x...)',
                            required: true
                        },
                        method: {
                            type: 'string',
                            description: 'Contract method name',
                            required: true
                        },
                        args: {
                            type: 'array',
                            description: 'Method arguments',
                            required: false
                        },
                        amount: {
                            type: 'string',
                            description: 'ETH amount to send (for payable methods)',
                            required: false
                        }
                    },
                    required: ['wallet_id', 'contract_address', 'method']
                }
            },
            {
                name: 'swap_assets',
                description: 'Swap tokens using Base DEX aggregation',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        from_asset_id: {
                            type: 'string',
                            description: 'Source asset ID',
                            required: true
                        },
                        to_asset_id: {
                            type: 'string',
                            description: 'Target asset ID',
                            required: true
                        },
                        amount: {
                            type: 'string',
                            description: 'Amount to swap',
                            required: true
                        },
                        slippage_tolerance: {
                            type: 'number',
                            description: 'Slippage tolerance (0.1 = 0.1%)',
                            required: false,
                            default: 0.5
                        }
                    },
                    required: ['wallet_id', 'from_asset_id', 'to_asset_id', 'amount']
                }
            },
            {
                name: 'stake_eth',
                description: 'Stake ETH for earning rewards',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        amount: {
                            type: 'string',
                            description: 'Amount of ETH to stake',
                            required: true
                        },
                        validator: {
                            type: 'string',
                            description: 'Validator address or service',
                            required: false
                        }
                    },
                    required: ['wallet_id', 'amount']
                }
            },
            {
                name: 'create_nft',
                description: 'Mint/create an NFT on Base chain',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        contract_address: {
                            type: 'string',
                            description: 'NFT contract address (0x...)',
                            required: true
                        },
                        to_address: {
                            type: 'string',
                            description: 'Recipient address (0x...)',
                            required: true
                        },
                        token_uri: {
                            type: 'string',
                            description: 'Token metadata URI',
                            required: false
                        }
                    },
                    required: ['wallet_id', 'contract_address', 'to_address']
                }
            },
            {
                name: 'bridge_assets',
                description: 'Bridge assets between Ethereum and Base',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        from_network: {
                            type: 'string',
                            description: 'Source network (ethereum, base)',
                            required: true
                        },
                        to_network: {
                            type: 'string',
                            description: 'Target network (ethereum, base)',
                            required: true
                        },
                        asset_id: {
                            type: 'string',
                            description: 'Asset to bridge (eth, usdc, etc.)',
                            required: true
                        },
                        amount: {
                            type: 'string',
                            description: 'Amount to bridge',
                            required: true
                        }
                    },
                    required: ['wallet_id', 'from_network', 'to_network', 'asset_id', 'amount']
                }
            },
            {
                name: 'get_transaction_history',
                description: 'Get transaction history for a wallet',
                parameters: {
                    type: 'object',
                    properties: {
                        wallet_id: {
                            type: 'string',
                            description: 'Wallet ID',
                            required: true
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of transactions to return',
                            required: false,
                            default: 50
                        },
                        cursor: {
                            type: 'string',
                            description: 'Pagination cursor',
                            required: false
                        }
                    },
                    required: ['wallet_id']
                }
            },
            {
                name: 'get_address_activity',
                description: 'Get detailed activity for an address on Base',
                parameters: {
                    type: 'object',
                    properties: {
                        address: {
                            type: 'string',
                            description: 'Address to query (0x...)',
                            required: true
                        },
                        activity_type: {
                            type: 'string',
                            description: 'Type of activity to filter',
                            enum: ['all', 'transfers', 'trades', 'nft', 'defi'],
                            required: false,
                            default: 'all'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of activities to return',
                            required: false,
                            default: 50
                        }
                    },
                    required: ['address']
                }
            },
            {
                name: 'estimate_fees',
                description: 'Estimate transaction fees for Base operations',
                parameters: {
                    type: 'object',
                    properties: {
                        operation_type: {
                            type: 'string',
                            description: 'Type of operation',
                            enum: ['transfer', 'contract_call', 'contract_deploy', 'swap'],
                            required: true
                        },
                        to_address: {
                            type: 'string',
                            description: 'Destination address (if applicable)',
                            required: false
                        },
                        data: {
                            type: 'string',
                            description: 'Transaction data (if applicable)',
                            required: false
                        }
                    },
                    required: ['operation_type']
                }
            }
        ]
    },
    {
        name: 'evm-mcp',
        description: 'Comprehensive EVM blockchain server supporting 30+ networks including Ethereum, Optimism, Arbitrum, Base, Polygon with unified interface',
        command: 'npx',
        args: ['-y', '@mcpdotdirect/evm-mcp-server'],
        env: {
        },
        connected: false,
        category: 'Chain RPC',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/evm-favicon.ico',
        githubUrl: 'https://github.com/mcpdotdirect/evm-mcp-server',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于EVM工具功能的预定义工具信息
        predefinedTools: [
            {
                name: 'get_account_balance',
                description: 'Get ETH balance for an account address',
                parameters: {
                    type: 'object',
                    properties: {
                        address: {
                            type: 'string',
                            description: 'Ethereum account address (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name (ethereum, polygon, arbitrum, etc.)',
                            required: false,
                            default: 'ethereum'
                        },
                        block: {
                            type: 'string',
                            description: 'Block number or "latest"',
                            required: false,
                            default: 'latest'
                        }
                    },
                    required: ['address']
                }
            },
            {
                name: 'get_account_nonce',
                description: 'Get the nonce (transaction count) for an account',
                parameters: {
                    type: 'object',
                    properties: {
                        address: {
                            type: 'string',
                            description: 'Ethereum account address (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        block: {
                            type: 'string',
                            description: 'Block number or "latest"',
                            required: false,
                            default: 'latest'
                        }
                    },
                    required: ['address']
                }
            },
            {
                name: 'get_transaction_by_hash',
                description: 'Get transaction information by transaction hash',
                parameters: {
                    type: 'object',
                    properties: {
                        hash: {
                            type: 'string',
                            description: 'Transaction hash (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['hash']
                }
            },
            {
                name: 'get_transaction_receipt',
                description: 'Get transaction receipt by transaction hash',
                parameters: {
                    type: 'object',
                    properties: {
                        hash: {
                            type: 'string',
                            description: 'Transaction hash (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['hash']
                }
            },
            {
                name: 'get_block_by_number',
                description: 'Get block information by block number',
                parameters: {
                    type: 'object',
                    properties: {
                        blockNumber: {
                            type: 'string',
                            description: 'Block number (hex) or "latest"',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        includeTransactions: {
                            type: 'boolean',
                            description: 'Include full transaction objects',
                            required: false,
                            default: false
                        }
                    },
                    required: ['blockNumber']
                }
            },
            {
                name: 'call_contract_method',
                description: 'Call a read-only contract method',
                parameters: {
                    type: 'object',
                    properties: {
                        to: {
                            type: 'string',
                            description: 'Contract address (0x...)',
                            required: true
                        },
                        data: {
                            type: 'string',
                            description: 'Encoded function call data (0x...)',
                            required: true
                        },
                        from: {
                            type: 'string',
                            description: 'Caller address (optional)',
                            required: false
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        block: {
                            type: 'string',
                            description: 'Block number or "latest"',
                            required: false,
                            default: 'latest'
                        }
                    },
                    required: ['to', 'data']
                }
            },
            {
                name: 'get_contract_code',
                description: 'Get bytecode of a smart contract',
                parameters: {
                    type: 'object',
                    properties: {
                        address: {
                            type: 'string',
                            description: 'Contract address (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        block: {
                            type: 'string',
                            description: 'Block number or "latest"',
                            required: false,
                            default: 'latest'
                        }
                    },
                    required: ['address']
                }
            },
            {
                name: 'get_token_balance',
                description: 'Get ERC-20 token balance for an account',
                parameters: {
                    type: 'object',
                    properties: {
                        tokenContract: {
                            type: 'string',
                            description: 'ERC-20 token contract address (0x...)',
                            required: true
                        },
                        account: {
                            type: 'string',
                            description: 'Account address to check balance for (0x...)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['tokenContract', 'account']
                }
            },
            {
                name: 'estimate_gas',
                description: 'Estimate gas required for a transaction',
                parameters: {
                    type: 'object',
                    properties: {
                        to: {
                            type: 'string',
                            description: 'Destination address (0x...)',
                            required: true
                        },
                        from: {
                            type: 'string',
                            description: 'Sender address (0x...)',
                            required: false
                        },
                        data: {
                            type: 'string',
                            description: 'Transaction data (0x...)',
                            required: false
                        },
                        value: {
                            type: 'string',
                            description: 'Value to send in wei (hex)',
                            required: false
                        },
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['to']
                }
            },
            {
                name: 'get_gas_price',
                description: 'Get current gas price for the network',
                parameters: {
                    type: 'object',
                    properties: {
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_latest_block',
                description: 'Get the latest block information',
                parameters: {
                    type: 'object',
                    properties: {
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        includeTransactions: {
                            type: 'boolean',
                            description: 'Include full transaction objects',
                            required: false,
                            default: false
                        }
                    },
                    required: []
                }
            }
        ]
    },

    {
        name: 'coingecko-mcp',
        description: 'CoinGecko official MCP server for cryptocurrency market data, historical prices, and OHLC candlestick data (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/mcp-coingecko-server/build/index.js`],
        env: {
            COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || ''
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coingecko.ico',
        githubUrl: 'https://docs.coingecko.com/reference/mcp-server',
        authRequired: true,
        authParams: {
            COINGECKO_API_KEY: "COINGECKO_API_KEY"
        },
        // 🔧 新增：基于CoinGecko官方API文档的预定义工具信息
        predefinedTools: [
            {
                name: 'get_coin_price',
                description: 'Get current price of one or more coins by their IDs',
                parameters: {
                    type: 'object',
                    properties: {
                        ids: {
                            type: 'string',
                            description: 'Comma-separated list of coin IDs (e.g., bitcoin,ethereum)',
                            required: true
                        },
                        vs_currencies: {
                            type: 'string',
                            description: 'Target currencies (e.g., usd,eur)',
                            required: false,
                            default: 'usd'
                        },
                        include_market_cap: {
                            type: 'boolean',
                            description: 'Include market cap data',
                            required: false,
                            default: false
                        },
                        include_24hr_vol: {
                            type: 'boolean',
                            description: 'Include 24h volume data',
                            required: false,
                            default: false
                        },
                        include_24hr_change: {
                            type: 'boolean',
                            description: 'Include 24h price change data',
                            required: false,
                            default: false
                        }
                    },
                    required: ['ids']
                }
            },
            {
                name: 'get_coin_market_data',
                description: 'Get market data for coins including price, market cap, volume',
                parameters: {
                    type: 'object',
                    properties: {
                        vs_currency: {
                            type: 'string',
                            description: 'Target currency (usd, eur, btc, etc.)',
                            required: false,
                            default: 'usd'
                        },
                        ids: {
                            type: 'string',
                            description: 'Comma-separated list of coin IDs to filter',
                            required: false
                        },
                        category: {
                            type: 'string',
                            description: 'Filter by category',
                            required: false
                        },
                        order: {
                            type: 'string',
                            description: 'Sort order',
                            enum: ['market_cap_desc', 'market_cap_asc', 'volume_desc', 'volume_asc', 'id_asc', 'id_desc'],
                            required: false,
                            default: 'market_cap_desc'
                        },
                        per_page: {
                            type: 'number',
                            description: 'Number of results per page (1-250)',
                            required: false,
                            default: 100
                        },
                        page: {
                            type: 'number',
                            description: 'Page number',
                            required: false,
                            default: 1
                        }
                    }
                }
            },
            {
                name: 'get_coin_by_id',
                description: 'Get detailed coin information by ID',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Coin ID (e.g., bitcoin, ethereum)',
                            required: true
                        },
                        localization: {
                            type: 'boolean',
                            description: 'Include all localized languages',
                            required: false,
                            default: false
                        },
                        tickers: {
                            type: 'boolean',
                            description: 'Include tickers data',
                            required: false,
                            default: false
                        },
                        market_data: {
                            type: 'boolean',
                            description: 'Include market data',
                            required: false,
                            default: true
                        },
                        community_data: {
                            type: 'boolean',
                            description: 'Include community data',
                            required: false,
                            default: true
                        },
                        developer_data: {
                            type: 'boolean',
                            description: 'Include developer data',
                            required: false,
                            default: true
                        }
                    },
                    required: ['id']
                }
            },
            {
                name: 'get_coin_history',
                description: 'Get historical market data for a coin at a specific date',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Coin ID (e.g., bitcoin, ethereum)',
                            required: true
                        },
                        date: {
                            type: 'string',
                            description: 'Date in dd-mm-yyyy format',
                            required: true
                        },
                        localization: {
                            type: 'boolean',
                            description: 'Include all localized languages',
                            required: false,
                            default: false
                        }
                    },
                    required: ['id', 'date']
                }
            },
            {
                name: 'get_coin_market_chart',
                description: 'Get historical market chart data (price, market cap, volume)',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Coin ID (e.g., bitcoin, ethereum)',
                            required: true
                        },
                        vs_currency: {
                            type: 'string',
                            description: 'Target currency',
                            required: true
                        },
                        days: {
                            type: 'string',
                            description: 'Data up to number of days ago (1/7/14/30/90/180/365/max)',
                            required: true
                        },
                        interval: {
                            type: 'string',
                            description: 'Data interval',
                            enum: ['daily'],
                            required: false
                        }
                    },
                    required: ['id', 'vs_currency', 'days']
                }
            },
            {
                name: 'get_coin_ohlc',
                description: 'Get OHLC (Open, High, Low, Close) chart data for a coin',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Coin ID (e.g., bitcoin, ethereum)',
                            required: true
                        },
                        vs_currency: {
                            type: 'string',
                            description: 'Target currency',
                            required: true
                        },
                        days: {
                            type: 'string',
                            description: 'Data up to number of days ago (1/7/14/30/90/180/365)',
                            required: true
                        }
                    },
                    required: ['id', 'vs_currency', 'days']
                }
            },
            {
                name: 'search_coins',
                description: 'Search for coins, categories and markets',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query',
                            required: true
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'get_trending',
                description: 'Get trending search coins, NFTs and categories',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_global_data',
                description: 'Get cryptocurrency global market data',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_supported_currencies',
                description: 'Get list of all supported currencies',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_coins_list',
                description: 'Get list of all supported coins with ID, name and symbol',
                parameters: {
                    type: 'object',
                    properties: {
                        include_platform: {
                            type: 'boolean',
                            description: 'Include platform contract addresses',
                            required: false,
                            default: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_exchange_rates',
                description: 'Get BTC exchange rates with other currencies',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_token_price_by_address',
                description: 'Get token price by contract address',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Asset platform ID (e.g., ethereum, binance-smart-chain)',
                            required: true
                        },
                        contract_addresses: {
                            type: 'string',
                            description: 'Comma-separated list of contract addresses',
                            required: true
                        },
                        vs_currencies: {
                            type: 'string',
                            description: 'Target currencies',
                            required: false,
                            default: 'usd'
                        }
                    },
                    required: ['id', 'contract_addresses']
                }
            }
        ]
    },
    {
        name: 'coinmarketcap-mcp',
        description: 'CoinMarketCap cryptocurrency market data and analytics',
        command: 'node',
        args: ['/home/ubuntu/mcp-tools/coinmarketcap-mcp/index.js'],
        env: {
            COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY || '',
            SUBSCRIPTION_LEVEL: "Basic",
            PORT: "3002"
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/coinmarket.png',
        githubUrl: 'https://github.com/shinzo-labs/coinmarketcap-mcp',
        authRequired: true,
        authParams: {
            COINMARKETCAP_API_KEY: "COINMARKETCAP_API_KEY"
        },
        // 🔧 新增：基于CoinMarketCap官方API的预定义工具信息
        predefinedTools: [
            {
                name: 'get_latest_quotes',
                description: 'Get the latest market quotes for cryptocurrencies',
                parameters: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH)',
                            required: false
                        },
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap cryptocurrency ID',
                            required: false
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat or crypto to convert price to (e.g., USD, EUR, BTC)',
                            required: false,
                            default: 'USD'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of cryptocurrencies to return (1-5000)',
                            required: false,
                            default: 100
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort field',
                            enum: ['market_cap', 'name', 'symbol', 'date_added', 'price', 'circulating_supply', 'total_supply', 'max_supply', 'num_market_pairs', 'volume_24h', 'percent_change_1h', 'percent_change_24h', 'percent_change_7d'],
                            required: false,
                            default: 'market_cap'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_historical_quotes',
                description: 'Get historical OHLCV data for cryptocurrency',
                parameters: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH)',
                            required: false
                        },
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap cryptocurrency ID',
                            required: false
                        },
                        time_start: {
                            type: 'string',
                            description: 'Start date (ISO 8601 format)',
                            required: false
                        },
                        time_end: {
                            type: 'string',
                            description: 'End date (ISO 8601 format)',
                            required: false
                        },
                        count: {
                            type: 'number',
                            description: 'Number of historical data points',
                            required: false,
                            default: 10
                        },
                        interval: {
                            type: 'string',
                            description: 'Time interval',
                            enum: ['1d', '7d', '14d', '15d', '30d', '90d', '365d'],
                            required: false,
                            default: '1d'
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_cryptocurrency_info',
                description: 'Get static metadata information for cryptocurrencies',
                parameters: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH)',
                            required: false
                        },
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap cryptocurrency ID',
                            required: false
                        },
                        aux: {
                            type: 'string',
                            description: 'Additional fields to include',
                            enum: ['urls', 'logo', 'description', 'tags', 'platform', 'date_added', 'notice', 'status'],
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_trending_gainers_losers',
                description: 'Get trending cryptocurrencies (gainers and losers)',
                parameters: {
                    type: 'object',
                    properties: {
                        time_period: {
                            type: 'string',
                            description: 'Time period for trending data',
                            enum: ['1h', '24h', '7d', '30d'],
                            required: false,
                            default: '24h'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of results to return',
                            required: false,
                            default: 10
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_global_metrics',
                description: 'Get global cryptocurrency market metrics',
                parameters: {
                    type: 'object',
                    properties: {
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_exchange_listings',
                description: 'Get list of all cryptocurrency exchanges',
                parameters: {
                    type: 'object',
                    properties: {
                        start: {
                            type: 'number',
                            description: 'Starting point for pagination',
                            required: false,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of exchanges to return',
                            required: false,
                            default: 100
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort field',
                            enum: ['name', 'volume_24h', 'volume_24h_adjusted'],
                            required: false,
                            default: 'volume_24h'
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_exchange_info',
                description: 'Get static metadata for specific cryptocurrency exchange',
                parameters: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap exchange ID',
                            required: false
                        },
                        slug: {
                            type: 'string',
                            description: 'Exchange slug (e.g., binance, coinbase-exchange)',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_market_pairs',
                description: 'Get market trading pairs for a cryptocurrency',
                parameters: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH)',
                            required: false
                        },
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap cryptocurrency ID',
                            required: false
                        },
                        start: {
                            type: 'number',
                            description: 'Starting point for pagination',
                            required: false,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of market pairs to return',
                            required: false,
                            default: 100
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'search_cryptocurrencies',
                description: 'Search for cryptocurrencies by name or symbol',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query (name or symbol)',
                            required: true
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of results to return',
                            required: false,
                            default: 10
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'get_price_performance_stats',
                description: 'Get price performance statistics for cryptocurrencies',
                parameters: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH)',
                            required: false
                        },
                        id: {
                            type: 'string',
                            description: 'CoinMarketCap cryptocurrency ID',
                            required: false
                        },
                        time_period: {
                            type: 'string',
                            description: 'Time period for performance stats',
                            enum: ['all_time', 'yesterday', 'today', 'ytd'],
                            required: false,
                            default: 'all_time'
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_dex_listings',
                description: 'Get decentralized exchange (DEX) listings and quotes',
                parameters: {
                    type: 'object',
                    properties: {
                        start: {
                            type: 'number',
                            description: 'Starting point for pagination',
                            required: false,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of DEX listings to return',
                            required: false,
                            default: 100
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort field',
                            enum: ['name', 'volume_24h', 'num_market_pairs'],
                            required: false,
                            default: 'volume_24h'
                        },
                        convert: {
                            type: 'string',
                            description: 'Fiat currency to convert to',
                            required: false,
                            default: 'USD'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_blockchain_networks',
                description: 'Get list of blockchain networks with unique identifiers',
                parameters: {
                    type: 'object',
                    properties: {
                        start: {
                            type: 'number',
                            description: 'Starting point for pagination',
                            required: false,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of networks to return',
                            required: false,
                            default: 100
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort field',
                            enum: ['name', 'id'],
                            required: false,
                            default: 'id'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_latest_airdrops',
                description: 'Get information about latest cryptocurrency airdrops',
                parameters: {
                    type: 'object',
                    properties: {
                        start: {
                            type: 'number',
                            description: 'Starting point for pagination',
                            required: false,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of airdrops to return',
                            required: false,
                            default: 20
                        },
                        status: {
                            type: 'string',
                            description: 'Airdrop status filter',
                            enum: ['active', 'upcoming', 'ended'],
                            required: false
                        }
                    },
                    required: []
                }
            }
        ]
    },
    {
        name: 'defillama-mcp',
        description: 'DeFiLlama DeFi protocol data and TVL analytics - provides protocol TVL, chain data, token prices, and stablecoin information (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/mcp-server-defillama/dist/index.js`],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-defillama.png',
        githubUrl: 'https://github.com/dcSpark/mcp-server-defillama',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于DeFiLlama官方API的预定义工具信息
        predefinedTools: [
            {
                name: 'get_protocol_tvl',
                description: 'Get Total Value Locked (TVL) data for DeFi protocols',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Protocol slug (e.g., aave, uniswap, compound)',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Blockchain name (e.g., ethereum, polygon, arbitrum)',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_all_protocols',
                description: 'Get list of all DeFi protocols with basic information',
                parameters: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            description: 'Filter by protocol category (e.g., dexes, lending, derivatives)',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Filter by blockchain',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_chain_tvl',
                description: 'Get TVL data for specific blockchain chains',
                parameters: {
                    type: 'object',
                    properties: {
                        chain: {
                            type: 'string',
                            description: 'Blockchain name (e.g., ethereum, bsc, polygon)',
                            required: true
                        }
                    },
                    required: ['chain']
                }
            },
            {
                name: 'get_historical_tvl',
                description: 'Get historical TVL data for protocols or chains',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Protocol slug for protocol-specific data',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Chain name for chain-specific data',
                            required: false
                        },
                        start_timestamp: {
                            type: 'number',
                            description: 'Start timestamp for historical data',
                            required: false
                        },
                        end_timestamp: {
                            type: 'number',
                            description: 'End timestamp for historical data',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_token_prices',
                description: 'Get current and historical token prices',
                parameters: {
                    type: 'object',
                    properties: {
                        tokens: {
                            type: 'array',
                            description: 'Array of token addresses or coingecko IDs',
                            required: true
                        },
                        timestamp: {
                            type: 'number',
                            description: 'Unix timestamp for historical prices',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Blockchain for token addresses',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['tokens']
                }
            },
            {
                name: 'get_stablecoin_data',
                description: 'Get stablecoin market cap and chain distribution data',
                parameters: {
                    type: 'object',
                    properties: {
                        stablecoin: {
                            type: 'string',
                            description: 'Stablecoin ID (e.g., 1, 2 for USDT, USDC)',
                            required: false
                        },
                        include_prices: {
                            type: 'boolean',
                            description: 'Include price data',
                            required: false,
                            default: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_protocol_fees_revenue',
                description: 'Get protocol fees and revenue data',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Protocol slug',
                            required: false
                        },
                        data_type: {
                            type: 'string',
                            description: 'Type of data to retrieve',
                            enum: ['fees', 'revenue', 'both'],
                            required: false,
                            default: 'both'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_yield_pools',
                description: 'Get yield farming pools and APY data',
                parameters: {
                    type: 'object',
                    properties: {
                        chain: {
                            type: 'string',
                            description: 'Filter by blockchain',
                            required: false
                        },
                        protocol: {
                            type: 'string',
                            description: 'Filter by protocol',
                            required: false
                        },
                        min_tvl: {
                            type: 'number',
                            description: 'Minimum TVL threshold',
                            required: false,
                            default: 1000
                        },
                        stablecoin: {
                            type: 'boolean',
                            description: 'Filter for stablecoin pools only',
                            required: false,
                            default: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_protocol_treasury',
                description: 'Get protocol treasury and token holdings data',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Protocol slug',
                            required: true
                        }
                    },
                    required: ['protocol']
                }
            },
            {
                name: 'get_protocol_emissions',
                description: 'Get protocol token emissions and unlock schedules',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Protocol slug',
                            required: true
                        }
                    },
                    required: ['protocol']
                }
            },
            {
                name: 'get_bridge_volumes',
                description: 'Get cross-chain bridge volume data',
                parameters: {
                    type: 'object',
                    properties: {
                        bridge: {
                            type: 'string',
                            description: 'Bridge name (e.g., multichain, polygon, arbitrum)',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Source or destination chain',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_dex_volumes',
                description: 'Get decentralized exchange trading volumes',
                parameters: {
                    type: 'object',
                    properties: {
                        dex: {
                            type: 'string',
                            description: 'DEX protocol name (e.g., uniswap, sushiswap)',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Blockchain name',
                            required: false
                        },
                        exclude_total_data_chart: {
                            type: 'boolean',
                            description: 'Exclude total data chart',
                            required: false,
                            default: true
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_liquidations_data',
                description: 'Get liquidation data for lending protocols',
                parameters: {
                    type: 'object',
                    properties: {
                        protocol: {
                            type: 'string',
                            description: 'Lending protocol name',
                            required: false
                        },
                        chain: {
                            type: 'string',
                            description: 'Blockchain name',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'search_protocols',
                description: 'Search for DeFi protocols by name or keyword',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query (protocol name or keyword)',
                            required: true
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of results',
                            required: false,
                            default: 10
                        }
                    },
                    required: ['query']
                }
            }
        ]
    },
    {
        name: 'dune-mcp',
        description: 'Dune Analytics blockchain data queries and dashboards',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/dune-mcp-server/dist/index.js`],
        env: {
            DUNE_API_KEY: process.env.DUNE_API_KEY || ''
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dune.png',
        githubUrl: 'https://github.com/ekailabs/dune-mcp-server',
        authRequired: true,
        authParams: {
            DUNE_API_KEY: "DUNE_API_KEY"
        },
        // 🔧 新增：基于Dune Analytics的预定义工具信息
        predefinedTools: [
            {
                name: 'execute_query',
                description: 'Execute a Dune Analytics query and return results',
                parameters: {
                    type: 'object',
                    properties: {
                        query_id: {
                            type: 'number',
                            description: 'Dune query ID to execute',
                            required: true
                        },
                        parameters: {
                            type: 'object',
                            description: 'Query parameters as key-value pairs',
                            required: false
                        }
                    },
                    required: ['query_id']
                }
            },
            {
                name: 'get_query_results',
                description: 'Get results from a previously executed query',
                parameters: {
                    type: 'object',
                    properties: {
                        execution_id: {
                            type: 'string',
                            description: 'Execution ID of the query',
                            required: true
                        }
                    },
                    required: ['execution_id']
                }
            },
            {
                name: 'get_latest_results',
                description: 'Get the latest results for a query',
                parameters: {
                    type: 'object',
                    properties: {
                        query_id: {
                            type: 'number',
                            description: 'Dune query ID',
                            required: true
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of rows to return',
                            required: false,
                            default: 100
                        }
                    },
                    required: ['query_id']
                }
            }
        ]
    },

    {
        name: 'chainlink-mcp',
        description: 'ChainLink price feeds and oracle data',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/chainlink-feeds-mcp/index.js`],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-chainlink-100.png',
        githubUrl: 'https://github.com/kukapay/chainlink-feeds-mcp',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于Chainlink的预定义工具信息
        predefinedTools: [
            {
                name: 'get_price_feed',
                description: 'Get latest price from Chainlink price feeds',
                parameters: {
                    type: 'object',
                    properties: {
                        feed_address: {
                            type: 'string',
                            description: 'Chainlink price feed contract address',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network name (ethereum, polygon, arbitrum, etc.)',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['feed_address']
                }
            },
            {
                name: 'get_feed_data',
                description: 'Get comprehensive data from a Chainlink price feed',
                parameters: {
                    type: 'object',
                    properties: {
                        pair: {
                            type: 'string',
                            description: 'Trading pair (e.g., ETH/USD, BTC/USD)',
                            required: true
                        },
                        network: {
                            type: 'string',
                            description: 'Network to query',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['pair']
                }
            },
            {
                name: 'list_price_feeds',
                description: 'List available Chainlink price feeds for a network',
                parameters: {
                    type: 'object',
                    properties: {
                        network: {
                            type: 'string',
                            description: 'Network name',
                            required: false,
                            default: 'ethereum'
                        },
                        category: {
                            type: 'string',
                            description: 'Feed category (crypto, forex, commodities)',
                            required: false
                        }
                    },
                    required: []
                }
            }
        ]
    },
    {
        name: 'feargreed-mcp',
        description: 'Fear & Greed Index cryptocurrency market sentiment',
        command: '/home/ubuntu/venvs/mcp-env/bin/uv',
        args: [ 
            "--directory", "/home/ubuntu/mcp-tools/crypto-feargreed-mcp", 
            "run", 
            "main.py" 
        ],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
        githubUrl: 'https://github.com/kukapay/crypto-feargreed-mcp',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于Fear & Greed Index的预定义工具信息
        predefinedTools: [
            {
                name: 'get_current_index',
                description: 'Get the current Fear & Greed Index value and classification',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_historical_data',
                description: 'Get historical Fear & Greed Index data',
                parameters: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Number of historical data points to return',
                            required: false,
                            default: 30
                        },
                        format: {
                            type: 'string',
                            description: 'Data format (json, csv)',
                            required: false,
                            default: 'json'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_index_analysis',
                description: 'Get detailed analysis of the current market sentiment',
                parameters: {
                    type: 'object',
                    properties: {
                        include_factors: {
                            type: 'boolean',
                            description: 'Include breakdown of contributing factors',
                            required: false,
                            default: true
                        }
                    },
                    required: []
                }
            }
        ]
    },
    {
        name: 'rugcheck-mcp',
        description: 'Rug Check token security and risk analysis for Solana tokens',
        command: '/home/ubuntu/mcp-tools/mcp-venv/bin/python',
        args: [`/home/ubuntu/mcp-tools/rug-check-mcp/main.py`],
        env: {
            SOLSNIFFER_API_KEY: process.env.SOLSNIFFER_API_KEY || ''
        },
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-rug-100.png',
        githubUrl: 'https://github.com/kukapay/rug-check-mcp',
        authRequired: true,
        authParams: {
            SOLSNIFFER_API_KEY: "SOLSNIFFER_API_KEY"
        },
        // 🔧 新增：基于RugCheck的预定义工具信息
        predefinedTools: [
            {
                name: 'check_token',
                description: 'Analyze token for potential rug pull risks and security issues',
                parameters: {
                    type: 'object',
                    properties: {
                        token_address: {
                            type: 'string',
                            description: 'Token contract address to analyze',
                            required: true
                        },
                        chain: {
                            type: 'string',
                            description: 'Blockchain network (ethereum, bsc, polygon, etc.)',
                            required: false,
                            default: 'ethereum'
                        }
                    },
                    required: ['token_address']
                }
            },
            {
                name: 'get_security_score',
                description: 'Get detailed security score and risk assessment for a token',
                parameters: {
                    type: 'object',
                    properties: {
                        token_address: {
                            type: 'string',
                            description: 'Token contract address',
                            required: true
                        },
                        include_details: {
                            type: 'boolean',
                            description: 'Include detailed risk breakdown',
                            required: false,
                            default: true
                        }
                    },
                    required: ['token_address']
                }
            }
        ]
    },
    {
        name: 'whaletracker-mcp',
        description: 'Whale Tracker large transaction monitoring',
        command: 'npx',
        args: ['-y', 'whale-tracker-mcp'],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-crypto-100.png',
        githubUrl: 'https://github.com/kukapay/whale-tracker-mcp',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于Whale Tracker的预定义工具信息
        predefinedTools: [
            {
                name: 'get_whale_transactions',
                description: 'Get recent large transactions (whale movements)',
                parameters: {
                    type: 'object',
                    properties: {
                        min_value_usd: {
                            type: 'number',
                            description: 'Minimum transaction value in USD',
                            required: false,
                            default: 1000000
                        },
                        token: {
                            type: 'string',
                            description: 'Token symbol to filter (ETH, BTC, USDC, etc.)',
                            required: false
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of transactions to return',
                            required: false,
                            default: 20
                        }
                    },
                    required: []
                }
            },
            {
                name: 'track_address',
                description: 'Monitor transactions for a specific whale address',
                parameters: {
                    type: 'object',
                    properties: {
                        address: {
                            type: 'string',
                            description: 'Wallet address to track',
                            required: true
                        },
                        time_range: {
                            type: 'string',
                            description: 'Time range (24h, 7d, 30d)',
                            required: false,
                            default: '24h'
                        }
                    },
                    required: ['address']
                }
            },
            {
                name: 'get_whale_alerts',
                description: 'Get real-time whale transaction alerts',
                parameters: {
                    type: 'object',
                    properties: {
                        networks: {
                            type: 'array',
                            description: 'Networks to monitor (ethereum, bitcoin, etc.)',
                            items: {
                                type: 'string'
                            },
                            required: false
                        },
                        threshold: {
                            type: 'number',
                            description: 'Alert threshold in USD',
                            required: false,
                            default: 500000
                        }
                    },
                    required: []
                }
            }
        ]
    },
    
    // Development Tools 服务
    {
        name: 'github-mcp',
        description: 'GitHub repository management and operations with comprehensive API access including repos, issues, PRs, actions, and code security',
        command: 'docker',
        args: [
            'run',
            '-i',
            '--rm',
            '-e',
            'GITHUB_PERSONAL_ACCESS_TOKEN',
            '-e',
            'GITHUB_TOOLSETS',
            '-e',
            'GITHUB_READ_ONLY',
            'ghcr.io/github/github-mcp-server'
        ],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
        },
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/GitHub-Mark.png',
        githubUrl: 'https://github.com/github/github-mcp-server',
        authRequired: true,
        authParams: {
            GITHUB_PERSONAL_ACCESS_TOKEN: "GITHUB_PERSONAL_ACCESS_TOKEN",
        },
        // 🔧 新增：基于GitHub官方文档的预定义工具信息
        predefinedTools: [
            {
                name: 'create_or_update_file',
                description: 'Create or update a single file in a repository',
                parameters: {
                    type: 'object',
                    properties: {
                        owner: {
                            type: 'string',
                            description: 'Repository owner (username or organization)',
                            required: true
                        },
                        repo: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        path: {
                            type: 'string',
                            description: 'Path where to create/update the file',
                            required: true
                        },
                        content: {
                            type: 'string',
                            description: 'Content of the file',
                            required: true
                        },
                        message: {
                            type: 'string',
                            description: 'Commit message',
                            required: true
                        },
                        branch: {
                            type: 'string',
                            description: 'Branch to create/update the file in',
                            required: true
                        },
                        sha: {
                            type: 'string',
                            description: 'SHA of file being replaced (for updates)',
                            required: false
                        }
                    },
                    required: ['owner', 'repo', 'path', 'content', 'message', 'branch']
                }
            },
            {
                name: 'search_repositories',
                description: 'Search for GitHub repositories',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query',
                            required: true
                        },
                        page: {
                            type: 'number',
                            description: 'Page number for pagination',
                            required: false
                        },
                        perPage: {
                            type: 'number',
                            description: 'Results per page (max 100)',
                            required: false,
                            default: 30
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'create_repository',
                description: 'Create a new GitHub repository',
                parameters: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        description: {
                            type: 'string',
                            description: 'Repository description',
                            required: false
                        },
                        private: {
                            type: 'boolean',
                            description: 'Whether repo should be private',
                            required: false,
                            default: false
                        },
                        autoInit: {
                            type: 'boolean',
                            description: 'Initialize with README',
                            required: false,
                            default: false
                        }
                    },
                    required: ['name']
                }
            },
            {
                name: 'create_issue',
                description: 'Create a new issue',
                parameters: {
                    type: 'object',
                    properties: {
                        owner: {
                            type: 'string',
                            description: 'Repository owner',
                            required: true
                        },
                        repo: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        title: {
                            type: 'string',
                            description: 'Issue title',
                            required: true
                        },
                        body: {
                            type: 'string',
                            description: 'Issue description',
                            required: false
                        },
                        assignees: {
                            type: 'array',
                            description: 'Usernames to assign',
                            items: { type: 'string' },
                            required: false
                        },
                        labels: {
                            type: 'array',
                            description: 'Labels to add',
                            items: { type: 'string' },
                            required: false
                        }
                    },
                    required: ['owner', 'repo', 'title']
                }
            },
            {
                name: 'create_pull_request',
                description: 'Create a new pull request',
                parameters: {
                    type: 'object',
                    properties: {
                        owner: {
                            type: 'string',
                            description: 'Repository owner',
                            required: true
                        },
                        repo: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        title: {
                            type: 'string',
                            description: 'PR title',
                            required: true
                        },
                        body: {
                            type: 'string',
                            description: 'PR description',
                            required: false
                        },
                        head: {
                            type: 'string',
                            description: 'Branch containing changes',
                            required: true
                        },
                        base: {
                            type: 'string',
                            description: 'Branch to merge into',
                            required: true
                        },
                        draft: {
                            type: 'boolean',
                            description: 'Create as draft PR',
                            required: false,
                            default: false
                        }
                    },
                    required: ['owner', 'repo', 'title', 'head', 'base']
                }
            },
            {
                name: 'search_code',
                description: 'Search for code across GitHub repositories',
                parameters: {
                    type: 'object',
                    properties: {
                        q: {
                            type: 'string',
                            description: 'Search query using GitHub code search syntax',
                            required: true
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort field (indexed only)',
                            enum: ['indexed'],
                            required: false
                        },
                        order: {
                            type: 'string',
                            description: 'Sort order',
                            enum: ['asc', 'desc'],
                            required: false,
                            default: 'desc'
                        },
                        per_page: {
                            type: 'number',
                            description: 'Results per page (max 100)',
                            required: false,
                            default: 30
                        }
                    },
                    required: ['q']
                }
            },
            {
                name: 'get_file_contents',
                description: 'Get contents of a file or directory',
                parameters: {
                    type: 'object',
                    properties: {
                        owner: {
                            type: 'string',
                            description: 'Repository owner',
                            required: true
                        },
                        repo: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        path: {
                            type: 'string',
                            description: 'Path to file/directory',
                            required: true
                        },
                        branch: {
                            type: 'string',
                            description: 'Branch to get contents from',
                            required: false
                        }
                    },
                    required: ['owner', 'repo', 'path']
                }
            },
            {
                name: 'fork_repository',
                description: 'Fork a repository',
                parameters: {
                    type: 'object',
                    properties: {
                        owner: {
                            type: 'string',
                            description: 'Repository owner',
                            required: true
                        },
                        repo: {
                            type: 'string',
                            description: 'Repository name',
                            required: true
                        },
                        organization: {
                            type: 'string',
                            description: 'Organization to fork to',
                            required: false
                        }
                    },
                    required: ['owner', 'repo']
                }
            }
        ]
    },
    {
        name: 'mindsdb-mcp',
        description: 'MindsDB machine learning database integration',
        command: '/home/ubuntu/mcp-tools/mcp-venv/bin/python',
        args: [`/home/ubuntu/mcp-tools/minds-mcp/server.py`],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-money-minded-68.png',
        githubUrl: 'https://github.com/mindsdb/minds-mcp',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于MindsDB的预定义工具信息
        predefinedTools: [
            {
                name: 'create_model',
                description: 'Create a machine learning model in MindsDB',
                parameters: {
                    type: 'object',
                    properties: {
                        model_name: {
                            type: 'string',
                            description: 'Name for the ML model',
                            required: true
                        },
                        query: {
                            type: 'string',
                            description: 'SQL query to define the model',
                            required: true
                        },
                        engine: {
                            type: 'string',
                            description: 'ML engine to use (lightwood, huggingface, etc.)',
                            required: false,
                            default: 'lightwood'
                        }
                    },
                    required: ['model_name', 'query']
                }
            },
            {
                name: 'predict',
                description: 'Make predictions using a trained model',
                parameters: {
                    type: 'object',
                    properties: {
                        model_name: {
                            type: 'string',
                            description: 'Name of the model to use for prediction',
                            required: true
                        },
                        data: {
                            type: 'object',
                            description: 'Input data for prediction',
                            required: true
                        }
                    },
                    required: ['model_name', 'data']
                }
            },
            {
                name: 'list_models',
                description: 'List all available models',
                parameters: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            description: 'Filter by model status (training, complete, error)',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'query_data',
                description: 'Execute SQL queries on connected data sources',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'SQL query to execute',
                            required: true
                        },
                        database: {
                            type: 'string',
                            description: 'Target database name',
                            required: false
                        }
                    },
                    required: ['query']
                }
            }
        ]
    },
    {
        name: 'playwright-mcp',
        description: 'Playwright browser automation and testing',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/playwrite.png',
        githubUrl: 'https://github.com/microsoft/playwright-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'blender-mcp',
        description: 'Blender 3D modeling and animation integration with Claude AI through MCP',
        command: '/home/ubuntu/mcp-tools/mcp-venv/bin/python',
        args: ['-m', 'blender_mcp.server'],
        env: { LOG_LEVEL: 'INFO' },
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-blender-100.png',
        githubUrl: 'https://github.com/ahujasid/blender-mcp',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于Blender的预定义工具信息
        predefinedTools: [
            {
                name: 'create_object',
                description: 'Create a new 3D object in Blender',
                parameters: {
                    type: 'object',
                    properties: {
                        object_type: {
                            type: 'string',
                            description: 'Type of object (cube, sphere, cylinder, plane, etc.)',
                            required: true
                        },
                        location: {
                            type: 'array',
                            description: 'Object location [x, y, z]',
                            items: {
                                type: 'number'
                            },
                            required: false,
                            default: [0, 0, 0]
                        },
                        scale: {
                            type: 'array',
                            description: 'Object scale [x, y, z]',
                            items: {
                                type: 'number'
                            },
                            required: false,
                            default: [1, 1, 1]
                        }
                    },
                    required: ['object_type']
                }
            },
            {
                name: 'render_scene',
                description: 'Render the current Blender scene',
                parameters: {
                    type: 'object',
                    properties: {
                        output_path: {
                            type: 'string',
                            description: 'Output file path for rendered image',
                            required: false
                        },
                        resolution: {
                            type: 'array',
                            description: 'Render resolution [width, height]',
                            items: {
                                type: 'number'
                            },
                            required: false,
                            default: [1920, 1080]
                        },
                        samples: {
                            type: 'number',
                            description: 'Number of render samples',
                            required: false,
                            default: 128
                        }
                    },
                    required: []
                }
            },
            {
                name: 'apply_material',
                description: 'Apply material to selected objects',
                parameters: {
                    type: 'object',
                    properties: {
                        material_name: {
                            type: 'string',
                            description: 'Name of the material to apply',
                            required: true
                        },
                        object_names: {
                            type: 'array',
                            description: 'Names of objects to apply material to',
                            items: {
                                type: 'string'
                            },
                            required: false
                        }
                    },
                    required: ['material_name']
                }
            },
            {
                name: 'animate_object',
                description: 'Create animation for an object',
                parameters: {
                    type: 'object',
                    properties: {
                        object_name: {
                            type: 'string',
                            description: 'Name of object to animate',
                            required: true
                        },
                        animation_type: {
                            type: 'string',
                            description: 'Animation type (location, rotation, scale)',
                            required: true
                        },
                        start_frame: {
                            type: 'number',
                            description: 'Starting frame of animation',
                            required: false,
                            default: 1
                        },
                        end_frame: {
                            type: 'number',
                            description: 'Ending frame of animation',
                            required: false,
                            default: 250
                        }
                    },
                    required: ['object_name', 'animation_type']
                }
            }
        ]
    },
    {
        name: 'unity-mcp',
        description: 'Unity game engine development tools',
        command: 'npx',
        args: ['-y', 'unity-mcp'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unity-100.png',
        githubUrl: 'https://github.com/justinpbarnett/unity-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'unreal-mcp',
        description: 'Unreal Engine game development integration with AI control through MCP',
        command: '/home/ubuntu/.local/bin/uv',
        args: [
            '--directory',
            '/home/ubuntu/mcp-tools/unreal-mcp/Python',
            'run',
            'unreal_mcp_server.py'
        ],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-unreal-engine-100.png',
        githubUrl: 'https://github.com/chongdashu/unreal-mcp',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'figma-mcp',
        description: 'Figma design tool integration and context',
        command: 'npx',
        args: ['-y', 'figma-developer-mcp',`--figma-api-key=${process.env.FIGMA_API_KEY || ''}`, "--stdio"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-figma-96.png',
        githubUrl: 'https://github.com/GLips/Figma-Context-MCP',
        authRequired: true,
        authParams: {
            FIGMA_API_KEY: "FIGMA_API_KEY"
        },
        // 🔧 新增：基于Figma的预定义工具信息
        predefinedTools: [
            {
                name: 'get_file_info',
                description: 'Get information about a Figma file',
                parameters: {
                    type: 'object',
                    properties: {
                        file_key: {
                            type: 'string',
                            description: 'Figma file key from the URL',
                            required: true
                        },
                        version: {
                            type: 'string',
                            description: 'File version ID (optional)',
                            required: false
                        }
                    },
                    required: ['file_key']
                }
            },
            {
                name: 'get_file_nodes',
                description: 'Get specific nodes from a Figma file',
                parameters: {
                    type: 'object',
                    properties: {
                        file_key: {
                            type: 'string',
                            description: 'Figma file key',
                            required: true
                        },
                        node_ids: {
                            type: 'array',
                            description: 'Array of node IDs to retrieve',
                            items: {
                                type: 'string'
                            },
                            required: true
                        }
                    },
                    required: ['file_key', 'node_ids']
                }
            },
            {
                name: 'get_image_exports',
                description: 'Export images from Figma nodes',
                parameters: {
                    type: 'object',
                    properties: {
                        file_key: {
                            type: 'string',
                            description: 'Figma file key',
                            required: true
                        },
                        node_ids: {
                            type: 'array',
                            description: 'Node IDs to export as images',
                            items: {
                                type: 'string'
                            },
                            required: true
                        },
                        format: {
                            type: 'string',
                            description: 'Export format (png, jpg, svg, pdf)',
                            required: false,
                            default: 'png'
                        },
                        scale: {
                            type: 'number',
                            description: 'Scale factor for export',
                            required: false,
                            default: 1
                        }
                    },
                    required: ['file_key', 'node_ids']
                }
            },
            {
                name: 'get_team_projects',
                description: 'Get projects for a team',
                parameters: {
                    type: 'object',
                    properties: {
                        team_id: {
                            type: 'string',
                            description: 'Team ID',
                            required: true
                        }
                    },
                    required: ['team_id']
                }
            }
        ]
    },
    {
        name: 'aws-mcp',
        description: 'AWS cloud services integration with comprehensive API support',
        command: '/home/ubuntu/.local/bin/uvx',
        args: ['awslabs.aws-api-mcp-server@latest'],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-aws-96.png',
        githubUrl: 'https://awslabs.github.io/mcp/',
        authRequired: false,
        authParams: {},
        // 🔧 新增：基于AWS的预定义工具信息
        predefinedTools: [
            {
                name: 'list_s3_buckets',
                description: 'List all S3 buckets in the account',
                parameters: {
                    type: 'object',
                    properties: {
                        region: {
                            type: 'string',
                            description: 'AWS region',
                            required: false,
                            default: 'us-east-1'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_s3_object',
                description: 'Get an object from S3 bucket',
                parameters: {
                    type: 'object',
                    properties: {
                        bucket: {
                            type: 'string',
                            description: 'S3 bucket name',
                            required: true
                        },
                        key: {
                            type: 'string',
                            description: 'Object key/path',
                            required: true
                        }
                    },
                    required: ['bucket', 'key']
                }
            },
            {
                name: 'list_ec2_instances',
                description: 'List EC2 instances',
                parameters: {
                    type: 'object',
                    properties: {
                        region: {
                            type: 'string',
                            description: 'AWS region',
                            required: false,
                            default: 'us-east-1'
                        },
                        state: {
                            type: 'string',
                            description: 'Instance state filter (running, stopped, etc.)',
                            required: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'invoke_lambda',
                description: 'Invoke a Lambda function',
                parameters: {
                    type: 'object',
                    properties: {
                        function_name: {
                            type: 'string',
                            description: 'Lambda function name or ARN',
                            required: true
                        },
                        payload: {
                            type: 'object',
                            description: 'Function payload/input',
                            required: false
                        },
                        invocation_type: {
                            type: 'string',
                            description: 'Invocation type (RequestResponse, Event, DryRun)',
                            required: false,
                            default: 'RequestResponse'
                        }
                    },
                    required: ['function_name']
                }
            }
        ]
    },
    {
        name: 'convex-mcp',
        description: 'Convex backend development platform',
        command: 'npx',
        args: ["-y", "convex@latest", "mcp", "start"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-convex-66.png',
        githubUrl: 'https://github.com/get-convex/convex-backend/blob/main/npm-packages/convex/src/cli/mcp.ts',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'cloudflare-mcp',
        description: 'Cloudflare edge computing and CDN services',
        command: 'npx',
        args: ["mcp-remote", "https://docs.mcp.cloudflare.com/sse"],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-cloudflare-100.png',
        githubUrl: 'https://github.com/cloudflare/mcp-server-cloudflare',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'supabase-mcp',
        description: 'Supabase backend-as-a-service integration',
        command: 'npx',
        args: ["-y",
            "@supabase/mcp-server-supabase@latest",
            "--access-token",
            process.env.SUPABASE_ACCESS_TOKEN || ''],
        env: {},
        connected: false,
        category: 'Dev Tool',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-supabase-100.png',
        githubUrl: 'https://github.com/supabase-community/supabase-mcp',
        authRequired: true,
        authParams: {
            SUPABASE_ACCESS_TOKEN: "SUPABASE_ACCESS_TOKEN"
        }
    },
    
    // Trading 服务
    {
        name: 'binance-mcp',
        description: 'Binance cryptocurrency exchange trading (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/binance-mcp/build/index.js`],
        env: {
            BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
            BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-binance-128.png',
        githubUrl: 'https://github.com/TermiX-official/binance-mcp',
        authRequired: true,
        authParams: {
            BINANCE_API_KEY: "BINANCE_API_KEY",
            BINANCE_API_SECRET: "BINANCE_API_SECRET"
        }
    },
    {
        name: 'uniswap-mcp',
        description: 'Uniswap DEX trading and liquidity management (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/uniswap-trader-mcp/index.js`],
        env: {
            INFURA_KEY: process.env.UNISWAP_INFURA_KEY || '',
            WALLET_PRIVATE_KEY: process.env.UNISWAP_WALLET_PRIVATE_KEY || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/uniswap.jpeg',
        githubUrl: 'https://github.com/kukapay/uniswap-trader-mcp',
        authRequired: true,
        authParams: {
            INFURA_KEY: "INFURA_KEY",
            WALLET_PRIVATE_KEY: "WALLET_PRIVATE_KEY"
        }
    },
    {
        name: 'hyperliquid-mcp',
        description: 'Hyperliquid decentralized perpetuals trading',
        command: 'npx',
        args: ['-y', '@mektigboy/server-hyperliquid'],
        env: {},
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/hyperliquid.png',
        githubUrl: 'https://github.com/mektigboy/server-hyperliquid',
        authRequired: false,
        authParams: {}
    },
    {
        name: 'pumpfun-mcp',
        description: 'Pump.fun meme token trading platform (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/pumpfun-mcp-server/build/index.js`],
        env: {
            HELIUS_RPC_URL: process.env.HELIUS_RPC_URL || ''
        },
        connected: false,
        category: 'Trading',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-pumpkin-96.png',
        githubUrl: 'https://github.com/noahgsolomon/pumpfun-mcp-server',
        authRequired: true,
        authParams: {
            HELIUS_RPC_URL: "HELIUS_RPC_URL"
        }
    },
    
    // Social 服务
    {
        name: 'discord-mcp',
        description: 'Discord social platform integration',
        command: '/home/ubuntu/.local/bin/uv',
        args: ["--directory",
            `/home/ubuntu/mcp-tools/mcp-discord`,
            "run",
            "mcp-discord"],
        env: {
            DISCORD_TOKEN: process.env.DISCORD_TOKEN || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-discord-96.png',
        githubUrl: 'https://github.com/hanweg/mcp-discord',
        authRequired: true,
        authParams: {
            DISCORD_TOKEN: "DISCORD_TOKEN"
        }
    },
    {
        name: 'telegram-mcp',
        description: 'Telegram messaging platform integration',
        command: 'npx',
        args: ['mcp-telegram'],
        env: {},
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/telegram.ico',
        githubUrl: 'https://github.com/sparfenyuk/mcp-telegram',
        authRequired: true,
        authParams: {
            TELEGRAM_API_ID: "TELEGRAM_API_ID",
            TELEGRAM_API_HASH: "TELEGRAM_API_HASH"
        }
    },
    {
        name: 'twitter-client-mcp',
        description: 'Advanced Twitter Client MCP with comprehensive functionality including profile operations, tweet management, search, and relationship operations. Uses Twitter API v2 credentials for enhanced functionality and secure access (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/twitter-client-mcp/dist/index.js`],
        env: {
            // Primary API v2 credentials for advanced functionality
            TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
            TWITTER_API_SECRET_KEY: process.env.TWITTER_API_SECRET_KEY || '',
            TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
            TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
            // Optional basic auth (leave empty to use API-only mode)
            TWITTER_USERNAME: process.env.TWITTER_USERNAME || '',
            TWITTER_PASSWORD: process.env.TWITTER_PASSWORD || '',
            TWITTER_EMAIL: process.env.TWITTER_EMAIL || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
        githubUrl: 'https://github.com/mzkrasner/twitter-client-mcp',
        authRequired: true,
        authParams: {
            TWITTER_API_KEY: "TWITTER_API_KEY",
            TWITTER_API_SECRET_KEY: "TWITTER_API_SECRET_KEY",
            TWITTER_ACCESS_TOKEN: "TWITTER_ACCESS_TOKEN",
            TWITTER_ACCESS_TOKEN_SECRET: "TWITTER_ACCESS_TOKEN_SECRET",
            TWITTER_USERNAME: "TWITTER_USERNAME",
            TWITTER_PASSWORD: "TWITTER_PASSWORD", 
            TWITTER_EMAIL: "TWITTER_EMAIL"
        },
        // 🔧 新增：预定义工具信息
        predefinedTools: [
            {
                name: 'profileByUsername',
                description: 'Get detailed Twitter profile information for a specific username',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Twitter username (without @ symbol)',
                            required: true
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'myProfile',
                description: 'Get the authenticated user\'s Twitter profile information',
                parameters: {
                    type: 'object',
                    properties: {
                        check: {
                            type: 'boolean',
                            description: 'Must be true to confirm the action',
                            required: true
                        }
                    },
                    required: ['check']
                }
            },
            {
                name: 'sendTweet',
                description: 'Post a new tweet or reply to an existing tweet',
                parameters: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'Tweet content (max 280 characters)',
                            required: true
                        },
                        replyToId: {
                            type: 'string',
                            description: 'ID of the tweet to reply to (optional)',
                            required: false
                        }
                    },
                    required: ['text']
                }
            },
            {
                name: 'searchTweets',
                description: 'Search for tweets using Twitter\'s search API',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query string',
                            required: true
                        },
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (1-100)',
                            required: false,
                            default: 10
                        },
                        searchMode: {
                            type: 'string',
                            description: 'Search mode: Latest, Top, or Photos',
                            enum: ['Latest', 'Top', 'Photos'],
                            required: false,
                            default: 'Latest'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'likeTweet',
                description: 'Like a specific tweet',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to like',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            },
            {
                name: 'unlikeTweet',
                description: 'Unlike a previously liked tweet',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to unlike',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            },
            {
                name: 'retweet',
                description: 'Retweet a specific tweet',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to retweet',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            },
            {
                name: 'unretweet',
                description: 'Undo a previous retweet',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to unretweet',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            },
            {
                name: 'followUser',
                description: 'Follow a specific user',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username of the user to follow',
                            required: true
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'unfollowUser',
                description: 'Unfollow a specific user',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username of the user to unfollow',
                            required: true
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'getFollowers',
                description: 'Get list of followers for a specific user',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username to get followers for',
                            required: true
                        },
                        count: {
                            type: 'number',
                            description: 'Number of followers to fetch (max 50)',
                            required: false,
                            default: 20
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'getFollowing',
                description: 'Get list of users that a specific user is following',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username to get following list for',
                            required: true
                        },
                        count: {
                            type: 'number',
                            description: 'Number of following to fetch (max 50)',
                            required: false,
                            default: 20
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'getTweets',
                description: 'Get recent tweets from a specific user',
                parameters: {
                    type: 'object',
                    properties: {
                        username: {
                            type: 'string',
                            description: 'Username to get tweets from',
                            required: true
                        },
                        count: {
                            type: 'number',
                            description: 'Number of tweets to fetch (max 50)',
                            required: false,
                            default: 10
                        }
                    },
                    required: ['username']
                }
            },
            {
                name: 'bookmarkTweet',
                description: 'Bookmark a specific tweet',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to bookmark',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            },
            {
                name: 'removeBookmark',
                description: 'Remove a tweet from bookmarks',
                parameters: {
                    type: 'object',
                    properties: {
                        tweetId: {
                            type: 'string',
                            description: 'ID of the tweet to remove from bookmarks',
                            required: true
                        }
                    },
                    required: ['tweetId']
                }
            }
        ]
    },
    {
        name: 'x-mcp',
        description: 'An MCP server to create, manage and publish X/Twitter posts directly',
        command: '/home/ubuntu/.local/bin/uv',
        args: ["--directory",
            `/home/ubuntu/mcp-tools/x-mcp`,
            "run",
            "x-mcp"],
        env: {
            TWITTER_API_KEY: process.env.TWITTER_API_KEY || '',
            TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || '',
            TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || '',
            TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
        },
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/x-mcp.ico',
        githubUrl: 'https://github.com/vidhupv/x-mcp',
        authRequired: true,
        authParams: {
            TWITTER_API_KEY: "TWITTER_API_KEY",
            TWITTER_API_SECRET: "TWITTER_API_SECRET",
            TWITTER_ACCESS_TOKEN: "TWITTER_ACCESS_TOKEN",
            TWITTER_ACCESS_TOKEN_SECRET: "TWITTER_ACCESS_TOKEN_SECRET"
        }
    },
    {
        name: 'notion-mcp',
        description: 'Notion workspace and documentation integration',
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: {"OPENAPI_MCP_HEADERS": process.env.OPENAPI_MCP_HEADERS || ''},
        connected: false,
        category: 'Social',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/icons8-notion-96.png',
        githubUrl: 'https://github.com/makenotion/notion-mcp-server',
        authRequired: true,
        authParams: {
            OPENAPI_MCP_HEADERS: "OPENAPI_MCP_HEADERS"
        }
    },
    {
        name: 'dexscreener-mcp',
        description: 'DexScreener real-time DEX pair data, token information, and market statistics across multiple blockchains (LOCAL BUILD)',
        command: 'node',
        args: [`/home/ubuntu/mcp-tools/dexscreener-mcp-server/build/index.js`],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/dexscreener.ico',
        githubUrl: 'https://github.com/opensvm/dexscreener-mcp-server',
        authRequired: false,
        authParams: {}
    },
    // new mcp
    {
        "name": "new-coingecko-mcp",
        "description": "CoinGecko cryptocurrency data and market analytics - provides prices, market data, trends, historical data, and crypto categories (REMOTE PUBLIC or LOCAL BUILD)",
        "command": "npx",
        "args": ["-y", "@coingecko/coingecko-mcp"],
        "env": {
            "COINGECKO_ENVIRONMENT": "Demo"
        },
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-coingecko.png",
        "githubUrl": "https://github.com/coingecko", // Note: No official GitHub for MCP server, this is general
        "authRequired": true, // For public keyless mode; set to true for Pro
        "authParams": {
            COINGECKO_API_KEY: "COINGECKO_API_KEY",
        },
    },
    {
        "name": "web-search-mcp",
        "description": "Web Search MCP Server - provides internet search capabilities using Serper.dev API for querying web results, snippets, and related searches (LOCAL BUILD)",
        "command": "node",
        "args": ["/home/ubuntu/mcp-tools/web-search/build/index.js"], // Adjust to your local build path, e.g., /home/ubuntu/mcp-tools/web-search/dist/index.js
        "env": {},
        "connected": false,
        "category": "Browser Automation",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-web-search.png", // Placeholder; update if available
        "githubUrl": "https://github.com/pskill9/web-search",
        "authRequired": false,
        "authParams": {},
    },
    {
        "name": "puppeteer-mcp",
        "description": "Puppeteer MCP Server - provides browser automation capabilities through Puppeteer, allowing interaction with both new browser instances and existing Chrome windows for tasks like navigation, screenshots, and element interactions (LOCAL BUILD)",
        "command": "node",
        "args": ["/home/ubuntu/mcp-tools/puppeteer-mcp-server/dist/index.js"],
        "env": {},
        "connected": false,
        "category": "Browser Automation",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-puppeteer.png",
        "githubUrl": "https://github.com/merajmehrabi/puppeteer-mcp-server",
        "authRequired": false,
        "authParams": {},
    },
    {
        "name": "web3-research-mcp",
        "description": "Web3 Research MCP Server - provides blockchain data, transaction history, smart contract interactions, wallet analytics, and DeFi/NFT metrics using Alchemy and other Web3 APIs (LOCAL BUILD)",
        "command": "/home/ubuntu/.nvm/versions/node/v20.19.3/bin/npx",
        "args": ["-y", "web3-research-mcp@latest"],
        "env": {},
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-web3-research.png",
        "githubUrl": "https://github.com/aaronjmars/web3-research-mcp",
        "authRequired": false,
        "authParams": {},
    },
    {
        "name": "crypto-portfolio-mcp",
        "description": "Crypto Portfolio MCP Server - provides tools for tracking and managing cryptocurrency portfolio allocations, including real-time prices from Binance, portfolio summaries, value history charts, and analysis for diversification and risk (LOCAL BUILD)",
        "command": "/home/ubuntu/mcp-tools/mcp-venv/bin/python",
        "args": ["/home/ubuntu/mcp-tools/crypto-portfolio-mcp/main.py"],
        "env": {},
        "connected": false,
        "category": "Trading",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-portfolio.png",
        "githubUrl": "https://github.com/kukapay/crypto-portfolio-mcp",
        "authRequired": false,
        "authParams": {},
    },
    {
        "name": "crypto-news-mcp",
        "description": "Crypto News MCP Server - provides real-time cryptocurrency news headlines, keyword searches, and summarization prompts sourced from NewsData API for AI agents (LOCAL BUILD)",
        "command": "/home/ubuntu/mcp-tools/mcp-venv/bin/python",
        "args": ["/home/ubuntu/mcp-tools/crypto-news-mcp/main.py"],
        "env": {},
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-news.png",
        "githubUrl": "https://github.com/kukapay/crypto-news-mcp",
        "authRequired": true,
        "authParams": {
            NEWS_API_KEY: "your_newsdata_api_key_here"
        },
    },
    {
        name: 'new-dune-analytics-mcp',
        description: 'Dune Analytics MCP Server - provides access to blockchain data queries and results from Dune Analytics for AI agents, including fetching latest results and executing queries',
        command: 'npx',
        args: ['-y', '@kukapay/dune-analytics-mcp'],
        env: {},
        connected: false,
        category: 'Crypto Tools',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-dune-analytics.png',
        githubUrl: 'https://·github.com/kukapay/dune-analytics-mcp',
        authRequired: true,
        authParams: {
            DUNE_API_KEY: "DUNE_API_KEY"
        },
        predefinedTools: [
            {
                name: 'get_latest_result',
                description: 'Retrieves the latest results of a specified Dune query',
                parameters: {
                    type: 'object',
                    properties: {
                        query_id: {
                            type: 'integer',
                            description: 'The ID of the Dune query',
                            required: true
                        }
                    },
                    required: ['query_id']
                }
            },
            {
                name: 'run_query',
                description: 'Executes a Dune query and returns the results',
                parameters: {
                    type: 'object',
                    properties: {
                        query_id: {
                            type: 'integer',
                            description: 'The ID of the Dune query to run',
                            required: true
                        }
                    },
                    required: ['query_id']
                }
            }
        ]
    },
    {
        "name": "demcp-defillama-mcp",
        "description": "DeFiLlama MCP Server (demcp variant) - provides DeFi protocol data, TVL analytics, chain data, token prices, and liquidity pool information using FastMCP framework for AI integration (LOCAL BUILD)",
        "command": "/home/ubuntu/mcp-tools/mcp-venv/bin/python",
        "args": ["/home/ubuntu/mcp-tools/defillama-mcp/defillama.py"],
        "env": {},
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-defillama.png",
        "githubUrl": "https://github.com/demcp/demcp-defillama-mcp",
        "authRequired": false,
        "authParams": {},
        "predefinedTools": [
            {
                "name": "get_protocols",
                "description": "Retrieve information about top DeFi protocols",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "get_protocol_tvl",
                "description": "Get TVL data for a specific protocol",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "protocol": {
                            "type": "string",
                            "description": "Protocol slug (e.g., aave, uniswap)",
                            "required": true
                        }
                    },
                    "required": ["protocol"]
                }
            },
            {
                "name": "get_chain_tvl",
                "description": "Access historical TVL data for a specific blockchain",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chain": {
                            "type": "string",
                            "description": "Blockchain name (e.g., ethereum, polygon)",
                            "required": true
                        }
                    },
                    "required": ["chain"]
                }
            },
            {
                "name": "get_token_prices",
                "description": "Obtain current price information for specific tokens",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tokens": {
                            "type": "array",
                            "description": "Array of token addresses or symbols",
                            "required": true
                        },
                        "chain": {
                            "type": "string",
                            "description": "Blockchain name",
                            "required": false
                        }
                    },
                    "required": ["tokens"]
                }
            },
            {
                "name": "get_pools",
                "description": "List available liquidity pools",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chain": {
                            "type": "string",
                            "description": "Filter by blockchain",
                            "required": false
                        },
                        "protocol": {
                            "type": "string",
                            "description": "Filter by protocol",
                            "required": false
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_pool_tvl",
                "description": "Get detailed information about a specific liquidity pool",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pool_id": {
                            "type": "string",
                            "description": "ID of the liquidity pool",
                            "required": true
                        },
                        "chain": {
                            "type": "string",
                            "description": "Blockchain name",
                            "required": false
                        }
                    },
                    "required": ["pool_id"]
                }
            }
        ]
    },
    {
        name: 'crypto-projects-mcp',
        description: 'Crypto Projects MCP Server - provides cryptocurrency project data from Mobula.io to AI agents, including raw JSON data and formatted Markdown summaries using uv for package management',
        command: '/home/ubuntu/.local/bin/uv',
        args: [
            'run',
            '--directory',
            '/home/ubuntu/mcp-tools/crypto-projects-mcp',
            'main.py'
        ],
        env: {},
        connected: false,
        category: 'Market Data',
        imageUrl: 'https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-projects.png',
        githubUrl: 'https://github.com/kukapay/crypto-projects-mcp',
        authRequired: false,
        authParams: {},
        predefinedTools: [
            {
                name: 'get_project_data',
                description: 'Retrieves raw JSON data for a specified cryptocurrency project, useful for applications needing unprocessed data',
                parameters: {
                    type: 'object',
                    properties: {
                        project_name: {
                            type: 'string',
                            description: 'Project name (e.g., avalanche)',
                            required: true
                        }
                    },
                    required: ['project_name']
                }
            },
            {
                name: 'format_project_data',
                description: 'Fetches data using the get_project_data tool and formats it into a comprehensive Markdown document, designed for LLM applications to present structured, human-readable information about a cryptocurrency project',
                parameters: {
                    type: 'object',
                    properties: {
                        project_name: {
                            type: 'string',
                            description: 'Project name (e.g., avalanche)',
                            required: true
                        },
                        lang: {
                            type: 'string',
                            description: 'Language code (e.g., en_US)',
                            required: false
                        }
                    },
                    required: ['project_name']
                }
            }
        ]
    },
    {
        "name": "crypto-whitepapers-mcp",
        "description": "Crypto Whitepapers MCP Server - serves as a structured knowledge base of crypto whitepapers, enabling AI agents to access, analyze, and learn from them by searching, loading, and querying whitepaper content (LOCAL BUILD)",
        "command": "/home/ubuntu/.local/bin/uv",
        "args": ["--directory", "/home/ubuntu/mcp-tools/crypto-whitepapers-mcp", "run", "crypto-whitepapers-mcp"],
        "env": {},
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-whitepapers.png",
        "githubUrl": "https://github.com/kukapay/crypto-whitepapers-mcp",
        "authRequired": false,
        "authParams": {},
        "predefinedTools": [
            {
                "name": "list_available_projects",
                "description": "Lists all projects in the knowledge base, derived from PDF filenames",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "search_whitepaper",
                "description": "Searches for a project's whitepaper PDF using DuckDuckGo",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_name": {
                            "type": "string",
                            "description": "Project name (e.g., bitcoin)",
                            "required": true
                        }
                    },
                    "required": ["project_name"]
                }
            },
            {
                "name": "load_whitepaper",
                "description": "Downloads a whitepaper PDF from a URL and loads it into the knowledge base",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_name": {
                            "type": "string",
                            "description": "Project name (e.g., bitcoin)",
                            "required": true
                        },
                        "url": {
                            "type": "string",
                            "description": "URL of the whitepaper PDF",
                            "required": true
                        }
                    },
                    "required": ["project_name", "url"]
                }
            },
            {
                "name": "ask_whitepapers",
                "description": "Searches the knowledge base for a query, optionally filtered by project",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The query to search in whitepapers",
                            "required": true
                        },
                        "project_name": {
                            "type": "string",
                            "description": "Optional project name to filter",
                            "required": false
                        }
                    },
                    "required": ["query"]
                }
            }
        ]
    },
    {
        "name": "new-hyperliquid-mcp",
        "description": "Hyperliquid MCP Server - provides onchain tools for AI applications to interact with Hyperliquid, including account states, order management, trading operations, and market data using Hyperliquid SDK (LOCAL BUILD)",
        "command": "node",
        "args": ["/home/ubuntu/mcp-tools/hyperliquid-mcp/dist/index.js"],
        "env": {},
        "connected": false,
        "category": "Trading",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-hyperliquid.png",
        "githubUrl": "https://github.com/Impa-Ventures/hyperliquid-mcp",
        "authRequired": true,
        "authParams": {
            PRIVATE_KEY: "This is your wallet private key"
        },
        "predefinedTools": [
            {
                "name": "get_spot_clearinghouse_state",
                "description": "Get the clearinghouse state of a user on Hyperliquid",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "string",
                            "description": "User address (defaults to wallet address)",
                            "required": false
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_perp_clearinghouse_state",
                "description": "Get the perpetual clearinghouse state of a user on Hyperliquid",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "string",
                            "description": "User address (defaults to wallet address)",
                            "required": false
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_order_status",
                "description": "Get the status of a specific order",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "string",
                            "description": "User address",
                            "required": true
                        },
                        "oid": {
                            "type": "string",
                            "description": "Order ID (number or string)",
                            "required": true
                        }
                    },
                    "required": ["user", "oid"]
                }
            },
            {
                "name": "get_open_orders",
                "description": "Get all open orders for a user",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "string",
                            "description": "User address (defaults to wallet address)",
                            "required": false
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_order_history",
                "description": "Get order history for a user",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "string",
                            "description": "User address (defaults to wallet address)",
                            "required": false
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_all_mids",
                "description": "Get mid prices for all coins on Hyperliquid",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "get_spot_meta",
                "description": "Request spot trading metadata",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "get_candle_snapshot",
                "description": "Get historical candlestick data",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "coin": {
                            "type": "string",
                            "description": "Coin symbol",
                            "required": true
                        },
                        "interval": {
                            "type": "string",
                            "description": "Time interval",
                            "required": true
                        },
                        "startTime": {
                            "type": "number",
                            "description": "Start timestamp",
                            "required": true
                        },
                        "endTime": {
                            "type": "number",
                            "description": "End timestamp",
                            "required": false
                        }
                    },
                    "required": ["coin", "interval", "startTime"]
                }
            },
            {
                "name": "get_l2_book",
                "description": "Get L2 order book data",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "coin": {
                            "type": "string",
                            "description": "Coin symbol",
                            "required": true
                        }
                    },
                    "required": ["coin"]
                }
            },
            {
                "name": "place_order",
                "description": "Place a trading order",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "coin": {
                            "type": "string",
                            "description": "Coin symbol",
                            "required": true
                        },
                        "is_buy": {
                            "type": "boolean",
                            "description": "Buy or sell",
                            "required": true
                        },
                        "sz": {
                            "type": "number",
                            "description": "Size",
                            "required": true
                        },
                        "limit_px": {
                            "type": "number",
                            "description": "Limit price",
                            "required": true
                        },
                        "tif": {
                            "type": "string",
                            "description": "Time in force (Gtc, Ioc, Alo)",
                            "required": false
                        },
                        "reduce_only": {
                            "type": "boolean",
                            "description": "Reduce only",
                            "required": false
                        },
                        "vaultAddress": {
                            "type": "string",
                            "description": "Vault address",
                            "required": false
                        },
                        "is_limit": {
                            "type": "boolean",
                            "description": "Is limit order",
                            "required": false
                        },
                        "trigger_px": {
                            "type": "number",
                            "description": "Trigger price",
                            "required": false
                        },
                        "is_market": {
                            "type": "boolean",
                            "description": "Is market order",
                            "required": false
                        },
                        "tpsl": {
                            "type": "string",
                            "description": "Take profit or stop loss (tp, sl)",
                            "required": false
                        }
                    },
                    "required": ["coin", "is_buy", "sz", "limit_px"]
                }
            },
            {
                "name": "cancel_order",
                "description": "Cancel an existing order",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "coin": {
                            "type": "string",
                            "description": "Coin symbol",
                            "required": true
                        },
                        "o": {
                            "type": "number",
                            "description": "Order ID",
                            "required": true
                        }
                    },
                    "required": ["coin", "o"]
                }
            },
            {
                "name": "transfer_spot_perp",
                "description": "Transfer between spot and perpetual accounts",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": {
                            "type": "number",
                            "description": "Amount to transfer",
                            "required": true
                        },
                        "to_perp": {
                            "type": "boolean",
                            "description": "Transfer to perp (true) or spot (false)",
                            "required": true
                        }
                    },
                    "required": ["amount", "to_perp"]
                }
            }
        ]
    },
    {
        "name": "crypto-sentiment-mcp",
        "description": "Crypto Sentiment MCP Server - provides cryptocurrency sentiment analysis to AI agents, leveraging Santiment's aggregated social media and news data to track market mood and detect emerging trends (LOCAL BUILD)",
        "command": "/home/ubuntu/.local/bin/uv",
        "args": ["--directory", "/home/ubuntu/mcp-tools/crypto-sentiment-mcp", "run", "main.py"],
        "env": {
            SANTIMENT_API_KEY: process.env.SANTIMENT_API_KEY || ''
        },
        "connected": false,
        "category": "Market Data",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-sentiment.png",
        "githubUrl": "https://github.com/kukapay/crypto-sentiment-mcp",
        "authRequired": true,
        "authParams": {
            SANTIMENT_API_KEY: "SANTIMENT_API_KEY"
        },
        "predefinedTools": [
            {
                "name": "get_sentiment_balance",
                "description": "Get the average sentiment balance for an asset over a specified period",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "asset": {
                            "type": "string",
                            "description": "The cryptocurrency asset (e.g., bitcoin)",
                            "required": true
                        },
                        "days": {
                            "type": "integer",
                            "description": "Number of days for the period",
                            "required": true,
                            "default": 7
                        }
                    },
                    "required": ["asset", "days"]
                }
            },
            {
                "name": "get_social_volume",
                "description": "Fetch the total number of social media mentions for an asset",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "asset": {
                            "type": "string",
                            "description": "The cryptocurrency asset (e.g., bitcoin)",
                            "required": true
                        },
                        "days": {
                            "type": "integer",
                            "description": "Number of days for the period",
                            "required": true,
                            "default": 7
                        }
                    },
                    "required": ["asset", "days"]
                }
            },
            {
                "name": "alert_social_shift",
                "description": "Detect significant spikes or drops in social volume compared to the previous average",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "asset": {
                            "type": "string",
                            "description": "The cryptocurrency asset (e.g., bitcoin)",
                            "required": true
                        },
                        "threshold": {
                            "type": "number",
                            "description": "Percentage threshold for shift detection",
                            "required": true,
                            "default": 50.0
                        },
                        "days": {
                            "type": "integer",
                            "description": "Number of days for the period",
                            "required": true,
                            "default": 7
                        }
                    },
                    "required": ["asset", "threshold", "days"]
                }
            },
            {
                "name": "get_trending_words",
                "description": "Retrieve the top trending words in crypto discussions, ranked by score over a period",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "integer",
                            "description": "Number of days for the period",
                            "required": false,
                            "default": 7
                        },
                        "top_n": {
                            "type": "integer",
                            "description": "Number of top words to return",
                            "required": false,
                            "default": 5
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "get_social_dominance",
                "description": "Measure the percentage of crypto media discussions dominated by an asset",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "asset": {
                            "type": "string",
                            "description": "The cryptocurrency asset (e.g., bitcoin)",
                            "required": true
                        },
                        "days": {
                            "type": "integer",
                            "description": "Number of days for the period",
                            "required": false,
                            "default": 7
                        }
                    },
                    "required": ["asset"]
                }
            }
        ]
    },
    {
        "name": "crypto-indicators-mcp",
        "description": "Crypto Indicators MCP Server - provides a range of cryptocurrency technical analysis indicators and strategies, empowering AI trading agents to efficiently analyze market trends and develop robust quantitative strategies (LOCAL BUILD)",
        "command": "node",
        "args": ["/home/ubuntu/mcp-tools/crypto-indicators-mcp/index.js"],
        "env": {
            "EXCHANGE_NAME": "binance"
        },
        "connected": false,
        "category": "Trading",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-crypto-indicators.png",
        "githubUrl": "https://github.com/kukapay/crypto-indicators-mcp",
        "authRequired": false,
        "authParams": {},
        "predefinedTools": [
            {
                "name": "calculate_absolute_price_oscillator",
                "description": "Measures the difference between two EMAs to identify trend strength (APO)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": true,
                            "default": "1d"
                        },
                        "fast_period": {
                            "type": "number",
                            "description": "Fast EMA period",
                            "required": true,
                            "default": 12
                        },
                        "slow_period": {
                            "type": "number",
                            "description": "Slow EMA period",
                            "required": true,
                            "default": 26
                        }
                    },
                    "required": ["symbol", "timeframe", "fast_period", "slow_period"]
                }
            },
            {
                "name": "calculate_aroon",
                "description": "Identifies trend changes and strength using high/low price extremes (Aroon)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "period": {
                            "type": "number",
                            "description": "Lookback period",
                            "required": false,
                            "default": 14
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_balance_of_power",
                "description": "Gauges buying vs. selling pressure based on price movement (BOP)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_commodity_channel_index",
                "description": "Detects overbought/oversold conditions and trend reversals (CCI)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "period": {
                            "type": "number",
                            "description": "Period for calculation",
                            "required": false,
                            "default": 20
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_moving_average_convergence_divergence",
                "description": "Tracks momentum and trend direction via EMA differences (MACD)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "fast_period": {
                            "type": "number",
                            "description": "Fast EMA period",
                            "required": false,
                            "default": 12
                        },
                        "slow_period": {
                            "type": "number",
                            "description": "Slow EMA period",
                            "required": false,
                            "default": 26
                        },
                        "signal_period": {
                            "type": "number",
                            "description": "Signal line period",
                            "required": false,
                            "default": 9
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_relative_strength_index",
                "description": "Identifies overbought/oversold conditions via momentum (RSI)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "period": {
                            "type": "number",
                            "description": "RSI period",
                            "required": false,
                            "default": 14
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_stochastic_oscillator",
                "description": "Compares closing prices to ranges for momentum signals (STOCH)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "k_period": {
                            "type": "number",
                            "description": "%K period",
                            "required": false,
                            "default": 14
                        },
                        "d_period": {
                            "type": "number",
                            "description": "%D period",
                            "required": false,
                            "default": 3
                        }
                    },
                    "required": ["symbol"]
                }
            },
            {
                "name": "calculate_awesome_oscillator",
                "description": "Measures market momentum using midline crossovers (AO)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "Cryptocurrency symbol (e.g., BTCUSDT)",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Timeframe (e.g., 1d)",
                            "required": false,
                            "default": "1d"
                        },
                        "fast_period": {
                            "type": "number",
                            "description": "Fast period",
                            "required": false,
                            "default": 5
                        },
                        "slow_period": {
                            "type": "number",
                            "description": "Slow period",
                            "required": false,
                            "default": 34
                        }
                    },
                    "required": ["symbol"]
                }
            }
        ]
    },
    {
        "name": "polymarket-mcp",
        "description": "PolyMarket MCP Server - provides access to prediction market data through the PolyMarket API, implementing a standardized interface for retrieving market information, prices, and historical data from prediction markets (LOCAL BUILD)",
        "command": "/home/ubuntu/.local/bin/uv",
        "args": ["--directory", "/home/ubuntu/mcp-tools/polymarket-mcp", "run", "src/polymarket_mcp/server.py"],
        "env": {},
        "connected": false,
        "category": "Trading",
        "imageUrl": "https://mcp-server-tool-logo.s3.ap-northeast-1.amazonaws.com/mcp-server-polymarket.png",
        "githubUrl": "https://github.com/berlinbra/polymarket-mcp",
        "authRequired": true,
        "authParams": {
            "Key": "your_api_key_here",
            "Funder": "poly market wallet address"
        },        
        "predefinedTools": [
            {
                "name": "get_market_info",
                "description": "Get detailed information about a specific prediction market",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "market_id": {
                            "type": "string",
                            "description": "Market ID or slug",
                            "required": true
                        }
                    },
                    "required": ["market_id"]
                }
            },
            {
                "name": "list_markets",
                "description": "List available prediction markets with filtering options",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by market status",
                            "enum": ["open", "closed", "resolved"],
                            "required": true
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Number of markets to return",
                            "default": 10,
                            "minimum": 1,
                            "maximum": 100,
                            "required": true
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Number of markets to skip (for pagination)",
                            "default": 0,
                            "minimum": 0,
                            "required": true
                        }
                    },
                    "required": ["status", "limit", "offset"]
                }
            },
            {
                "name": "get_market_prices",
                "description": "Get current prices and trading information",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "market_id": {
                            "type": "string",
                            "description": "Market ID or slug",
                            "required": true
                        }
                    },
                    "required": ["market_id"]
                }
            },
            {
                "name": "get_market_history",
                "description": "Get historical price and volume data",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "market_id": {
                            "type": "string",
                            "description": "Market ID or slug",
                            "required": true
                        },
                        "timeframe": {
                            "type": "string",
                            "description": "Time period for historical data",
                            "enum": ["1d", "7d", "30d", "all"],
                            "default": "7d",
                            "required": false
                        }
                    },
                    "required": ["market_id"]
                }
            }
        ]
    }

];

export const mcpNameMapping: Record<string, string> = {
    'x-mcp-server': 'x-mcp',
    'github-mcp-server': 'github-mcp',
    'playwright-mcp-server': 'playwright',
    'cook-mcp-server': 'cook-mcp',
    'dexscreener-mcp-server': 'dexscreener-mcp',
    'mcp-coingecko-server': 'coingecko-mcp',
    'pumpfun-mcp-server': 'pumpfun-mcp',
    'uniswap-trader-mcp': 'uniswap-mcp',
    'playwright-mcp-service': 'playwright',
    'coingecko-server': 'coingecko-mcp',
    'coingecko-mcp-service': 'coingecko-mcp',
    'evm-mcp-server': 'evm-mcp',
    'evm-mcp-service': 'evm-mcp',
    'dune-mcp-server': 'dune-mcp',
    'binance-mcp-server': 'binance-mcp',
    'base-mcp-server': 'base-mcp',
    'coinmarketcap-mcp-service': 'coinmarketcap-mcp',
    'coinmarketcap_mcp_service': 'coinmarketcap-mcp',
    'defillama-mcp-service': 'mcp-server-defillama',
    'chainlink-feeds-mcp-service': 'chainlink-feeds-mcp',
    'rug-check-mcp-service': 'rugcheck-mcp',
    'crypto-feargreed-mcp-service': 'crypto-feargreed-mcp',
    'whale-tracker-mcp-service': 'whale-tracker-mcp',
    'discord-mcp-service': 'mcp-discord',
    'telegram-mcp-service': 'mcp-telegram',
    'twitter-client-mcp-service': 'twitter-client-mcp',
    'notion-mcp-service': 'notion-mcp-server',
    '12306-mcp-service': '12306-mcp'
};

/**
 * 获取预定义的MCP服务
 * @param name MCP名称
 * @returns MCP服务配置
 */
export function getPredefinedMCP(name: string): MCPService | undefined {
    // 使用全局映射进行标准化
    const normalizedName = mcpNameMapping[name] || name;
    
    // 从预定义列表中查找
    return predefinedMCPs.find(mcp => mcp.name === normalizedName);
}

/**
 * 获取所有预定义的MCP服务
 * @returns MCP服务配置列表
 */
export function getAllPredefinedMCPs(): MCPService[] {
    return [...predefinedMCPs];
}

/**
 * 根据类别获取MCP服务
 * @param category 类别名称
 * @returns 该类别的MCP服务列表
 */
export function getMCPsByCategory(category: string): MCPService[] {
    return predefinedMCPs.filter(mcp => mcp.category === category);
}

/**
 * 获取所有MCP类别
 * @returns 所有类别名称列表
 */
export function getAllMCPCategories(): string[] {
    const categories = new Set(predefinedMCPs.map(mcp => mcp.category).filter(category => category !== undefined));
    return Array.from(categories);
} 