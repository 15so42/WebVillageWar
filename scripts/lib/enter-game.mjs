// 验收脚本共用的"进入游戏"前置。
//
// 生存玩法没有选关、没有难度、没有牌组配置：主菜单只有一个「开始游戏」，
// 点下去直接进唯一场景。所以所有脚本的启动前置都收敛成这一个函数，
// 而不是每个脚本各自点三下菜单（那种写法在改菜单时会一起失效，21 个文件逐个改最容易漏）。
//
// 用法（脚本里已有 ev / sleep 时）：
//   import { enterSurvivalGame } from './lib/enter-game.mjs';
//   report.started = await enterSurvivalGame(ev, sleep);
export async function enterSurvivalGame(ev, sleep, { attempts = 60, settleMs = 400 } = {}) {
  // 1) 等主菜单渲染出来
  let menuReady = false;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(settleMs);
    if (await ev(`!!document.querySelector('[data-action="start-game"]')`)) {
      menuReady = true;
      break;
    }
  }
  if (!menuReady) return false;
  // 2) 点「开始游戏」，直接进场景
  await ev(`document.querySelector('[data-action="start-game"]')?.click(); true`);
  // 3) 等游戏实例就绪。
  //    连续批量跑 21 个脚本时，浏览器与 dev server 在负载下会明显变慢，
  //    原来固定的 24 秒预算偶发不够（有两次观测：verify-field-recruit 与
  //    verify-rune-stone-play 都只在批量里失败、单独跑必过）。
  //    所以这里把预算提到 ~40 秒，并**补点一次**：点击丢失或主菜单刚重建时重试。
  for (let i = 0; i < Math.round(attempts * 1.67); i += 1) {
    await sleep(settleMs);
    if (await ev(`!!window.__VILLAGE_WAR_DEBUG__?.game`)) return true;
    if (i === attempts) {
      // 还在菜单上说明那次点击没生效，再点一次
      await ev(`document.querySelector('[data-action="start-game"]')?.click(); true`);
    }
  }
  return false;
}

/** 进入游戏后确认当前关卡确实是生存地图（脚本可以用来断言"没进错场景"）。 */
export async function currentLevelId(ev) {
  return ev(`window.__VILLAGE_WAR_DEBUG__?.game?.worldConfig?.sceneKey ?? null`);
}
