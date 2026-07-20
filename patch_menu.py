import re

with open('src/systems/MetaGameSystem.js', 'r') as f:
    js = f.read()

new_menu = '''  renderMainMenu() {
    return `
      <main class="med-meta-menu">
        <div class="med-menu-board-wrapper">
          <div class="med-menu-board">
            <div class="med-menu-crest-new">
               <svg viewBox="0 0 100 120" width="80" height="96">
                  <!-- Golden edge, black shield -->
                  <path d="M 10 10 L 90 10 L 90 70 C 90 100, 50 115, 50 115 C 50 115, 10 100, 10 70 Z" fill="#111" stroke="#D2A046" stroke-width="6" stroke-linejoin="round"/>
                  <!-- War banner element -->
                  <path d="M 20 20 L 80 20 L 75 35 L 80 50 L 20 50 L 25 35 Z" fill="#8A251C" />
                  <!-- Castle silhouette -->
                  <path d="M 25 70 L 25 40 L 35 40 L 35 45 L 45 45 L 45 30 L 55 30 L 55 45 L 65 45 L 65 40 L 75 40 L 75 70 Z" fill="#D2A046" />
               </svg>
            </div>
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
        </div>
      </main>
    `;
  }'''

js = re.sub(r'  renderMainMenu\(\) \{.*?return `.*?`;\s*\}', new_menu, js, flags=re.DOTALL)

with open('src/systems/MetaGameSystem.js', 'w') as f:
    f.write(js)
print("Menu JS Patched")
