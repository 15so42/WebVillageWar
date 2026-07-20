import fs from 'fs';

let meta = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
meta = meta.replace(
    /'将主界面的整体背景修改为羊皮纸质感的手绘世界地图，并铺满整个屏幕以适应横屏布局；移除了原先的简易手绘插画底纹以保持界面整洁。',/,
    `'将主界面的整体背景修改为羊皮纸质感的手绘世界地图，并铺满整个屏幕以适应横屏布局；移除了原先的简易手绘插画底纹以保持界面整洁。',
      '使用SVG过程化生成了包含罗盘玫瑰、航线网络、海怪、航船、微型山脉和森林等丰富细节的复古世界地图，直接渲染为全屏背景。',`
)
fs.writeFileSync('src/systems/MetaGameSystem.js', meta);
