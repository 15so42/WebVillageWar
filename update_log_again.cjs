const fs = require('fs');
let code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
code = code.replace(
  "'深度重制战役选择界面：彻底抛弃网页布局，重新设计为一本置于深色木桌上的战役地图册，带有皮革装订、金属夹角和纯正羊皮纸手绘质感。',",
  "'深度重制战役选择界面：彻底抛弃网页布局，重新设计为一本置于深色木桌上的战役地图册，带有皮革装订、金属夹角和纯正羊皮纸手绘质感。',\n      '深度重制主菜单界面：为主菜单羊皮纸增加一层透明中世纪手绘地图底纹，并边缘化卷边损耗处理；重绘中世纪黑金盾牌战旗Logo，并将所有交互按钮替换为镶嵌四角铆钉的实体木牌材质。',"
);
fs.writeFileSync('src/systems/MetaGameSystem.js', code);
console.log("Updated changelog again");
