// 测试MCP替代服务
import { MCPAlternativeService } from './dist/services/mcpAlternativeService.js';

async function testMCPAlternative() {
  console.log('🧪 Testing MCP Alternative Service...\n');
  
  try {
    const service = new MCPAlternativeService();
    
    console.log('1️⃣ Testing coingecko-mcp alternatives...');
    const alternatives = await service.getAlternativeMCPs('coingecko-mcp', 'analyze Bitcoin price trends');
    
    console.log(`✅ Found ${alternatives.length} alternatives:`);
    alternatives.forEach((alt, index) => {
      console.log(`   ${index + 1}. ${alt.name} - ${alt.description}`);
    });
    
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMCPAlternative(); 