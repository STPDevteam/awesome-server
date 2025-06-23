#!/bin/bash

# 启动Playwright MCP服务器，监听所有网络接口
npx -y @playwright/mcp@latest --host 0.0.0.0 --port 3030 