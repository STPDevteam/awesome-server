#!/usr/bin/env node
/**
 * DeFiLlama MCP Memory Debug Test
 * 专门用于重现和调试DeFiLlama MCP工具调用内存泄漏问题
 */

const https = require('https');
const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3001';
const TEST_USER_ID = 'memory-debug-user';

// 测试用户认证令牌
let TEST_TOKEN = null;

// 日志工具
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`),
  memory: (msg) => console.log(`🧠 ${msg}`),
  step: (msg) => console.log(`📝 ${msg}`)
};

// 内存监控工具
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: (usage.rss / 1024 / 1024).toFixed(2),
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
    external: (usage.external / 1024 / 1024).toFixed(2)
  };
}

function logMemoryUsage(label) {
  const mem = getMemoryUsage();
  log.memory(`${label}:`);
  log.memory(`  RSS: ${mem.rss} MB`);
  log.memory(`  Heap Used: ${mem.heapUsed} MB`);
  log.memory(`  Heap Total: ${mem.heapTotal} MB`);
  log.memory(`  External: ${mem.external} MB`);
}

// 强制垃圾回收
function forceGC() {
  if (global.gc) {
    log.debug('Forcing garbage collection...');
    global.gc();
    return true;
  } else {
    log.warning('Garbage collection not available (start with --expose-gc)');
    return false;
  }
}

// 用户认证
async function authenticateUser() {
  try {
    log.step('开始用户认证...');
    
    const response = await axios.post(`${BASE_URL}/api/auth/wallet-login-init`, {
      address: '0x742d35Cc67C4f82f1234aBCDEF1234567890abcD'
    });

    if (response.data.success) {
      TEST_TOKEN = response.data.tempToken;
      log.success(`用户认证成功，获得临时令牌: ${TEST_TOKEN.substring(0, 20)}...`);
      return true;
    } else {
      log.error(`用户认证失败: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log.error(`用户认证异常: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// 创建测试任务
async function createTestTask() {
  try {
    log.step('创建DeFiLlama测试任务...');
    logMemoryUsage('创建任务前内存状态');
    
    const taskContent = "Get protocol TVL for Uniswap using DeFiLlama";
    
    const response = await axios.post(`${BASE_URL}/api/task`, {
      userId: TEST_USER_ID,
      title: 'DeFiLlama Memory Debug Test',
      content: taskContent
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      const taskId = response.data.task.id;
      log.success(`任务创建成功: ${taskId}`);
      logMemoryUsage('创建任务后内存状态');
      return taskId;
    } else {
      log.error(`任务创建失败: ${response.data.message}`);
      return null;
    }
  } catch (error) {
    log.error(`任务创建异常: ${error.response?.data?.message || error.message}`);
    logMemoryUsage('任务创建异常时内存状态');
    return null;
  }
}

// 分析任务（获取工作流）
async function analyzeTask(taskId) {
  return new Promise((resolve, reject) => {
    try {
      log.step(`开始分析任务: ${taskId}`);
      logMemoryUsage('任务分析前内存状态');
      
      const startTime = Date.now();
      
      axios.post(`${BASE_URL}/api/task/${taskId}/analyze`, {}, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }).then(async (res) => {
        log.debug(`分析API调用成功，开始处理流式响应...`);
        
        let buffer = '';
        let hasAnalysisComplete = false;
        let finalResult = {
          success: false,
          mcpWorkflow: null,
          metadata: null
        };
        
        res.data.on('data', (chunk) => {
          buffer += chunk.toString();
          
          // 处理完整的行
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整的行
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              
              // 检查是否是结束标记
              if (dataStr.trim() === '[DONE]') {
                hasAnalysisComplete = true;
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                log.debug(`流式分析数据: ${JSON.stringify(data, null, 2)}`);
                
                // 处理不同的事件类型
                switch (data.event) {
                  case 'analysis_start':
                    log.info(`开始分析任务: ${data.data.taskId}`);
                    break;
                    
                  case 'status_update':
                    log.info(`状态更新: ${data.data.status}`);
                    break;
                    
                  case 'step_start':
                    log.info(`开始步骤 ${data.data.stepNumber}/${data.data.totalSteps}: ${data.data.stepName}`);
                    break;
                    
                  case 'step_complete':
                    log.success(`步骤完成 - ${data.data.stepType}`);
                    if (data.data.mcps && data.data.mcps.length > 0) {
                      log.info(`推荐的MCP工具: ${data.data.mcps.map(mcp => mcp.name).join(', ')}`);
                    }
                    break;
                    
                  case 'analysis_complete':
                    log.success(`分析完成`);
                    finalResult.success = true;
                    finalResult.mcpWorkflow = data.data.mcpWorkflow;
                    finalResult.metadata = data.data.metadata;
                    hasAnalysisComplete = true;
                    break;
                    
                  case 'error':
                    log.error(`分析错误: ${data.data.message}`);
                    break;
                }
              } catch (parseError) {
                log.warning(`解析流式数据失败: ${parseError.message}, 原始数据: ${dataStr}`);
              }
            }
          }
        });
        
        res.data.on('end', () => {
          const duration = Date.now() - startTime;
          log.info(`任务分析流结束，耗时: ${duration}ms`);
          logMemoryUsage('任务分析完成后内存状态');
          resolve(finalResult);
        });
        
        res.data.on('error', (error) => {
          log.error(`任务分析流异常: ${error.message}`);
          logMemoryUsage('任务分析异常时内存状态');
          reject(error);
        });
        
        // 超时处理
        setTimeout(() => {
          if (!hasAnalysisComplete) {
            log.warning('任务分析超时 (60秒)');
            logMemoryUsage('任务分析超时时内存状态');
            reject(new Error('Analysis timeout'));
          }
        }, 60000);
        
      }).catch(error => {
        log.error(`任务分析请求失败: ${error.response?.data?.message || error.message}`);
        logMemoryUsage('任务分析请求失败时内存状态');
        reject(error);
      });
      
    } catch (error) {
      log.error(`任务分析异常: ${error.message}`);
      logMemoryUsage('任务分析异常时内存状态');
      reject(error);
    }
  });
}

// 执行任务（重现内存问题）
async function executeTask(taskId) {
  return new Promise((resolve, reject) => {
    try {
      log.step(`开始执行任务: ${taskId}`);
      logMemoryUsage('任务执行前内存状态');
      
      const startTime = Date.now();
      let memorySnapshots = [];
      
      // 定期记录内存使用情况
      const memoryMonitor = setInterval(() => {
        const mem = getMemoryUsage();
        memorySnapshots.push({
          timestamp: Date.now() - startTime,
          memory: mem
        });
        log.memory(`执行中内存监控 (${memorySnapshots.length}): Heap Used ${mem.heapUsed} MB`);
      }, 5000); // 每5秒记录一次
      
      axios.post(`${BASE_URL}/api/task/${taskId}/execute`, {}, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }).then(async (res) => {
        log.debug(`执行API调用成功，开始处理流式响应...`);
        
        let buffer = '';
        let hasWorkflowComplete = false;
        let hasError = false;
        let finalResult = {
          success: false,
          steps: [],
          errors: []
        };
        
        res.data.on('data', (chunk) => {
          const chunkSize = chunk.length;
          log.debug(`接收数据块: ${chunkSize} bytes`);
          
          buffer += chunk.toString();
          
          // 处理完整的行
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整的行
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              
              // 检查是否是结束标记
              if (dataStr.trim() === '[DONE]') {
                hasWorkflowComplete = true;
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                log.debug(`执行流式数据: ${JSON.stringify(data, null, 2)}`);
                
                // 处理不同的事件类型
                switch (data.event) {
                  case 'execution_start':
                    log.info(`开始执行任务: ${data.data.taskId}`);
                    break;
                    
                  case 'step_start':
                    log.info(`开始执行步骤 ${data.data.step}: ${data.data.mcpName} - ${data.data.actionName}`);
                    logMemoryUsage(`步骤${data.data.step}开始前内存`);
                    break;
                    
                  case 'step_complete':
                    log.success(`步骤 ${data.data.step} 执行成功`);
                    logMemoryUsage(`步骤${data.data.step}完成后内存`);
                    finalResult.steps.push({
                      step: data.data.step,
                      success: true,
                      result: data.data.result
                    });
                    break;
                    
                  case 'step_error':
                    log.error(`步骤 ${data.data.step} 执行失败: ${data.data.error}`);
                    logMemoryUsage(`步骤${data.data.step}错误时内存`);
                    finalResult.steps.push({
                      step: data.data.step,
                      success: false,
                      error: data.data.error
                    });
                    finalResult.errors.push(data.data.error);
                    hasError = true;
                    break;
                    
                  case 'task_complete':
                    log.success(`任务执行完成: ${data.data.taskId}`);
                    finalResult.success = data.data.success;
                    hasWorkflowComplete = true;
                    break;
                    
                  case 'error':
                    log.error(`执行错误: ${data.data.message}`);
                    if (data.data.details) {
                      log.error(`错误详情: ${data.data.details}`);
                    }
                    finalResult.errors.push(data.data.message);
                    hasError = true;
                    break;
                    
                  case 'final_result':
                    log.info('收到最终结果');
                    logMemoryUsage('收到最终结果时内存');
                    break;
                }
              } catch (parseError) {
                log.warning(`解析执行流数据失败: ${parseError.message}, 原始数据: ${dataStr.substring(0, 200)}...`);
              }
            }
          }
        });
        
        res.data.on('end', () => {
          clearInterval(memoryMonitor);
          const duration = Date.now() - startTime;
          log.info(`任务执行流结束，耗时: ${duration}ms`);
          logMemoryUsage('任务执行完成后内存状态');
          
          // 显示内存使用趋势
          log.memory('内存使用趋势:');
          memorySnapshots.forEach((snapshot, index) => {
            log.memory(`  ${snapshot.timestamp}ms: Heap Used ${snapshot.memory.heapUsed} MB`);
          });
          
          resolve(finalResult);
        });
        
        res.data.on('error', (error) => {
          clearInterval(memoryMonitor);
          log.error(`任务执行流异常: ${error.message}`);
          logMemoryUsage('任务执行异常时内存状态');
          reject(error);
        });
        
        // 超时处理
        setTimeout(() => {
          if (!hasWorkflowComplete) {
            clearInterval(memoryMonitor);
            log.warning('任务执行超时 (120秒)');
            logMemoryUsage('任务执行超时时内存状态');
            reject(new Error('Execution timeout'));
          }
        }, 120000);
        
      }).catch(error => {
        clearInterval(memoryMonitor);
        log.error(`任务执行请求失败: ${error.response?.data?.message || error.message}`);
        logMemoryUsage('任务执行请求失败时内存状态');
        reject(error);
      });
      
    } catch (error) {
      log.error(`任务执行异常: ${error.message}`);
      logMemoryUsage('任务执行异常时内存状态');
      reject(error);
    }
  });
}

// 主测试函数
async function runMemoryDebugTest() {
  try {
    console.log('\n🧠======= DeFiLlama MCP Memory Debug Test =======🧠\n');
    
    logMemoryUsage('测试开始前内存状态');
    
    // 1. 用户认证
    const authSuccess = await authenticateUser();
    if (!authSuccess) {
      throw new Error('用户认证失败');
    }
    
    // 2. 创建测试任务
    const taskId = await createTestTask();
    if (!taskId) {
      throw new Error('任务创建失败');
    }
    
    // 强制垃圾回收
    forceGC();
    logMemoryUsage('任务创建后垃圾回收内存状态');
    
    // 3. 分析任务
    log.step('开始任务分析阶段...');
    const analysisResult = await analyzeTask(taskId);
    
    if (!analysisResult.success) {
      throw new Error('任务分析失败');
    }
    
    log.success('任务分析成功');
    log.info(`工作流: ${JSON.stringify(analysisResult.mcpWorkflow, null, 2)}`);
    
    // 强制垃圾回收
    forceGC();
    logMemoryUsage('任务分析后垃圾回收内存状态');
    
    // 4. 执行任务（这里可能出现内存问题）
    log.step('开始任务执行阶段（监控内存使用）...');
    const executionResult = await executeTask(taskId);
    
    log.info(`执行结果: ${JSON.stringify(executionResult, null, 2)}`);
    
    // 强制垃圾回收
    forceGC();
    logMemoryUsage('任务执行后垃圾回收内存状态');
    
    // 5. 测试结果
    if (executionResult.success) {
      log.success('✅ 任务执行成功，未发现严重内存问题');
    } else {
      log.warning('⚠️ 任务执行有问题，请检查日志');
      if (executionResult.errors.length > 0) {
        log.error(`错误列表:`);
        executionResult.errors.forEach((error, index) => {
          log.error(`  ${index + 1}. ${error}`);
        });
      }
    }
    
  } catch (error) {
    log.error(`测试失败: ${error.message}`);
    logMemoryUsage('测试失败时内存状态');
    
    if (error.stack) {
      log.debug(`错误堆栈: ${error.stack}`);
    }
  } finally {
    logMemoryUsage('测试结束时内存状态');
    console.log('\n🏁======= Memory Debug Test Complete =======🏁\n');
  }
}

// 启动测试
if (require.main === module) {
  // 启用详细的Node.js调试信息
  process.env.NODE_DEBUG = 'http,https,net,stream';
  
  log.info('启动DeFiLlama MCP内存调试测试...');
  log.info('提示: 使用 --expose-gc 参数启动Node.js以启用垃圾回收监控');
  
  runMemoryDebugTest().catch((error) => {
    log.error(`测试异常: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runMemoryDebugTest,
  authenticateUser,
  createTestTask,
  analyzeTask,
  executeTask
}; 