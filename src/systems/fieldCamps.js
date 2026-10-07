// 路边营地与「眼下该做什么」。
// 营地不刷新、不占刷怪点名额，打光后把配置里的战利品留在原地。
// 目标句是时钟加最近一处缺口：入夜倒计时，然后只说今晚还缺的那一步。

export function createFieldCampState(camps = []) {
  return {
    camps: (camps ?? []).map((camp) => ({
      ...camp,
      members: (camp.members ?? []).map((member) => ({ ...member })),
      drops: (camp.drops ?? []).map((drop) => ({ ...drop }))
    })),
    cleared: new Set()
  };
}

export function fieldCampById(state, campId) {
  return state?.camps?.find((camp) => camp.id === campId) ?? null;
}

/** 这支单位死后，营地是否刚好被清完。已经清过的不会再报一次。 */
export function noteFieldCampDeath(state, campId, units = []) {
  const camp = fieldCampById(state, campId);
  if (!camp || state.cleared.has(campId)) return { justCleared: false, camp };
  const stillAlive = (units ?? []).some((unit) => unit?.alive && unit.fieldCampId === campId);
  if (stillAlive) return { justCleared: false, camp };
  state.cleared.add(campId);
  return { justCleared: true, camp };
}

export function formatRaidClock(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** 还在出兵、且外圈门已经打开的巢穴，离基地近的排前面。 */
export function nearestSpawningNest(nests = [], baseX = 0, baseZ = 0) {
  const cleared = new Set((nests ?? []).filter((nest) => nest?.cleared).map((nest) => nest.id));
  const open = (nests ?? []).filter((nest) => {
    if (!nest || nest.cleared) return false;
    if (nest.gateNestId && !cleared.has(nest.gateNestId)) return false;
    return true;
  });
  open.sort((a, b) => {
    const da = Math.hypot((Number(a.x) || 0) - baseX, (Number(a.z) || 0) - baseZ);
    const db = Math.hypot((Number(b.x) || 0) - baseX, (Number(b.z) || 0) - baseZ);
    return da - db;
  });
  return open[0] ?? null;
}

function supplyGap(input) {
  if (!input.hasFurnace) return '把木头送进熔炉，烧成木炭。';
  if (!input.hasManaFurnace) return '魔力炉也没接上。';
  if (input.manaFurnaceFueled === false) return '魔力炉没有木炭，箭塔会在半夜停火。';
  return '';
}

/**
 * 防线缺口。
 *
 * 历史版本读的是 `nearest.defenseBuilt`（"北岬巢穴还没有箭塔"）——那是"每座巢穴配一个
 * 预设塔位"的旧设计遗留，玩家已明确否定预设塔位。现在只按**真实是否存在已建成的
 * 防御塔**（`input.hasDefenseTower`）判断，塔建在哪儿由玩家自己决定，文案也不再
 * 把塔和某一座巢穴的槽位绑在一起。
 */
function defenseGapText(input, nearest) {
  const name = nearest?.name || '最近的巢穴';
  const needsTower = Boolean(nearest) && input.hasDefenseTower !== true;
  const supply = supplyGap(input);
  if (needsTower && supply) {
    const tower = `夜里${name}会来，先造防御塔`;
    return supply.startsWith('魔力炉也没') ? `${tower}，${supply}` : `${tower}。${supply}`;
  }
  if (needsTower) return `夜里${name}会来，先造防御塔（建在基地供能范围内）。`;
  if (supply) return supply;
  if (input.towerPoweredDown) return `${name}方向的箭塔停火了。先给魔力炉补木炭。`;
  if ((Number(input.transportLinkCount) || 0) >= 2) {
    return '两条运输线可以挂与门、或门或非门：塔还在吃魔力时，停掉继续送木炭。';
  }
  if (nearest) {
    // 「拆掉这条线就不再出兵」只对没有外圈的点成立。
    // 内圈巢穴被拆的那一刻，它封印着的外圈点反而**开始**出兵——这句话说错方向，
    // 玩家会以为拆完内巢整个方向就安全了。所以这里按真实 gate 关系分两种说法。
    const unlocksOuter = (input.nests ?? []).some((nest) => (
      nest?.gateNestId && String(nest.gateNestId) === String(nearest.id)
    ));
    return unlocksOuter
      ? `去拆${name}：拆掉它这个方向停止出兵，但外圈巢穴会解除封印开始出兵。`
      : `去拆${name}。拆掉这条线就不再出兵。`;
  }
  return '刷怪点已经拆完。把还活着的敌人清掉。';
}

/**
 * 顶部那句「眼下」先报的那段时间前缀（生存关的目标句都以它开头）。
 * 单独导出：远征目标句要复用同一套文案与格式，不能自己再写一份分钟数换算。
 */
export function survivalClockText(input = {}) {
  const hasClock = Number.isFinite(Number(input.secondsRemaining));
  if (!hasClock) return input.isNight ? '入夜了' : '白天';
  return input.isNight
    ? `这一夜还剩 ${formatRaidClock(input.secondsRemaining)}`
    : `离入夜还有 ${formatRaidClock(input.secondsRemaining)}`;
}

/**
 * 顶部那句「眼下」。先报离入夜或这一夜还剩多久。
 * 营地没清完时，后面只带这座营地；清完后只谈最近一座还在出兵的巢穴和防线缺口。
 */
export function survivalObjectiveText(input = {}) {
  const camps = input.camps ?? [];
  const clearedIds = input.clearedIds ?? new Set();
  const clock = survivalClockText(input);
  const nextCamp = (camps ?? []).find((camp) => camp?.id && !clearedIds.has(camp.id));
  if (nextCamp) {
    const brief = nextCamp.brief || `去清掉${nextCamp.name}。`;
    return `${clock}。${brief}`;
  }
  const nearest = nearestSpawningNest(input.nests ?? [], input.baseX ?? 4, input.baseZ ?? 40);
  return `${clock}。${defenseGapText(input, nearest)}`;
}

/** 防线缺口的纯文本（远征目标句在入夜优先档里复用它，避免两套说法）。 */
export function defenseGapSentence(input = {}, nearest = null) {
  return defenseGapText(input, nearest);
}

/**
 * 顶部那一行能放下的**短提示**（一句话，不带倒计时前缀）。
 *
 * 为什么单独一条口径：完整目标句里有"先合成并装备傀儡木棒（木材×12 + 石料×4）…"
 * 这种上百字的说明，它是玩法解释不是"眼下要做什么"。顶部只留短句，长文整体迁到
 * 帮助面板（见 HelpPanelUi），但两处必须说同一个方向——所以这里复用与完整目标句
 * 相同的判据顺序。
 *
 * 刻意**不**把"去清掉西坡狼窝"放在开局第一句：开局只有一支木傀儡、没有任何战斗
 * 单位，让玩家去清 23 米外的两只狼只有送死一种结果（第 5 项实测确认）。完整目标句
 * 的原有顺序不变（有营地先说营地），短句这里先讲"打不过就先攒拳头"。
 */
export function survivalObjectiveCompactText(input = {}) {
  const camps = input.camps ?? [];
  const clearedIds = input.clearedIds ?? new Set();
  const nextCamp = (camps ?? []).find((camp) => camp?.id && !clearedIds.has(camp.id));
  const nearest = nearestSpawningNest(input.nests ?? [], input.baseX ?? 4, input.baseZ ?? 40);
  // 目前的开局档位：还没有专用武器（`needsWeapon` 由远征的装备口径给出）。
  if (input.loadout?.needsWeapon) {
    return nextCamp ? `先攒人手：清掉${nextCamp.name}` : (nearest ? `先攒人手：拆${nearest.name}` : '先给木傀儡装上武器');
  }
  if (nextCamp) return `清掉${nextCamp.name}`;
  if (nearest) {
    return input.isNight || input.towerPoweredDown
      ? `守住基地，拆${nearest.name}`
      : `下一目标：拆${nearest.name}`;
  }
  return '刷怪点已清完，清掉残余敌人';
}

/**
 * 帮助面板用的**完整开局说明**：把原先挤在顶部的那段长文原样放在这里。
 * 与顶部短句共用同一个来源（`openingLoadoutText`），所以两处不会各说一套。
 */
export function survivalObjectiveDetailText(input = {}, openingText = null) {
  const camps = input.camps ?? [];
  const clearedIds = input.clearedIds ?? new Set();
  const nextCamp = (camps ?? []).find((camp) => camp?.id && !clearedIds.has(camp.id));
  const nearest = nearestSpawningNest(input.nests ?? [], input.baseX ?? 4, input.baseZ ?? 40);
  const lines = [];
  if (nextCamp) lines.push(`眼下：清掉${nextCamp.name}（${nextCamp.brief ?? '营地在等你处理'}）`);
  else if (nearest) lines.push(`眼下：${defenseGapText(input, nearest)}`);
  if (openingText) lines.push(openingText);
  return lines;
}
