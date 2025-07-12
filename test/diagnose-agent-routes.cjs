const fs = require('fs');
const path = require('path');

console.log('🔍 Agent Routes Diagnostic Tool');
console.log('===============================\n');

// 1. 检查agent路由文件是否存在
console.log('1. 📁 Checking agent route files...');
const agentRouteFile = path.join(__dirname, '../src/routes/agent.ts');
if (fs.existsSync(agentRouteFile)) {
  const stats = fs.statSync(agentRouteFile);
  console.log(`   ✅ agent.ts exists (${stats.size} bytes, modified: ${stats.mtime})`);
} else {
  console.log('   ❌ agent.ts not found');
}

// 2. 检查编译后的文件
console.log('\n2. 🔨 Checking compiled files...');
const compiledAgentFile = path.join(__dirname, '../dist/routes/agent.js');
if (fs.existsSync(compiledAgentFile)) {
  const stats = fs.statSync(compiledAgentFile);
  console.log(`   ✅ Compiled agent.js exists (${stats.size} bytes, modified: ${stats.mtime})`);
} else {
  console.log('   ❌ Compiled agent.js not found');
}

// 3. 检查index.ts中的路由注册
console.log('\n3. 🔗 Checking route registration in index.ts...');
const indexFile = path.join(__dirname, '../src/index.ts');
if (fs.existsSync(indexFile)) {
  const indexContent = fs.readFileSync(indexFile, 'utf8');
  
  // 检查agent路由导入
  if (indexContent.includes('import agentRoutes from \'./routes/agent.js\'')) {
    console.log('   ✅ Agent routes import found');
  } else {
    console.log('   ❌ Agent routes import not found');
  }
  
  // 检查路由注册
  if (indexContent.includes('app.use(\'/api/agent\', agentRoutes)')) {
    console.log('   ✅ Agent routes registration found');
  } else {
    console.log('   ❌ Agent routes registration not found');
  }
} else {
  console.log('   ❌ index.ts not found');
}

// 4. 检查package.json脚本
console.log('\n4. 📦 Checking package.json scripts...');
const packageFile = path.join(__dirname, '../package.json');
if (fs.existsSync(packageFile)) {
  const packageContent = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  console.log('   Available scripts:');
  Object.keys(packageContent.scripts || {}).forEach(script => {
    console.log(`     - ${script}: ${packageContent.scripts[script]}`);
  });
} else {
  console.log('   ❌ package.json not found');
}

// 5. 检查TypeScript配置
console.log('\n5. ⚙️  Checking TypeScript configuration...');
const tsconfigFile = path.join(__dirname, '../tsconfig.json');
if (fs.existsSync(tsconfigFile)) {
  console.log('   ✅ tsconfig.json exists');
  try {
    const tsconfigContent = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'));
    console.log(`   Output directory: ${tsconfigContent.compilerOptions?.outDir || 'not specified'}`);
  } catch (e) {
    console.log('   ⚠️  Could not parse tsconfig.json');
  }
} else {
  console.log('   ❌ tsconfig.json not found');
}

// 6. 检查dist目录结构
console.log('\n6. 📂 Checking dist directory structure...');
const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  console.log('   ✅ dist directory exists');
  
  const distRoutes = path.join(distDir, 'routes');
  if (fs.existsSync(distRoutes)) {
    console.log('   ✅ dist/routes directory exists');
    
    const files = fs.readdirSync(distRoutes);
    console.log('   Route files in dist:');
    files.forEach(file => {
      const filePath = path.join(distRoutes, file);
      const stats = fs.statSync(filePath);
      console.log(`     - ${file} (${stats.size} bytes, ${stats.mtime})`);
    });
  } else {
    console.log('   ❌ dist/routes directory not found');
  }
} else {
  console.log('   ❌ dist directory not found');
}

// 7. 生成建议
console.log('\n7. 💡 Recommendations:');
console.log('   Based on the test results, here are the steps to fix the issue:');
console.log('   ');
console.log('   🔧 On the production server, run:');
console.log('   1. Check PM2 status: pm2 list');
console.log('   2. Check PM2 logs: pm2 logs mcp-server --lines 50');
console.log('   3. Rebuild the project: npm run build');
console.log('   4. Restart PM2: pm2 restart mcp-server');
console.log('   5. Check logs again: pm2 logs mcp-server --lines 20');
console.log('   ');
console.log('   🔍 Look for these errors in the logs:');
console.log('   - Import/export errors');
console.log('   - TypeScript compilation errors');
console.log('   - Route registration errors');
console.log('   - Missing dependencies');
console.log('   ');
console.log('   ⚠️  If the issue persists:');
console.log('   - Check if the agent.ts file exists on the server');
console.log('   - Verify the file has the correct content');
console.log('   - Check file permissions');
console.log('   - Try a clean rebuild: rm -rf dist && npm run build');

console.log('\n✅ Diagnostic complete!'); 