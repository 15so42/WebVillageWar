import {
  encodeAnimPhase,
  quantizePosition,
  quantizeYaw,
  SYNC,
  visualStateCode
} from '../protocol/syncConfig.js';
import { MSG } from '../protocol/messages.js';

export class SnapshotBuilder {
  constructor(game) {
    this.game = game;
    this.tick = 0;
    this.worldTimer = 0;
    this.transformTimer = 0;
    this.eventBuffer = [];
    this.maxEventMs = 30_000;
  }

  update(dt) {
    this.worldTimer += dt;
    this.transformTimer += dt;
    const outputs = [];
    if (this.worldTimer >= 1 / SYNC.worldHz) {
      this.worldTimer = 0;
      this.tick += 1;
      outputs.push({ type: MSG.SNAPSHOT_WORLD, payload: this.buildWorldSnapshot() });
    }
    if (this.transformTimer >= 1 / SYNC.transformHz) {
      this.transformTimer = 0;
      outputs.push({ type: MSG.SNAPSHOT_TRANSFORM, payload: this.buildTransformSnapshot() });
    }
    return outputs;
  }

  buildWorldSnapshot() {
    const game = this.game;
    return {
      tick: this.tick,
      serverTime: Date.now(),
      playerBase: {
        hp: Math.round(game.playerBase.health),
        maxHp: Math.round(game.playerBase.maxHealth),
        durability: Math.round(game.playerBase.structureDurability ?? 0),
        maxDurability: Math.round(game.playerBase.maxStructureDurability ?? 0)
      },
      enemyCamp: {
        hp: Math.round(game.enemyCamp.health),
        maxHp: Math.round(game.enemyCamp.maxHealth)
      },
      wave: {
        index: game.wave ?? 0,
        label: game.currentWave?.label ?? ''
      },
      units: this.collectUnitWorldRows(),
      playersPublic: this.collectPlayersPublic()
    };
  }

  buildTransformSnapshot() {
    return {
      tick: this.tick,
      serverTime: Date.now(),
      transforms: this.collectTransformRows()
    };
  }

  buildFullSnapshot() {
    return {
      tick: this.tick,
      serverTime: Date.now(),
      world: this.buildWorldSnapshot(),
      transform: this.buildTransformSnapshot()
    };
  }

  collectUnitWorldRows() {
    const rows = [];
    const all = [...this.game.friendlyUnits, ...this.game.enemyUnits];
    all.forEach((unit) => {
      if (!unit.alive) return;
      rows.push([
        unit.id,
        unit.team,
        unit.type,
        unit.ownerPlayerId ?? null,
        Math.round(unit.health),
        Math.round(unit.maxHealth),
        Math.round(unit.shield ?? 0),
        unit.underConstruction ? 1 : 0
      ]);
    });
    return rows;
  }

  collectTransformRows() {
    const rows = [];
    const all = [...this.game.friendlyUnits, ...this.game.enemyUnits];
    all.forEach((unit) => {
      if (!unit.alive) return;
      rows.push([
        unit.id,
        quantizePosition(unit.position.x),
        quantizePosition(unit.position.z),
        quantizeYaw(unit.mesh.rotation.y),
        visualStateCode(unit.visualState),
        encodeAnimPhase(unit)
      ]);
    });
    return rows;
  }

  collectPlayersPublic() {
    const game = this.game;
    if (!game.players) {
      return [{
        slot: 'p1',
        energy: game.cardSystem?.energy ?? 0,
        silver: game.silver ?? 0,
        handCount: game.cardSystem?.handCards?.length ?? 0,
        connected: true
      }];
    }
    return ['p1', 'p2'].map((slot) => {
      const run = game.players[slot];
      const cards = game.cardSystems?.[slot];
      const sessionName = game.levelSession?.players?.[slot]?.name;
      return {
        slot,
        name: sessionName ?? (slot === 'p1' ? '玩家 1' : '玩家 2'),
        energy: cards?.energy ?? 0,
        silver: run?.silver ?? 0,
        handCount: cards?.handCards?.length ?? 0,
        drawCount: cards?.drawPile?.length ?? 0,
        discardCount: cards?.discardPile?.length ?? 0,
        tempCount: cards?.temporaryCards?.length ?? 0,
        connected: run?.connected !== false,
        runShopOpen: Boolean(run?.runShopOpen),
        strategyPending: run?.pendingStrategyRewards?.length ?? 0
      };
    });
  }

  buildPrivateState(slot) {
    const cards = this.game.cardSystems?.[slot] ?? (slot === this.game.localPlayerSlot ? this.game.cardSystem : null);
    const run = this.game.players?.[slot];
    if (!cards || !run) return null;
    return {
      tick: this.tick,
      playerSlot: slot,
      energy: cards.energy,
      hand: cards.handCards.map((card) => ({
        instanceId: card.instanceId,
        id: card.id,
        name: card.name,
        kind: card.kind,
        energyCost: card.energyCost,
        level: card.level ?? 1
      })),
      drawCount: cards.drawPile.length,
      discardCount: cards.discardPile.length,
      silver: run.silver,
      strategyUi: run.strategyEvent
        ? {
          type: run.strategyEvent.type,
          choices: run.strategyEvent.choices?.map((choice) => ({
            id: choice.id,
            title: choice.title,
            description: choice.description
          })) ?? []
        }
        : null
    };
  }

  pushEvent(event) {
    const entry = { ...event, at: Date.now(), tick: this.tick };
    this.eventBuffer.push(entry);
    const cutoff = Date.now() - this.maxEventMs;
    while (this.eventBuffer.length && this.eventBuffer[0].at < cutoff) {
      this.eventBuffer.shift();
    }
    return entry;
  }

  eventsSince(tick) {
    return this.eventBuffer.filter((event) => event.tick > tick);
  }
}
