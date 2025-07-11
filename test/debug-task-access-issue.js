const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'debug-output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 问题中的具体ID
const TASK_ID = '3b6520dd-66e7-4fb1-a049-39d249efbe1a';
const USER_ID = 'user_1750336953793_2ao99rwhh';

// 保存调试结果
function saveDebugResult(filename, data) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`📝 调试结果已保存: ${filename}`);
}

// 调试任务访问权限问题
async function debugTaskAccessIssue() {
  console.log('🔍 调试任务访问权限问题...\n');
  console.log(`任务ID: ${TASK_ID}`);
  console.log(`用户ID: ${USER_ID}\n`);

  try {
    // 1. 尝试获取用户信息
    console.log('1️⃣ 检查用户信息...');
    try {
      const userResponse = await axios.get(`${BASE_URL}/api/auth/user/${USER_ID}`);
      console.log('✅ 用户存在');
      saveDebugResult('01-user-info.json', userResponse.data);
    } catch (error) {
      console.log('❌ 用户不存在或获取失败');
      if (error.response) {
        saveDebugResult('01-user-error.json', error.response.data);
      }
    }

    // 2. 尝试创建测试用户来获取访问令牌
    console.log('2️⃣ 创建测试用户获取访问令牌...');
    let accessToken;
    try {
      const createUserResponse = await axios.post(`${BASE_URL}/api/auth/create-user`, {
        userId: 'debug_user_temp',
        email: 'debug@test.com',
        name: 'Debug User'
      });
      accessToken = createUserResponse.data.data.accessToken;
      console.log('✅ 测试用户创建成功');
      saveDebugResult('02-test-user.json', createUserResponse.data);
    } catch (error) {
      console.log('❌ 测试用户创建失败');
      if (error.response) {
        saveDebugResult('02-test-user-error.json', error.response.data);
      }
      return;
    }

    // 3. 尝试获取任务信息（使用测试用户的令牌）
    console.log('3️⃣ 检查任务信息...');
    try {
      const taskResponse = await axios.get(`${BASE_URL}/api/task/${TASK_ID}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      console.log('✅ 任务存在');
      console.log(`任务标题: ${taskResponse.data.data.title}`);
      console.log(`任务状态: ${taskResponse.data.data.status}`);
      console.log(`任务用户ID: ${taskResponse.data.data.userId}`);
      console.log(`请求用户ID: ${USER_ID}`);
      
      if (taskResponse.data.data.userId !== USER_ID) {
        console.log('⚠️ 用户ID不匹配！这就是问题所在！');
        console.log(`任务属于用户: ${taskResponse.data.data.userId}`);
        console.log(`请求来自用户: ${USER_ID}`);
      }
      
      saveDebugResult('03-task-info.json', taskResponse.data);
    } catch (error) {
      console.log('❌ 任务不存在或获取失败');
      if (error.response) {
        console.log(`错误状态: ${error.response.status}`);
        console.log(`错误信息: ${error.response.data.message}`);
        saveDebugResult('03-task-error.json', error.response.data);
      }
    }

    // 4. 检查是否有该用户的任务列表
    console.log('4️⃣ 检查用户的任务列表...');
    try {
      const tasksResponse = await axios.get(`${BASE_URL}/api/task?userId=${USER_ID}&limit=10`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      console.log(`✅ 用户有 ${tasksResponse.data.data.tasks.length} 个任务`);
      
      if (tasksResponse.data.data.tasks.length > 0) {
        console.log('用户的任务列表:');
        tasksResponse.data.data.tasks.forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.id} - ${task.title} (状态: ${task.status})`);
        });
      }
      
      saveDebugResult('04-user-tasks.json', tasksResponse.data);
    } catch (error) {
      console.log('❌ 获取用户任务列表失败');
      if (error.response) {
        saveDebugResult('04-user-tasks-error.json', error.response.data);
      }
    }

    // 5. 检查最近的任务
    console.log('5️⃣ 检查最近的任务...');
    try {
      const recentTasksResponse = await axios.get(`${BASE_URL}/api/task?limit=20&sortBy=createdAt&sortOrder=desc`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      console.log(`✅ 找到 ${recentTasksResponse.data.data.tasks.length} 个最近任务`);
      
      // 查找目标任务
      const targetTask = recentTasksResponse.data.data.tasks.find(task => task.id === TASK_ID);
      if (targetTask) {
        console.log('🎯 在最近任务中找到目标任务！');
        console.log(`任务详情: ${targetTask.title} (用户: ${targetTask.userId}, 状态: ${targetTask.status})`);
      } else {
        console.log('❌ 在最近任务中未找到目标任务');
      }
      
      saveDebugResult('05-recent-tasks.json', recentTasksResponse.data);
    } catch (error) {
      console.log('❌ 获取最近任务失败');
      if (error.response) {
        saveDebugResult('05-recent-tasks-error.json', error.response.data);
      }
    }

    // 6. 直接查询数据库（如果有权限）
    console.log('6️⃣ 尝试直接数据库查询...');
    try {
      const dbQueryResponse = await axios.post(`${BASE_URL}/api/debug/query-task`, {
        taskId: TASK_ID,
        userId: USER_ID
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      console.log('✅ 数据库查询成功');
      saveDebugResult('06-db-query.json', dbQueryResponse.data);
    } catch (error) {
      console.log('❌ 数据库查询失败（可能没有调试接口）');
      if (error.response) {
        saveDebugResult('06-db-query-error.json', error.response.data);
      }
    }

    console.log('\n🎯 调试总结:');
    console.log('1. 检查用户是否存在');
    console.log('2. 检查任务是否存在');
    console.log('3. 检查任务的userId是否与请求用户匹配');
    console.log('4. 检查任务状态是否为completed');
    console.log('5. 查看调试输出文件了解详细信息');

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error.message);
    if (error.response) {
      console.error('错误响应:', error.response.data);
      saveDebugResult('debug-error.json', error.response.data);
    }
  }
}

// 运行调试
if (require.main === module) {
  debugTaskAccessIssue()
    .then(() => {
      console.log('\n🎯 调试完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 调试失败:', error);
      process.exit(1);
    });
}

module.exports = { debugTaskAccessIssue }; 