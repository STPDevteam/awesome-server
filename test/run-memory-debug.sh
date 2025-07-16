#!/bin/bash

echo "🧠 DeFiLlama MCP Memory Debug Test Runner"
echo "========================================"

# 检查是否在项目根目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# 检查服务器是否运行
echo "🔍 检查服务器状态..."
curl -s http://localhost:3001/health > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ 服务器未启动，请先启动服务器: npm start"
    exit 1
fi

echo "✅ 服务器运行正常"

# 切换到test目录
cd test

# 检查测试脚本是否存在
if [ ! -f "debug-defillama-memory.js" ]; then
    echo "❌ 测试脚本不存在: debug-defillama-memory.js"
    exit 1
fi

echo "🚀 启动内存调试测试..."
echo "📊 提示: 将启用垃圾回收监控 (--expose-gc)"
echo "📊 提示: 将启用详细的内存和数据调试日志"
echo ""

# 启动测试，启用垃圾回收和详细调试
node --expose-gc --max-old-space-size=4096 debug-defillama-memory.js

echo ""
echo "🏁 测试完成"
echo "📋 请检查上方的详细日志来分析内存使用情况"
echo "🔍 关键查看项目:"
echo "   - 🧠 Memory & Data Debug 部分的内存增量"
echo "   - 📊 JSON Result Processing Debug 的解析过程"
echo "   - ⚠️ POTENTIAL MEMORY LEAK DETECTED 警告"
echo "   - 🎯 MEMORY EFFICIENCY RATIO 效率比率" 