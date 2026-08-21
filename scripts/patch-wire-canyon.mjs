// 接线：雪谷 decorate 用 createSnowCanyonWalls 替代圆锥 createMountainRidge/createSnowMountain
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const oldBlock =
`    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));
    createMountainRidge(scene);
    createSnowMountain(scene);
    placeSnowValleyRoadsideClusters(scene, pathPoints);
`;

const newBlock =
`    createSnowValleyBackdrop(scene, seededRandom((worldConfig().seed ?? 42) + 977));
    createSnowCanyonWalls(scene); // 层次感峡谷岩壁（替代圆锥排），近暖远冷双层+上台
    placeSnowValleyRoadsideClusters(scene, pathPoints);
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
console.log('wired createSnowCanyonWalls into decorate (cones disabled)');
