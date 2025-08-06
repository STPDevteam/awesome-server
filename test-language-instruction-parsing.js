#!/usr/bin/env node

/**
 * 语言指令解析功能测试
 * 测试系统是否能正确识别用户消息中的语言指令
 */

const { parseLanguageInstruction, resolveUserLanguageWithInstruction } = require('./src/utils/languageDetector.js');

async function testLanguageInstructionParsing() {
  console.log('🧪 语言指令解析测试开始...\n');

  const testCases = [
    // 中文语言指令
    {
      message: "请用英语帮我分析一下以太坊的价格走势",
      expected: "en",
      description: "中文消息中指定英语回复"
    },
    {
      message: "用韩语介绍一下比特币",
      expected: "ko", 
      description: "中文消息中指定韩语回复"
    },
    {
      message: "用日语回答：什么是区块链？",
      expected: "ja",
      description: "中文消息中指定日语回复"
    },
    
    // 英文语言指令
    {
      message: "Please answer in Chinese: What is the current Bitcoin price?",
      expected: "zh",
      description: "英文消息中指定中文回复"
    },
    {
      message: "Reply in Korean about Ethereum",
      expected: "ko",
      description: "英文消息中指定韩语回复"
    },
    {
      message: "Can you explain blockchain in Japanese?",
      expected: "ja",
      description: "英文消息中指定日语解释"
    },
    
    // 韩文语言指令
    {
      message: "한국어로 답변해주세요: 이더리움의 현재 상황은?",
      expected: "ko",
      description: "韩文消息中指定韩语回复"
    },
    {
      message: "영어로 대답해주세요",
      expected: "en", 
      description: "韩文消息中指定英语回复"
    },
    
    // 日文语言指令
    {
      message: "日本語で答えてください：ビットコインとは何ですか？",
      expected: "ja",
      description: "日文消息中指定日语回复"
    },
    {
      message: "英語で説明してください",
      expected: "en",
      description: "日文消息中指定英语回复"
    },
    
    // 其他语言指令
    {
      message: "Répondez en français s'il vous plaît",
      expected: "fr",
      description: "法语语言指令"
    },
    {
      message: "Responda en español por favor",
      expected: "es", 
      description: "西班牙语语言指令"
    },
    
    // 无语言指令的情况
    {
      message: "What is the current price of Bitcoin?",
      expected: null,
      description: "纯英文询问（无语言指令）"
    },
    {
      message: "比特币现在多少钱？",
      expected: null,
      description: "纯中文询问（无语言指令）"
    },
    {
      message: "비트코인 가격이 얼마예요?",
      expected: null,
      description: "纯韩文询问（无语言指令）"
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    try {
      console.log(`📝 测试 ${i + 1}/${totalTests}: ${testCase.description}`);
      console.log(`   消息: "${testCase.message}"`);
      console.log(`   期望: ${testCase.expected || 'null'}`);
      
      const result = await parseLanguageInstruction(testCase.message);
      console.log(`   结果: ${result || 'null'}`);
      
      const passed = result === testCase.expected;
      console.log(`   ${passed ? '✅ 通过' : '❌ 失败'}\n`);
      
      if (passed) {
        passedTests++;
      }
      
    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}\n`);
    }
  }

  console.log(`🎯 测试总结: ${passedTests}/${totalTests} 通过 (${Math.round(passedTests/totalTests*100)}%)`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！语言指令解析功能正常工作。');
  } else {
    console.log('⚠️  部分测试失败，需要进一步调试。');
  }
}

async function testEnhancedLanguageResolution() {
  console.log('\n\n🚀 增强版语言解析测试开始...\n');
  
  const testCases = [
    {
      message: "请用英语帮我查询以太坊价格",
      agentLang: "zh",
      expected: "en",
      description: "有语言指令的情况（应优先语言指令）"
    },
    {
      message: "查询比特币价格",
      agentLang: "zh", 
      expected: "zh",
      description: "无语言指令，使用检测到的输入语言"
    },
    {
      message: "What is Bitcoin?",
      agentLang: "zh",
      expected: "en", 
      description: "无语言指令，检测为英文"
    }
  ];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    
    try {
      console.log(`📝 测试 ${i + 1}/${testCases.length}: ${testCase.description}`);
      console.log(`   消息: "${testCase.message}"`);
      console.log(`   Agent语言: ${testCase.agentLang}`);
      console.log(`   期望: ${testCase.expected}`);
      
      const result = await resolveUserLanguageWithInstruction(
        testCase.message,
        testCase.agentLang
      );
      
      console.log(`   结果: ${result}`);
      console.log(`   ${result === testCase.expected ? '✅ 通过' : '❌ 失败'}\n`);
      
    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}\n`);
    }
  }
}

async function main() {
  try {
    await testLanguageInstructionParsing();
    await testEnhancedLanguageResolution();
  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 