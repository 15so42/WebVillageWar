import { readFileSync } from 'node:fs';
const t = readFileSync('src/world/createWorld.js', 'utf8');

const s = t.indexOf('function createSnowCanyonWalls');
const seg = t.slice(s, s + 3000);
const re = /name: '([^']+)'[\s\S]*?heightMin: ([\d.]+), heightMax: ([\d.]+)[\s\S]*?depthMin: ([\d.]+), depthMax: ([\d.]+)[\s\S]*?tint: '([^']+)', tintStrength: ([\d.]+)/g;
let m;
while ((m = re.exec(seg))) {
  console.log(m[1], 'h=' + m[2] + '-' + m[3], 'd=' + m[4] + '-' + m[5], 'tint=' + m[6], 'str=' + m[7]);
}

const i = t.indexOf("path: '");
console.log('palette.path =>', i >= 0 ? t.slice(i, i + 26) : 'nf');

const j = t.indexOf('function paintCleanTerraceFaces');
const seg2 = t.slice(j, j + 1600);
const rc = seg2.match(/rockLit = new THREE\.Color\('([^']+)'\);[\s\S]{0,80}?rockMid = new THREE\.Color\('([^']+)'\);[\s\S]{0,80}?rockDark = new THREE\.Color\('([^']+)'\);/);
console.log('rock colors =>', rc ? rc.slice(1).join(' ') : 'nf');
