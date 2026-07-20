const fs = require('fs');

const code = fs.readFileSync('src/systems/MetaGameSystem.js', 'utf8');

const newLevels = `  renderLevels() {
    const selectedLevel = this.selectedLevel();
    const availableDifficulty = this.availableDifficulty(selectedLevel.id);
    const selectedDifficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      availableDifficulty
    );
    const baseDifficulty = Math.max(1, Math.floor(selectedLevel.baseDifficulty ?? 1));
    const maxWaves = Math.floor((selectedLevel.enemyDirector?.maxThreat ?? 10) / 2);
    
    return \`
      <main class="med-map-book-container">
        <button class="med-btn-back book-back-btn" type="button" data-action="menu">← 撤回营帐</button>
        
        <div class="med-map-book">
          <!-- Leather binding in the middle -->
          <div class="med-book-binding"></div>
          
          <!-- Metal Corners -->
          <div class="med-corner top-left"></div>
          <div class="med-corner top-right"></div>
          <div class="med-corner bottom-left"></div>
          <div class="med-corner bottom-right"></div>

          <div class="med-book-page left-page">
            <h3 class="med-page-title">战役编年史</h3>
            <div class="med-chapter-list">
              \${LEVEL_DEFINITIONS.map((level) => {
                const unlockedDiff = this.availableDifficulty(level.id);
                const isSelected = level.id === selectedLevel.id;
                return \\\`
                  <button class="med-chapter-plaque \${isSelected ? 'is-selected' : ''}" 
                          type="button" 
                          data-action="select-level" 
                          data-level-id="\${level.id}">
                    <div class="plaque-nail left-nail"></div>
                    <div class="plaque-nail right-nail"></div>
                    <div class="plaque-content">
                        <span class="chapter-icon">\${unlockedDiff >= MAX_LEVEL_DIFFICULTY ? '🚩' : '⚔️'}</span>
                        <div class="chapter-info">
                            <span class="chapter-name">\${level.name}</span>
                            <span class="chapter-level">等级 \${unlockedDiff}</span>
                        </div>
                    </div>
                  </button>
                \\\`;
              }).join('')}
            </div>
          </div>

          <div class="med-book-page right-page">
             <h2 class="med-region-title">\${selectedLevel.name}</h2>
             <div class="med-region-illustration">
                <div class="med-region-map-placeholder">
                    🗺️
                </div>
             </div>
             <p class="med-region-desc">\${selectedLevel.summary}</p>
             
             <div class="med-region-stats">
                <div class="med-stat-box">
                    <span class="stat-label">基础环境难度</span>
                    <span class="stat-value">\${baseDifficulty}</span>
                </div>
                <div class="med-stat-box">
                    <span class="stat-label">预计波次规模</span>
                    <span class="stat-value">\${maxWaves} 波</span>
                </div>
             </div>
             
             <div class="med-difficulty-book-selector">
                <span class="diff-label">挑战刻度</span>
                <div class="diff-controls">
                    <button type="button" class="diff-btn" data-action="diff-down" \${selectedDifficulty <= 1 ? 'disabled' : ''}>◀</button>
                    <span class="diff-display">Lv.\${selectedDifficulty}</span>
                    <button type="button" class="diff-btn" data-action="diff-up" \${selectedDifficulty >= availableDifficulty ? 'disabled' : ''}>▶</button>
                </div>
             </div>

             <button class="med-war-start-btn" type="button" data-action="start">
                <span class="btn-inner-text">吹响号角 / 开始战役</span>
             </button>
          </div>
        </div>
      </main>
    \`;
  }`;

const startIdx = code.indexOf('  renderLevels() {');
const endIdx = code.indexOf('  renderDeckBuilder() {');

if (startIdx !== -1 && endIdx !== -1) {
    let modified = code.substring(0, startIdx) + newLevels.replace(/\\\\`/g, '`') + '\n\n' + code.substring(endIdx);
    fs.writeFileSync('src/systems/MetaGameSystem.js', modified);
    console.log("Patched levels correctly");
} else {
    console.error("Could not find start or end index.");
}
