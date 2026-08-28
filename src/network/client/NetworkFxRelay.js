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
    case 'fx_explosion':
      effects.spawnExplosion(vecFrom(event), event.radius ?? 2.4);
      break;
    case 'fx_yellow_shockwave':
      effects.spawnYellowShockwave(vecFrom(event), event.radius ?? 5);
      break;
    case 'fx_solar_flare_pulse':
      effects.spawnSolarFlarePulse(vecFrom(event), event.radius ?? 5);
      break;
    case 'fx_firework':
      effects.spawnFirework(vecFrom(event), event.radius ?? 7);
      break;
    case 'fx_unit_upgrade':
      effects.spawnUnitUpgrade(vecFrom(event), event.options ?? {});
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
    case 'fx_self_destruct_explosion':
      effects.spawnSelfDestructExplosion(vecFrom(event), event.radius ?? 6);
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
    case 'fx_recovery_aura':
      effects.ensureRecoveryAura(vecFrom(event), event.radius ?? 4.8);
      break;
    case 'fx_enemy_camp_blast':
      effects.spawnEnemyCampBlast(vecFrom(event.start), vecFrom(event.end), event.options ?? {});
      break;
    case 'fx_meteor':
      effects.spawnMeteor(vecFrom(event), event.radius ?? 2.4, () => {});
      break;
    case 'fx_lava_eruption':
      effects.spawnLavaEruption(vecFrom(event), event.radius ?? 3.5, () => {});
      break;
    case 'fx_jade_shatter':
      effects.spawnJadeShatter(vecFrom(event), event.radius ?? 2.6);
      break;
    case 'fx_falling_star':
      effects.spawnFallingStar(vecFrom(event), event.radius ?? 2.1, () => {});
      break;
    case 'fx_judgment_sword':
      effects.spawnJudgmentSword(vecFrom(event), event.radius ?? 0.9, () => {});
      break;
    case 'fx_crater':
      effects.spawnCrater(vecFrom(event), event.radius ?? 2.4);
      break;
    case 'fx_root_warning':
      effects.spawnRootWarning(
        vecFrom(event),
        event.radius ?? 3.2,
        event.duration ?? 0.62
      );
      break;
    case 'fx_lightning_chain':
      effects.spawnLightningChain(
        vecFrom(event.start),
        vecFrom(event.end),
        event.options ?? {}
      );
      break;
    case 'fx_thunder_cloud':
      effects.spawnThunderCloud({
        position: vecFrom(event),
        age: event.age ?? 0,
        ability: event.ability ?? {}
      });
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
    method: 'spawnExplosion',
    name: 'fx_explosion',
    serialize: ([position, radius]) => ({
      name: 'fx_explosion',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnYellowShockwave',
    name: 'fx_yellow_shockwave',
    serialize: ([position, radius]) => ({
      name: 'fx_yellow_shockwave',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnSolarFlarePulse',
    name: 'fx_solar_flare_pulse',
    serialize: ([position, radius]) => ({
      name: 'fx_solar_flare_pulse',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnFirework',
    name: 'fx_firework',
    serialize: ([position, radius]) => ({
      name: 'fx_firework',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnUnitUpgrade',
    name: 'fx_unit_upgrade',
    serialize: ([position, options = {}]) => ({
      name: 'fx_unit_upgrade',
      ...vec3(position),
      options: {
        color: options.color,
        radius: options.radius,
        height: options.height,
        duration: options.duration
      }
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
    method: 'spawnLightningChain',
    name: 'fx_lightning_chain',
    serialize: ([start, end, options = {}]) => ({
      name: 'fx_lightning_chain',
      start: vec3(start),
      end: vec3(end),
      options: {
        color: options.color,
        duration: options.duration,
        impactRadius: options.impactRadius
      }
    })
  },
  {
    method: 'spawnThunderCloud',
    name: 'fx_thunder_cloud',
    serialize: ([state = {}]) => ({
      name: 'fx_thunder_cloud',
      ...vec3(state.position),
      age: state.age,
      ability: {
        duration: state.ability?.duration,
        height: state.ability?.height,
        visualScale: state.ability?.visualScale
      }
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
    method: 'spawnSelfDestructExplosion',
    name: 'fx_self_destruct_explosion',
    serialize: ([position, radius]) => ({
      name: 'fx_self_destruct_explosion',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnJudgmentSword',
    name: 'fx_judgment_sword',
    serialize: ([position, radius]) => ({
      name: 'fx_judgment_sword',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'ensureRecoveryAura',
    name: 'fx_recovery_aura',
    serialize: ([center, radius]) => ({
      name: 'fx_recovery_aura',
      ...vec3(center),
      radius
    })
  },
  {
    method: 'spawnLavaEruption',
    name: 'fx_lava_eruption',
    serialize: ([position, radius]) => ({
      name: 'fx_lava_eruption',
      ...vec3(position),
      radius
    })
  },
  {
    method: 'spawnJadeShatter',
    name: 'fx_jade_shatter',
    serialize: ([position, radius]) => ({
      name: 'fx_jade_shatter',
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
  },
  {
    method: 'spawnRootWarning',
    name: 'fx_root_warning',
    serialize: ([position, radius, duration]) => ({
      name: 'fx_root_warning',
      ...vec3(position),
      radius,
      duration
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
      // Some visual emitters rate-limit themselves. Never put a suppressed
      // local effect on the wire, otherwise one harmless per-frame attempt
      // becomes dozens of remote events each second.
      if (result === false) return result;
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
