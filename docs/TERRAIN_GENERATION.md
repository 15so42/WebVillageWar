# Terrain & Cliff Generation (Low Poly Style)

本文档记录了游戏中岛屿悬崖（Island Cliffs）与地形生成的具体技术实现方案，以保证游戏始终维持类似《Bad North》的极简大块面、干净利落的 Low Poly 视觉风格，并避免穿模、碎面等渲染瑕疵。

## 1. 极简 Low Poly 岩石基础几何

为了实现“刀削斧凿”的巨大岩壁感，悬崖不使用高度图（Heightmap）或复杂的噪声网格（Noise Mesh），而是使用最基础的几何体拼接：

- **基础形状**：使用 `THREE.CylinderGeometry`，将分段数（`radialSegments`）严格限制在 **4 到 6** 之间。
- **不规则拉伸**：在 X 轴和 Z 轴上应用随机缩放（`stretchX`, `stretchZ`），打破正多边形的规则感，形成不规则的柱状体。
- **平滑着色消除**：使用 `.toNonIndexed()` 转换几何体，并调用 `.computeVertexNormals()` 实现硬边缘（Flat Shading）的光影效果。

## 2. 积雪完美贴合（消除穿模与“外翻帽子”现象）

以往的实现中，为了做积雪，通常是复制一份岩石模型，在 Y 轴压扁并稍微放大 X/Z，像一顶帽子盖在岩石上。这会导致积雪底部宽于岩石顶部，产生穿模、黑线和边缘不齐的瑕疵。

**当前完美贴合的数学方案**：
将整个山体的高度（`ch`）按比例切分为两部分：岩石主体（如 94%）与顶部积雪（如 6%）。
利用线性插值，计算出岩石与积雪交界处的准确半径 `midR`：

```javascript
const rockRatio = 0.94; // 岩石占比
const rockH = ch * rockRatio;
const snowH = ch * (1 - rockRatio);

// 插值计算交界处的半径
const midR = botR + (topR - botR) * rockRatio;

// 1. 生成底部岩石 (从 midR 到底部 botR)
let rockGeo = new THREE.CylinderGeometry(midR, botR, rockH, numSides, 1);

// 2. 生成顶部积雪 (从顶部 topR 到 midR)
let snowGeo = new THREE.CylinderGeometry(topR, midR, snowH, numSides, 1);

// 3. 垂直无缝拼接
rock.position.set(0, -ch * 0.5 + rockH * 0.5, 0);
snow.position.set(0, -ch * 0.5 + rockH + snowH * 0.5, 0); 
```

**优势**：由于交界处（`midR`）的顶点完全一致且多边形边数相同，两块几何体实现了 100% 的严密缝合，无论如何旋转缩放，雪顶都平滑顺着岩壁延伸，绝无穿模或悬空。

## 3. 悬崖布局与地貌结构

悬崖的生成逻辑遵循“自然聚落”而非纯随机噪声，以确保中心战场的空旷与边缘的包裹感：

- **拒绝阶梯状堆叠**：将原来多层递进的平台修改为 1~2 个圆柱体构成的**单块巨岩**。强制共享相近的高度基准（`sharedHeight`），使其看起来是一座完整的山峰，而不是人工开凿的楼梯。
- **微小的自然倾角**：给整个悬崖组添加微弱的 X 和 Z 轴旋转（`±0.08` 弧度），打破绝对水平的僵硬感。
- **区域高度分级**：手动定义一组 `hillZones`（锚点区域）：
  - 少数 **极高岩台**（11~12高度）：作为视觉焦点（Focus Cliffs）。
  - 部分 **中等岩台**（5~7高度）：构成岛屿海拔的主体。
  - 少数 **低矮平台**（3高度）：作为岛屿边缘向水面的过渡。

## 4. 顶部生态约束 (Top Ecology)

在悬崖顶部会生成松树（Snow Pines）、碎石和偶尔的小屋，增强高地的探索感。

- **高度基准对齐**：使用主岩石的高度作为近似顶部 Y 坐标（`topYApproximation`），确保所有生态元素都准确放置在平坦的雪面上。
- **向心收拢（decoSpread）**：为了配合顶部变窄的悬崖，生态元素的散布半径（`decoSpread`）被严格限制在 `0.25` 左右，防止树木或小屋悬空在悬崖边缘之外。

## 总结

此套技术方案通过**严谨的几何插值**和**宏观的分区布局**，以极低的性能开销（每个悬崖仅几十个面）实现了高度干净、利落且没有任何渲染瑕疵的极简 Low Poly 雪岛风貌。后续如需新增地貌元素（如断桥、瀑布），亦应严格遵循此插值缝合与纯大面块的规范。
