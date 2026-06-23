import './styles.css';
import { Game } from './systems/Game.js';

const canvas = document.querySelector('#game-canvas');
const debugState = document.querySelector('#debug-state');

try {
  const game = new Game({ canvas });
  game.start();
} catch (error) {
  if (debugState) {
    debugState.textContent = error?.stack ?? String(error);
  }
  console.error(error);
  throw error;
}
