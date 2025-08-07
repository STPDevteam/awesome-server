
---

# MCP-LangChain: Intelligent Task Orchestration System

**MCP-LangChain** is an intelligent backend orchestration engine built on top of the **Model Context Protocol (MCP)** and **LangChain**. It enables natural language task parsing, dynamic tool selection, and streaming task execution in a modular, scalable way.

---

## 🚀 Core Features

* 🔐 **Wallet Login** — Supports EIP-4361 standard ("Sign-In with Ethereum") for secure Web3 authentication
* 🤖 **AI Chat Integration** — Seamlessly integrates OpenAI GPT models
* 🔧 **MCP Integration** — Executes tools via standardized MCP workflows
* ⚡ **Enhanced Task Engine** — Intelligent retries, parameter inference, dual-format result handling 🆕
* 🎯 **Intelligent Agents** — Dedicated agent dialogues and task execution logic
* 🌍 **Multilingual Support** — Auto language detection with support for 11+ languages 🆕
* 👤 **User Management** — Profile, avatar, balance, and subscription state
* 🛡️ **Security System** — JWT-based authentication, rate-limiting, and signature validation
* 📱 **Pluggable Login Methods** — Placeholder for Google, GitHub, and other login options
* 💳 **Crypto Payments** — USDT/USDC payments via Coinbase Commerce
* 👑 **Membership System** — Plus/Pro tier management via backend APIs

---

## 🧑‍💻 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/mcp-server.git
cd mcp-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
# Then edit `.env` to set:
# - OPENAI_API_KEY
# - DB_PASSWORD
# - JWT_ACCESS_SECRET
# - JWT_REFRESH_SECRET
```

> For detailed environment configurations, see [docs/ENVIRONMENT\_SETUP.md](./docs/ENVIRONMENT_SETUP.md)

---

### 4. Start Development Server

```bash
npm run dev
```

Open your browser at [http://localhost:3001](http://localhost:3001)

---

## 🧩 System Architecture

MCP-LangChain adopts a layered architecture:

```
Client
  ↓
API Layer           -> Express + RESTful routes
Business Logic      -> Task parsing, tool selection, execution control
AI Engine Layer     -> LangChain + OpenAI for task reasoning
MCP Tool Layer      -> Dynamic invocation of MCP tools
Persistence Layer   -> PostgreSQL via Prisma
Infrastructure      -> Logging, SSE streaming, rate limiting
```

---

## 🌀 Task Execution Flow

1. **Task Creation** – User submits task input
2. **Task Analysis** – LangChain parses task intent and parameters
3. **Workflow Planning** – Optimal MCP tools are selected and ordered
4. **Tool Authorization** – User signs in or provides auth for MCP tools
5. **Streamed Execution** – Tasks are executed sequentially with SSE updates
6. **Result Presentation** – Final result formatted and returned to frontend

---

## 📡 Key API Endpoints

### 🔐 Auth APIs

| Method | Endpoint                 | Description             |
| ------ | ------------------------ | ----------------------- |
| POST   | `/api/auth/register`     | Register a new user     |
| POST   | `/api/auth/login`        | Email/password login    |
| POST   | `/api/auth/wallet/login` | Wallet (EIP-4361) login |
| POST   | `/api/auth/refresh`      | Refresh access token    |

### 📋 Task APIs

| Method | Endpoint                                   |
| ------ | ------------------------------------------ |
| POST   | `/api/task` — Create a new task            |
| GET    | `/api/task` — List all tasks for user      |
| GET    | `/api/task/:id` — Get specific task detail |
| POST   | `/api/task/title` — Generate task title    |

### ⚙️ Execution APIs

| POST | `/api/task/:id/analyze/stream` — Streamed task parsing   |
| ---- | -------------------------------------------------------- |
| POST | `/api/task/:id/execute/stream` — Streamed tool execution |

### 🔐 MCP Auth APIs

| Endpoint                                      | Purpose                       |
| --------------------------------------------- | ----------------------------- |
| `POST /api/task/:id/verify-auth`              | Verify auth info for MCP tool |
| `GET /api/task/:id/mcp-alternatives/:mcpName` | Fetch alternative tools       |
| `POST /api/task/:id/replace-mcp`              | Replace tool in workflow      |

### 💳 Payment & Membership

| Method | Endpoint                                                    |
| ------ | ----------------------------------------------------------- |
| GET    | `/api/payment/pricing` — Get subscription plans             |
| POST   | `/api/payment/create-payment` — Create payment order        |
| GET    | `/api/payment/payment/:id` — Check payment status           |
| GET    | `/api/payment/payments` — Fetch payment history             |
| GET    | `/api/payment/membership-status` — Current membership tier  |
| DELETE | `/api/payment/membership` — Cancel membership               |
| POST   | `/api/payment/webhooks/coinbase` — Coinbase webhook handler |

---

## 📁 Project Structure

```
mcp-server/
├── src/                    # Main backend source code
├── deployment/             # Deployment configs (Docker etc.)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── deploy.sh
├── docs/                   # Technical documentation
├── examples/               # API usage examples
├── test/                   # Unit & integration tests
├── .env                    # Local environment configs
└── package.json
```

---

## 🧪 Local Testing (via `curl`)

```bash
# Create a task
curl -X POST "http://localhost:3001/api/task" \
  -H "Content-Type: application/json" \
  -d '{"content": "Analyze current market trends", "userId": "1"}'

# List user tasks
curl -X GET "http://localhost:3001/api/task?userId=1"

# Fetch task details
curl -X GET "http://localhost:3001/api/task/<TASK_ID>?userId=1"
```

---

## 🧑‍💼 Contributing

We welcome contributions! Please fork the repo, create a feature branch, and submit a pull request.

---

## 🪪 License

This project is licensed under the **MIT License**.

---

