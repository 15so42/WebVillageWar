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
      this.game.enemyUnits.forEach((enemy) => {
        if (!enemy.alive) return;
        const distance = distance2D(enemy.position, point);
        if (distance > card.radius) return;
        const falloff = 1 - distance / card.radius;
        this.game.combat.applyDamage(
          enemy,
          card.damage * (0.65 + falloff * 0.35),
          null,
          0
        );

        const dir = enemy.position.clone().sub(point).setY(0);
        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          enemy.knockbackVelocity.addScaledVector(dir, card.knockback * (0.45 + falloff));
          enemy.hitStunTimer = Math.max(enemy.hitStunTimer, 0.22);
        }
      });
    });
  }
}
