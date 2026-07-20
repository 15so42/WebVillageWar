import re

with open('src/systems/MetaGameSystem.js', 'r') as f:
    js = f.read()

# Replace renderMainMenu
new_menu = '''renderMainMenu() {
    return `
      <main class="med-meta-menu">
        <div class="med-menu-board">
          <div class="med-menu-crest">🏰</div>
          <h1 class="med-menu-title">VILLAGE WAR</h1>
          <h2 class="med-menu-subtitle">凛 冬 之 战</h2>
          <div class="med-menu-divider"></div>
          <nav class="med-menu-nav" aria-label="主菜单">
            <button class="med-btn-primary" type="button" data-action="levels">踏上征途 <span>Embark</span></button>
            <button class="med-btn" type="button" data-action="coop">双人联机 <span>Co-op</span></button>
            <button class="med-btn" type="button" data-action="shop">炼金工坊 <span>Workshop</span></button>
            <div class="med-menu-row">
                <button class="med-btn-small" type="button" data-action="guide">战术典籍</button>
                <button class="med-btn-small" type="button" data-action="encyclopedia">附魔图鉴</button>
                <button class="med-btn-small" type="button" data-action="changelog">王国纪要</button>
            </div>
            <button class="med-btn-danger" type="button" data-action="clear-save">焚毁盟约 (清档)</button>
          </nav>
          <div class="med-version-mark">${TEST_VERSION_LABEL}</div>
        </div>
      </main>
    `;
  }'''
js = re.sub(r'renderMainMenu\(\) \{.*?return `.*?`;\s*\}', new_menu, js, flags=re.DOTALL)


# Replace renderLevels
new_levels = '''renderLevels() {
    const selectedLevel = this.selectedLevel();
    const availableDifficulty = this.availableDifficulty(selectedLevel.id);
    const selectedDifficulty = Math.min(
      clampDifficulty(this.selectedDifficulty),
      availableDifficulty
    );
    const baseDifficulty = Math.max(1, Math.floor(selectedLevel.baseDifficulty ?? 1));
    const growthMultiplier = difficultyGrowthMultiplier(selectedLevel, selectedDifficulty);
    return `
      <main class="med-meta-levels">
        <div class="med-levels-board">
            <button class="med-btn-back" type="button" data-action="menu">← 撤回营帐</button>
            
            <div class="med-levels-layout">
                <!-- Left: Map Scroll -->
                <div class="med-map-scroll">
                    <h3 class="med-scroll-title">战役地图</h3>
                    <div class="med-map-list">
                    ${LEVEL_DEFINITIONS.map((level) => {
                      const unlockedDiff = this.availableDifficulty(level.id);
                      const isSelected = level.id === selectedLevel.id;
                      return `
                        <button class="med-map-node ${isSelected ? 'is-selected' : ''}" 
                                type="button" 
                                data-action="select-level" 
                                data-level-id="${level.id}">
                          <span class="node-icon">${unlockedDiff >= MAX_LEVEL_DIFFICULTY ? '🚩' : '💠'}</span>
                          <span class="node-name">${level.name}</span>
                          <span class="node-status">Lv.${unlockedDiff}</span>
                        </button>
                      `;
                    }).join('')}
                    </div>
                </div>

                <!-- Right: Briefing -->
                <div class="med-briefing-panel">
                    <h2 class="med-briefing-title">${selectedLevel.name}</h2>
                    <p class="med-briefing-desc">${selectedLevel.summary}</p>
                    
                    <div class="med-briefing-stats">
                        <div class="med-stat"><span>基础环境难度</span> <strong>${baseDifficulty}</strong></div>
                        <div class="med-stat"><span>地图总规模</span> <strong>${selectedLevel.nodes.length} 波</strong></div>
                    </div>
                    
                    <div class="med-difficulty-selector">
                        <h4>挑战难度刻度</h4>
                        <div class="med-diff-controls">
                            <button type="button" class="med-btn-icon" data-action="diff-down" ${selectedDifficulty <= 1 ? 'disabled' : ''}>◀</button>
                            <span class="med-diff-display">Lv.${selectedDifficulty}</span>
                            <button type="button" class="med-btn-icon" data-action="diff-up" ${selectedDifficulty >= availableDifficulty ? 'disabled' : ''}>▶</button>
                        </div>
                    </div>

                    <button class="med-btn-embark" type="button" data-action="start">吹响号角 / 开始战役</button>
                </div>
            </div>
        </div>
      </main>
    `;
  }'''
js = re.sub(r'renderLevels\(\) \{.*?return `.*?`;\s*\}', new_levels, js, flags=re.DOTALL)

with open('src/systems/MetaGameSystem.js', 'w') as f:
    f.write(js)
print("Meta menu patched.")
