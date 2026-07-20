const fs = require('fs');
let code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
code = code.replace(
  "'重做主菜单系统：将主菜单与关卡选择页面替换为中世纪羊皮纸画卷风格，辅以经典的古典印刷字体渲染史诗氛围。',",
  "'重做主菜单系统：将主菜单替换为中世纪羊皮纸画卷风格。',\n      '深度重制战役选择界面：彻底抛弃网页布局，重新设计为一本置于深色木桌上的战役地图册，带有皮革装订、金属夹角和纯正羊皮纸手绘质感。',"
);
fs.writeFileSync('src/systems/MetaGameSystem.js', code);
console.log("Updated changelog");
