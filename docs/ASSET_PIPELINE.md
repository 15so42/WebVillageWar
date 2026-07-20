# 美术资源替换管线

当前原型里的角色、基地、箭矢、陨石和特效都是程序化低多边形模型。它们不是最终资源，而是 fallback。后续替换为正式模型、动画和特效时，玩法系统不应该改，只改 `src/art/` 这一层。

本项目已确定采用 Codex 托管美术管线：用户不需要手动导入任何美术资源。具体执行规则见 `docs/CODEX_ART_WORKFLOW.md`。

## 推荐资源格式

- 角色、建筑、武器、可复用特效：优先用 `.glb`，但不是只能用 `.glb`。
- 贴图：优先用小尺寸 PNG 或 WebP，低多边形风格建议共用调色板贴图。
- 骨骼动画：优先把同一角色的 `Idle`、`Walk`、`Attack`、`Hit`、`Death` 放在同一个 GLB 中。
- 粒子类效果：轻量阶段可用 Three.js 程序化粒子；复杂阶段可用 GLB mesh burst、spritesheet 或自定义 shader。

浏览器端可用资源格式：

- `.glb/.gltf`：最推荐的运行时 3D 格式。能带 mesh、材质、骨骼、动画、贴图引用，Three.js 支持成熟。
- `.fbx`：可以用 `FBXLoader` 直接读，但体积和材质一致性通常不如 GLB。更推荐在 DCC 工具里转成 GLB。
- `.obj`：只适合静态模型，动画支持弱，不适合角色。
- `.png/.webp`：适合贴图、sprite 特效、序列帧。
- 程序化 mesh：适合原型、低多边形粒子、范围圈、占位模型。
- shader：适合高级特效，比如冲击波、护盾、溶解、能量流。

长期项目建议：源文件可以是 `.blend/.fbx/.psd`，运行时统一导出成 `.glb + .webp/png`。这样加载、缓存和版本管理最稳。

## 目录约定

运行时资源放在 `public/assets/`：

```text
public/assets/
  models/units/swordsman.glb
  models/units/archer.glb
  models/units/raider.glb
  models/buildings/player-base.glb
  vfx/meteor.glb
  textures/shared-palette.png
```

源工程文件不放进 `public/`，比如 `.blend`、`.psd`、高模和未压缩贴图应放到独立的源资源目录，避免被浏览器直接打包/服务。

## 代码边界

当前已经有一个视觉入口：`src/art/visualRegistry.js`。

- `createUnitModel(type, team)`：创建单位显示模型。
- `createProjectileModel(type, options)`：创建箭矢等弹体。
- `createSpellModel(type)`：创建陨石等法术显示模型。
- `playUnitAnimation(unit, name)`：战斗系统只请求 `attack`、`hit` 等语义动画。
- `updateUnitAnimation(unit, dt)`：当前是程序化占位动画，以后可改成 `AnimationMixer.update(dt)`。

以后接正式资源时，做法是：

1. 用 `GLTFLoader` 在游戏开始前预加载 `public/assets` 下的 GLB。
2. `visualRegistry` 根据 `unit.swordsman` 这类稳定 key 克隆模型。
3. 如果 GLB 没加载成功，继续回退到 `lowpoly.js` 的程序化模型。
4. 把 GLB 中的动画 clip 名映射到数据表里的语义名：`idle`、`walk`、`attack`、`hit`、`death`。
5. 战斗系统继续只调用 `playUnitAnimation(unit, 'attack')`，不关心它背后是骨骼动画还是占位动画。

## 单位动画契约

`src/data/gameData.js` 的 `UNIT_DEFINITIONS[type].art` 声明了动画命名和时机：

```js
art: {
  modelKey: 'unit.swordsman',
  rig: 'humanoid',
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    attack: 'Sword_Attack',
    hit: 'Hit',
    death: 'Death'
  },
  timelines: {
    attack: {
      duration: 0.46,
      events: {
        impact: 0.54
      }
    },
    hit: {
      duration: 0.24
    }
  }
}
```

美术资源导出时可以按这些 clip 名命名；如果模型文件中的名字不同，只需要改数据表映射，不要改战斗逻辑。

`timelines.attack.events.impact = 0.54` 表示攻击动画播放到 54% 时触发近战伤害。弓兵使用 `release` 表示动画播放到某个比例时发射箭矢。这样就能配置“剑挥到敌人身上才扣血”“弓拉满后才射箭”，而不是攻击开始瞬间结算。

当前约定：

- `idle`：循环播放。
- `walk`：移动时循环播放。
- `attack`：一次性播放，按 `impact` 或 `release` 事件触发战斗结算。
- `hit`：受击一次性播放。
- `death`：死亡一次性播放，后续接尸体淡出或掉落物。

以后接 `AnimationMixer` 时，`visualRegistry.playUnitAnimation()` 负责把这些语义动画映射到 GLB clip，并处理 fade in / fade out。`CombatSystem` 只关心事件是否到达，不关心具体 clip 名。

## 特效替换策略

特效也按语义 key 管理：

- `vfx.hit`：普通命中火花。
- `vfx.fire-hit`：火焰附加命中特效。
- `vfx.thorns-reflect`：荆棘反伤爆发。
- `vfx.recovery-pulse`：基地回复粒子。
- `vfx.meteor`：陨石下落和落地爆炸。

当前这些都在 `EffectsSystem` 中用简单几何体生成。后续可以逐步替换：

1. 先替换 `createSpellModel('meteor')` 的陨石模型。
2. 再把 `spawnHit`、`spawnFire`、`spawnThorns` 改成读取 VFX 预制体或粒子配置。
3. 大型效果仍由 `EffectsSystem` 负责生命周期、位置、持续时间和销毁。
4. 伤害、击退、燃烧、反伤等玩法结算仍留在 `CombatSystem`，不要写进特效模型里。

更详细的 HTML / Three.js 特效制作方式见 `docs/VFX_GUIDE.md`。

## 实装顺序建议

1. 先换角色 GLB，但保留程序化血条、选中环和附魔环。
2. 接 `AnimationMixer`，让 `idle/walk/attack/hit` 跑起来。
3. 换武器、箭矢和陨石模型。
4. 换命中、火焰、荆棘和回复特效。
5. 最后再优化加载体验、压缩 GLB 和做特效对象池。

这个顺序比较稳，因为每一步都能用现有玩法验证，不会把“资源没加载出来”和“战斗逻辑坏了”混在一起。
