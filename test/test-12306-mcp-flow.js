// 测试12306-mcp服务的完整查询流程
import { MCPManager } from '../dist/services/mcpManager.js';
import { logger } from '../dist/utils/logger.js';

async function test12306MCPFlow() {
  try {
    console.log('开始测试12306-mcp服务完整查询流程...');
    
    // 创建MCPManager实例
    const mcpManager = new MCPManager();
    
    // 连接12306-mcp服务
    console.log('连接12306-mcp服务...');
    try {
      await mcpManager.connect('12306-mcp', 'npx', ['-y', '12306-mcp']);
      console.log('12306-mcp服务连接成功！');
      
      // 第一步：获取当前日期
      console.log('\n步骤1: 获取当前日期');
      const dateResult = await mcpManager.callTool('12306-mcp', 'get-current-date', {});
      console.log('当前日期:', dateResult);
      const currentDate = dateResult.content[0].text;
      
      // 第二步：获取城市车站代码
      console.log('\n步骤2: 获取出发地和目的地的车站代码');
      const fromCityResult = await mcpManager.callTool('12306-mcp', 'get-station-code-of-citys', {
        citys: '北京'
      });
      console.log('北京车站代码:', fromCityResult);
      const fromStationCode = fromCityResult.content[0].data[0].station_code;
      
      const toCityResult = await mcpManager.callTool('12306-mcp', 'get-station-code-of-citys', {
        citys: '上海'
      });
      console.log('上海车站代码:', toCityResult);
      const toStationCode = toCityResult.content[0].data[0].station_code;
      
      // 第三步：查询余票信息
      console.log('\n步骤3: 查询余票信息');
      const ticketsResult = await mcpManager.callTool('12306-mcp', 'get-tickets', {
        date: currentDate,
        fromStation: fromStationCode,
        toStation: toStationCode
      });
      console.log('余票查询结果:', JSON.stringify(ticketsResult, null, 2));
      
      // 如果有车次信息，获取第一个车次的详细信息
      if (ticketsResult.content[0].data && ticketsResult.content[0].data.length > 0) {
        const firstTrain = ticketsResult.content[0].data[0];
        console.log('\n步骤4: 查询列车时刻表');
        
        const routeResult = await mcpManager.callTool('12306-mcp', 'get-train-route-stations', {
          trainNo: firstTrain.train_no,
          fromStationTelecode: firstTrain.from_station.telecode,
          toStationTelecode: firstTrain.to_station.telecode,
          departDate: currentDate
        });
        console.log('列车时刻表查询结果:', JSON.stringify(routeResult, null, 2));
      }
    } catch (error) {
      console.error(`执行过程中出错:`, error);
    }
    
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
test12306MCPFlow(); 