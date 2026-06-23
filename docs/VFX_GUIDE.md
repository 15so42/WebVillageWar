# HTML / Three.js 特效制作指南

浏览器游戏里的特效不等于只能写 HTML。这个项目里，战场内特效应该优先用 Three.js / WebGL；HTML/CSS 更适合 HUD、卡牌、按钮、浮动数字和屏幕闪白。

## 特效类型

- 世界内特效：火焰、陨石、刀光、箭矢尾迹、命中火花、治疗粒子。用 Three.js。
- 屏幕 UI 特效：卡牌冷却、按钮高亮、血量文字、屏幕边缘受击提示。用 HTML/CSS。
- 混合特效：例如单位头顶伤害数字，可以用 Three.js 精灵，也可以把 3D 坐标投影到屏幕坐标后用 DOM 渲染。

## Three.js 常见做法

### 几何体爆发

适合低多边形火花、碎石、荆棘。做法是创建一组小 mesh，给每个 mesh 一个速度和生命周期，每帧移动、缩放、淡出。

当前 `EffectsSystem.spawnHit()` 和 `spawnThorns()` 就是这种方式。

### Sprite / Spritesheet

适合火焰、烟雾、魔法光斑。做一张透明 PNG/WebP 序列帧图，把 `SpriteMaterial.map.offset` 按时间切帧。

优点是便宜、好看；缺点是视角变化时不是真 3D。

### Points / InstancedMesh 粒子

适合大量粒子，比如治疗圈、雪、尘土。`Points` 更轻，`InstancedMesh` 更适合低多边形块状粒子。

### Shader

适合范围圈、扭曲、溶解、冲击波、能量护盾。优点是表现力强；缺点是调试成本高。建议等玩法稳定后再做。

### GLB mesh burst

美术可以在 Blender 里做一个短促爆炸模型或刀光模型，导出 GLB。运行时播放、缩放、淡出，然后销毁。

适合陨石主体、特殊法术、复杂刀光。

## 当前项目的特效入口

`src/systems/EffectsSystem.js` 负责生命周期：

- 创建特效对象。
- 放到世界坐标。
- 每帧更新位置、缩放、透明度。
- 到时间后移除。

正式资源接入时，不要把伤害写进特效对象。伤害、击退、燃烧、反伤仍由 `CombatSystem` 结算；特效只负责表现。

## 特效配置建议

后续可以新增 `src/data/vfxData.js`：

```js
export const VFX_DEFINITIONS = {
  fireHit: {
    type: 'sprite',
    texture: '/assets/vfx/fire-hit.webp',
    frames: 12,
    duration: 0.45,
    size: 1.1,
    blend: 'additive'
  },
  thornsReflect: {
    type: 'mesh-burst',
    modelKey: 'vfx.thorns',
    duration: 0.52,
    count: 8,
    speed: 3.8
  }
};
```

然后 `EffectsSystem.spawnFire()` 只引用 `fireHit` 这个 key，不直接依赖文件名。

## 制作流程

1. 先用程序化几何体调清楚位置、时机、持续时间和大小。
2. 再用 sprite 或 GLB 替换视觉资源。
3. 保留程序化 fallback，避免资源缺失时影响玩法验证。
4. 同一个特效至少检查桌面和手机尺寸，确认不遮挡卡牌和 HUD。
5. 常用粒子要做对象池，避免频繁创建销毁导致卡顿。
