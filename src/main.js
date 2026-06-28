import './styles.css';
import { Game } from './systems/Game.js';
import { MetaGameSystem } from './systems/MetaGameSystem.js';

const canvas = document.querySelector('#game-canvas');
const debugState = document.querySelector('#debug-state');

try {
  let activeGame = null;
  const meta = new MetaGameSystem({
    onStartLevel: (session) => {
      activeGame?.destroy?.();
      try {
        activeGame = new Game({
          canvas,
          session,
          onLevelComplete: (result) => {
            activeGame?.destroy?.();
            activeGame = null;
            meta.completeLevel(result);
          }
        });
        activeGame.start();
        if (debugState) {
          debugState.hidden = true;
          debugState.textContent = '';
        }
      } catch (error) {
        activeGame?.destroy?.();
        activeGame = null;
        if (debugState) {
          debugState.hidden = false;
          debugState.textContent = error?.stack ?? String(error);
        }
        console.error(error);
        meta.show('levels');
      }
    }
  });
} catch (error) {
  if (debugState) {
    debugState.textContent = error?.stack ?? String(error);
  }
  console.error(error);
  throw error;
}
