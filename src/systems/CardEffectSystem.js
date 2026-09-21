import { BUFF_DEFINITIONS, TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';
import { RUNE_ERROR_LABELS } from './RuneStoneSystem.js';
import { shouldConsumeWaveRewardCard } from './waveRewardPool.js';

export class CardEffectSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      'spawn-units': (context) => this.spawnUnits(context),
      'build-structure': (context) => this.buildStructure(context),
      'create-area-effect': (context) => this.createAreaEffect(context),
      'cast-spell': (context) => this.castSpell(context),
      'cast-meteor-barrage': (context) => this.castMeteorBarrage(context),
      'apply-buff': (context) => this.applyBuff(context),
      'apply-random-enchantments': (context) => this.applyRandomEnchantments(context),
      'apply-team-generic-upgrade': (context) => this.applyTeamGenericUpgrade(context),
      'apply-team-special-upgrade': (context) => this.applyTeamSpecialUpgrade(context),
      'increase-enchantment-slots': (context) => this.increaseEnchantmentSlots(context),
      'acquire-ability': (context) => this.acquireAbility(context),
      'gain-energy': (context) => this.gainEnergy(context),
      'gain-energy-from-units': (context) => this.gainEnergyFromUnits(context),
      'draw-temporary-cards': (context) => this.drawTemporaryCards(context),
      'corrupt-hand-card': (context) => this.corruptHandCard(context),
      'mark-hunt-zone': (context) => this.markHuntZone(context),
      'gamble-silver': (context) => this.gambleSilver(context)
    };
  }

  /**
   * 当前操作的玩家槽位。resolve 会把槽位注入处理函数，但直接调用某个
   * 处理函数（例如随机附魔）时没有该参数，因此统一在这里兜底解析，
   * 保证符文石归属永远落在正确的玩家经济上。
   */
  currentPlayerId() {
    return this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
  }

  resolve(drag) {
    const card = drag.card;
    const effect = card.effect ?? legacyEffectFor(card);
    const handler = this.handlers[effect.type];
    if (!handler) {
      console.warn(`No card effect handler for ${effect.type}`);
      return false;
    }

    const resolved = handler({
      card,
      effect,
      playerId: this.currentPlayerId(),
      point: drag.point?.clone(),
      targetUnit: drag.targetUnit,
      targetCard: drag.targetCard,
      // 本次出牌实际支付的能量：符文石用它作为后续出售基准。
      playEnergyCost: drag.playEnergyCost
    });
    if (resolved === false) return false;
    this.game.lastCardPlayed = card.id;
    return true;
  }

  spawnUnits({ card, effect, point }) {
    if (!point || this.game.canDeploySummonAt?.(point) === false) return false;
    const baseCount = effect.count ?? card.count;
    const abilityOwner = this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
    const reinforcementBonus = this.game.abilitiesFor?.(abilityOwner)?.getSummonReinforcementBonus?.(card) ?? 0;
    this.game.summonUnits(
      effect.unitType ?? card.unitType,
      Math.max(1, Math.floor(baseCount ?? 1) + reinforcementBonus),
      point,
      card.radius,
      { sourceCard: card }
    );
    return true;
  }

  applyTeamGenericUpgrade({ effect }) {
    return Boolean(this.game.applyTeamGenericUpgrade?.(effect?.upgrade));
  }

  applyTeamSpecialUpgrade({ effect }) {
    return Boolean(this.game.applyTeamSpecialUpgrade?.(effect?.unitType, effect?.upgrade));
  }

  buildStructure({ card, effect, point }) {
    if (!point) return false;
    const unitType = effect.unitType ?? card.unitType;
    if (unitType === 'beacon' && this.game.canPlaceBeaconAt?.(point) === false) return false;
    this.game.buildStructureUnit(effect.unitType ?? card.unitType, point, {
      sourceCard: card,
      buildSeconds: effect.buildSeconds ?? card.buildSeconds
    });
    return true;
  }

  createAreaEffect({ card, effect, playerId, point }) {
    if (!point) return false;
    return Boolean(this.game.areaEffects.create(effect.areaEffect ?? effect, point, card, { playerId }));
  }

  castSpell({ card, effect, playerId, point }) {
    return this.game.spells.cast(effect.spellId, {
      card,
      effect,
      playerId,
      point
    });
  }

  castMeteorBarrage({ card, effect, playerId, point }) {
    if (!point) return false;
    const strikeCount = Math.max(0, Math.floor(this.game.runCardsPlayedCount ?? 0) + 1);
    if (strikeCount <= 0) return false;
    return this.game.spells.cast('meteor-barrage', {
      card,
      effect,
      playerId,
      point,
      count: strikeCount
    });
  }

  applyBuff({ card, effect, targetUnit, playerId = null, playEnergyCost }) {
    const buffId = effect.buffId ?? card.enchantmentId;
    const cardLevel = Math.max(1, Math.floor(card.level ?? 1));
    const definition = BUFF_DEFINITIONS[buffId];
    const isEnchantment = definition?.category === 'enchantment';
    // 附魔卡不再直接挂 Buff：消耗一次，生成一块符文石。
    // 有目标单位 → 进该单位符文背包并生效；没有目标 → 进基地背包（拖到空处）。
    if (isEnchantment) {
      return this.createRuneStoneFromCard({
        card,
        enchantmentDefinition: definition,
        targetUnit,
        playerId: playerId ?? this.currentPlayerId(),
        playEnergyCost
      });
    }
    if (!targetUnit) return false;
    const buff = this.game.buffs.applyBuff(targetUnit, buffId, null, {
      sourceCard: card.id,
      level: cardLevel
    });
    if (!buff) return false;
    const visualDefinition = buff ?? definition;
    this.game.effects.spawnRing(targetUnit.position, visualDefinition?.color ?? card.color, 0.85, 0.6);
    this.game.selectUnit(targetUnit);
    return true;
  }

  /** 附魔卡的唯一出口：交给 RuneStoneSystem 权威生成符文石。 */
  createRuneStoneFromCard({ card, enchantmentDefinition, targetUnit, playerId, playEnergyCost }) {
    const runeStones = this.game.runeStones;
    if (!runeStones?.createFromCard) {
      this.showRuneFailure(targetUnit, '无法生成符文石');
      return false;
    }
    const paidEnergy = Number.isFinite(playEnergyCost)
      ? playEnergyCost
      : Math.max(0, Number(card.energyCost ?? 1));
    const result = runeStones.createFromCard(card, {
      playerId,
      targetUnit: targetUnit ?? null,
      paidEnergy
    });
    if (!result?.ok) {
      this.showRuneFailure(targetUnit, RUNE_ERROR_LABELS[result?.reason] ?? '无法生成符文石');
      return false;
    }
    const color = enchantmentDefinition?.color ?? card.color ?? '#b68cff';
    const ringPosition = targetUnit?.position ?? this.game.playerBase?.position ?? null;
    if (ringPosition) {
      this.game.effects.spawnRing(ringPosition, color, 0.85, 0.6);
    }
    if (targetUnit) this.game.selectUnit(targetUnit);
    return true;
  }

  /** 符文石生成失败（背包已满 / 同名已携带 / 目标无效）时的浮动提示。 */
  showRuneFailure(targetUnit, text) {
    const position = targetUnit?.position
      ?? this.game.playerBase?.position
      ?? null;
    if (!position) return;
    this.game.effects.spawnDamageNumber(position, 1, {
      text,
      color: '#ffb0a4',
      stroke: '#421b18',
      height: targetUnit?.projectileHitHeight ?? 1.55,
      duration: 0.9,
      fontSize: 74,
      baseHeight: 0.5
    });
  }

  applyRandomEnchantments({ card, effect, targetUnit, playerId = null }) {
    if (!targetUnit) return false;
    const ownerId = playerId ?? this.currentPlayerId();
    const count = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'count', 1)));
    const enchantmentIds = Object.entries(BUFF_DEFINITIONS)
      .filter(([, definition]) => definition.category === 'enchantment' && !definition.retired)
      .map(([id]) => id);
    if (!enchantmentIds.length) return false;
    const runeStones = this.game.runeStones;
    if (!runeStones?.createFromCard) return false;
    const stoneLevel = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'level', 1)));
    let applied = 0;
    for (let index = 0; index < count; index += 1) {
      const enchantmentId = enchantmentIds[Math.floor(Math.random() * enchantmentIds.length)];
      // 随机结果允许重复；同名/容量冲突由 createFromCard 拒绝，直接跳过该次。
      const result = runeStones.createFromCard(
        { id: card.id, level: stoneLevel, enchantmentId },
        { playerId: ownerId, targetUnit, paidEnergy: 0 }
      );
      if (result?.ok) applied += 1;
    }
    if (applied <= 0) return false;
    this.game.effects.spawnRing(targetUnit.position, card.color ?? '#b68cff', 1.1, 0.75);
    this.game.effects.spawnDamageNumber(targetUnit.position, 1, {
      text: `随机附魔x${applied}`,
      color: card.color ?? '#d8b7ff',
      stroke: '#21132f',
      height: targetUnit.projectileHitHeight ?? 1.55,
      duration: 0.8,
      fontSize: 72,
      baseHeight: 0.48
    });
    this.game.selectUnit(targetUnit);
    return true;
  }

  increaseEnchantmentSlots({ card, effect, targetUnit }) {
    if (!targetUnit) return false;
    const amount = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'amount', 1)));
    targetUnit.maxEnchantmentSlots = Math.max(
      targetUnit.enchantments?.size ?? 0,
      Math.floor(targetUnit.maxEnchantmentSlots ?? 5) + amount
    );
    targetUnit.statusUiDirty = true;
    this.game.effects.spawnRing(targetUnit.position, card.color ?? '#63e0c4', 0.95, 0.72);
    this.game.effects.spawnDamageNumber(targetUnit.position, 1, {
      text: `附魔槽 +${amount}`,
      color: card.color ?? '#9fffe8',
      stroke: '#12352f',
      height: targetUnit.projectileHitHeight ?? 1.55,
      duration: 0.9,
      fontSize: 76,
      baseHeight: 0.5
    });
    this.game.selectUnit(targetUnit);
    return true;
  }

  showEnchantmentSlotFailure(targetUnit) {
    this.game.effects.spawnDamageNumber(targetUnit.position, 1, {
      text: '附魔槽已满',
      color: '#ffb0a4',
      stroke: '#421b18',
      height: targetUnit.projectileHitHeight ?? 1.55,
      duration: 0.9,
      fontSize: 74,
      baseHeight: 0.5
    });
  }

  acquireAbility({ card, effect }) {
    const abilityId = effect.abilityId ?? card.abilityId;
    const stacks = resolveCardEffectNumber(card, effect, 'stacks', 1);
    const durationSeconds = resolveCardEffectNumber(card, effect, 'durationSeconds', effect.durationSeconds ?? 0);
    const abilityOwner = this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
    return this.game.abilitiesFor?.(abilityOwner)?.acquire(abilityId, stacks, { durationSeconds }) === true;
  }

  gainEnergy({ card, effect }) {
    const amount = resolveCardEffectNumber(card, effect, 'amount', effect.amount ?? 0);
    this.game.cardSystem.addEnergy(amount);
    return true;
  }

  gambleSilver({ card }) {
    const playerId = this.game.activeEconomySlot
      ?? this.game.cardSystem?.playerSlot
      ?? this.game.localPlayerSlot;
    const before = Math.max(0, this.game.getSilver?.(playerId) ?? this.game.silver ?? 0);
    const doubled = Math.random() < 0.5;
    const after = doubled ? before * 2 : 0;
    if (typeof this.game.setSilver === 'function') {
      this.game.setSilver(after, playerId);
    } else {
      this.game.silver = after;
    }
    const position = this.game.playerBase?.position ?? null;
    this.game.updateHud(0);
    if (this.game.runShopOpen) this.game.renderRunShop();
    if (position) {
      this.game.effects.spawnDamageNumber(position, 1, {
        text: doubled ? '银币翻倍' : '银币清空',
        color: doubled ? '#ffe08a' : '#d8a0a0',
        stroke: doubled ? '#4a3818' : '#3a2020',
        height: 3.05,
        duration: 0.88,
        fontSize: 82,
        baseHeight: 0.5
      });
      this.game.effects.spawnRing(position, card.color ?? '#d8b85a', 1.15, 0.48);
    }
    return true;
  }

  gainEnergyFromUnits({ card, effect, playerId }) {
    const perUnit = resolveCardEffectNumber(card, effect, 'amountPerUnit', 1);
    const friendlyCount = this.game.friendlyUnits.filter((unit) => (
      unit.alive &&
      unit.team === TEAMS.PLAYER &&
      (this.game.unitBelongsToPlayer?.(unit, playerId) ?? true) &&
      !unit.underConstruction
    )).length;
    const amount = friendlyCount * perUnit;
    if (amount <= 0) return false;
    const gained = this.game.cardSystem.addEnergy(amount);
    if (gained > 0) {
      this.game.effects.spawnEnergyNumber(this.game.playerBase.position, gained, {
        height: 3.05
      });
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: `集结+${gained}`,
        color: card.color ?? '#7f8fc7',
        stroke: '#1a2240',
        height: 3.2,
        duration: 0.78,
        fontSize: 76,
        baseHeight: 0.5
      });
    }
    return gained > 0;
  }

  drawTemporaryCards({ card, effect }) {
    const amount = Math.max(1, Math.floor(resolveCardEffectNumber(card, effect, 'amount', 1)));
    let drawn = this.game.cardSystem.drawTemporaryCards(amount, {
      temporaryLimit: effect.temporaryLimit,
      overflowToDrawTop: true,
      preferHandSlots: true
    });
    if (drawn < amount && effect.fallbackPool === 'wave-reward-pool') {
      drawn += this.game.cardSystem.addTemporaryCardsFromPool(
        this.game.waveRewardCardPool?.() ?? [],
        amount - drawn,
        {
          temporaryLimit: effect.temporaryLimit,
          overflowToDrawTop: true,
          preferHandSlots: true,
          prefix: `tactic-${card.id}-${Date.now()}`,
          onCardCreated: (definition) => {
            if (shouldConsumeWaveRewardCard({
              rewardSource: 'wave-reward-deck',
              action: 'add-card',
              card: definition
            })) {
              this.game.consumeWaveRewardCard?.(definition);
            }
          }
        }
      );
    }
    return drawn > 0;
  }

  corruptHandCard({ card, effect, targetCard }) {
    void effect;
    if (!targetCard || targetCard === card) return false;
    targetCard.exhaust = true;
    targetCard.energyCost = 0;
    if (!Number.isFinite(targetCard.maxUses)) {
      targetCard.maxUses = 1;
      targetCard.remainingUses = 1;
    }
    this.game.cardSystem.renderHand?.();
    this.game.cardSystem.updateCardAffordability?.();
    this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
      text: '0费消耗',
      color: card.color ?? '#9f6b70',
      stroke: '#3a272c',
      height: 3,
      duration: 0.78,
      fontSize: 76,
      baseHeight: 0.48
    });
    return true;
  }

  markHuntZone({ card, effect, point }) {
    if (!point) return false;
    const radius = card.radius ?? effect.radius ?? 3;
    const buffId = effect.buffId ?? 'huntMarked';
    let marked = 0;
    this.game.enemyUnits.forEach((enemy) => {
      if (!enemy.alive || enemy.underConstruction) return;
      if (distance2D(enemy.position, point) > radius) return;
      const buff = this.game.buffs.applyBuff(enemy, buffId, null, {
        sourceCard: card.id
      });
      if (buff) marked += 1;
    });
    if (marked <= 0) return false;
    this.game.effects.spawnRing(point, card.color ?? '#ff8866', radius, 0.55);
    this.game.effects.spawnDamageNumber(point, 1, {
      text: `猎标x${marked}`,
      color: card.color ?? '#ff8866',
      stroke: '#4a2018',
      height: 1.2,
      duration: 0.82,
      fontSize: 74,
      baseHeight: 0.42
    });
    return true;
  }

}

function resolveCardEffectNumber(card, effect, field, fallback = 0) {
  if (Number.isFinite(effect[field])) return effect[field];
  const level = Math.max(1, Math.floor(card?.level ?? 1));
  const base = Number.isFinite(effect[`${field}Base`]) ? effect[`${field}Base`] : fallback;
  const perLevel = Number.isFinite(effect[`${field}PerLevel`])
    ? effect[`${field}PerLevel`]
    : 0;
  return base + perLevel * Math.max(0, level - 1);
}

function legacyEffectFor(card) {
  if (card.kind === 'summon') {
    return {
      type: 'spawn-units',
      unitType: card.unitType,
      count: card.count
    };
  }

  if (card.kind === 'spell') {
    return {
      type: 'cast-spell',
      spellId: card.id
    };
  }

  return {
    type: 'apply-buff',
    buffId: card.enchantmentId
  };
}
