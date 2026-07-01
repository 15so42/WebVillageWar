import './styles.css';
import { Game } from './systems/Game.js';
import { MetaGameSystem } from './systems/MetaGameSystem.js';

const canvas = document.querySelector('#game-canvas');
const debugState = document.querySelector('#debug-state');
const mobileActionDock = document.querySelector('#mobile-action-dock');
const mobileActionFeedback = document.querySelector('#mobile-action-feedback');

let deferredInstallPrompt = null;
let feedbackTimer = 0;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showMobileFeedback('已安装到主屏幕');
});

mobileActionDock?.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-mobile-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.mobileAction;
  if (action === 'fullscreen') {
    requestAppFullscreen();
  } else if (action === 'landscape') {
    requestLandscape();
  } else if (action === 'pwa') {
    requestPwaInstall();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

try {
  let activeGame = null;
  let meta = null;
  const startSession = (session) => {
    activeGame?.destroy?.();
    try {
      activeGame = new Game({
        canvas,
        session,
        onLevelComplete: (result) => {
          activeGame?.destroy?.();
          activeGame = null;
          meta.completeLevel(result);
        },
        onRestart: (restartSession) => {
          startSession(restartSession);
        },
        onExitToMenu: () => {
          activeGame?.destroy?.();
          activeGame = null;
          meta.show('levels');
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
  };
  meta = new MetaGameSystem({
    onStartLevel: (session) => {
      startSession(session);
    }
  });
} catch (error) {
  if (debugState) {
    debugState.textContent = error?.stack ?? String(error);
  }
  console.error(error);
  throw error;
}

async function requestAppFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    showMobileFeedback('已经是全屏');
    return true;
  }
  const request = root.requestFullscreen
    ?? root.webkitRequestFullscreen
    ?? root.msRequestFullscreen;
  if (!request) {
    showMobileFeedback('当前浏览器不支持网页全屏');
    return false;
  }
  try {
    await request.call(root);
    showMobileFeedback('已进入全屏');
    return true;
  } catch {
    showMobileFeedback('请用浏览器菜单全屏，或添加到主屏幕后打开');
    return false;
  }
}

async function requestLandscape() {
  await requestAppFullscreen();
  const orientation = screen.orientation;
  if (!orientation?.lock) {
    showMobileFeedback('请旋转手机，并关闭系统竖屏锁定');
    return;
  }
  try {
    await orientation.lock('landscape');
    showMobileFeedback('已请求横屏');
  } catch {
    showMobileFeedback('请旋转手机，并关闭系统竖屏锁定');
  }
}

async function requestPwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    showMobileFeedback(choice?.outcome === 'accepted' ? '已开始安装' : '已取消安装');
    return;
  }
  showMobileFeedback('请用浏览器菜单选择“添加到主屏幕”');
}

function showMobileFeedback(message) {
  if (!mobileActionFeedback) return;
  mobileActionFeedback.textContent = message;
  mobileActionFeedback.hidden = false;
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    mobileActionFeedback.hidden = true;
  }, 2600);
}
