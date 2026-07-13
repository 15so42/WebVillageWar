# 双人合作联机开发文档

更新日期：2026-07-13  
状态：**MVP 已实现（大厅 + Host 权威同步 + 断线重连骨架）**  
关联分支：从 `codex/strategy-choice-waves` 或 `main` 开新分支均可

本文档供下一个 Agent / 开发者**直接开工**。实现联机时以本文为准，不要在中继服跑 Three.js 模拟，不要把 WebSocket 逻辑散落到 `Game.js` 各处。

---

## 1. 产品规则（已确认，勿改除非用户明确要求）

| 维度 | 规则 |
|------|------|
| 模式 | 2 人合作打 AI（现有 PvE 波次流程） |
| 牌组 | **双方各用自己的牌组**（Meta 里各自选的 deck） |
| 能量 / 出牌 | **各自独立**，各打各的 |
| 波次奖励 | **各自弹各自的三选一**，互不影响 |
| 军需铺 / 银币 | **各自独立** |
| 营地 | **共享一个** `playerBase`（血量、耐久、胜负绑定） |
| 敌军血量 | 合作模式下 × **2.5** |
| 敌军攻击 | 合作模式下 × **1.3** |
| 敌军数量 | **不变**（波次表、spawn 数量逻辑不改） |
| Host | **创房者** = 权威主机（MVP 不做 Host 迁移） |
| 作弊 | 不考虑 |
| 断线 | **必须支持重连**（Client 重连为主；Host 断线冻结等待） |

### 操作与归属

- 友军单位仍 `team === 'player'`。
- 新增 `unit.ownerPlayerId = 'p1' | 'p2'`：谁出的牌召唤的归谁。
- 选兵 / 移动 / 驻守：默认只能操作 `ownerPlayerId === 自己` 的单位。
- 营地被毁 = 双方一起输。

---

## 2. 总体架构

```
┌─────────────────┐         ┌─────────────────┐
│  Host 浏览器     │         │  Client 浏览器   │
│  跑完整 Game    │         │  镜像渲染        │
│  权威结算       │         │  只发命令        │
└────────┬────────┘         └────────┬────────┘
         │    WebSocket 中继（2vCPU）   │
         └──────────────┬──────────────┘
                        │
              ┌─────────▼─────────┐
              │  RoomManager      │
              │  多房间 + 转发     │
              │  不理解游戏规则    │
              └───────────────────┘
```

**铁律：**

1. **只有 Host** 跑 `Game` tick、AI、伤害、卡牌合法性、波次。
2. **中继服** 只做房间管理 + 消息路由 + 断线 slot 保留，不跑 Three.js。
3. **Client** 只发 `InputCommand`，收 `WorldSnapshot` + `GameEvent`，本地插值渲染。
4. 联机代码放 `src/network/` 和 `server/`，通过 `GameNetworkBridge` 薄层接入 `Game`。

---

## 3. 状态分层

### 3.1 共享世界（Host 权威，`Game` 根上）

- `playerBase`（生命、耐久、基地防御火力）
- `enemyCamp`、波次进度、`enemyDirector`、`waveSchedule`
- 全部敌军单位
- 祭坛占领、地形卡区域效果、`AreaEffectSystem`
- 全局 `tick`、胜负、`levelFinished`
- `coop` 配置：`{ enabled, healthMult: 2.5, damageMult: 1.3 }`

### 3.2 按玩家槽位（`PlayerRunState`，slot = `p1` | `p2`）

每个玩家一份：

| 字段 | 说明 | 当前单机对应 |
|------|------|--------------|
| `deck / drawPile / hand / discard` | 牌组运行时 | `CardSystem` 内部 |
| `energy / energyTimer` | 能量 | `CardSystem.energy` |
| `silver` | 局内银币 | `Game.silver` |
| `runShopOpen / runShopPendingOffers / shopPrices / runShopActiveCategory` | 军需铺 | `Game.runShop*` |
| `pendingStrategyRewards / strategyRewardRerollCount` | 波次奖励队列 | `Game.pendingStrategyRewards` |
| `teamGenericUpgradeCounts / teamSpecialUpgrades` | 波次升级 | `Game.teamGenericUpgradeCounts` |
| `selectedUnits / selectionMode` | 选兵状态 | `Game.selectedUnits` |
| `strategyEvent` | 当前策略 UI 状态 | `Game.strategyEvent`（按 slot 拆分） |

### 3.3 单位归属

```js
// UnitEntity 或 summon 时写入
unit.ownerPlayerId = 'p1'; // 或 'p2'
```

索敌、伤害、阵营逻辑仍看 `team`，不改 `CombatSystem` 阵营判断。

---

## 4. 敌军合作缩放（实现挂点）

**文件：** `src/systems/Game.js` → `applyEnemyDifficulty(unit, threatTier, difficulty)`

在现有 `healthFactor` / `damageFactor` 计算完成后、写入 `addModifiers` 之前：

```js
if (this.coop?.enabled) {
  healthFactor *= this.coop.healthMult ?? 2.5;
  damageFactor *= this.coop.damageMult ?? 1.3;
}
```

**不要改：**

- `createWaveSchedule` / 波次条目数量
- `summonUnits` / `spawnEnemy*` 的 count 参数
- `enemyDirector` 的能量消耗与出兵数量逻辑

常量建议放 `src/data/gameData.js`：

```js
export const COOP_ENEMY_SCALING = {
  healthMult: 2.5,
  damageMult: 1.3
};
```

---

## 5. 目录结构（新建）

```text
shared/protocol/              # 前后端共用消息定义（可从 server 引用）
  MessageTypes.js
  Commands.js
  Snapshots.js
  Events.js

server/                       # 独立 Node 中继（package.json 可放根目录 workspaces 或 server 子目录）
  index.js
  RoomManager.js
  RelayRouter.js
  ReconnectRegistry.js
  PlayerSession.js

src/coop/                     # 双人局内逻辑（先本地双人，再挂网络）
  PlayerRunState.js
  CoopSession.js
  CoopGameFactory.js

src/network/
  transport/WebSocketTransport.js
  session/
    RoomClient.js
    MultiplayerSession.js
  host/
    HostAuthority.js
    CommandValidator.js
    SnapshotBuilder.js
    ReconnectHost.js
  client/
    ClientMirror.js
    SnapshotApplier.js
    CommandSender.js
    ReconnectClient.js
  bridge/
    GameNetworkBridge.js      # 唯一与 Game 交互的入口

src/systems/MetaGameSystem.js # 主菜单新增「联机」入口（见 §8）
```

---

## 6. 网络协议

### 6.1 房间生命周期（Client ↔ Server）

| 消息 | 方向 | 说明 |
|------|------|------|
| `room_create` | C→S | 创房，返回 `roomId`、`playerToken`、`playerSlot: p1` |
| `room_join` | C→S | `{ roomId }`，分配 `p2`，返回 token |
| `room_leave` | C→S | 离开房间 |
| `room_ready` | C→S | `{ ready: boolean }` |
| `room_start` | C→S | **仅 Host** 可发，带 `levelId`、`difficulty`、双方 deck 摘要 |
| `room_state` | S→ALL | 广播房间状态（玩家列表、准备、关卡） |
| `heartbeat` | 双向 | 15s 一次 |
| `reconnect` | C→S | `{ roomId, playerToken, lastAckTick, lastAckSeq }` |
| `reconnect_ok` | S→C | 恢复 slot，转发给 Host 要求全量快照 |

### 6.2 对局消息（经中继转发）

**上行 `cmd`（Client 或 Host 代发 p2）：**

```json
{
  "type": "cmd",
  "seq": 120,
  "playerSlot": "p2",
  "clientTick": 640,
  "name": "play_card",
  "payload": {
    "cardInstanceId": "archer-3-...",
    "point": [12.3, -4.8],
    "targetUnitId": null
  }
}
```

**命令类型（第一期）：**

- `play_card` / `discard_card`
- `select_units` / `issue_move` / `issue_guard` / `issue_stop`
- `shop_open` / `shop_buy` / `shop_reroll` / `shop_close`
- `strategy_choose` / `strategy_reroll`

**下行广播 `snapshot`（10Hz，双方可见）：**

```json
{
  "type": "snapshot",
  "tick": 880,
  "serverTime": 1730000000,
  "playerBase": { "hp": 120, "maxHp": 150, "durability": 40 },
  "wave": { "index": 3, "kind": "elite" },
  "units": [
    {
      "id": 12,
      "ownerPlayerId": "p1",
      "type": "knight",
      "x": 1.2, "z": 3.4, "yaw": 1.1,
      "hp": 28, "maxHp": 34, "shield": 6,
      "state": "move", "anim": "walk", "animT": 0.42
    }
  ],
  "playersPublic": [
    { "slot": "p1", "energy": 6, "silver": 42, "handCount": 5, "connected": true },
    { "slot": "p2", "energy": 4, "silver": 18, "handCount": 5, "connected": true }
  ]
}
```

**下行私有 `private_state`（只发给对应 slot）：**

```json
{
  "type": "private_state",
  "tick": 880,
  "playerSlot": "p2",
  "hand": [ /* 完整手牌对象 */ ],
  "drawCount": 12,
  "discardCount": 3,
  "runShop": { "open": false, "offers": {}, "activeCategory": null },
  "strategyUi": { "type": "wave-reward", "choices": [ /* ... */ ] }
}
```

**即时 `event`（不等快照）：**

- `damage_applied` / `unit_spawned` / `unit_died`
- `projectile_spawned` / `projectile_hit`
- `card_resolved` / `wave_started` / `wave_cleared`
- `player_disconnected` / `player_reconnected`
- `match_ended`

### 6.3 同步参数

| 参数 | 值 |
|------|-----|
| Host 逻辑 tick | 20 TPS（50ms） |
| 广播快照 | 10Hz（每 2 tick） |
| 私有状态 | 手牌变化 / 军需铺打开时立即发 |
| 事件 | 立即发 |
| Client 渲染 | 60FPS 插值，缓冲 100–150ms |
| 移动命令节流 | 12–15Hz |
| 事件环形缓冲 | Host 保留最近 30s 供重连补发 |

---

## 7. 断线重连

### 7.1 身份

进房时服务器分配并持久化到 `sessionStorage`：

```json
{ "roomId": "A7K3Q9", "playerToken": "uuid", "playerSlot": "p2" }
```

### 7.2 Client 断线

1. Server 标记 `connected=false`，保留 slot **90 秒**。
2. Client 重连：`reconnect { roomId, playerToken, lastAckTick, lastAckSeq }`。
3. Host 收到后发送：
   - `full_snapshot`（全量世界状态）
   - `private_state`（该玩家完整经济/UI）
   - `event_catchup`（`tick > lastAckTick` 的事件列表）
4. Client 应用后恢复操作。

### 7.3 Host 断线

- 整局**冻结**（双方显示「主机断线，等待重连」）。
- Host 90s 内重连 → 继续 tick。
- 超时 → `match_ended`，回大厅。
- **MVP 不做 Host 迁移给 p2。**

### 7.4 断线期间行为

- Client 断线：Host **继续跑 AI 和波次**；该玩家单位维持当前状态（不自动代操作）。
- 波次奖励 / 军需铺：该玩家 UI 暂停，重连后补弹未处理队列。

---

## 8. 主菜单联机流程

**文件：** `src/systems/MetaGameSystem.js`

### 8.1 主菜单新增按钮

在 `meta-menu-actions` 增加：

```html
<button class="meta-menu-button" type="button" data-action="coop">联机</button>
```

### 8.2 新视图 `coop` / `coop-lobby`

1. **创建房间** → 成为 `p1` + Host，显示 6 位房间号。
2. **加入房间** → 输入房间号，成为 `p2`。
3. 玩家列表 + 准备按钮（双方 deck 从 `deckSelection` 带上，各 36 张规则与单机相同）。
4. Host 选关卡、难度（复用 `selectedLevelId` / `selectedDifficulty` 逻辑）。
5. Host 点「开始合作」→ `room_start` → 双方进入 loading → Host 创建 `CoopGameFactory.create(session)`。

### 8.3 开局 session 结构

```js
{
  mode: 'coop',
  level: { /* level 对象 */ },
  difficulty: 2,
  hostSlot: 'p1',
  players: {
    p1: { playerId, name, deck: [ /* 带 instanceId 的牌 */ ] },
    p2: { playerId, name, deck: [ /* ... */ ] }
  },
  coop: {
    enabled: true,
    healthMult: 2.5,
    damageMult: 1.3
  },
  matchSeed: 123456789,
  startedAt: Date.now()
}
```

单机 `startLevel()` 与联机入口**分离**：联机不要直接调单机 `onStartLevel(session)` 除非 session 已含双人字段。

---

## 9. 现有代码改造清单

### 9.1 必须先抽（阶段 A，可离线验证）

| 任务 | 文件 | 说明 |
|------|------|------|
| 新建 `PlayerRunState` | `src/coop/PlayerRunState.js` | 从 `Game` 迁出单玩家经济字段 |
| 新建 `CoopSession` | `src/coop/CoopSession.js` | 规范化双人 session |
| 双 `CardSystem` | `src/systems/CardSystem.js` | 构造参数加 `playerSlot`；`game.players[slot]` 读写能量/手牌 |
| `Game.silver` 下沉 | `src/systems/Game.js` | → `players[slot].silver` |
| 军需铺按 slot | `src/systems/Game.js` | `openRunShop` / `purchaseRunShop*` 带 slot |
| 策略奖励按 slot | `src/systems/Game.js` | `pendingStrategyRewards` per player；波次结束各 push 一条 |
| 单位 owner | `src/entities/UnitEntity.js` 或 summon 路径 | `ownerPlayerId` |
| 选兵过滤 | `src/systems/Game.js` 输入处理 | 只能选自己的单位 |
| 合作缩放 | `src/systems/Game.js` | `applyEnemyDifficulty` 末尾乘系数 |
| 共享基地 HUD | `src/systems/Game.js` | 顶栏一个基地血条；银币显示改「己方银币」 |

### 9.2 本地双人冒烟（阶段 A 完成标准）

在同一浏览器开 `?coopLocal=1` 或 dev 按钮：

- p1、p2 各有一套能量/手牌/银币/军需铺。
- p1 出牌不影响 p2 能量。
- 波次结束两人各弹奖励。
- 敌军血攻 visibly 更高（2.5 / 1.3）。
- 基地共享，一方视角基地血条一致。

### 9.3 网络层（阶段 B–D）

| 任务 | 说明 |
|------|------|
| `server/` 中继 | `ws` 库，RoomManager，消息转发 |
| `RoomClient` | 创房/加房/准备/开始 |
| `HostAuthority` | 挂 `Game.tick` 前后，消费命令队列 |
| `CommandValidator` | 校验 slot、能量、银币、手牌 instanceId |
| `SnapshotBuilder` | 从 `Game` + `players` 导出 snapshot / private_state |
| `ClientMirror` | 无权威逻辑，应用快照到镜像单位 |
| `GameNetworkBridge` | Host/Client 模式切换，屏蔽单机/联机分叉散落 |
| 断线重连 | `ReconnectHost` / `ReconnectClient` + 90s slot |

### 9.4 建议从 `Game.js` 抽出（中长期，不阻塞 MVP）

- `WaveDirector.js` — 波次、敌军生成
- `RunShopController.js` — 军需铺
- `StrategyFlowController.js` — 策略事件/波次奖励

`Game.js` 当前约 **7500+ 行**，联机期间**禁止**继续往里面堆 WebSocket 代码。

---

## 10. `GameNetworkBridge` 接口（实现时照此写）

```js
// src/network/bridge/GameNetworkBridge.js

export class GameNetworkBridge {
  constructor({ mode }) { // 'offline' | 'host' | 'client'
    this.mode = mode;
  }

  bindGame(game) { /* Host: tick 钩子 */ }
  unbindGame() {}

  // Host
  ingestCommand(cmd) { /* 入队，tick 开头处理 */ }
  afterTick(game) { /* SnapshotBuilder + 事件 flush */ }

  // Client
  applySnapshot(snap) {}
  applyPrivateState(state) {}
  applyEvent(evt) {}

  // 发送层注入
  setTransport(sendFn) {}
}
```

**Client 禁止：**

- 调用 `CombatSystem.applyDamage`
- 本地扣血/召唤/抽牌
- 直接改 `friendlyUnits` 列表

---

## 11. 性能准则

1. 快照只同步**逻辑态**（位置、血、状态、anim），不同步 Three.js 对象引用。
2. Client 应用快照时**更新已有单位**，不每帧重建 mesh。
3. 手牌细节**永不进广播快照**，只走 `private_state`。
4. 不要用降频掩盖 Host 的 O(N²) 或重复寻路；联机前先用 profiler 确认 Host 单局 20 TPS 稳定。
5. 中继服 JSON 即可；带宽稳定后可改 binary + delta snapshot。
6. 房主尽量 PC；手机可作为 Client，不建议默认手机当 Host。

---

## 12. 实施里程碑与验收

### 阶段 A — 双人本地原型（不联网）

**目标：** `CoopGameFactory` 在同一页跑通双经济 + 共享基地。

验收：

- [ ] 两套能量/手牌/银币/军需铺互不影响
- [ ] 波次奖励各选各的
- [ ] 敌军 2.5x 血 / 1.3x 攻，数量不变
- [ ] 共享基地胜负
- [ ] `npm run build` 通过

### 阶段 B — 中继 + 大厅

**目标：** 主菜单联机 → 创房/加房/准备/开始。

验收：

- [ ] 多房间并存
- [ ] 6 位房间号
- [ ] Host 选关开始
- [ ] `playerToken` 下发

### 阶段 C — 同步

**目标：** Host 跑局，Client 看到单位移动和战斗。

验收：

- [ ] Client 发 `play_card` / `issue_move`，Host 校验执行
- [ ] 10Hz 快照 + 即时事件
- [ ] 私有手牌不泄露给对方

### 阶段 D — 断线重连

验收：

- [ ] Client 断线 90s 内重连恢复
- [ ] Host 断线冻结，重连后继续
- [ ] `full_snapshot` + `event_catchup`

---

## 13. 开发环境与验证

```powershell
# 前端（仓库根目录）
npm install
npm run dev

# 改动的 JS 先语法检查
node --check src/coop/PlayerRunState.js

# 构建
npm run build
```

```powershell
# 中继服（实现后，server/ 目录）
cd server
npm install
npm start
# 默认 ws://localhost:8787
```

环境变量建议：

```env
VITE_COOP_WS_URL=ws://localhost:8787
```

---

## 14. 不要做的事

1. ❌ 在 2vCPU 服务器上跑 `Game` 或 Three.js 权威模拟。
2. ❌ 在 `Game.js` 里直接写 WebSocket 连接 scattered  everywhere。
3. ❌ 合作模式改敌军 spawn 数量。
4. ❌ Client 本地结算伤害或抽牌。
5. ❌ MVP 做 Host 迁移。
6. ❌ 为联机恢复已废弃的地形卡误拖拽保护逻辑（见 `CardSystem` `pointercancel` 修复）。
7. ❌ 用 `docs/UPDATE_LOG.md` 写玩家可见更新；玩家日志只在 `MetaGameSystem.js` 的 `CHANGELOG_ENTRIES`。

---

## 15. 相关文件索引

| 用途 | 路径 |
|------|------|
| 主循环与波次 | `src/systems/Game.js` |
| 敌军难度缩放 | `Game.applyEnemyDifficulty`（约 3264 行） |
| 卡牌/能量 UI | `src/systems/CardSystem.js` |
| 军需铺 | `Game.openRunShop` / `bindRunShopUi` |
| 波次奖励 | `Game.openStrategyEvent` / `pendingStrategyRewards` |
| 主菜单 | `src/systems/MetaGameSystem.js` |
| 关卡/数值 | `src/data/gameData.js` |
| 战斗结算 | `src/systems/CombatSystem.js` |
| 单位注册 | `src/systems/UnitRegistry.js` |
| 通用架构 | `docs/ARCHITECTURE.md` |
| 性能排查 | `docs/PERFORMANCE_OPTIMIZATION.md` |

---

## 16. 下一个 Agent 建议起手式

1. 阅读本文 §1、§3、§9。
2. 创建分支 `feature/coop-multiplayer`。
3. 实现 **阶段 A**：`src/coop/PlayerRunState.js`、`CoopSession.js`、`CoopGameFactory.js`，改 `CardSystem` 支持 `playerSlot`。
4. 用本地双人模式验证 §12 阶段 A 验收清单。
5. 再搭 `server/` 和 `src/network/`，不要跳过阶段 A。

有问题先查 `Game.js` 里 `this.silver`、`this.cardSystem`、`pendingStrategyRewards` 的单机用法，再按 slot 拆分。
