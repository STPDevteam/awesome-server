# 测试 X MCP Server 集成

## 问题解决方案

你遇到的问题已经解决。主要问题是前端没有使用 LangChain 后端，因此无法调用 MCP 工具。现在系统已经配置为默认使用 LangChain 后端。

## 测试步骤

1. **确保服务都在运行**
   - 后端服务：http://localhost:3001/health 应该返回 `{"status":"ok",...}`
   - 前端应用：http://localhost:5173
   - x-mcp-server 已连接（显示绿色 "Connected"）

2. **测试查看推文功能**
   - 在聊天中输入："帮我查看最新的推文"
   - 系统应该返回你的 Twitter timeline 中的最新 5 条推文

3. **测试发布推文功能**
   - 在聊天中输入："发布一条推文说：正在测试 MCP 集成！"
   - 系统应该返回发布成功的消息和推文 ID

## 重要注意事项

1. **确保使用 "User" 角色**：在发送消息时，确保选择的是 "User" 角色（这应该是默认选项）

2. **检查环境变量**：
   - 确保后端的 `.env` 文件包含有效的 `OPENAI_API_KEY`
   - 确保 x-mcp-server 配置了正确的 Twitter API 凭证

3. **查看日志**：
   - 如果功能不工作，查看后端控制台的日志信息
   - 浏览器开发者工具的 Network 标签可以看到 API 调用

## 系统工作原理

1. 用户发送消息（使用 User 角色）
2. 前端通过 LangChain API 发送到后端
3. 后端分析用户意图：
   - 如果包含"查看"+"推文"→ 调用 `get_home_timeline`
   - 如果包含"发布"+"推文"→ 调用 `create_tweet`
4. 后端调用 x-mcp-server 的相应工具
5. 返回格式化的结果给用户

## 如果还是不工作

1. 重启所有服务：
   ```bash
   # 停止所有服务
   # 重新启动后端
   cd backend-langchain-mcp
   npm run dev
   
   # 重新启动前端
   cd ..
   npm run dev
   ```

2. 清除浏览器缓存并刷新页面

3. 重新连接 x-mcp-server：
   - 打开 MCP Services
   - 如果已连接，先断开再重新连接
   - 确保输入正确的 Twitter API 凭证 