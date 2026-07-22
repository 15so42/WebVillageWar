import * as THREE from 'three';

function vec3(position) {
  if (!position) return null;
  return {
    x: position.x ?? 0,
    y: position.y ?? 0,
    z: position.z ?? 0
  };
}

function vecFrom(payload) {
  if (!payload) return new THREE.Vector3();
  return new THREE.Vector3(payload.x ?? 0, payload.y ?? 0, payload.z ?? 0);
}

export function applyNetworkFx(game, event) {
  const effects = game?.effects;
  if (!effects || !event?.name) return;

  switch (event.name) {
    case 'fx_ring':
      effects.spawnRing(
        vecFrom(event),
        event.color ?? '#ffffff',
        event.radius ?? 1,
        event.duration ?? 0.55
      );
      break;
    case 'fx_move':
      effects.spawnMoveDestination(vecFrom(event), event.radius ?? 1.2, event.color ?? '#62d56f');
      break;
    case 'fx_hit':
      effects.spawnHit(vecFrom(event), event.color ?? '#f6e7a0');
      break;
    case 'fx_damage':
      effects.spawnDamageNumber(vecFrom(event), event.amount ?? 0, {
        damageType: event.damageType,
        text: event.text,
        color: event.color,
        stroke: event.stroke,
        height: event.height,
        duration: event.duration,
        fontSize: event.fontSize,
        strokeWidth: event.strokeWidth,
        baseHeight: event.baseHeight,
        fadeStart: event.fadeStart
      });
      break;
    case 'fx_heal':
      effects.spawnHealNumber(vecFrom(event), event.amount ?? 0, {
        color: event.color,
        text: event.text
      });
      break;
    case 'fx_death':
      effects.spawnDeathBurst(vecFrom(event), event.radius ?? 0.8);
      break;
    case 'fx_projectile':
      effects.spawnProjectileTrail(
        vecFrom(event.start),
        vecFrom(event.end),
        event.color ?? '#f4fbff',
        event.options ?? {}
      );
      break;
    case 'fx_energy':
      effects.spawnEnergyNumber(vecFrom(event), event.amount ?? 0, event.options ?? {});
      break;
    case 'fx_structure_dust':
      effects.spawnStructureDust(vecFrom(event), event.radius ?? 2.5, event.color ?? '#b9aa8d');
      break;
    case 'fx_recovery':
      effects.spawnRecoveryPulse(vecFrom(event), event.radius ?? 4.8);
      break;
    case 'fx_enemy_camp_blast':
      effects.spawnEnemyCampBlast(vecFrom(event.start), vecFrom(event.end), event.options ?? {});
      break;
    case 'fx_meteor':
      effects.spawnMeteor(vecFrom(event), event.radius ?? 2.4, () => {});
      break;
    case 'fx_falling_star':
      effects.spawnFallingStar(vecFrom(event), event.radius ?? 2.1, () => {});
      break;
    case 'fx_crater':
      effects.spawnCrater(vecFrom(event), event.radius ?? 2.4);
      break;
    case 'fx_area_effect':
      effects.spawnNetworkAreaEffect(event);
      break;
  }
}

const EFFECT_RELAY_SPECS = [
  {
    method: 'spawnRing',
    name: 'fx_ring',
    serialize: ([position, color, radius, duration]) => ({
      name: 'fx_ring',
      ...vec3(position),
      color,
      radius,
      duration
    })
  },
  {
    method: 'spawnMoveDestination',
    name: 'fx_move',
    serialize: ([position, radius, color]) => ({
      name: 'fx_move',
      ...vec3(position),
      radius,
      color
    })
  },
  {
    method: 'spawnHit',
    name: 'fx_hit',
    serialize: ([position, color]) => ({
      name: 'fx_hit',
      ...vec3(position),
      color
    })
  },
  {
    method: 'spawnDamageNumber',
    name: 'fx_damage',
    serialize: ([position, amount, options = {}]) => ({
      name: 'fx_damage',
      ...vec3(position),
      amount,
      damageType: options.damageType,
      text: options.text,
      color: options.color,
      stroke: options.stroke,
      height: options.height,
      duration: options.duration,
      fontSize: options.fontSize,
      strokeWidth: options.strokeWidth,
      baseHeight: options.baseHeight,
      fadeStart: options.fadeStart
    })
  },
  {
    method: 'spawnDeathBurst',
    name: 'fx_death',
    serialize: ([position, radius]) => ({
      name: 'fx_death',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnProjectileTrail',
    name: 'fx_projectile',
    serialize: ([start, end, color, options = {}]) => ({
      name: 'fx_projectile',
      start: vec3(start),
      end: vec3(end),
      color,
      options
    })
  },
  {
    method: 'spawnStructureDust',
    name: 'fx_structure_dust',
    serialize: ([position, radius, color]) => ({
      name: 'fx_structure_dust',
      ...vec3(position),
      radius,
      color
    })
  },
  {
    method: 'spawnRecoveryPulse',
    name: 'fx_recovery',
    serialize: ([center, radius]) => ({
      name: 'fx_recovery',
      ...vec3(center),
      radius
    })
  },
  {
    method: 'spawnEnemyCampBlast',
    name: 'fx_enemy_camp_blast',
    serialize: ([start, end, options = {}]) => ({
      name: 'fx_enemy_camp_blast',
      start: vec3(start),
      end: vec3(end),
      options
    })
  },
  {
    method: 'spawnMeteor',
    name: 'fx_meteor',
    serialize: ([position, radius]) => ({
      name: 'fx_meteor',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnFallingStar',
    name: 'fx_falling_star',
    serialize: ([position, radius]) => ({
      name: 'fx_falling_star',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnCrater',
    name: 'fx_crater',
    serialize: ([position, radius]) => ({
      name: 'fx_crater',
      ...vec3(position),
      radius
    })
  }
];

export function installHostEffectsRelay(game, emitEvent) {
  if (!game?.effects || game.__networkFxRelayInstalled) return () => {};
  const originals = new Map();
  EFFECT_RELAY_SPECS.forEach(({ method, serialize }) => {
    const original = game.effects[method]?.bind(game.effects);
    if (!original) return;
    originals.set(method, original);
    game.effects[method] = (...args) => {
      const result = original(...args);
      try {
        const payload = serialize(args);
        if (payload) emitEvent(payload);
      } catch {
        // ignore relay serialization issues
      }
      return result;
    };
  });
  game.__networkFxRelayInstalled = true;
  return () => {
    originals.forEach((original, method) => {
      game.effects[method] = original;
    });
    delete game.__networkFxRelayInstalled;
  };
}
