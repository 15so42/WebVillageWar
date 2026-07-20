const fs = require('fs');
let code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
code = code.replace(
  "'重塑水晶能量池结构，将其置于底角，展现为悬浮在法阵上的纯粹蓝色魔法水晶。'",
  "'重塑水晶能量池结构，将其置于底角，展现为悬浮在法阵上的纯粹蓝色魔法水晶。',\n      '深度重做军需铺界面、暂停菜单以及单位选中信息板，统一采用沉浸式羊皮纸与质感木纹中世纪视觉，拒绝简单的扁平换色。',\n      '修复了游戏通关结算与进入关卡时波次数读取失败（nodes.length undefined）导致游戏崩溃的严重 bug。'"
);
fs.writeFileSync('src/systems/MetaGameSystem.js', code);
console.log("Updated changelog");
