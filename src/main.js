import './styles.css';
import './mainMenu.css';
import { AnimationPreviewScene } from './systems/AnimationPreviewScene.js';
import { DebugScene, createDebugSession } from './systems/DebugScene.js';
import { Game } from './systems/Game.js';
import { MetaGameSystem } from './systems/MetaGameSystem.js';
import { CoopLobbySystem } from './systems/CoopLobbySystem.js';
import { CoopMatchController } from './network/CoopMatchController.js';

const canvas = document.querySelector('#game-canvas');
const debugState = document.querySelector('#debug-state');
const mobileActionDock = document.querySelector('#mobile-action-dock');
const mobileActionFeedback = document.querySelector('#mobile-action-feedback');

let feedbackTimer = 0;
const UI_SCALE_STORAGE_KEY = 'village-war-ui-scale';
const UI_SCALE_OPTIONS = [0.4, 0.6, 0.8];
const DEFAULT_UI_SCALE = 0.6;
const APP_BASE_URL = new URL(import.meta.env.BASE_URL || './', window.location.href);

applyStoredUiScale();

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
  } else if (action === 'portrait') {
    requestPortrait();
  } else if (action === 'ui-scale') {
    cycleUiScale();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const workerUrl = new URL('sw.js', APP_BASE_URL);
    navigator.serviceWorker.register(workerUrl.href, { scope: APP_BASE_URL.href }).catch(() => {});
  });
}

try {
  let activeGame = null;
  let meta = null;
  let coopLobby = null;
  let coopController = null;
  const recordLaunchError = (error, source) => {
    window.__VILLAGE_WAR_LAST_LAUNCH_ERROR__ = {
      source,
      message: error?.message ? String(error.message) : String(error),
      stack: error?.stack ?? null
    };
    if (debugState) {
      debugState.hidden = true;
      debugState.textContent = error?.stack ?? String(error);
    }
    console.error(error);
  };
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
      recordLaunchError(error, 'level');
      meta.show('levels');
      meta.setNotice?.('关卡启动失败，请刷新页面或降低画质后重试');
    }
  };
  const startDebugScene = () => {
    activeGame?.destroy?.();
    try {
      activeGame = new DebugScene({
        canvas,
        session: createDebugSession(),
        onLevelComplete: () => {
          activeGame?.destroy?.();
          activeGame = null;
          meta.show('levels');
        },
        onRestart: () => {
          startDebugScene();
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
      recordLaunchError(error, 'debug-scene');
      meta.show('levels');
      meta.setNotice?.('测试场景启动失败，请刷新页面后重试');
    }
  };
  const startAnimationPreview = () => {
    activeGame?.destroy?.();
    try {
      activeGame = new AnimationPreviewScene({
        canvas,
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
      recordLaunchError(error, 'animation-preview');
      meta.show('levels');
      meta.setNotice?.('动画预览启动失败，请刷新页面后重试');
    }
  };
  const startCoopSession = (session, networkBridge) => {
    meta.hide();
    coopLobby?.hide();
    activeGame?.destroy?.();
    try {
      activeGame = new Game({
        canvas,
        session,
        networkBridge,
        onLevelComplete: (result) => {
          activeGame?.destroy?.();
          activeGame = null;
          coopController?.destroy();
          coopController = null;
          meta.completeLevel(result);
        },
        onRestart: (restartSession) => {
          startCoopSession(restartSession, networkBridge);
        },
        onExitToMenu: () => {
          activeGame?.destroy?.();
          activeGame = null;
          coopController?.destroy();
          coopController = null;
          meta.show('menu');
        }
      });
      activeGame.start();
    } catch (error) {
      activeGame?.destroy?.();
      activeGame = null;
      recordLaunchError(error, 'coop');
      meta.show('menu');
      meta.setNotice?.('联机开局失败，请确认中继服已启动');
    }
  };
  meta = new MetaGameSystem({
    onStartLevel: (session) => {
      startSession(session);
    },
    onStartDebug: () => {
      startDebugScene();
    },
    onStartAnimationPreview: () => {
      startAnimationPreview();
    },
    onOpenCoop: () => {
      meta.hide();
      if (!coopController) {
        coopController = new CoopMatchController({
          getDeckSelection: () => meta.deckSelection,
          getSelectedLevelId: () => meta.selectedLevelId,
          getSelectedDifficulty: () => meta.selectedDifficulty,
          selectedLevel: () => meta.selectedLevel(),
          cardWithLevel: (id) => meta.cardWithLevel(id),
          onStartGame: (session, bridge) => startCoopSession(session, bridge),
          onNotice: (message) => {
            meta.setNotice(message);
            coopLobby?.setNotice?.(message);
          },
          onLobbyVisible: (state) => coopLobby?.render(state),
          onConnectionLost: ({ reconnectChecking = false } = {}) => {
            activeGame?.destroy?.();
            activeGame = null;
            meta.hide();
            coopLobby?.show(reconnectChecking
              ? '连接已中断，正在检测原房间与 Host 是否在线…'
              : '连接已中断，当前会话已无法回连');
          }
        });
      }
      if (!coopLobby) {
        coopLobby = new CoopLobbySystem({
          controller: coopController,
          getSelectedLevelId: () => meta.selectedLevelId,
          getSelectedDifficulty: () => meta.selectedDifficulty,
          selectedLevel: () => meta.selectedLevel(),
          onBack: () => meta.show('menu')
        });
      }
      coopController.restoreSession?.();
      coopLobby.show(meta.notice ?? '');
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

async function requestPortrait() {
  const orientation = screen.orientation;
  if (!orientation?.lock) {
    showMobileFeedback('请旋转手机，并关闭系统横屏锁定');
    return;
  }
  try {
    await orientation.lock('portrait');
    showMobileFeedback('已请求竖屏');
  } catch {
    try {
      orientation.unlock?.();
    } catch {
      // Some browsers expose unlock but still reject it outside installed apps.
    }
    showMobileFeedback('请旋转手机，并关闭系统横屏锁定');
  }
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

function applyStoredUiScale() {
  const stored = Number(readStoredUiScale());
  const scale = UI_SCALE_OPTIONS.includes(stored) ? stored : DEFAULT_UI_SCALE;
  applyUiScale(scale);
}

function cycleUiScale() {
  const current = currentUiScale();
  const index = UI_SCALE_OPTIONS.findIndex((scale) => Math.abs(scale - current) < 0.01);
  const next = index >= 0 ? UI_SCALE_OPTIONS[(index + 1) % UI_SCALE_OPTIONS.length] : DEFAULT_UI_SCALE;
  writeStoredUiScale(next);
  applyUiScale(next);
  showMobileFeedback(`Ui缩放 ${Math.round(next * 100)}%`);
}

function currentUiScale() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-scale');
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : DEFAULT_UI_SCALE;
}

function applyUiScale(scale) {
  document.documentElement.style.setProperty('--mobile-ui-scale', String(scale));
  syncMobileUiMetrics(scale);
}

function syncMobileUiMetrics(scale = currentUiScale()) {
  const width = window.innerWidth || 0;
  const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches ?? false;
  const cardHeight = isPortrait ? 179 : (width <= 760 ? 196 : 176);
  document.documentElement.style.setProperty('--mobile-hand-visual-height', `${Math.round(cardHeight * scale)}px`);
  const energyPanel = document.querySelector('.energy-panel');
  const energyHeight = energyPanel?.getBoundingClientRect?.().height ?? 0;
  if (energyHeight > 0) {
    document.documentElement.style.setProperty('--mobile-energy-panel-height', `${Math.round(energyHeight)}px`);
  }
}

window.addEventListener('resize', () => syncMobileUiMetrics(), { passive: true });
screen.orientation?.addEventListener?.('change', () => syncMobileUiMetrics());

function readStoredUiScale() {
  try {
    return window.localStorage?.getItem(UI_SCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredUiScale(scale) {
  try {
    window.localStorage?.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Storage can be unavailable in private or embedded browsers.
  }
}
