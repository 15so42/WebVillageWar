// createDistantSnowMountains 内追加中景山脚环（远/中两层山脊），兼容 CRLF/LF
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/world/createWorld.js';
let txt = readFileSync(file, 'utf8');

const oldBlock =
`    const peak = new THREE.Mesh(geo, peakMat);
    peak.position.set(x, height * 0.5 - 7 - random() * 3, z);
    peak.rotation.y = random() * Math.PI * 2;
    scene.add(peak);
  }
}
`;

const newBlock =
`    const peak = new THREE.Mesh(geo, peakMat);
    peak.position.set(x, height * 0.5 - 7 - random() * 3, z);
    peak.rotation.y = random() * Math.PI * 2;
    scene.add(peak);
  }

  // 中景山脚环：远山内圈再立一层较低山脊，远/中/近三层纵深
  const midCount = 18;
  for (let i = 0; i < midCount; i += 1) {
    const angle = (i / midCount) * Math.PI * 2 + (random() - 0.5) * 0.2;
    const ringRX = 64 + random() * 14;
    const ringRZ = 56 + random() * 12;
    const x = Math.cos(angle) * ringRX;
    const z = Math.sin(angle) * ringRZ;
    const height = 9 + random() * 9;
    const radius = height * (0.6 + random() * 0.28);
    const geo = new THREE.ConeGeometry(radius, height, 5 + Math.floor(random() * 2));
    const haze = 0.26 + random() * 0.16;
    const sunlit = new THREE.Color(cliffArt.snow ?? '#eeeaea').lerp(fogColor, haze * 0.7);
    const mid = new THREE.Color(cliffArt.mid ?? '#766264').lerp(fogColor, haze);
    const shadow = new THREE.Color(cliffArt.shadow ?? '#403a4e').lerp(fogColor, haze);
    bakeWarmLighting(geo, sunlit, mid, shadow, sunDir);
    const peak = new THREE.Mesh(geo, peakMat);
    peak.position.set(x, height * 0.5 - 6 - random() * 2, z);
    peak.rotation.y = random() * Math.PI * 2;
    scene.add(peak);
  }
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
console.log('patched mid-ring OK');
