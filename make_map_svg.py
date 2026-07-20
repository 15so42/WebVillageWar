import urllib.parse
import re

svg_content = """<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <filter id="parchmentNoise">
      <feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="5" result="noise" />
      <feColorMatrix type="matrix" values="
        1 0 0 0 0 
        0 0.9 0 0 0 
        0 0.7 0 0 0 
        0 0 0 0.4 0" in="noise" result="coloredNoise" />
      <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
    </filter>
    <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="none"/>
      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(100,60,30,0.15)" stroke-width="1"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%" fx="50%" fy="50%">
      <stop offset="60%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(30,15,5,0.8)" />
    </radialGradient>
  </defs>

  <!-- Base Parchment -->
  <rect width="100%" height="100%" fill="#d6b88b" filter="url(#parchmentNoise)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Rhumb Lines -->
  <g stroke="rgba(100,60,30,0.2)" stroke-width="1.5">
    <line x1="1600" y1="200" x2="0" y2="1080" />
    <line x1="1600" y1="200" x2="0" y2="0" />
    <line x1="1600" y1="200" x2="1920" y2="1080" />
    <line x1="1600" y1="200" x2="800" y2="1080" />
    <line x1="1600" y1="200" x2="300" y2="1080" />
    <line x1="1600" y1="200" x2="0" y2="600" />
    <line x1="1600" y1="200" x2="1920" y2="600" />
    <line x1="1600" y1="200" x2="1920" y2="0" />
    <line x1="1600" y1="200" x2="1000" y2="0" />
    
    <line x1="400" y1="800" x2="0" y2="0" />
    <line x1="400" y1="800" x2="1920" y2="0" />
    <line x1="400" y1="800" x2="1920" y2="400" />
    <line x1="400" y1="800" x2="1920" y2="1080" />
    <line x1="400" y1="800" x2="0" y2="1080" />
    <line x1="400" y1="800" x2="0" y2="400" />
  </g>

  <!-- Abstract Coastlines (Top Left) -->
  <path d="M 0 300 Q 150 280, 200 200 T 350 150 T 450 50 L 500 0 L 0 0 Z" fill="rgba(160,130,95,0.4)" stroke="rgba(90,50,20,0.6)" stroke-width="3" stroke-dasharray="10 5" />
  <path d="M 0 320 Q 160 290, 220 210 T 370 160 T 470 60 L 520 0 L 0 0 Z" fill="none" stroke="rgba(90,50,20,0.3)" stroke-width="1.5" />
  <path d="M 0 340 Q 170 300, 240 220 T 390 170 T 490 70 L 540 0 L 0 0 Z" fill="none" stroke="rgba(90,50,20,0.15)" stroke-width="1" />

  <!-- Abstract Coastlines (Bottom Right) -->
  <path d="M 1920 600 Q 1800 650, 1750 750 T 1600 850 T 1450 950 Q 1400 1000, 1350 1080 L 1920 1080 Z" fill="rgba(160,130,95,0.4)" stroke="rgba(90,50,20,0.6)" stroke-width="3" stroke-dasharray="10 5" />
  <path d="M 1920 580 Q 1780 630, 1730 730 T 1580 830 T 1430 930 Q 1380 980, 1330 1080 L 1920 1080 Z" fill="none" stroke="rgba(90,50,20,0.3)" stroke-width="1.5" />
  <path d="M 1920 560 Q 1760 610, 1710 710 T 1560 810 T 1410 910 Q 1360 960, 1310 1080 L 1920 1080 Z" fill="none" stroke="rgba(90,50,20,0.15)" stroke-width="1" />

  <!-- Abstract Coastlines (Bottom Left Island) -->
  <path d="M 150 1080 L 150 950 Q 200 900, 300 920 T 450 850 Q 550 880, 500 1000 L 450 1080 Z" fill="rgba(160,130,95,0.4)" stroke="rgba(90,50,20,0.6)" stroke-width="3" stroke-dasharray="10 5" />

  <!-- Compass Rose 1 -->
  <g transform="translate(1600, 200)">
    <circle r="120" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="2"/>
    <circle r="110" fill="none" stroke="rgba(100,60,30,0.2)" stroke-width="1"/>
    <circle r="100" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="4" stroke-dasharray="10 5"/>
    <circle r="40" fill="none" stroke="rgba(100,60,30,0.6)" stroke-width="2"/>
    <path d="M 0 -130 L 15 -20 L 130 0 L 15 20 L 0 130 L -15 20 L -130 0 L -15 -20 Z" fill="rgba(100,60,30,0.2)" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <path d="M 0 -130 L 0 130 M -130 0 L 130 0" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <!-- Diagonal points -->
    <path d="M -80 -80 L -10 -10 L 80 -80 L 10 -10 L 80 80 L 10 10 L -80 80 L -10 10 Z" fill="none" stroke="rgba(100,60,30,0.5)" stroke-width="1.5"/>
    <circle r="15" fill="rgba(200,160,100,0.5)" stroke="rgba(100,60,30,0.8)" stroke-width="3"/>
  </g>

  <!-- Compass Rose 2 -->
  <g transform="translate(400, 800) scale(0.7)">
    <circle r="120" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="2"/>
    <circle r="100" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="4" stroke-dasharray="10 5"/>
    <path d="M 0 -130 L 15 -20 L 130 0 L 15 20 L 0 130 L -15 20 L -130 0 L -15 -20 Z" fill="rgba(100,60,30,0.2)" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <path d="M 0 -130 L 0 130 M -130 0 L 130 0" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <circle r="15" fill="rgba(200,160,100,0.5)" stroke="rgba(100,60,30,0.8)" stroke-width="3"/>
  </g>

  <!-- Decorative Sea Monster (Kraken / Serpent) -->
  <g transform="translate(1000, 300) scale(1.5)" fill="none" stroke="rgba(100,60,30,0.5)" stroke-width="2">
    <!-- Tail -->
    <path d="M -100 50 Q -70 10, -50 40 T 0 50" />
    <path d="M -100 50 Q -110 30, -130 40" />
    <!-- Body Loops -->
    <path d="M 0 50 Q 30 100, 50 40 T 100 50" />
    <path d="M 100 50 Q 130 0, 150 30 T 200 40" />
    <!-- Head -->
    <path d="M 200 40 Q 220 50, 230 30 T 250 10 Q 230 -10, 210 10" />
    <!-- Spikes / details -->
    <path d="M -40 38 L -45 25 M 40 50 L 40 35 M 140 28 L 140 15 M 225 25 L 235 15" stroke-width="1.5" />
    <!-- Waves around it -->
    <path d="M -120 60 Q -90 50, -60 60 T 0 60 T 60 60 T 120 60 T 180 60 T 240 60" stroke="rgba(100,60,30,0.3)" stroke-width="1"/>
    <path d="M -100 70 Q -70 60, -40 70 T 20 70 T 80 70 T 140 70 T 200 70" stroke="rgba(100,60,30,0.2)" stroke-width="1"/>
  </g>

  <!-- Decorative Ship -->
  <g transform="translate(600, 500) scale(1.2)" fill="none" stroke="rgba(100,60,30,0.6)" stroke-width="2">
    <!-- Hull -->
    <path d="M -40 20 L 40 20 L 50 0 L -50 0 Z" fill="rgba(100,60,30,0.2)" />
    <!-- Masts -->
    <line x1="-15" y1="0" x2="-15" y2="-50" />
    <line x1="15" y1="0" x2="15" y2="-60" />
    <!-- Sails -->
    <path d="M -15 -10 Q -30 -15, -15 -45 Q -5 -15, -15 -10 Z" fill="rgba(200,180,150,0.4)" />
    <path d="M 15 -10 Q -5 -15, 15 -55 Q 35 -15, 15 -10 Z" fill="rgba(200,180,150,0.4)" />
    <path d="M 15 -20 Q 30 -25, 45 -40 L 15 -40" />
    <!-- Flags -->
    <path d="M -15 -50 L -5 -55 L -15 -60 Z" fill="rgba(150,60,30,0.5)" />
    <path d="M 15 -60 L 25 -65 L 15 -70 Z" fill="rgba(150,60,30,0.5)" />
    <!-- Waves -->
    <path d="M -60 25 Q -30 15, 0 25 T 60 25" stroke="rgba(100,60,30,0.4)" stroke-width="1.5" />
    <path d="M -50 35 Q -20 25, 10 35 T 70 35" stroke="rgba(100,60,30,0.2)" stroke-width="1" />
  </g>

  <!-- Small Mountains (Top Right) -->
  <g transform="translate(1400, 100) scale(1)" fill="none" stroke="rgba(90,50,20,0.7)" stroke-width="2">
    <path d="M 0 50 L 30 0 L 60 50 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 30 0 L 40 50" stroke-width="1" />
    <path d="M 40 40 L 70 -10 L 100 40 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 70 -10 L 80 40" stroke-width="1" />
    <path d="M -30 60 L 0 20 L 30 60 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 0 20 L 10 60" stroke-width="1" />
  </g>
  
  <!-- Small Mountains (Bottom Right) -->
  <g transform="translate(1650, 800) scale(1.2)" fill="none" stroke="rgba(90,50,20,0.7)" stroke-width="2">
    <path d="M 0 50 L 30 0 L 60 50 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 30 0 L 40 50" stroke-width="1" />
    <path d="M 40 40 L 70 -10 L 100 40 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 70 -10 L 80 40" stroke-width="1" />
    <path d="M 80 50 L 110 10 L 140 50 Z" fill="rgba(150,120,90,0.3)"/>
    <path d="M 110 10 L 120 50" stroke-width="1" />
  </g>

  <!-- Trees / Forest area -->
  <g transform="translate(200, 100)" fill="rgba(100,120,80,0.4)" stroke="rgba(60,80,40,0.7)" stroke-width="1.5">
    <path d="M 0 20 Q 10 0, 20 20 Z" />
    <path d="M 15 25 Q 25 5, 35 25 Z" />
    <path d="M -10 30 Q 0 10, 10 30 Z" />
    <path d="M 30 15 Q 40 -5, 50 15 Z" />
    <path d="M 5 10 Q 15 -10, 25 10 Z" />
  </g>

  <!-- Trees / Forest area -->
  <g transform="translate(300, 150)" fill="rgba(100,120,80,0.4)" stroke="rgba(60,80,40,0.7)" stroke-width="1.5">
    <path d="M 0 20 Q 10 0, 20 20 Z" />
    <path d="M 15 25 Q 25 5, 35 25 Z" />
    <path d="M -10 30 Q 0 10, 10 30 Z" />
    <path d="M 30 15 Q 40 -5, 50 15 Z" />
    <path d="M 5 10 Q 15 -10, 25 10 Z" />
  </g>

  <!-- Vignette overlay -->
  <rect width="100%" height="100%" fill="url(#vignette)" pointer-events="none"/>
</svg>"""

encoded_svg = urllib.parse.quote(svg_content)
data_uri = f"data:image/svg+xml;utf8,{encoded_svg}"

with open("src/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

bg_css = f"""
.med-meta-menu {{
    /* Procedurally generated full-screen medieval parchment map */
    background: url('{data_uri}') center center / cover no-repeat !important;
    background-color: #d6b88b !important;
}}
"""

css = re.sub(
    r"\.med-meta-menu\s*\{[^}]*\}",
    bg_css.strip(),
    css,
    flags=re.DOTALL
)

with open("src/styles.css", "w", encoding="utf-8") as f:
    f.write(css)

