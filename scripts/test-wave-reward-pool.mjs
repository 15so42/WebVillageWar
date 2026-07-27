import assert from 'node:assert/strict';
import { shouldConsumeWaveRewardCard } from '../src/systems/waveRewardPool.js';

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'wave-reward-deck',
  action: 'add-card',
  card: { kind: 'summon', unitType: 'raider' }
}), false, 'summon cards stay in the wave reward pool');

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'wave-reward-deck',
  action: 'add-card',
  card: { kind: 'spell' }
}), true, 'non-unit reward cards remain one-time offers');

assert.equal(shouldConsumeWaveRewardCard({
  rewardSource: 'run-shop',
  action: 'add-card',
  card: { kind: 'summon' }
}), false, 'run shop choices never use the wave reward pool rule');

console.log('wave reward pool checks passed');
