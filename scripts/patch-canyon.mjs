// 在 createWorld.js 的 valleyFloor 之后插入雪谷峡谷台地（兼容 CRLF/LF）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const oldBlock =
`  const valleyFloor = terrain.valleyFloorBase +
    northMask * terrain.valleyNorthRise +
    smoothstep(0, 32, Math.abs(x)) * terrain.valleySideRise;
  height = mix(height, Math.min(height, valleyFloor), valleyMask * 0.68);
`;

const newBlock =
`  const valleyFloor = terrain.valleyFloorBase +
    northMask * terrain.valleyNorthRise +
    smoothstep(0, 32, Math.abs(x)) * terrain.valleySideRise;
  height = mix(height, Math.min(height, valleyFloor), valleyMask * 0.68);

  // 雪谷峡谷台地：沿 S 形主路走廊两侧 3 档递升的岩壁层次（近台→中台→高台），
  // 营造近/中/远与高低纵深；主路/基地/敌营沿路 pathDistance≈0 因此保持平地可走
  if (config.sceneKey === 'snow-valley') {
    const canyonRim =
      smoothstep(10, 17, pathDistance) * 1.5 +
      smoothstep(17, 27, pathDistance) * 2.0 +
      smoothstep(27, 42, pathDistance) * 2.9;
    height += canyonRim;
  }
`;

const oldCRLF = oldBlock.replace(/\n/g, '\r\n');
const newCRLF = newBlock.replace(/\n/g, '\r\n');

if (txt.includes(oldCRLF)) {
  txt = txt.replace(oldCRLF, newCRLF);
} else if (txt.includes(oldBlock)) {
  txt = txt.replace(oldBlock, newBlock);
} else {
  console.error('OLD NOT FOUND (CRLF nor LF)');
  process.exit(1);
}
writeFileSync(file, txt, 'utf8');
console.log('patched canyonRim OK (CRLF preserved)');
