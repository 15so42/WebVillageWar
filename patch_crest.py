import re

with open("src/systems/MetaGameSystem.js", "r", encoding="utf-8") as f:
    js = f.read()

# Replace the crest group
crest_group_replacement = """
            <div class="med-menu-crest-group" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <!-- Vertical Banner Behind Crest -->
                <div class="med-menu-vertical-banner" style="position: absolute; top: -80px; width: 140px; height: 300px; z-index: -1;">
                    <svg viewBox="0 0 140 300" width="100%" height="100%">
                        <!-- Banner Body -->
                        <path d="M 10 0 L 130 0 L 130 250 L 70 290 L 10 250 Z" fill="#7a1c1c" stroke="#d4af37" stroke-width="4" filter="drop-shadow(0px 10px 10px rgba(0,0,0,0.7))"/>
                        <!-- Gold Trim Inner -->
                        <path d="M 18 0 L 122 0 L 122 245 L 70 275 L 18 245 Z" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="4 2"/>
                        <!-- Decorative Symbols -->
                        <path d="M 70 200 L 80 220 L 60 220 Z" fill="#d4af37"/>
                        <!-- Top hanging bar -->
                        <rect x="0" y="-5" width="140" height="10" fill="#2a1a10" rx="3" ry="3"/>
                        <circle cx="5" cy="0" r="6" fill="#d4af37"/>
                        <circle cx="135" cy="0" r="6" fill="#d4af37"/>
                    </svg>
                </div>
                
                <!-- Ribbon and Gold lines connecting Crest and Title -->
                <div class="med-menu-ribbon-bg">
                    <svg viewBox="0 0 200 60" width="100%" height="60" preserveAspectRatio="none">
                        <path d="M 50 25 L 150 25 L 160 30 L 150 35 L 50 35 L 40 30 Z" fill="#5c2e26" stroke="#8c6213" stroke-width="1.5" filter="drop-shadow(0px 3px 2px rgba(0,0,0,0.5))"/>
                        <path d="M 30 30 L 50 30 M 150 30 L 170 30" stroke="#8c6213" stroke-width="1.5" stroke-dasharray="2 2"/>
                    </svg>
                </div>
                
                <div class="med-menu-crest-new">
                   <svg viewBox="0 0 100 130" width="120" height="156" style="overflow: visible;">
                      <defs>
                         <filter id="metal-bevel-v2" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                            <feOffset dx="0" dy="2" result="offsetBlur"/>
                            <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="#fff" result="specOut">
                               <fePointLight x="50" y="-30" z="50"/>
                            </feSpecularLighting>
                            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                            <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
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
                      <g>
                          <!-- Shield Backing -->
                          <path d="M 10 16 L 90 16 L 90 76 C 90 106, 50 121, 50 121 C 50 121, 10 106, 10 76 Z" fill="#000" />
"""

js = re.sub(
    r'<div class="med-menu-crest-group">.*?<g filter="url\(#crest-shadow-v2\)">\s*<!-- Shield Backing -->\s*<path d="M 10 16 L 90 16 L 90 76 C 90 106, 50 121, 50 121 C 50 121, 10 106, 10 76 Z" fill="#000" />',
    crest_group_replacement.strip(),
    js,
    flags=re.DOTALL
)

with open("src/systems/MetaGameSystem.js", "w", encoding="utf-8") as f:
    f.write(js)

