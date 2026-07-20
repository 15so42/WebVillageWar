import re

with open('src/systems/MetaGameSystem.js', 'r') as f:
    js = f.read()

new_menu = '''  renderMainMenu() {
    return `
      <main class="med-meta-menu">
        <div class="med-menu-board-wrapper">
          <div class="med-menu-board">
            <div class="med-menu-crest-new">
               <svg viewBox="0 0 100 130" width="120" height="156">
                  <defs>
                     <filter id="metal-bevel" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                        <feOffset dx="1" dy="3" result="offsetBlur"/>
                        <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="#fff" result="specOut">
                           <fePointLight x="20" y="-30" z="50"/>
                        </feSpecularLighting>
                        <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                        <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
                     </filter>
                     <filter id="crest-shadow">
                        <feDropShadow dx="0" dy="12" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/>
                     </filter>
                     <linearGradient id="metal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#F2D06B"/>
                        <stop offset="50%" stop-color="#C29026"/>
                        <stop offset="100%" stop-color="#614104"/>
                     </linearGradient>
                     <linearGradient id="shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#333"/>
                        <stop offset="100%" stop-color="#050505"/>
                     </linearGradient>
                  </defs>
                  <g filter="url(#crest-shadow)">
                      <!-- Shield Backing (Thickness) -->
                      <path d="M 10 16 L 90 16 L 90 76 C 90 106, 50 121, 50 121 C 50 121, 10 106, 10 76 Z" fill="#000" />
                      <!-- Golden edge & shield -->
                      <path d="M 10 10 L 90 10 L 90 70 C 90 100, 50 115, 50 115 C 50 115, 10 100, 10 70 Z" fill="url(#shield-grad)" stroke="url(#metal-grad)" stroke-width="8" stroke-linejoin="round" filter="url(#metal-bevel)"/>
                      <!-- War banner element -->
                      <path d="M 15 25 L 85 25 L 75 40 L 85 55 L 15 55 L 25 40 Z" fill="#8A251C" stroke="#4a1510" stroke-width="2" filter="url(#metal-bevel)"/>
                      <!-- Castle silhouette -->
                      <path d="M 25 70 L 25 40 L 35 40 L 35 45 L 45 45 L 45 30 L 55 30 L 55 45 L 65 45 L 65 40 L 75 40 L 75 70 Z" fill="url(#metal-grad)" filter="url(#metal-bevel)"/>
                  </g>
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
print("Menu JS Patched Again")
