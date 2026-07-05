import { PLAYER_ABILITY_DEFINITIONS, TEAMS } from '../data/gameData.js';
import { distance2D } from '../utils/math.js';

const PERIODIC_ENERGY_SECONDS = 10;
const CARD_ENERGY_REFUND_CHANCE_PER_STACK = 0.16;
const ENCHANT_ECHO_CHANCE_PER_STACK = 0.2;
const DEATH_EXPLOSION_DAMAGE_PER_STACK = 10;
const DEATH_EXPLOSION_RADIUS = 3.2;
const BUILDING_DURABILITY_PER_STACK = 0.2;
const RANDOM_HEAL_PERCENT = 0.16;
const VICTORY_GOLD_PER_STACK = 0.2;

export class AbilitySystem {
  constructor(game) {
    this.game = game;
    this.abilities = new Map();
    this.periodicEnergyTimer = PERIODIC_ENERGY_SECONDS;
    this.updateUi();
  }

  update(dt) {
    const stacks = this.getStacks('periodicEnergy');
    if (stacks <= 0) return;
    this.periodicEnergyTimer -= dt;
    while (this.periodicEnergyTimer <= 0) {
      this.gainEnergy(stacks, this.game.playerBase?.position);
      this.periodicEnergyTimer += PERIODIC_ENERGY_SECONDS;
    }
  }

  acquire(abilityId, stacks = 1) {
    const definition = PLAYER_ABILITY_DEFINITIONS[abilityId];
    if (!definition) return false;
    const amount = Math.max(1, Math.floor(stacks));
    const existing = this.abilities.get(abilityId);
    const next = {
      ...definition,
      stacks: Math.max(0, existing?.stacks ?? 0) + amount
    };
    this.abilities.set(abilityId, next);
    if (abilityId === 'periodicEnergy' && !existing) {
      this.periodicEnergyTimer = PERIODIC_ENERGY_SECONDS;
    }
    if (abilityId === 'summonUseBonus') {
      this.game.cardSystem?.increaseUsesForKind?.('summon', amount);
    }
    this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
      text: `${definition.name}+${amount}`,
      color: definition.color,
      stroke: '#17201f',
      height: 3.1,
      duration: 0.82,
      fontSize: 78,
      baseHeight: 0.5
    });
    this.updateUi();
    return true;
  }

  onCardPlayed(card, drag) {
    if (card?.kind === 'enchant' && !drag?.skipAbilityTriggers) {
      this.tryEchoEnchant(card, drag);
    }
    this.triggerEnergyRefund(card);
    this.triggerRandomHeal(card);
  }

  onCardExhausted(card) {
    void card;
  }

  onFriendlyUnitDeath(unit) {
    const stacks = this.getStacks('deathExplosion');
    if (stacks <= 0 || !unit?.position || unit.isBuilding) return;
    const damage = DEATH_EXPLOSION_DAMAGE_PER_STACK * stacks;
    this.game.enemyUnits.forEach((enemy) => {
      if (!enemy.alive || distance2D(enemy.position, unit.position) > DEATH_EXPLOSION_RADIUS) return;
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
    this.game.effects.spawnRing(unit.position, '#ffb45c', DEATH_EXPLOSION_RADIUS, 0.48);
    this.game.effects.spawnHit({
      x: unit.position.x,
      y: (unit.position.y ?? 0) + 0.86,
      z: unit.position.z
    }, '#ffb45c');
  }

  applyNewBuildingDurability(unit) {
    const stacks = this.getStacks('buildingDurability');
    if (stacks <= 0 || !unit?.isBuilding || !unit.attributes) return;
    const source = 'ability:buildingDurability';
    unit.attributes.removeModifiersBySource(source);
    unit.attributes.addModifier({
      stat: 'maxDurability',
      type: 'multiply',
      percent: BUILDING_DURABILITY_PER_STACK * stacks
    }, source);
    unit.weapon.durability = unit.weapon.maxDurability;
  }

  getRewardMultiplier() {
    return 1 + VICTORY_GOLD_PER_STACK * this.getStacks('victoryGold');
  }

  getActiveAbilities() {
    return [...this.abilities.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  getStacks(abilityId) {
    return Math.max(0, this.abilities.get(abilityId)?.stacks ?? 0);
  }

  getCardUseBonus(card) {
    if (card?.kind === 'summon') return this.getStacks('summonUseBonus');
    return 0;
  }

  tryEchoEnchant(card, drag) {
    const stacks = this.getStacks('enchantEcho');
    if (stacks <= 0) return;
    const chance = Math.min(1, ENCHANT_ECHO_CHANCE_PER_STACK * stacks);
    if (Math.random() >= chance) return;
    const repeated = this.game.cardEffects.resolve({
      ...drag,
      card,
      skipAbilityTriggers: true
    });
    if (repeated) {
      this.game.effects.spawnDamageNumber(this.game.playerBase.position, 1, {
        text: '附魔回响',
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
    const stacks = this.getStacks('randomHealOnCard');
    if (stacks <= 0) return;
    const targets = this.game.friendlyUnits.filter((unit) => (
      unit.alive &&
      unit.team === TEAMS.PLAYER &&
      !unit.isBuilding &&
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

  gainEnergy(amount, position = null) {
    const gained = this.game.cardSystem.addEnergy(amount);
    if (gained > 0 && position) {
      this.game.effects.spawnEnergyNumber(position, gained, {
        height: 2.72
      });
    }
    return gained;
  }

  updateUi() {
    this.game.cardSystem?.updateAbilityIcons?.(this.getActiveAbilities());
  }
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}
