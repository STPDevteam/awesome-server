// 测试Markdown JSON解析修复
function testMarkdownJsonParsing() {
  console.log('🧪 Testing Markdown JSON parsing fix...');
  
  // 模拟LLM返回的Markdown包装JSON
  const mockMarkdownResponses = [
    // 情况1：标准的markdown代码块
    '```json\n{\n  "toolName": "defillama_get_protocol_tvl",\n  "inputParams": {\n    "protocol": "uniswap"\n  },\n  "reasoning": "Test"\n}\n```',
    
    // 情况2：工作流数组
    '```json\n[\n  {\n    "step": 1,\n    "mcp": "defillama-mcp",\n    "action": "Get TVL data",\n    "input": {\n      "protocol": "Uniswap"\n    }\n  }\n]\n```',
    
    // 情况3：没有换行的markdown
    '```json{"toolName": "test_tool", "inputParams": {"param": "value"}}```',
    
    // 情况4：包含额外文本的响应
    'Here is the JSON:\n```json\n{"result": "success"}\n```\nThat should work.',
    
    // 情况5：纯JSON（无markdown）
    '{"toolName": "direct_json", "inputParams": {"test": true}}'
  ];
  
  mockMarkdownResponses.forEach((response, index) => {
    console.log(`\n📝 Test Case ${index + 1}:`);
    console.log(`Input: ${response.substring(0, 50)}...`);
    
    try {
      // 应用我们的清理逻辑
      let cleanedText = response.trim();
      
      // 移除Markdown代码块标记
      cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // 尝试提取JSON对象或数组
      let jsonMatch;
      if (cleanedText.includes('[')) {
        jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
      } else {
        jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      }
      
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }
      
      const parsed = JSON.parse(cleanedText);
      console.log(`✅ Parsed successfully:`, JSON.stringify(parsed, null, 2));
      
    } catch (error) {
      console.log(`❌ Parse failed:`, error.message);
    }
  });
}

// 运行测试
testMarkdownJsonParsing();
console.log('\n✨ JSON parsing test completed!'); 