// 中央浅谷地形：谷底略低 + 山脚略高 + 温柔起伏，路/广场/营地/战斗平台保持平坦。CRLF/LF 兼容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const anchor = `    height += swell * swellKeep;`;
const insert = `    height += swell * swellKeep;
    // 中央浅谷：谷底略低、两侧山脚略高、温柔起伏；
    // 主路/基地/敌营/祭坛与战斗平台附近淡出，保持平坦可走（量级小，不成碗、不成坡）
    const valleyFeet = smoothstep(14, 30, Math.abs(x)) * 0.7;
    const valleyLow = (1 - smoothstep(0, 14, Math.abs(x))) * -0.35;
    const valleyWave =
      Math.sin(x * 0.05 + z * 0.042) * 0.22 +
      Math.cos(x * 0.068 - z * 0.03) * 0.17 +
      Math.sin((x - z) * 0.037) * 0.14;
    let reliefKeep =
      (1 - smoothstep(5, 11, pathDistance)) +
      (1 - smoothstep(9, 17, Math.hypot(x - (config.playerBasePosition?.x ?? 0), z - (config.playerBasePosition?.z ?? 0)))) +
      (1 - smoothstep(9, 17, Math.hypot(x - (config.enemyCampPosition?.x ?? 0), z - (config.enemyCampPosition?.z ?? 0))));
    (config.clearings ?? []).forEach((c) => {
      reliefKeep = Math.max(reliefKeep, (1 - smoothstep(2.5, 9, Math.hypot(x - c.x, z - c.z))) * 0.9);
    });
    reliefKeep = 1 - Math.min(1, reliefKeep);
    height += (valleyFeet + valleyLow + valleyWave) * Math.max(0.08, reliefKeep);`;

let ok = false;
for (const v of [anchor, anchor.replace(/\n/g, '\r\n')]) {
  if (txt.includes(v)) { txt = txt.replace(v, insert.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n')); ok = true; break; }
}
if (!ok) { console.error('anchor not found'); process.exit(1); }
writeFileSync(file, txt, 'utf8');
console.log('central shallow-valley terrain inserted');
