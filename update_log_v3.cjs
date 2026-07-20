const fs = require('fs');
let code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
code = code.replace(
  "'深度重制主菜单界面：为主菜单羊皮纸增加一层透明中世纪手绘地图底纹，并边缘化卷边损耗处理；重绘中世纪黑金盾牌战旗Logo，并将所有交互按钮替换为镶嵌四角铆钉的实体木牌材质。',",
  "'深度重制主菜单界面：在原有羊皮纸质感基础上，为Logo和标题后方增加了低透明度的雪山城堡等战争手绘插画底纹；全面升级“踏上征途”主按钮的视觉层级，采用更厚的木牌材质、金色铁质包边、内阴影与轻微发光效果，以突出战争手册的实体感；其他次级交互按钮则统一替换为深灰木质纹理以弱化视觉比重，焚毁盟约仅在Hover态显示红色。',\n      '深度重制战役选择界面：彻底抛弃网页布局，重新设计为一本置于深色木桌上的战役地图册，带有皮革装订、金属夹角和纯正羊皮纸手绘质感。',"
);
fs.writeFileSync('src/systems/MetaGameSystem.js', code);
console.log("Updated changelog V3");
