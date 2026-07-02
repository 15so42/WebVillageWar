import { distance2D } from '../utils/math.js';

export class SpellSystem {
  constructor(game) {
    this.game = game;
    this.handlers = {
      meteor: (context) => this.castMeteor(context)
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

  castMeteor({ point, card }) {
    this.game.effects.spawnMeteor(point.clone(), card.radius, () => {
      [...this.game.friendlyUnits, ...this.game.enemyUnits].forEach((unit) => {
        if (!unit.alive || unit.underConstruction) return;
        const distance = distance2D(unit.position, point);
        if (distance > card.radius) return;
        const falloff = 1 - distance / card.radius;
        this.game.combat.applyDamage(
          unit,
          card.damage * (0.65 + falloff * 0.35),
          null,
          0
        );

        const dir = unit.position.clone().sub(point).setY(0);
        if (dir.lengthSq() > 0.001 && !isStaticUnit(unit)) {
          dir.normalize();
          unit.knockbackVelocity.addScaledVector(dir, card.knockback * (0.45 + falloff));
          unit.hitStunTimer = Math.max(unit.hitStunTimer, 0.22);
        }
      });
    });
  }
}

function isStaticUnit(unit) {
  return unit.isBuilding || unit.definition?.canMove === false;
}
