import re

with open("src/systems/MetaGameSystem.js", "r", encoding="utf-8") as f:
    js = f.read()

# The horizontal banner behind the crest
banner_svg = """
                <!-- Horizontal Banner Behind Crest -->
                <div class="med-menu-horizontal-banner" style="position: absolute; top: 10px; width: 440px; height: 120px; z-index: -1;">
                    <svg viewBox="0 0 440 120" width="100%" height="100%" style="overflow: visible;">
                        <defs>
                            <filter id="fabricNoise">
                                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
                                <feColorMatrix type="matrix" values="1 0 0 0 0  0 0.9 0 0 0  0 0.8 0 0 0  0 0 0 0.5 0" in="noise" result="coloredNoise" />
                                <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
                            </filter>
                            <linearGradient id="bannerShadows" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#2a0808"/>
                                <stop offset="10%" stop-color="#5a1515"/>
                                <stop offset="30%" stop-color="#7a1c1c"/>
                                <stop offset="50%" stop-color="#4a0f0f"/> <!-- fold -->
                                <stop offset="70%" stop-color="#7a1c1c"/>
                                <stop offset="90%" stop-color="#5a1515"/>
                                <stop offset="100%" stop-color="#2a0808"/>
                            </linearGradient>
                            <filter id="bannerDropShadow">
                                <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity="0.7"/>
                            </filter>
                        </defs>
                        <!-- Banner Body -->
                        <path d="M 20 20 L 420 20 L 400 60 L 420 100 L 20 100 L 40 60 Z" fill="url(#bannerShadows)" filter="url(#fabricNoise) url(#bannerDropShadow)"/>
                        
                        <!-- Gold Embroidery / Stitching -->
                        <path d="M 32 28 L 408 28 L 392 60 L 408 92 L 32 92 L 48 60 Z" fill="none" stroke="#b08d45" stroke-width="2" stroke-dasharray="6 4" opacity="0.8"/>
                        <path d="M 38 34 L 402 34 L 385 60 L 402 86 L 38 86 L 55 60 Z" fill="none" stroke="#d4af37" stroke-width="1" opacity="0.5"/>
                        
                        <!-- Folds and Creases (Shadows/Highlights) -->
                        <path d="M 120 20 L 110 100 M 130 20 L 120 100" stroke="rgba(0,0,0,0.4)" stroke-width="3" fill="none" filter="url(#fabricNoise)"/>
                        <path d="M 320 20 L 330 100 M 310 20 L 320 100" stroke="rgba(0,0,0,0.4)" stroke-width="3" fill="none" filter="url(#fabricNoise)"/>
                        
                        <!-- Minor tears on edges -->
                        <path d="M 20 40 L 25 45 L 20 50 M 420 70 L 415 75 L 420 80 M 150 100 L 155 95 L 160 100" fill="none" stroke="#2a0808" stroke-width="1.5"/>
                    </svg>
                </div>
"""

# The crest SVG
crest_svg = """
                <div class="med-menu-crest-new">
                   <svg viewBox="0 0 140 160" width="140" height="160" style="overflow: visible;">
                      <defs>
                         <!-- Forged Iron Texture -->
                         <filter id="ironBevel" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" result="noise"/>
                            <feColorMatrix type="matrix" values="0.2 0 0 0 0  0 0.2 0 0 0  0 0.2 0 0 0  0 0 0 1 0" in="noise" result="coloredNoise"/>
                            <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" result="textured"/>
                            <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
                         </filter>
                         
                         <!-- Worn Gold Bevel -->
                         <filter id="goldBevel" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur"/>
                            <feOffset dx="0" dy="2" result="offsetBlur"/>
                            <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.4" specularExponent="10" lighting-color="#eedd99" result="specOut">
                               <fePointLight x="50" y="-30" z="30"/>
                            </feSpecularLighting>
                            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                            <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
                         </filter>

                         <linearGradient id="ironGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#3a3a3a"/>
                            <stop offset="40%" stop-color="#1f1f1f"/>
                            <stop offset="60%" stop-color="#141414"/>
                            <stop offset="100%" stop-color="#050505"/>
                         </linearGradient>

                         <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e6c27a"/>
                            <stop offset="25%" stop-color="#b88f3b"/>
                            <stop offset="50%" stop-color="#8a611c"/>
                            <stop offset="75%" stop-color="#b88f3b"/>
                            <stop offset="100%" stop-color="#4a3103"/>
                         </linearGradient>
                      </defs>
                      <g>
                          <!-- Heavy Iron Shield Base -->
                          <path d="M 10 10 L 130 10 L 130 80 C 130 130, 70 150, 70 150 C 70 150, 10 130, 10 80 Z" fill="url(#ironGrad)" filter="url(#ironBevel)" />
                          
                          <!-- Outer Worn Gold Trim -->
                          <path d="M 15 15 L 125 15 L 125 78 C 125 120, 70 138, 70 138 C 70 138, 15 120, 15 78 Z" fill="none" stroke="url(#goldGrad)" stroke-width="6" stroke-linejoin="round" filter="url(#goldBevel)"/>
                          
                          <!-- Inner Iron Rivets -->
                          <circle cx="25" cy="25" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="115" cy="25" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="25" cy="75" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="115" cy="75" r="2.5" fill="#111" filter="url(#goldBevel)"/>
                          <circle cx="70" cy="125" r="2.5" fill="#111" filter="url(#goldBevel)"/>

                          <!-- Engraved Metal Patterns (Scratches/Lines) -->
                          <path d="M 30 40 L 50 20 M 110 40 L 90 20 M 50 100 L 70 120 M 90 100 L 70 120" stroke="rgba(0,0,0,0.5)" stroke-width="1.5" fill="none"/>
                          <path d="M 32 42 L 52 22 M 108 38 L 88 18 M 52 102 L 72 122 M 88 98 L 68 118" stroke="rgba(255,255,255,0.05)" stroke-width="1" fill="none"/>

                          <!-- Kingdom Symbol (Castle / Crown) -->
                          <path d="M 40 90 L 40 50 L 52 50 L 52 60 L 64 60 L 64 45 L 76 45 L 76 60 L 88 60 L 88 50 L 100 50 L 100 90 Z" fill="url(#goldGrad)" filter="url(#goldBevel)"/>
                          
                          <!-- Castle Details (Windows/Gate) -->
                          <path d="M 65 90 L 65 75 C 65 70, 75 70, 75 75 L 75 90 Z" fill="#111" filter="url(#ironBevel)"/>
                          <rect x="44" y="65" width="4" height="8" fill="#111" rx="2"/>
                          <rect x="92" y="65" width="4" height="8" fill="#111" rx="2"/>
                          
                          <!-- Sword crossing behind castle but inside shield -->
                          <path d="M 50 105 L 90 35 M 90 105 L 50 35" stroke="rgba(0,0,0,0.6)" stroke-width="4"/>
                          <path d="M 50 105 L 90 35 M 90 105 L 50 35" stroke="#777" stroke-width="2"/>
                      </g>
                   </svg>
                </div>
"""

start_tag = r'<div class="med-menu-horizontal-banner".*?</svg>\s*</div>'
crest_tag = r'<div class="med-menu-crest-new">.*?</svg>\s*</div>'

js = re.sub(start_tag, banner_svg.strip(), js, flags=re.DOTALL)
js = re.sub(crest_tag, crest_svg.strip(), js, flags=re.DOTALL)

with open("src/systems/MetaGameSystem.js", "w", encoding="utf-8") as f:
    f.write(js)

