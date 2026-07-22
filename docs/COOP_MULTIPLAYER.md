# 多人联机权威规范

更新日期：2026-07-22
状态：**规范 v2.2；双人联机网络同步已基本可用，未勾选项目仍需继续实机验收**

本文虽然保留旧文件名 `COOP_MULTIPLAYER.md`，但适用范围是通用多人联机，包括多人 PvE、PvP 与 AI 势力。当前双人合作只是第一个产品模式，不得再把 `p1` / `p2`、两个玩家或单一共享基地写成网络架构前提。

---

## 1. 不可违反的原则

1. **Host 是唯一游戏权威。** Host 运行完整 `Game`、单位逻辑、AI、寻路、攻击、伤害、卡牌、能量、奖励、商店、波次和胜负结算。
2. **Client 只提交操作命令。** 除 UI 展开、拖拽、悬停、预览、等待动画等纯表现外，Client 不得本地结算游戏逻辑。
3. **Client 只显示 Host 已确认的结果。** Client 不得先扣能量、抽牌、扣血、生成权威单位或改变奖励状态。可以显示“命令待确认”，但不能把预测结果当成权威状态。
4. **Host 本地玩家也走同一命令入口。** 房主点击卡牌不能绕过 `CommandValidator` 直接改状态，否则 Host 与远端玩家会形成两套规则。
5. **中继服不是游戏服务器。** 当前中继只负责身份绑定、房间、路由、重连凭证和基本消息校验，不运行 Three.js 或游戏规则，也不理解具体游戏消息。
6. **变化驱动优先。** 血量、耐久、护盾、资源、牌堆、效果、动画和流程状态在变化时立即同步，不做固定频率的全量重复广播。
7. **移动同步是常规例外。** 移动中的位置、朝向和速度需要及时流式同步；停止后发最终位置并停止该单位的高频发送。
8. **全量快照只用于边界场景。** 开局初始化、加入观战、断线重连、版本恢复或校验失败时才发送完整快照。
9. **协议以稳定 ID 表达对象。** 不使用数组下标充当长期身份，不让 Client 用显示文本反推逻辑。
10. **相同输入必须可重放和去重。** 命令、结算事务、事件与状态补丁都必须有序号或唯一 ID。

### 1.1 权威边界

| 内容 | Host | Client |
|---|---|---|
| UI 悬停、拖拽、卡牌完整预览 | 不需要参与 | 本地执行 |
| 出牌是否合法、扣费、卡牌移区、效果结算 | 执行并广播结果 | 只发命令并应用结果 |
| 单位 AI、索敌、寻路、攻击、伤害、击退 | 执行 | 镜像显示 |
| 波次、奖励候选、商店候选、随机数 | 生成并持有 | 只显示私有结果并提交选择 |
| 资源、手牌、牌堆、基地、胜负 | 唯一权威 | 镜像 |
| 客户端对 Host 最新变换做显示 Lerp、镜头、面板开关 | 不需要参与 | 本地执行 |

Client 禁止调用会产生权威结果的方法，例如 `CombatSystem.applyDamage`、本地抽牌、修改能量、生成权威单位、推进波次、生成随机奖励或直接修改 `friendlyUnits` / `enemyUnits`。

本文把波次奖励、开局选卡、商店选择等玩法过程称为**持续交互状态**，不称为网络事件。网络事件只是传输中的一次性消息；持续交互状态必须存在于 Host 状态中并可通过重连快照完整恢复。

---

## 2. 支持的对局模式

网络层不得根据 `mode === 'coop'` 推断玩家数、基地数或阵营关系。规则由 Host 持有的 `MatchRules` 决定。

```js
{
  mode: 'pve', // 'pve' | 'pvp'
  maxPlayers: 4,
  hostPlayerId: 'player-uuid',
  players: [/* PlayerDescriptor[] */],
  factions: [/* FactionDescriptor[] */],
  aiFactions: [/* AiFactionDescriptor[] */],
  basePolicy: 'shared_team_base', // 或 'per_player_base'
  matchSeed: 123456789,
  rulesVersion: 'multiplayer-v2'
}
```

### 2.1 PvE

- 支持两个或更多玩家，不以双人为上限。
- 玩家各自拥有牌组、手牌、抽牌堆、弃牌堆、能量、银币、能力、商店、奖励队列和选择状态。
- 敌军被击杀时，每位 PvE 玩家都在自己的能量和银币账户中获得同额基础奖励；归属只影响各自能力带来的额外收益。
- 同一 PvE 队伍共享基地；共享基地死亡，队伍内所有玩家失败。
- 当前双人默认合作缩放保持敌军 `2.5x` 血量、`1.3x` 攻击、数量不变。三人及以上缩放必须从 `gameData.js` 的模式配置读取，不得在网络代码里临时推导。
- 波次奖励为每个玩家分别生成和分发；同一波次不同玩家可以获得不同候选项。
- 任意友方单位首次占领祭坛时，为所有玩家分别生成能力卡三选一，每位玩家独立选择并获得自己的能力。

### 2.2 PvP

- 当前规则是每个玩家拥有自己的阵营与基地；某玩家基地死亡时按模式规则淘汰或判负。
- PvP 对局可以同时存在 AI 阵营；AI 与玩家单位使用同一 Host 权威战斗系统。
- 网络协议用 `playerId`、`factionId`、`teamId` 和 `baseId` 表达关系，不用 `team === 'player'` 推断盟友。
- 未来若增加组队 PvP，只修改 `MatchRules` 和阵营关系，不改消息结构。
- 私有信息必须按可见性过滤：对手手牌、抽牌顺序、未公开奖励、商店候选和战争迷雾外单位不得广播。

---

## 3. 身份与稳定 ID

| ID | 用途 |
|---|---|
| `matchId` | 一局对局 |
| `playerId` | 稳定玩家身份；不能依赖 `p1` / `p2` |
| `connectionId` | 一次网络连接，可在重连后变化 |
| `factionId` / `teamId` | 阵营和同盟关系 |
| `baseId` / `unitId` | 权威实体 |
| `cardDefinitionId` | 卡牌数据定义，例如 `energy_surge` |
| `cardInstanceId` | 本局中的具体卡牌实例 |
| `choiceId` / `offerId` | 一次奖励或商店候选 |
| `effectInstanceId` | 单位上的一个同步特效实例 |
| `commandId` | 一次玩家命令，用于去重和回执 |
| `transactionId` / `eventId` | 一次权威结算及其事件 |

房间显示顺序可以继续叫 slot，但 slot 只是 UI 排序字段，不得作为玩家控制状态 Map 的固定键。所有集合使用 `Map<playerId, ...>` 或等价动态结构。

中继必须从连接会话填入真实 `playerId`，忽略或拒绝 Client 自报的其他玩家身份。Client 不能发送“让另一个玩家出牌”的命令。

---

## 4. Host 维护的玩家控制域

Host 为每个参与者创建独立 `PlayerRuntimeState`：

```js
{
  playerId,
  factionId,
  connected,
  deck: [],
  drawPile: [],
  hand: [],
  discardPile: [],
  temporaryCards: [],
  energy: 0,
  silver: 0,
  abilities: new Map(),
  pendingRewards: new Map(),
  shopState: null,
  flowState: 'playing'
}
```

CardSystem、能量、能力、商店与奖励控制器必须按 `playerId` 索引。框选/选中状态完全留在本地；移动、停止、驻守等命令显式携带 `unitIds`，再由 Host 校验归属并执行。

单位至少保存：

```js
{
  unitId,
  factionId,
  ownerPlayerId, // AI 或无归属单位可为 null
  controllerPlayerId // 当前允许发命令者，可与 owner 不同
}
```

索敌与伤害看阵营关系，玩家能否操作看 `controllerPlayerId` 和权限规则，两者不能混用。

---

## 5. 大厅、准备、开局与选卡状态机

双方准备后直接由各浏览器自行进入游戏，是目前最容易产生竞态的路径。开局必须由 Host 状态机推进，Client 只能确认自己已经完成当前阶段。

```text
LOBBY_EDITING
  -> READY_CHECK
  -> MATCH_LOADING
  -> OPENING_SELECTION（若本模式有开局选卡）
  -> RUNNING
  -> ENDED
```

### 5.1 大厅规则

- 玩家修改牌组、模式、阵营、地图、难度或会影响对局的配置后，Host 必须将相关玩家恢复为未准备。
- 加入房间和回连后，Client 必须先向 Host 发送游戏版本握手。`gameVersion`、`gameProtocolVersion` 与 `catalogVersion` 必须全部完全一致；任一不一致都禁止准备或恢复对局，并同时提示主机版本与客户端版本。版本校验由 Host / Client 端到端完成，中继不解析版本。
- `ready` 命令携带 `gameVersion`、`deckRevision` 和 `catalogVersion`。Host 验证卡牌数量、拥有权、重复限制和版本后，才广播 `player_ready_changed`。
- 全员准备只是 Host 可以开始的条件，不等于 Client 自行调用 `startLevel()`。
- Host 生成 `matchId`、`matchSeed`、完整玩家清单与规则快照后发送 `match_loading_started`。
- 每个 Client 加载完成后只发送 `client_loaded`；Host 收齐必需玩家的确认后推进下一阶段。
- 任一阶段消息都带 `phaseRevision`。Client 忽略旧 revision，防止重复进入和界面倒退。

### 5.2 开局选卡 / 起始奖励

- Host 根据 `matchSeed` 和独立随机流生成每个玩家的候选项。
- Host 创建并持有 `activeSelection { selectionId, playerId, revision, choices[], status, progress }`，直到选择完成或按规则超时。
- Host 第一次私发完整 `selection_state`；后续只在该持续状态变化时私发补丁。
- Client 必须收到完整可预览信息后再显示选择 UI。
- 玩家发送 `selection_choose { selectionId, choiceId }`，不得只发送数组下标。
- Host 验证选择仍开放且属于该玩家，执行效果，再返回权威事务，并将 `activeSelection.status` 改为 `closed`。
- 若所有玩家都必须完成选卡，Host 收齐后才广播 `match_running`；不得由 Client 根据“自己已选完”自行开局。
- 重复提交同一 `commandId` 必须返回同一结果，不得重复拿卡或扣费。

### 5.3 超时和断线

选择阶段的超时策略属于 `MatchRules`：可以自动选定、跳过或等待，但只能由 Host 执行。Client 断线后 Host 保留完整 `activeSelection`；重连时私有快照根据其当前状态和进度恢复 UI。

---

## 6. 协议分层

### 6.1 Client 上行：只有命令

```json
{
  "type": "command",
  "matchId": "match-uuid",
  "commandId": "player-uuid:184",
  "clientSeq": 184,
  "expectedPhaseRevision": 7,
  "name": "play_card",
  "payload": {
    "cardInstanceId": "card-uuid",
    "targetPoint": [12.3, 0, -4.8],
    "targetUnitId": null
  }
}
```

中继绑定 `playerId`；Host 按顺序执行并验证：身份、阶段、控制权限、对象是否存在、资源、牌区、目标、距离、冷却和 command 去重。拒绝时返回 `command_rejected { commandId, reasonCode, authoritativeRevision }`。

命令类型至少包括：

- `play_card` / `discard_card`
- `issue_move` / `issue_guard` / `issue_stop`（命令显式携带 `unitIds`；框选状态仅存在于各自本地）
- `reward_choose` / `reward_reroll` / `reward_skip`
- `shop_category` / `shop_choose` / `shop_energy` / `shop_back` / `shop_reward_skip`；普通军需铺开关仅属于玩家本地 UI，不发送命令
- `client_loaded` / `ready_set`

Host 本地 UI 也构造相同命令对象并进入同一队列。

### 6.2 Host 下行：状态补丁、事务事件和私有 UI

下行消息分三类：

1. `state_patch`：持久状态变更，Client 应用后得到当前真值。
2. `transaction`：一次命令或战斗结算产生的有序结果，可包含多个补丁和表现事件，Client 原子应用。
3. `ui_state`：只发给对应玩家的手牌、奖励、商店和流程 UI 状态。

所有下行消息至少带 `matchId`、`serverSeq`、`serverTick`。实体补丁还带 `entityRevision`；事务中每个产生持久变化的 result 也要带对应实体的结果 revision。Client 发现序号缺口或 revision 不连续时请求局部或完整重同步，不猜测中间结果。

网络事件不作为重连后的历史恢复来源。重连以 Host 当前完整状态为准；断线前或断线期间已经发生、且已被快照吸收的网络事件不补发、不重播。

```json
{
  "type": "state_patch",
  "serverSeq": 9201,
  "serverTick": 1870,
  "entityType": "unit",
  "entityId": "unit-42",
  "entityRevision": 16,
  "changes": {
    "health": 72,
    "shield": 0
  }
}
```

### 6.3 伤害与耐久事件

当前血量、耐久和护盾是状态真值；每次结算发生时立即传结果，不等待循环快照。伤害事件必须包含结算前后值，避免 Client 用本地规则再次计算。

```json
{
  "type": "transaction",
  "transactionId": "tx-8801",
  "cause": { "kind": "attack", "sourceUnitId": "unit-7" },
  "results": [
    {
      "kind": "damage_applied",
      "targetId": "unit-42",
      "damageType": "physical",
      "requestedAmount": 18,
      "healthBefore": 84,
      "healthAfter": 72,
      "shieldBefore": 6,
      "shieldAfter": 0,
      "targetRevisionAfter": 16
    }
  ]
}
```

Client 将 `healthAfter` / `shieldAfter` 写入镜像并播放受击表现；不得再用护甲公式扣一次血。基地耐久同理使用 `durabilityBefore` / `durabilityAfter`。治疗、修复、吸收和死亡也遵循 before/after 结构。

### 6.4 一张“能量 +2”卡牌的完整事务

1. Client 只发 `play_card { cardInstanceId, ... }`。
2. Host 验证牌在该玩家手中且费用足够。
3. Host 在一个事务内扣费用、把实例移入弃牌堆、结算能量 `+2`。
4. Host 给该玩家返回私有牌区/资源结果；给有观察权限的玩家广播公开出牌表现。

```json
{
  "type": "transaction",
  "transactionId": "tx-card-91",
  "commandId": "player-a:184",
  "results": [
    { "kind": "resource_changed", "playerId": "player-a", "resource": "energy", "before": 5, "after": 3, "reason": "card_cost" },
    { "kind": "card_zone_changed", "cardInstanceId": "card-uuid", "from": "hand", "to": "discard" },
    { "kind": "resource_changed", "playerId": "player-a", "resource": "energy", "before": 3, "after": 5, "reason": "card_effect" },
    { "kind": "card_resolved", "cardInstanceId": "card-uuid", "cardDefinitionId": "energy_plus_2" }
  ]
}
```

同一事务的结果按数组顺序应用，并在同一渲染帧提交，避免 UI 短暂显示不可能状态。

---

## 7. 卡牌 ID、目录与完整预览

- `cardDefinitionId` 指向版本化的本地卡牌目录；`cardInstanceId` 标识本局中的具体实例。
- 发手牌、弃牌堆、临时牌、奖励牌或移出牌时都必须包含 `cardInstanceId`、`cardDefinitionId`、等级和影响预览的运行时覆盖字段。
- Client 根据 `cardDefinitionId` 从本地 `gameData.js` / 卡牌目录获取名称、描述、卡面、目标规则和完整预览，不依赖 Host 重发整份静态定义。
- 动态描述需要的数值由 Host 发送 `resolvedPreview` 或 `runtimeOverrides`，Client 不自行用可能不同版本的规则推算。
- 开局时校验 `catalogVersion` / `contentHash`。版本不一致时禁止进入权威对局并给出明确错误。
- 对手可以拥有同一卡牌定义的资料，但不能因此获得对手手中有哪些卡牌实例。PvP 只同步允许公开的卡牌信息。

“脱出卡牌”、临时移除或其他特殊牌区必须使用明确 zone，例如 `exile`、`temporary`、`reward_pending`，并继续保留实例和定义 ID，保证客户端随时能打开完整预览。

---

## 8. 波次奖励与其他随机流程

Host 独占 `matchSeed`，并为不同领域和玩家派生独立随机流，例如：

```text
rewardSeed = derive(matchSeed, "wave-reward", waveId, playerId, rerollCount)
```

不得使用 `Date.now()` 或各客户端的 `Math.random()` 生成权威奖励、牌序或实例身份。

奖励本身是 Host 持有的持续交互状态，不是只发一次就丢弃的网络事件：

```js
activeReward = {
  rewardId,
  playerId,
  revision,
  waveId,
  choices: [],
  rerollCount: 0,
  status: 'open',
  progress: 'waiting_for_player'
};
```

标准流程：

1. Host 在奖励时机为每个玩家生成不同 `rewardId` 和候选 `choiceId`，并保存完整 `activeReward`。
2. Host 私发 `reward_state`，每个候选带卡牌 ID、运行时数值和完整预览所需字段。
3. Client 发送 `reward_choose { rewardId, choiceId }`。
4. Host 验证并结算，返回 `reward_granted` 事务，例如给卡、加能量、添加能力。
5. Host 将状态改为 `closed` 并同步；Client 根据持续状态关闭界面。

重抽会创建新 `rewardRevision` 和新 choice IDs，旧候选立即失效。商店、事件三选一和开局选卡使用相同的持续 offer/choice 模式。玩家在界面中闪退时不需要重播 `reward_opened`；重连快照直接恢复 `activeReward` 的当前 revision、候选和进度。

---

## 9. 单位状态、特效、附魔和动画

### 9.1 单位状态

生成单位时发完整初始状态；之后只发变化字段。典型同步字段：

- 生命、最大生命、护盾、耐久、建造进度
- 阵营、归属、控制者
- 当前逻辑状态中 Client 需要显示的枚举
- 当前特效列表和附魔 UI 字符串

单位死亡使用权威事件并附最终状态。Client 不根据“血量看起来小于零”自行触发奖励或胜负。

### 9.2 特效列表，不同步 Buff 列表

网络镜像单位只维护 `effects[]`，不维护或复制 Host 的玩法 Buff 列表。Host 内部数值修正继续由能力、区域、战斗等权威系统结算，Client 不需要知道计算链。

```js
unit.effects = [{
  effectInstanceId: 'fx-uuid',
  effectKey: 'burning',       // 稳定字符串或目录 key
  sourceEntityId: 'unit-7',
  stacks: 2,
  startTick: 1800,
  endTick: 1960,
  params: { color: '#ff8a3d' }
}];
```

使用 `effect_added`、`effect_updated`、`effect_removed` 变化同步；单位生成、重连或纠错快照中发送完整 `effects[]`。特效到期由 Host 发移除事件，Client 定时器只能用于视觉淡出，不能自行改变权威列表。

### 9.3 血条下方附魔 UI

附魔显示使用简单、稳定的字符串或 UI key 同步，例如：

```json
{
  "enchantLabels": ["flame_weapon", "frost_guard"]
}
```

Client 将 key 映射为本地化文本、图标和样式。动态层数可使用 `{ "key": "flame_weapon", "stacks": 2 }`，但不把完整 Buff 逻辑复制到 Client。

### 9.4 动画

- 只在动画状态切换时发送 `animation_changed`。
- 载荷包含 `unitId`、`animationKey`、`startTick`、`playbackRate`、`loop`，必要时带过渡时长。
- Client 本地推进动画时间；不循环同步 `animT`。
- 重连快照包含当前动画和开始 tick，使 Client 能恢复正确阶段。

---

## 10. 位移同步

普通寻路移动与外力位移使用不同的显示数据，但两者的玩法结果都只由 Host 决定。

- 寻路和沿路径移动只在 Host 内部执行；网络层不发送路径。单位移动期间由 Host 以 20Hz transform 流发送权威位置与朝向。
- Client 根据相邻 Host 坐标估算显示速度，只做有上限的短时位置外推，并持续平滑收敛到最新 Host 坐标；RTT 仅用于估计单程传输延迟。Client 不运行 NavMesh、不重新寻路，也不参与碰撞、索敌或战斗判断。
- 停止、到达目标和传送发送 `motion_event` 及最终位置。静止单位不持续占用 transform 带宽；明确的静止传送可以直接 snap。
- 击退使用独立的 `knockback_start` / `knockback_end` 事件标记状态；击退期间禁用速度外推和本地击退公式，只平滑跟随 Host transform，结束时继续平滑收敛到最终权威位置。
- 飞行物使用生成/销毁事件管理生命周期，并在 10Hz 变换流中同步位置和旋转；Client 只显示镜像，不计算命中或弹道。
- Client 可以立即显示移动指令标记，但单位实际显示位置必须来自 Host 的 transform 流或 `motion_event`。

位置流只解决显示流畅性；碰撞、攻击距离、占点和击退结果仍完全由 Host 位置判断。

---

## 11. 同步策略和恢复

| 数据 | 正常同步方式 |
|---|---|
| 血量 / 护盾 / 耐久 | 每次变化立即发 before/after 结果和状态 revision |
| 能量 / 银币 | 每次变化立即发 |
| 手牌 / 牌区 | 抽取、移动、创建、销毁时私发 |
| 单位生成 / 死亡 | 立即事件 |
| effects / 附魔 UI | 增删改时立即发 |
| 动画 | 动画切换时发 |
| 位置 / 朝向 | 仅移动期间连续流式发送 |
| 波次 / 流程阶段 | 状态转换时发 |
| 完整世界 | 开局、重连、显式 resync |

可以周期发送轻量 `state_hash`、心跳和最后序号，用于发现漂移；不得借校验之名恢复为每秒多次发送全体血量、单位列表和私有状态。

### 11.1 重连

只保证非 Host Client 的闪退、刷新与网络波动恢复。Host 在 Client 掉线期间继续持有并推进完整权威状态；该玩家暂时不能提交操作。

Client 检测到本地断线凭证后，必须先向中继发送只读 `reconnect_probe`。只有原房间仍存在、凭证有效且 Host 当前在线时，联机界面才弹出“是否回连原房间”的确认窗口。未经玩家确认不得发送 `reconnect` 或恢复对局；玩家拒绝后清除本地回连凭证，可以创建或加入其他房间。确认回连时中继必须再次校验 Host 在线，避免探测与点击之间 Host 掉线。

Client 重连后获取一个当前状态快照，至少包括：

1. 当前对局和阶段 revision。
2. 对其可见的全部基地、波次、场上单位和其他世界实体；Client 清理旧镜像后按当前实体重新生成。
3. 每个可见单位当前生命、护盾、耐久、transform、动画、`effects[]` 和附魔 UI。
4. 本玩家完整卡牌运行态：牌组、抽牌堆、手牌、弃牌堆、临时牌区、放逐牌区和其他模式使用的牌区。
5. 本玩家资源、能力、商店以及所有持续交互状态，包括波次奖励、开局选卡及其当前 revision 和进度。

Client 不请求也不接收断线期间的旧网络事件。快照带 `baseServerSeq`；Client 应用快照期间暂存其后到达的正常实时消息，快照完成后只继续处理 `serverSeq > baseServerSeq` 的新消息。这是正常实时流衔接，不是旧事件补发。

闪退重启需要持久化 `{ roomId, playerId, hostPlayerId, reconnectToken, expiresAt }`，不能只依赖内存连接对象。Host 为断线玩家保留状态到配置的 Client 重连宽限期，超时后按模式规则移除玩家。

本阶段不支持 Host 回连、Host 进程闪退恢复或 Host 迁移。Host 与中继断开后，仍在线的 Client 立即停止对局并显示只能退出的“对局已终止”弹窗；中继保留房间记录 60 秒仅用于租约清理和通知，该房间不再接受 Host 或普通 Client 回连，连续 60 秒后释放。因为中继不保存游戏世界，任何客户端都不能从中继恢复已经丢失的 Host 权威状态。

---

## 12. 隐私、可见性与 PvP 兼容

每个下行对象经过 `VisibilityPolicy`：

- `public`：所有参与者可见，例如公开单位、基地状态、波次。
- `team`：只对同队可见，例如队伍战术信息。
- `owner`：只对该玩家可见，例如手牌、抽牌顺序、个人奖励。
- `observer`：按观战规则过滤。

禁止先向全房广播私有内容再要求 Client 隐藏。中继的 `to` 只是路由，Host 必须先构建正确的每客户端视图。

战争迷雾加入后，隐藏单位不能出现在对手快照、transform 流或特效事件中；从可见变隐藏时发送 `entity_hidden`，重新出现时发送新的可见状态。

---

## 13. 通用中继与现有代码的架构映射

### 13.1 通用中继协议

中继服务器只部署一套与游戏内容无关的稳定版本。后续增加卡牌、单位、奖励字段或游戏消息类型，只更新 Host / Client，不要求修改或重部署中继。

中继只理解以下通用能力：

- 创建、加入、离开和释放房间。
- 连接身份、房主身份、重连 token、Client 重连宽限期和回连前 Host 在线探测。
- 心跳、连接存活和房间成员列表。
- Host 连接租约：Host 连续 60 秒不在线时自动释放房间。
- 按 `toPlayerId`、`broadcast` 或通用 channel 转发不透明 payload。
- 消息大小、发送频率、房间成员身份和目标合法性等基础安全限制。

中继不得解析 `play_card`、`reward_choose`、单位状态、准备状态或胜负规则。准备、开局、玩法版本校验和所有权威结算都是 Host / Client 之间的游戏协议。

```json
{
  "relayVersion": 2,
  "roomId": "ROOM-ID",
  "to": "player-id-or-broadcast",
  "channel": "game",
  "payload": "opaque-json-or-binary"
}
```

`fromPlayerId` 由中继根据连接身份写入，不能信任 payload 内的自报身份。游戏协议有独立 `gameProtocolVersion` / `catalogVersion`，由 Host 和 Client 端到端协商，中继无需理解。

### 13.2 架构映射

| 责任 | 目标位置 |
|---|---|
| 动态多人 session / MatchRules | `src/network/session/MultiplayerSession.js` 或从 `CoopSession` 演进 |
| 每玩家运行态 | `src/coop/PlayerRunState.js` 演进为按 `playerId` 动态创建 |
| 命令校验与去重 | `src/network/host/CommandValidator.js` |
| Host 命令队列与结算事务 | `src/network/host/HostAuthority.js` |
| 变化追踪、事件构建、恢复快照 | `src/network/host/` 下拆分职责 |
| Client 镜像，不运行逻辑 | `src/network/client/ClientMirror.js` |
| 唯一 Game 接入层 | `src/network/bridge/GameNetworkBridge.js` |
| 通用房间身份与不透明转发 | `server/` |

`Game.js` 不直接处理 WebSocket。UnitRegistry、UnitLogicSystem、TargetingSystem、PathfindingSystem / MovementAgent、AttackSystem 和 CombatSystem 只在 Host 权威模拟中运行；ClientMirror 只复用渲染实体和 UI 能力。

### 13.3 当前实现与本规范的已知差距

以下是改造项，不是可继续沿用的设计：

1. `CoopSession.js`、`PlayerRunState.js`、`HostAuthority.js`、`SnapshotBuilder.js`、`server/index.js` 多处固定遍历 `p1` / `p2`。
2. `SnapshotBuilder` 当前以固定频率重复发送全体单位血量和玩家公开状态；应改为变化补丁，保留移动流和恢复快照。
3. Host 20Hz 权威位置流、Client 受限短时外推和独立击退状态事件已接入；仍需在双端实机中验证拥挤分离、连续转向和击退结束时的显示平滑度。
4. 私有状态当前按频率检查并序列化整包；应由牌区、资源、奖励和商店变更主动触发。
5. 奖励和商店选择当前大量使用 `index`；应替换为 Host 生成的 `choiceId` + revision。
6. `buildDeckFromIds` 当前使用 `Date.now()` / `Math.random()` 生成实例 ID；权威实例必须由 Host 依据 match 上下文生成稳定唯一 ID。
7. 房主本地操作存在直接调用游戏逻辑的可能；所有玩家必须统一走命令验证入口。
8. 现有文档和 UI 仍写“双人合作”；协议重构后再按产品进度开放多人入口。
9. 现有中继理解 `ROOM_READY`、`ROOM_START` 等游戏流程消息；应收敛为通用房间生命周期和不透明 payload 转发。
10. Client 已改用完整当前状态快照恢复，不再依赖断线期间的旧事件补发；仍需覆盖持续选择状态的双端实机回归。
11. Client 回连宽限期与 Host 房间清理租约已独立配置；仍需验证长对局后的断线、Host 离线探测和点击确认前二次校验。

在以上关键项完成前，不应继续用零散补丁修复准备后选卡竞态；应先统一状态机和权威命令流。

---

## 14. 验收清单

### 14.1 准备和选卡

- [ ] 3 名以上玩家可加入动态玩家列表，没有 `p1/p2` 分支崩溃。
- [ ] 任一玩家准备后修改牌组会正确取消准备。
- [ ] 全员准备只触发一次 Host 开局事务，每个 Client 只进入一次 loading。
- [ ] 开局选卡由 Host 分发，玩家选择使用 `selectionId + choiceId`。
- [ ] 重复、延迟或乱序选择不会重复给卡，也不会让 UI 回到旧阶段。
- [ ] 断线重连能恢复未完成的选卡界面和完整卡牌预览。

### 14.2 出牌和玩家控制域

- [ ] Host 与远端 Client 出同一张卡走相同验证逻辑。
- [ ] Client 只发送命令；Host 拒绝时没有任何权威状态被本地提前修改。
- [ ] 扣费、牌入弃牌堆、效果结算和 UI 更新以单个事务有序应用。
- [ ] 玩家不能控制其他玩家单位，不能使用其他玩家的 cardInstanceId。
- [ ] 每位玩家的牌组、能量、银币、能力、商店和奖励互不覆盖。

### 14.3 战斗同步

- [ ] 伤害、治疗、护盾、耐久事件包含 before/after，Client 不重复计算。
- [ ] 单位 effects 增删改和重连恢复正确，不依赖 Client Buff 逻辑。
- [ ] 血条下附魔 UI 根据同步 key/string 正确更新。
- [ ] 动画只在切换时同步，重连后能恢复当前动画。
- [ ] 移动、击退和停止流畅；静止单位不持续占用 transform 带宽。

### 14.4 模式

- [ ] PvE 多人共享基地，基地死亡后所有队员失败。
- [ ] 每个玩家的波次奖励由 Host 根据种子独立生成。
- [ ] PvP 每玩家独立基地，AI 势力能参与同一权威战斗。
- [ ] PvP 私有手牌、奖励和不可见实体没有泄露给对手。

### 14.5 重连与通用中继

- [ ] 非 Host Client 在普通战斗、移动、出牌和持续选择状态中闪退后都能恢复。
- [ ] 重连后按当前快照重建场上单位和全部私有牌区，不补发任何断线期间的旧网络事件。
- [ ] 玩家提交奖励选择后、收到结果前闪退，无论 Host 是否已处理，都不会重复发奖或丢失当前选择。
- [ ] 网络短暂中断和进程闪退使用同一套 Client 全量状态恢复流程。
- [ ] Client 只有在房间存在且 Host 在线时才显示回连确认；确认时 Host 已离线则中继拒绝回连。
- [ ] Host 断线后不提供回连；房间记录保留 60 秒用于通知和清理，之后释放。
- [ ] Host 页面或进程退出后不尝试从中继恢复已经丢失的权威游戏状态。
- [ ] 改变游戏 payload、增加消息类型或更新卡牌内容后，既有通用中继无需修改仍可正确转发。

### 14.6 基础验证

```powershell
node --check src/network/protocol/messages.js
node --check src/network/host/HostAuthority.js
node --check src/network/client/ClientMirror.js
node --check server/index.js
npm run build
```

联机回归至少使用两个独立浏览器上下文；多人协议完成后增加三客户端测试。测试重复命令、乱序消息、短线重连、高延迟和丢包，而不只测试同机低延迟直连。

---

## 15. 禁止事项

1. 禁止 Client 本地结算后再通知 Host。
2. 禁止按固定 `p1` / `p2` 写玩家业务逻辑。
3. 禁止用数组下标作为奖励、卡牌或商店选择的稳定身份。
4. 禁止循环广播没有变化的完整单位和私有状态。
5. 禁止把玩法 Buff 计算复制到 Client；Client 只维护同步特效和 UI 标记。
6. 禁止为击退另建客户端物理；统一跟随 Host 位移。
7. 禁止向全房广播 PvP 私有状态后仅在 UI 隐藏。
8. 禁止在 `Game.js` 散落 WebSocket 调用。
9. 禁止在中继服运行 Three.js 权威模拟。
10. 未经明确设计，不做 Host 迁移、客户端预测战斗或回滚网络码。
11. 禁止在全量重连快照之后重放已经包含在快照中的旧网络事件。
12. 禁止让中继服务器理解或分支处理卡牌、奖励、战斗和游戏流程消息。

---

## 16. 实施顺序

1. 先将中继收敛为稳定通用 envelope + 不透明 payload，并建立动态 `playerId` 数据模型。
2. 再完成大厅—加载—开局选卡状态机，优先消除当前准备后选卡竞态。
3. 将卡牌、资源、奖励和商店改为 Host 持续状态 + 事务式变化同步。
4. 将战斗状态改为 before/after 补丁，补齐 effects、附魔 UI 和动画切换事件。
5. 实现非 Host Client 的全量当前状态重连，不保留 `event_catchup` 历史补发路径。
6. 最后替换固定世界快照为移动流 + 变化补丁 + 恢复快照，并调优移动频率。
7. 双人 PvE 稳定后用三玩家 PvE 验证动态结构，再启用 PvP 可见性和独立基地规则。

每个阶段都必须先通过 `node --check`、`npm run build` 和对应的多客户端实际流程测试，再进入下一阶段。
