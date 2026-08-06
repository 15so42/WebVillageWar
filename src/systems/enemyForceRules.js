export const ELITE_AND_BOSS_INITIAL_ATTACK_PENALTY = -2;

export function eliteOrBossInitialAttackModifiers() {
  return [{
    stat: 'attackPower',
    type: 'add',
    amount: ELITE_AND_BOSS_INITIAL_ATTACK_PENALTY
  }];
}
