import { distance2D } from '../utils/math.js';
import { targetCombatRadius } from './combatHelpers.js';

export class SpellSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      meteor: (context) => this.castMeteor(context),
      'meteor-barrage': (context) => this.castMeteorBarrage(context),
      'lava-eruption': (context) => this.castLavaEruption(context)
    };
  }

  cast(spellId, context) {
    const handler = this.handlers[spellId];
    if (!handler) {
      console.warn(`No spell handler for ${spellId}`);
      return false;
    }
    handler(context);
    return true;
  }

  castMeteor({ point, card, playerId = null }) {
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    const bonusLevel = Math.max(0, level - 1);
    const radius = this.game.scaleSpellAreaRadius(
      Math.max(0.5, (card?.radius ?? 3.25) * (1 + 0.06 * bonusLevel)),
      playerId
    );
    const damage = Math.max(0, (card?.damage ?? 0) * (1 + 0.18 * bonusLevel));
    const knockback = Math.max(0, (card?.knockback ?? 0) * (1 + 0.08 * bonusLevel));
    this.game.effects.spawnMeteor(point.clone(), radius, () => {
      this.game.enemyUnits.forEach((unit) => {
        if (!unit.alive || unit.underConstruction) return;
        const distance = distance2D(unit.position, point);
        if (distance > radius) return;
        const falloff = 1 - distance / radius;
        this.game.combat.applyDamage(
          unit,
          damage * (0.65 + falloff * 0.35),
          null,
          0,
          {
            source: null,
            target: unit,
            defenseDamageType: card?.defenseDamageType ?? 'magic',
            isAttack: false,
            damageNumberHeight: unit.projectileHitHeight ?? 1.45,
            damageNumberDuration: 0.72
          }
        );

        const dir = unit.position.clone().sub(point).setY(0);
        if (dir.lengthSq() > 0.001 && !isStaticUnit(unit)) {
          dir.normalize();
          unit.knockbackVelocity.addScaledVector(dir, knockback * (0.45 + falloff));
          unit.hitStunTimer = Math.max(unit.hitStunTimer, 0.22);
          this.game.pathfinding?.clear?.(unit);
        }
      });
      this.game.effects.spawnRing(point, '#ff9a47', radius, 0.72);
      this.game.effects.spawnCrater(point, radius);
    });
  }

  castMeteorBarrage({ point, card, playerId = null, count = 1 }) {
    const strikes = Math.max(1, Math.floor(count));
    const staggerSeconds = 0.32;
    for (let index = 0; index < strikes; index += 1) {
      window.setTimeout(() => {
        if (this.game.destroyed || this.game.levelFinished) return;
        const strikePoint = point.clone();
        strikePoint.x += (Math.random() - 0.5) * 1.4;
        strikePoint.z += (Math.random() - 0.5) * 1.4;
        this.castMeteor({ point: strikePoint, card, playerId });
      }, index * staggerSeconds * 1000);
    }
  }

  castLavaEruption({ point, card, playerId = null }) {
    if (!point) return;
    const level = Math.max(1, Math.floor(card?.level ?? 1));
    const radius = this.game.scaleSpellAreaRadius(
      Math.max(0.5, (card?.radius ?? 3.5) * (1 + 0.06 * Math.max(0, level - 1))),
      playerId
    );
    const cardsPlayedIncludingThis = Math.max(1, Math.floor(this.game.runCardsPlayedCount ?? 0) + 1);
    const damage = cardsPlayedIncludingThis;
    const impactPoint = point.clone();
    impactPoint.y = this.game.groundHeightAt(impactPoint);
    // Lock valid victims when the spell is cast. The visual has a short
    // eruption lead-in; without this snapshot an enemy can be visibly inside
    // the targeted area yet cross its centre-point boundary before impact.
    const targets = this.game.enemyUnits.filter((unit) => (
      unit.alive &&
      !unit.underConstruction &&
      distance2D(unit.position, impactPoint) <= radius + targetCombatRadius(unit)
    ));
    this.game.effects.spawnLavaEruption(impactPoint, radius, () => {
      targets.forEach((unit) => {
        if (!unit.alive) return;
        this.game.combat.applyDamage(unit, damage, null, 0, {
          damage,
          source: null,
          target: unit,
          defenseDamageType: 'magic',
          isAttack: false,
          damageNumberHeight: unit.projectileHitHeight ?? 1.45,
          damageNumberDuration: 0.72
        });
      });
      this.game.effects.spawnCrater(impactPoint, radius);
    });
  }
}

function isStaticUnit(unit) {
  return unit.isBuilding || unit.definition?.canMove === false;
}
