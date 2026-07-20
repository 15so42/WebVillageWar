import re

with open('src/systems/MetaGameSystem.js', 'r') as f:
    js = f.read()

new_menu = '''  renderMainMenu() {
    return `
      <main class="med-meta-menu">
        <!-- Corner Delete Button -->
        <button class="med-btn-epic-danger-corner" type="button" data-action="clear-save" title="焚毁盟约 (清档)">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
             <path d="M 3 6 L 21 6 M 8 6 L 8 4 Q 8 3 9 3 L 15 3 Q 16 3 16 4 L 16 6 M 10 11 L 10 17 M 14 11 L 14 17 M 5 6 L 19 6 L 18 20 Q 18 21 17 21 L 7 21 Q 6 21 6 20 Z" />
          </svg>
        </button>

        <div class="med-menu-board-wrapper">
          <div class="med-menu-board">
            
            <!-- Background Illustration (Opacity 8%) -->
            <div class="med-menu-illustration">
                <svg viewBox="0 0 500 300" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
                   <g opacity="0.08" stroke="#3e2a1b" stroke-width="2" fill="none">
                      <!-- Snow mountains -->
                      <path d="M 0 150 L 50 80 L 100 130 L 180 50 L 250 120 L 320 40 L 400 130 L 450 90 L 500 150" stroke-linejoin="round"/>
                      <path d="M 50 80 L 50 150 M 180 50 L 170 150 M 320 40 L 330 150 M 450 90 L 440 150" stroke-dasharray="2 4" stroke-width="1"/>
                      <!-- Castle silhouette in background -->
                      <path d="M 200 150 L 200 100 L 220 100 L 220 120 L 240 120 L 240 90 L 260 90 L 260 120 L 280 120 L 280 100 L 300 100 L 300 150 Z" fill="#3e2a1b" fill-opacity="0.2"/>
                      <!-- Village houses -->
                      <path d="M 50 200 L 70 180 L 90 200 L 90 220 L 50 220 Z M 60 200 L 80 200 L 80 220 L 60 220 Z" />
                      <path d="M 100 210 L 115 195 L 130 210 L 130 230 L 100 230 Z" />
                      <path d="M 380 190 L 400 170 L 420 190 L 420 210 L 380 210 Z" />
                      <!-- War banner -->
                      <path d="M 350 160 L 350 250 M 350 170 L 390 170 L 380 190 L 390 210 L 350 210" stroke-linejoin="round"/>
                      <path d="M 150 180 L 150 260 M 150 190 L 110 190 L 120 210 L 110 230 L 150 230" stroke-linejoin="round"/>
                      <!-- Soldiers silhouettes/spears -->
                      <path d="M 220 250 L 220 220 M 240 260 L 240 230 M 260 255 L 260 225 M 280 260 L 280 230" stroke-width="3" stroke-linecap="round"/>
                      <path d="M 215 230 L 225 210 M 235 240 L 245 220 M 255 235 L 265 215 M 275 240 L 285 220" stroke-width="1.5"/>
                   </g>
                </svg>
            </div>

            <div class="med-menu-crest-group">
                <!-- Ribbon and Gold lines connecting Crest and Title -->
                <div class="med-menu-ribbon-bg">
                    <svg viewBox="0 0 200 60" width="100%" height="60" preserveAspectRatio="none">
                        <path d="M 50 25 L 150 25 L 160 30 L 150 35 L 50 35 L 40 30 Z" fill="#5c2e26" stroke="#8c6213" stroke-width="1.5" filter="drop-shadow(0px 3px 2px rgba(0,0,0,0.5))"/>
                        <path d="M 30 30 L 50 30 M 150 30 L 170 30" stroke="#8c6213" stroke-width="1.5" stroke-dasharray="2 2"/>
                    </svg>
                </div>
                
                <div class="med-menu-crest-new">
                   <svg viewBox="0 0 100 130" width="120" height="156">
                      <defs>
                         <filter id="metal-bevel-v2" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                            <feOffset dx="0" dy="2" result="offsetBlur"/>
                            <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="#fff" result="specOut">
                               <fePointLight x="50" y="-30" z="50"/>
                            </feSpecularLighting>
                            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                            <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                            <feDropShadow dx="0" dy="8" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
                         </filter>
                         <filter id="crest-shadow-v2">
                            <feDropShadow dx="0" dy="12" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/>
                         </filter>
                         <linearGradient id="metal-grad-v2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#F2D06B"/>
                            <stop offset="30%" stop-color="#C29026"/>
                            <stop offset="70%" stop-color="#8c6213"/>
                            <stop offset="100%" stop-color="#4a3103"/>
                         </linearGradient>
                         <linearGradient id="shield-grad-v2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#2a2a2a"/>
                            <stop offset="50%" stop-color="#111"/>
                            <stop offset="100%" stop-color="#000"/>
                         </linearGradient>
                      </defs>
                      <g filter="url(#crest-shadow-v2)">
                          <!-- Shield Backing -->
                          <path d="M 10 16 L 90 16 L 90 76 C 90 106, 50 121, 50 121 C 50 121, 10 106, 10 76 Z" fill="#000" />
                          <!-- Golden edge & shield -->
                          <path d="M 10 10 L 90 10 L 90 70 C 90 100, 50 115, 50 115 C 50 115, 10 100, 10 70 Z" fill="url(#shield-grad-v2)" stroke="url(#metal-grad-v2)" stroke-width="8" stroke-linejoin="round" filter="url(#metal-bevel-v2)"/>
                          <!-- War banner element inside shield -->
                          <path d="M 15 25 L 85 25 L 75 40 L 85 55 L 15 55 L 25 40 Z" fill="#8A251C" stroke="#4a1510" stroke-width="2" filter="url(#metal-bevel-v2)"/>
                          <!-- Castle silhouette -->
                          <path d="M 25 70 L 25 40 L 35 40 L 35 45 L 45 45 L 45 30 L 55 30 L 55 45 L 65 45 L 65 40 L 75 40 L 75 70 Z" fill="url(#metal-grad-v2)" filter="url(#metal-bevel-v2)"/>
                      </g>
                   </svg>
                </div>

                <!-- Cloth straps connecting shield and title -->
                <div class="med-menu-straps" style="position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); z-index: 0;">
                    <svg viewBox="0 0 60 40" width="60" height="40">
                        <g filter="drop-shadow(0px 4px 2px rgba(0,0,0,0.6))">
                            <path d="M 15 0 L 15 25 L 20 35 L 25 25 L 25 0 Z" fill="#5c2e26" stroke="#3a1c15" stroke-width="1"/>
                            <path d="M 35 0 L 35 30 L 40 40 L 45 30 L 45 0 Z" fill="#5c2e26" stroke="#3a1c15" stroke-width="1"/>
                        </g>
                        <path d="M 17 25 L 23 25 M 37 30 L 43 30" stroke="#C29026" stroke-width="1"/>
                    </svg>
                </div>
            </div>
            
            <div class="med-menu-title-container">
                <h1 class="med-menu-title-epic">VILLAGE WAR</h1>
                <h2 class="med-menu-subtitle-epic">凛 冬 之 战</h2>
            </div>
            <div class="med-menu-divider-epic">
                <!-- Golden decorative line -->
                <svg width="250" height="20" viewBox="0 0 250 20">
                    <path d="M 0 10 L 100 10 L 110 5 L 120 15 L 130 5 L 140 10 L 250 10" stroke="url(#metal-grad-v2)" stroke-width="2" fill="none" opacity="0.8"/>
                    <circle cx="125" cy="10" r="4" fill="#C29026" opacity="0.9"/>
                    <circle cx="0" cy="10" r="2" fill="#C29026"/>
                    <circle cx="250" cy="10" r="2" fill="#C29026"/>
                </svg>
            </div>
            
            <nav class="med-menu-nav" aria-label="主菜单">
              <!-- Embark as the only primary button -->
              <button class="med-btn-epic-primary" type="button" data-action="levels">
                  <!-- Metal Corners & Engraving -->
                  <svg class="btn-metal-corners" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; border-radius: 4px;">
                      <!-- Golden Corners -->
                      <path d="M 0 15 L 0 0 L 15 0 M 85 0 L 100 0 L 100 15 M 100 85 L 100 100 L 85 100 M 15 100 L 0 100 L 0 85" fill="none" stroke="#F2D06B" stroke-width="4" filter="drop-shadow(0 2px 2px rgba(0,0,0,0.8))"/>
                      <!-- Crest Engraving Watermark -->
                      <path d="M 40 20 L 60 20 L 60 70 L 50 85 L 40 70 Z" fill="none" stroke="#000" stroke-width="1.5" opacity="0.15"/>
                  </svg>
                  <span class="btn-text-main">踏上征途</span> 
                  <span class="btn-text-sub">Embark</span>
              </button>
              <button class="med-btn-epic" type="button" data-action="coop">双人联机 <span>Co-op</span></button>
              <button class="med-btn-epic" type="button" data-action="shop">炼金工坊 <span>Workshop</span></button>
              <div class="med-menu-row">
                  <button class="med-btn-epic-small" type="button" data-action="guide">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> 战术典籍
                  </button>
                  <button class="med-btn-epic-small" type="button" data-action="encyclopedia">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 附魔图鉴
                  </button>
                  <button class="med-btn-epic-small" type="button" data-action="changelog">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; opacity: 0.7;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 王国纪要
                  </button>
              </div>
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
print("Menu JS Patched V5")
