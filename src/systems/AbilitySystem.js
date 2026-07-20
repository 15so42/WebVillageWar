import { PLAYER_ABILITY_DEFINITIONS, TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

const KILL_HARVEST_ENERGY_PER_STACK = 0.35;
const CARD_ENERGY_REFUND_CHANCE_PER_STACK = 0.16;
const ENCHANT_RESONANCE_CHANCE_PER_STACK = 0.12;
const MARTYRDOM_DAMAGE_PER_STACK = 15;
const MARTYRDOM_RADIUS = 3.2;
const MARTYRDOM_RADIUS_BONUS = 0.25;
const BUILDING_STAT_PER_STACK = 0.25;
const RANDOM_HEAL_PERCENT = 0.16;
const TRIAGE_HEAL_PERCENT = 0.12;
const VICTORY_GOLD_PER_STACK = 0.2;
const WAR_DRUM_CARDS_PER_DRAW = 3;
const BLOOD_RAGE_ENERGY_PER_KILL = 1;
const ARSENAL_ATTACK_PER_SUMMON = 1;
const SUMMON_REINFORCEMENT_CHANCE_PER_STACK = 0.5;
const PERIODIC_ENERGY_INTERVAL_SECONDS = 10;

export class AbilitySystem {
  constructor(game, options = {}) {
    this.game = game;
    this.playerSlot = options.playerSlot ?? game?.localPlayerSlot ?? 'p1';
    this.mountUi = options.mountUi !== false;
    this.abilities = new Map();
    this.warDrumCardCounter = 0;
    this.periodicEnergyTimer = 0;
    this.updateUi();
  }

  get cardSystem() {
    return this.game.cardSystems?.[this.playerSlot] ?? this.game.cardSystem;
  }

  ownedFriendlyUnits({ includeBuildings = true } = {}) {
    return this.game.friendlyUnits.filter((unit) => {
      if (!unit?.alive || unit.team !== TEAMS.PLAYER) return false;
      if (!includeBuildings && unit.isBuilding) return false;
      if (!this.game.coop?.enabled) return true;
      return !unit.ownerPlayerId || unit.ownerPlayerId === this.playerSlot;
    });
  }

  update(dt) {
    this.expireTimedAbilities();
    this.tickPeriodicEnergy(dt);
  }

  acquire(abilityId, stacks = 1, options = {}) {
    const definition = PLAYER_ABILITY_DEFINITIONS[abilityId];
    if (!definition) return false;
    const amount = Math.max(1, Math.floor(stacks));
    const durationSeconds = Math.max(0, Number(options.durationSeconds ?? 0));
    const expiresAt = durationSeconds > 0
      ? (this.game.elapsedTime ?? 0) + durationSeconds
      : null;
    const existing = this.abilities.get(abilityId);
    const next = {
      ...definition,
      stacks: Math.max(0, existing?.stacks ?? 0) + amount,
      expiresAt: expiresAt ?? existing?.expiresAt ?? null
    };
    if (expiresAt != null) {
      next.expiresAt = expiresAt;
    }
    this.abilities.set(abilityId, next);
    if (!options.silent) {
      const durationText = expiresAt != null ? ` ${durationSeconds}s` : '';
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: `${definition.name}+${amount}${durationText}`,
        color: definition.color,
        stroke: '#17201f',
        height: 3.1,
        duration: 0.82,
        fontSize: 78,
        baseHeight: 0.5
      });
    }
    this.updateUi();
    return true;
  }

  onCardPlayed(card, drag) {
    if (card?.kind === 'enchant' && !drag?.skipAbilityTriggers) {
      this.tryEchoEnchant(card, drag);
    }
    this.triggerEnergyRefund(card);
    this.triggerRandomHeal(card);
    this.triggerRevivalMatrix(card);
    this.triggerWarDrum(card);
  }

  onEnemyKilled(unit, position = null) {
    const harvestStacks = this.getStacks('killHarvest');
    if (harvestStacks > 0) {
      this.gainEnergy(harvestStacks * KILL_HARVEST_ENERGY_PER_STACK, position ?? unit?.position);
    }
    const bloodRageStacks = this.getStacks('bloodRage');
    if (bloodRageStacks > 0) {
      this.gainEnergy(BLOOD_RAGE_ENERGY_PER_KILL * bloodRageStacks, position ?? unit?.position);
    }
  }

  onFriendlyUnitSummoned(unit, sourceCard = null) {
    void sourceCard;
    if (this.game.coop?.enabled && unit?.ownerPlayerId && unit.ownerPlayerId !== this.playerSlot) {
      return;
    }
    this.applySummonEndurance(unit);
    if (!this.getStacks('arsenal') || !unit?.alive || unit.team !== TEAMS.PLAYER) return;
    const unitType = unit.type;
    if (!unitType) return;
    const sourceTag = `ability:arsenal:${unitType}:${Math.floor((this.game.elapsedTime ?? 0) * 10)}`;
    this.ownedFriendlyUnits().forEach((ally) => {
      if (!ally.alive || ally.type !== unitType) return;
      ally.attributes.addModifiers([
        {
          stat: 'attackDamage',
          type: 'add',
          amount: ARSENAL_ATTACK_PER_SUMMON
        }
      ], sourceTag);
      ally.statusUiDirty = true;
      this.game.effects.spawnRing(ally.position, '#d8c58d', 0.62, 0.34);
    });
  }

  onFriendlyUnitDeath(unit) {
    if (!unit?.position || unit.isBuilding) return;
    if (this.game.coop?.enabled && unit.ownerPlayerId && unit.ownerPlayerId !== this.playerSlot) {
      return;
    }
    const stacks = this.getStacks('martyrdomLine');
    if (stacks <= 0) return;
    const damage = MARTYRDOM_DAMAGE_PER_STACK * stacks;
    const radius = MARTYRDOM_RADIUS + MARTYRDOM_RADIUS_BONUS * stacks;
    this.game.enemyUnits.forEach((enemy) => {
      if (!enemy.alive || distance2D(enemy.position, unit.position) > radius) return;
      this.game.combat.applyDamage(enemy, damage, unit, 0.6, {
        damage,
        source: unit,
        target: enemy,
        defenseDamageType: 'physical',
        damageTypes: new Set(),
        isAttack: false,
        isExplosionDamage: true,
        damageNumberHeight: enemy.projectileHitHeight ?? 1.45,
        damageNumberDuration: 0.68
      });
    });
    this.game.effects.spawnRing(unit.position, '#ffb45c', radius, 0.48);
    this.game.effects.spawnHit({
      x: unit.position.x,
      y: (unit.position.y ?? 0) + 0.86,
      z: unit.position.z
    }, '#ffb45c');
  }

  applyNewBuildingDurability(unit) {
    if (!unit?.isBuilding || !unit.attributes) return;
    const stacks = this.getStacks('fortificationDoctrine');
    if (stacks <= 0) return;

    unit.attributes.removeModifiersBySource('ability:fortificationDoctrine');
    const percent = BUILDING_STAT_PER_STACK * stacks;
    unit.attributes.addModifiers([
      { stat: 'maxHealth', type: 'multiply', percent },
      { stat: 'maxDurability', type: 'multiply', percent }
    ], 'ability:fortificationDoctrine');
    unit.health = unit.maxHealth;
    unit.weapon.durability = unit.weapon.maxDurability;
  }

  applySummonEndurance(unit) {
    const stacks = this.getStacks('summonEndurance');
    if (stacks <= 0 || !unit?.alive || unit.team !== TEAMS.PLAYER || unit.isBuilding) return;
    const source = 'ability:summonEndurance';
    unit.attributes.removeModifiersBySource(source);
    const percent = 0.2 * stacks;
    unit.attributes.addModifiers([
      {
        stat: 'maxHealth',
        type: 'multiply',
        percent
      }
    ], source);
    unit.health = unit.maxHealth;
    unit.statusUiDirty = true;
  }

  getRewardMultiplier() {
    return 1 + VICTORY_GOLD_PER_STACK * this.getStacks('victoryGold');
  }

  getDotDamageMultiplier(source) {
    if (!source || source.team !== TEAMS.PLAYER) return 1;
    if (this.getStacks('venomSpread') <= 0) return 1;
    return 2;
  }

  getActiveAbilities() {
    this.expireTimedAbilities();
    return [...this.abilities.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  getStacks(abilityId) {
    this.expireTimedAbilities();
    return Math.max(0, this.abilities.get(abilityId)?.stacks ?? 0);
  }

  getCardUseBonus(card) {
    void card;
    return 0;
  }

  getSummonReinforcementBonus(card) {
    if (card?.kind !== 'summon') return 0;
    return this.rollSummonReinforcementBonus(this.getStacks('legionExpansion'), card);
  }

  rollSummonReinforcementBonus(stacks, card = null) {
    if (stacks <= 0) return 0;
    let remainingChance = stacks * SUMMON_REINFORCEMENT_CHANCE_PER_STACK;
    let bonus = 0;
    while (remainingChance >= 1) {
      bonus += 1;
      remainingChance -= 1;
    }
    if (remainingChance > 0 && Math.random() < remainingChance) {
      bonus += 1;
    }
    if (bonus > 0 && card?.energyCost != null) {
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: `增援x${bonus}`,
        color: '#8fdc9b',
        stroke: '#1a3024',
        height: 3,
        duration: 0.72,
        fontSize: 76,
        baseHeight: 0.48
      });
    }
    return bonus;
  }

  tryEchoEnchant(card, drag) {
    const stacks = this.getStacks('enchantResonance');
    if (stacks <= 0) return;
    const chance = Math.min(1, ENCHANT_RESONANCE_CHANCE_PER_STACK * stacks);
    if (Math.random() >= chance) return;
    const repeated = this.game.cardEffects.resolve({
      ...drag,
      card,
      skipAbilityTriggers: true
    });
    if (repeated) {
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: '附魔共鸣',
        color: '#d8b7ff',
        stroke: '#21132f',
        height: 3,
        duration: 0.72,
        fontSize: 76,
        baseHeight: 0.48
      });
    }
  }

  triggerEnergyRefund(card) {
    const stacks = this.getStacks('exhaustEnergy');
    if (stacks <= 0 || (card?.energyCost ?? 0) <= 0) return;
    const chance = Math.min(0.5, CARD_ENERGY_REFUND_CHANCE_PER_STACK * stacks);
    if (Math.random() >= chance) return;
    this.gainEnergy(1, this.game.playerBase?.position);
  }

  triggerRandomHeal(card) {
    void card;
    const stacks = this.getStacks('randomHealOnCard');
    if (stacks <= 0) return;
    const targets = this.ownedFriendlyUnits({ includeBuildings: false }).filter((unit) => (
      !unit.underConstruction
    ));
    if (!targets.length) return;
    const shuffled = shuffle([...targets]);
    const count = Math.min(stacks, shuffled.length);
    for (let i = 0; i < count; i += 1) {
      const target = shuffled[i];
      const amount = target.maxHealth * RANDOM_HEAL_PERCENT;
      const healed = target.restoreHealth(amount);
      this.game.effects.spawnHealNumber(target.position, healed, {
        displayAmount: amount,
        color: '#9dffb0',
        height: target.projectileHitHeight ?? 1.52
      });
      if (healed > 0.01) {
        this.game.effects.spawnRing(target.position, '#9dffb0', 0.5, 0.32);
      }
    }
  }

  triggerRevivalMatrix(card) {
    void card;
    const stacks = this.getStacks('revivalMatrix');
    if (stacks <= 0) return;
    const targets = this.ownedFriendlyUnits({ includeBuildings: false }).filter((unit) => (
      !unit.underConstruction
    ));
    if (!targets.length) return;
    const target = targets.reduce((lowest, unit) => (
      !lowest || (unit.health / unit.maxHealth) < (lowest.health / lowest.maxHealth) ? unit : lowest
    ), null);
    if (!target) return;
    const amount = target.maxHealth * TRIAGE_HEAL_PERCENT * stacks;
    const healed = target.restoreHealth(amount);
    if (healed <= 0.01) return;
    this.game.effects.spawnHealNumber(target.position, healed, {
      displayAmount: amount,
      color: '#7dffb8',
      height: target.projectileHitHeight ?? 1.52
    });
    this.game.effects.spawnRing(target.position, '#7dffb8', 0.62, 0.36);
    this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
      text: '复苏矩阵',
      color: '#7dffb8',
      stroke: '#12342d',
      height: 3,
      duration: 0.72,
      fontSize: 76,
      baseHeight: 0.48
    });
  }

  triggerWarDrum(card) {
    void card;
    if (this.getStacks('warDrum') <= 0) return;
    this.warDrumCardCounter += 1;
    if (this.warDrumCardCounter < WAR_DRUM_CARDS_PER_DRAW) return;
    this.warDrumCardCounter = 0;
    const before = this.cardSystem?.handCards?.length ?? 0;
    this.cardSystem?.drawToFullHand?.({ animate: this.mountUi });
    this.cardSystem?.renderHand?.();
    const after = this.cardSystem?.handCards?.length ?? 0;
    if (after <= before) return;
    this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
      text: '战鼓抽牌',
      color: '#ffd166',
      stroke: '#4a3010',
      height: 3,
      duration: 0.72,
      fontSize: 76,
      baseHeight: 0.48
    });
  }

  gainEnergy(amount, position = null) {
    const gained = this.cardSystem?.addEnergy?.(amount) ?? 0;
    if (gained > 0 && position) {
      this.game.effects.spawnEnergyNumber(position, gained, {
        height: 2.72
      });
    }
    return gained;
  }

  updateUi() {
    if (!this.mountUi) return;
    this.cardSystem?.updateAbilityIcons?.(
      this.getActiveAbilities().filter((ability) => this.getStacks(ability.id) > 0)
    );
  }

  tickPeriodicEnergy(dt) {
    const stacks = this.getStacks('periodicEnergy');
    if (stacks <= 0) {
      this.periodicEnergyTimer = 0;
      return;
    }
    this.periodicEnergyTimer += dt;
    while (this.periodicEnergyTimer >= PERIODIC_ENERGY_INTERVAL_SECONDS) {
      this.periodicEnergyTimer -= PERIODIC_ENERGY_INTERVAL_SECONDS;
      this.gainEnergy(stacks, this.game.playerBase?.position);
    }
  }

  expireTimedAbilities() {
    const now = this.game.elapsedTime ?? 0;
    let changed = false;
    this.abilities.forEach((ability, abilityId) => {
      if (ability.expiresAt == null || now < ability.expiresAt) return;
      this.abilities.delete(abilityId);
      changed = true;
    });
    if (changed) {
      this.updateUi();
    }
  }
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}
