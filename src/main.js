import './styles.css';
import { init as initRecastNavigation } from 'recast-navigation';
import { Game } from './systems/Game.js';
import { MetaGameSystem } from './systems/MetaGameSystem.js';

const canvas = document.querySelector('#game-canvas');
const debugState = document.querySelector('#debug-state');

try {
  await initRecastNavigation();

  let activeGame = null;
  const meta = new MetaGameSystem({
    onStartLevel: (session) => {
      activeGame?.destroy?.();
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
    }
  });
} catch (error) {
  if (debugState) {
    debugState.textContent = error?.stack ?? String(error);
  }
  console.error(error);
  throw error;
}
