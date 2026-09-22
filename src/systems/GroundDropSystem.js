import * as THREE from 'three';
import { mat } from '../art/lowpoly.js';
import { createSoftParticleSprite } from '../art/vfxMaterials.js';
import { itemName, itemStacksByMerging } from './items.js';
import { RUNE_STONE_ITEM_ID, runeColor, runeDisplayName } from './runeStones.js';
import {
  DROP_STATE,
  advanceDrop,
  createDrop,
  dropInRange,
  dropIsPickable,
  dropRules,
  dropTotalCount,
  pickUpDrop
} from './drops.js';

/**
 * 地面遗物包（方案第 7 节：死亡掉落与物品守恒）。
 *
 * 纯规则在 `drops.js`（不碰 THREE），这里只负责三件事：
 *   1. 把 `planDeathDrop` / `RuneStoneSystem.detachStonesOnDeath` 给出的
 *      stacks 变成一个看得见、捡得走的地面产物；
 *   2. 存留时间推进；
 *   3. 有人走到跟前时把东西转移进他的容器——**是转移，不是复制**。
 *
 * 两条刻意的取舍，都写在方案留白处：
 *   - 玩家遗物不自动消失（`lifetimeSeconds: 0`）。方案把存留时间列为待定，
 *     而这一节的硬要求是物品守恒；给遗物加倒计时等于把"来不及捡"变成"东西没了"。
 *   - 拾取靠走近自动完成，不做远程手动拾取。方案明确把"是否允许远程手动拾取"
 *     列为待定，所以这里不实现它，而不是顺手实现。
 */

export const GROUND_DROP_RULES = {
  ...dropRules(),
  lifetimeSeconds: 0,
  // 拾取扫描不必每帧做：掉落物数量少，但每帧遍历全部单位 × 全部掉落物没有意义
  scanIntervalSeconds: 0.2
};

const CRATE_SIZE = { width: 0.58, height: 0.36, depth: 0.44 };
const FALLBACK_COLOR = '#ffd7a0';

export class GroundDropSystem {
  constructor(game, options = {}) {
    this.game = game ?? null;
    this.rules = dropRules({ ...GROUND_DROP_RULES, ...(options.rules ?? {}) });
    /** @type {Map<string, object>} dropId → { drop, group, baseY, age, colorKey } */
    this.entries = new Map();
    this.nextId = 1;
    this.scanTimer = 0;
    this.root = new THREE.Group();
    this.root.name = 'GroundDrops';
    // 共享几何体：掉落物是低频对象，但也不该每掉一次就新建一份几何体（AGENTS.md 性能原则）
    this.geometries = {
      crate: new THREE.BoxGeometry(CRATE_SIZE.width, CRATE_SIZE.height, CRATE_SIZE.depth),
      lid: new THREE.BoxGeometry(CRATE_SIZE.width * 1.04, 0.07, CRATE_SIZE.depth * 1.04)
    };
    this.materials = {
      crate: mat('#8a5a2b', { roughness: 0.86 }),
      lid: mat('#6d4520', { roughness: 0.9 })
    };
    // 软边辉光按颜色缓存：同色掉落物共用一份 SpriteMaterial
    this.glowMaterials = new Map();
    this.glintMaterials = new Map();
  }

  attach() {
    if (this.game?.scene && !this.root.parent) this.game.scene.add(this.root);
    return this;
  }

  /** 预分配一个 id，让掉落物与石头位置记录指向同一个编号。 */
  reserveId() {
    return `drop-${this.nextId++}`;
  }

  get count() {
    return this.entries.size;
  }

  drops() {
    return [...this.entries.values()].map((entry) => entry.drop);
  }

  serialize() {
    return this.drops().map((drop) => ({
      id: drop.id,
      x: drop.x,
      z: drop.z,
      ownerId: drop.ownerId ?? null,
      state: drop.state,
      remainingSeconds: drop.remainingSeconds ?? 0,
      stacks: drop.stacks.map((stack) => ({
        itemId: stack.itemId,
        count: stack.count,
        instanceId: stack.instanceId ?? null,
        data: stack.data ? { ...stack.data } : null
      }))
    }));
  }

  /**
   * 生成一个掉落物。`stacks` 里的实例类物品（附魔石/工具）保持各自的 instanceId，
   * 落地与拾取搬运的都是同一件。
   */
  spawnFromStacks(stacks, { dropId = null, x = 0, z = 0, ownerId = null } = {}) {
    const valid = (stacks ?? []).filter((stack) => stack?.itemId && stack.count > 0);
    if (!valid.length) return null;
    const id = dropId ?? this.reserveId();
    if (this.entries.has(id)) return this.entries.get(id).drop;
    const drop = createDrop(valid, { dropId: id, x, z, ownerId, rules: this.rules });
    if (!drop) return null;
    const position = new THREE.Vector3(drop.x, 0, drop.z);
    position.y = this.game?.groundHeightAt ? this.game.groundHeightAt(position) : 0;
    const entry = this.createEntry(drop, position);
    this.entries.set(id, entry);
    this.root.add(entry.group);
    this.game?.effects?.spawnRing?.(position, entry.color, 0.62, 0.46);
    return drop;
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    if (step <= 0) return;
    this.entries.forEach((entry, id) => {
      const { drop, group } = entry;
      entry.age += step;
      if (drop.state === DROP_STATE.onGround) {
        advanceDrop(drop, step);
        if (drop.state !== DROP_STATE.onGround) {
          this.removeEntry(id, 'expired');
          return;
        }
      }
      // 悬浮 + 呼吸：两个不同周期的正弦，避免"整块一起上下"的机械感
      group.position.y = entry.baseY + Math.sin(entry.age * 2.1) * 0.06;
      const pulse = 0.72 + Math.sin(entry.age * 3.3) * 0.28;
      entry.glow.material.opacity = 0.3 * pulse + 0.12;
      if (entry.glint) {
        entry.glint.material.opacity = 0.42 * pulse;
        entry.glint.position.y = 0.62 + Math.sin(entry.age * 1.7) * 0.05;
      }
    });
    this.updatePickup(step);
  }

  updatePickup(dt) {
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = Math.max(0.02, Number(this.rules.scanIntervalSeconds) || 0.2);
    if (!this.entries.size) return;
    const units = (this.game?.friendlyUnits ?? []).filter((unit) => (
      unit?.alive && !unit.isBuilding && unit.position
    ));
    if (!units.length) return;
    // 用 for...of 而不是 forEach：拾取会改动 entries，遍历中删除很危险，
    // 所以先快照 id 列表，再逐个确认它还在。
    [...this.entries.keys()].forEach((id) => {
      const entry = this.entries.get(id);
      if (!entry || !dropIsPickable(entry.drop)) return;
      const taker = units.find((unit) => dropInRange(
        entry.drop,
        { x: unit.position.x ?? 0, z: unit.position.z ?? 0 },
        this.rules
      ));
      if (taker) this.pickUp(id, taker);
    });
  }

  /**
   * 让 `unit` 捡起这个掉落物。
   *
   * 附魔石交给 `RuneStoneSystem.pickUpStone`（同一块石头回到新持有者背包）；
   * 其余物品走 `pickUpDrop` 的"装多少算多少，余量留在原地"语义。
   * 装不下的部分绝不销毁。
   */
  pickUp(dropId, unit) {
    const entry = this.entries.get(dropId);
    if (!entry || !unit) return { ok: false, taken: 0, reason: 'not_pickable' };
    const drop = entry.drop;
    if (!dropIsPickable(drop)) return { ok: false, taken: 0, reason: 'not_pickable' };

    let taken = 0;
    const blocked = [];
    const remaining = [];

    drop.stacks.forEach((stack) => {
      if (stack.itemId !== RUNE_STONE_ITEM_ID) {
        remaining.push(stack);
        return;
      }
      const result = this.game?.runeStones?.pickUpStone?.(stack.instanceId, unit, stack.data);
      if (result?.ok) {
        taken += 1;
      } else {
        blocked.push(stack);
        remaining.push(stack);
      }
    });

    const inventory = this.inventoryFor(unit);
    if (remaining.length && inventory) {
      // 借用 pickUpDrop 的"能装多少装多少 + 返回余量"语义，但只把它喂给物品那一部分，
      // 附魔石已经在上一步单独处理过了。
      const view = { ...drop, stacks: remaining };
      const result = pickUpDrop(view, inventory);
      taken += result.taken;
      drop.stacks = view.stacks;
      drop.state = view.state;
    } else {
      drop.stacks = remaining;
    }

    if (drop.stacks.length === 0) {
      drop.state = DROP_STATE.pickedUp;
      this.removeEntry(dropId, 'picked_up');
    } else {
      // 还有东西没拿走（背包满 / 没有背包）：更新视觉颜色与提示，掉落物留在原地。
      this.refreshEntryColor(entry);
      if (taken > 0 || blocked.length) this.hintBlocked(entry, unit, blocked.length > 0);
    }
    if (taken > 0) {
      this.game?.effects?.spawnRing?.(entry.group.position, entry.color, 0.5, 0.34);
    }
    return { ok: taken > 0, taken, reason: taken > 0 ? 'none' : (blocked.length ? 'target_full' : 'no_space') };
  }

  /** 谁能拿普通货物：目前只有登记过的傀儡有物品背包（战斗兵种的背包还没做）。 */
  inventoryFor(unit) {
    return unit?.workerInventory ?? null;
  }

  hintBlocked(entry, unit, runeFull) {
    const text = runeFull
      ? '符文背包已满，这块符文石先留在地上。'
      : '背包放不下了，剩下的东西留在地上。';
    this.game?.cardSystem?.setHintOnce?.(text, `ground-drop:${entry.drop.id}:${unit.id}`);
  }

  createEntry(drop, position) {
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = `GroundDrop:${drop.id}`;

    const crate = new THREE.Mesh(this.geometries.crate, this.materials.crate);
    crate.position.y = CRATE_SIZE.height * 0.5 + 0.01;
    crate.rotation.y = ((hashString(drop.id) % 360) / 360) * Math.PI;
    crate.castShadow = true;
    const lid = new THREE.Mesh(this.geometries.lid, this.materials.lid);
    lid.position.y = CRATE_SIZE.height + 0.02;
    lid.rotation.y = crate.rotation.y;

    const color = this.colorForStacks(drop.stacks);
    const glow = createSoftParticleSprite(color, { opacity: 0.32, falloff: 'soft' });
    glow.scale.set(1.9, 1.9, 1);
    glow.position.y = 0.34;
    glow.material.depthTest = true;

    const hasStone = drop.stacks.some((stack) => stack.itemId === RUNE_STONE_ITEM_ID);
    const glint = hasStone
      ? createSoftParticleSprite(color, { opacity: 0.42, falloff: 'tight' })
      : null;
    if (glint) {
      glint.scale.set(0.5, 0.5, 1);
      glint.position.y = 0.62;
    }

    group.add(crate, lid, glow);
    if (glint) group.add(glint);
    return {
      drop,
      group,
      glow,
      glint,
      color,
      baseY: position.y,
      age: 0
    };
  }

  refreshEntryColor(entry) {
    const color = this.colorForStacks(entry.drop.stacks);
    if (color === entry.color) return;
    entry.color = color;
    entry.glow.material = this.glowMaterial(color);
    if (entry.glint) entry.glint.material = this.glintMaterial(color);
  }

  colorForStacks(stacks) {
    const stone = (stacks ?? []).find((stack) => stack.itemId === RUNE_STONE_ITEM_ID);
    if (stone?.data?.enchantmentId) return runeColor(stone.data.enchantmentId);
    return FALLBACK_COLOR;
  }

  glowMaterial(color) {
    if (!this.glowMaterials.has(color)) {
      const sprite = createSoftParticleSprite(color, { opacity: 0.32, falloff: 'soft' });
      this.glowMaterials.set(color, sprite.material);
    }
    return this.glowMaterials.get(color);
  }

  glintMaterial(color) {
    if (!this.glintMaterials.has(color)) {
      const sprite = createSoftParticleSprite(color, { opacity: 0.42, falloff: 'tight' });
      this.glintMaterials.set(color, sprite.material);
    }
    return this.glintMaterials.get(color);
  }

  removeEntry(dropId, reason = 'removed') {
    const entry = this.entries.get(dropId);
    if (!entry) return false;
    this.entries.delete(dropId);
    this.root.remove(entry.group);
    // 几何体与材质是共享的，这里只拆掉这一份 group，不 dispose 共享资源。
    if (reason === 'expired') this.game?.runeStones?.forgetGroundStones?.(dropId);
    return true;
  }

  clear() {
    [...this.entries.keys()].forEach((id) => this.removeEntry(id, 'cleared'));
  }

  destroy() {
    this.clear();
    this.root.removeFromParent();
    Object.values(this.geometries).forEach((geometry) => geometry.dispose?.());
    this.materials.crate.dispose?.();
    this.materials.lid.dispose?.();
    this.glowMaterials.forEach((material) => material.dispose?.());
    this.glintMaterials.forEach((material) => material.dispose?.());
    this.glowMaterials.clear();
    this.glintMaterials.clear();
  }

  /** 掉落物内容的人类可读摘要（日志 / 验收脚本用）。 */
  describe(dropId) {
    const entry = this.entries.get(dropId);
    if (!entry) return null;
    return {
      id: entry.drop.id,
      total: dropTotalCount(entry.drop),
      labels: entry.drop.stacks.map((stack) => (
        stack.itemId === RUNE_STONE_ITEM_ID
          ? `${runeDisplayName(stack.data?.enchantmentId)}·符文石 x${stack.count}`
          : `${itemName(stack.itemId)} x${stack.count}`
      )),
      mergeable: entry.drop.stacks.filter((stack) => itemStacksByMerging(stack.itemId)).length
    };
  }
}

function hashString(value) {
  const text = String(value ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 100000;
  }
  return hash;
}
