const { MCPAuthService } = require('../dist/services/mcpAuthService.js');

async function checkAuthStatus() {
  try {
    const mcpAuthService = new MCPAuthService();
    const auths = await mcpAuthService.getUserAllMCPAuths('test-user-001');
    console.log('用户 test-user-001 的认证状态:');
    console.log(JSON.stringify(auths, null, 2));
  } catch (error) {
    console.error('检查认证状态失败:', error);
  }
}

checkAuthStatus(); 