const fs = require('fs');
let code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');
code = code.replace(/\$\{selectedLevel\.nodes\.length\} 波/g, "\${Math.floor((selectedLevel.enemyDirector?.maxThreat ?? 10) / 2)} 波");
fs.writeFileSync('src/systems/MetaGameSystem.js', code);
console.log("Patched nodes");
