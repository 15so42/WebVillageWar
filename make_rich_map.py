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
      <stop offset="50%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(30,15,5,0.8)" />
    </radialGradient>
  </defs>

  <!-- Base Parchment -->
  <rect width="100%" height="100%" fill="#d6b88b" filter="url(#parchmentNoise)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Rhumb Lines / Navigation Lines -->
  <g stroke="rgba(100,60,30,0.15)" stroke-width="1.5">
    <!-- Starburst patterns from random points on edges -->
    <path d="M 1600 200 L 0 1080 M 1600 200 L 0 0 M 1600 200 L 1920 1080 M 1600 200 L 800 1080 M 1600 200 L 300 1080 M 1600 200 L 0 600 M 1600 200 L 1920 600 M 1600 200 L 1920 0 M 1600 200 L 1000 0" />
    <path d="M 400 800 L 0 0 M 400 800 L 1920 0 M 400 800 L 1920 400 M 400 800 L 1920 1080 M 400 800 L 0 1080 M 400 800 L 0 400" />
    <path d="M 960 100 L 0 400 M 960 100 L 0 800 M 960 100 L 1920 400 M 960 100 L 1920 800" />
  </g>

  <!-- Kingdom Borders (Dashed) -->
  <path d="M 200 0 Q 300 200, 250 400 T 400 800 Q 450 900, 300 1080" fill="none" stroke="rgba(150,50,30,0.3)" stroke-width="3" stroke-dasharray="15 10"/>
  <path d="M 1920 300 Q 1700 400, 1650 600 T 1500 800 Q 1400 900, 1450 1080" fill="none" stroke="rgba(150,50,30,0.3)" stroke-width="3" stroke-dasharray="15 10"/>
  <path d="M 600 0 Q 700 150, 900 200 T 1200 200 Q 1400 150, 1500 0" fill="none" stroke="rgba(150,50,30,0.3)" stroke-width="3" stroke-dasharray="15 10"/>

  <!-- Rivers (Wavy, branching) -->
  <path d="M 1200 0 Q 1300 100, 1250 200 T 1350 400 Q 1400 500, 1350 600 T 1500 800 Q 1550 900, 1500 1080" fill="none" stroke="rgba(70,90,120,0.4)" stroke-width="4"/>
  <path d="M 1350 400 Q 1200 450, 1150 500 T 1000 550" fill="none" stroke="rgba(70,90,120,0.3)" stroke-width="2"/>
  <path d="M 400 0 Q 450 150, 350 300 T 450 500 Q 500 600, 400 750 T 450 950 Q 500 1000, 450 1080" fill="none" stroke="rgba(70,90,120,0.4)" stroke-width="4"/>
  <path d="M 350 300 Q 200 350, 150 400 T 0 450" fill="none" stroke="rgba(70,90,120,0.3)" stroke-width="2"/>

  <!-- Roads / Explorer Routes (Dotted) -->
  <path d="M 450 500 Q 600 550, 650 450 T 800 400 Q 900 350, 1000 450 T 1150 500 Q 1250 550, 1350 400" fill="none" stroke="rgba(90,60,30,0.6)" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M 650 450 Q 700 600, 600 700 T 750 900" fill="none" stroke="rgba(90,60,30,0.6)" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M 1150 500 Q 1100 650, 1200 750 T 1050 950" fill="none" stroke="rgba(90,60,30,0.6)" stroke-width="2" stroke-dasharray="4 4"/>

  <!-- Coastlines (Top Left) -->
  <path d="M 0 300 Q 150 280, 200 200 T 350 150 T 450 50 L 500 0 L 0 0 Z" fill="rgba(160,130,95,0.4)" stroke="rgba(90,50,20,0.6)" stroke-width="3" stroke-dasharray="10 5" />
  <path d="M 0 320 Q 160 290, 220 210 T 370 160 T 470 60 L 520 0 L 0 0 Z" fill="none" stroke="rgba(90,50,20,0.3)" stroke-width="1.5" />
  
  <!-- Coastlines (Bottom Right) -->
  <path d="M 1920 600 Q 1800 650, 1750 750 T 1600 850 T 1450 950 Q 1400 1000, 1350 1080 L 1920 1080 Z" fill="rgba(160,130,95,0.4)" stroke="rgba(90,50,20,0.6)" stroke-width="3" stroke-dasharray="10 5" />
  <path d="M 1920 580 Q 1780 630, 1730 730 T 1580 830 T 1430 930 Q 1380 980, 1330 1080 L 1920 1080 Z" fill="none" stroke="rgba(90,50,20,0.3)" stroke-width="1.5" />

  <!-- Compass Rose 1 -->
  <g transform="translate(1600, 200)">
    <circle r="120" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="2"/>
    <circle r="110" fill="none" stroke="rgba(100,60,30,0.2)" stroke-width="1"/>
    <circle r="100" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="4" stroke-dasharray="10 5"/>
    <circle r="40" fill="none" stroke="rgba(100,60,30,0.6)" stroke-width="2"/>
    <path d="M 0 -130 L 15 -20 L 130 0 L 15 20 L 0 130 L -15 20 L -130 0 L -15 -20 Z" fill="rgba(100,60,30,0.2)" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <path d="M 0 -130 L 0 130 M -130 0 L 130 0" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <path d="M -80 -80 L -10 -10 L 80 -80 L 10 -10 L 80 80 L 10 10 L -80 80 L -10 10 Z" fill="none" stroke="rgba(100,60,30,0.5)" stroke-width="1.5"/>
    <circle r="15" fill="rgba(200,160,100,0.5)" stroke="rgba(100,60,30,0.8)" stroke-width="3"/>
  </g>

  <!-- Compass Rose 2 -->
  <g transform="translate(300, 900) scale(0.6)">
    <circle r="120" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="2"/>
    <circle r="100" fill="none" stroke="rgba(100,60,30,0.4)" stroke-width="4" stroke-dasharray="10 5"/>
    <path d="M 0 -130 L 15 -20 L 130 0 L 15 20 L 0 130 L -15 20 L -130 0 L -15 -20 Z" fill="rgba(100,60,30,0.2)" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <path d="M 0 -130 L 0 130 M -130 0 L 130 0" stroke="rgba(100,60,30,0.7)" stroke-width="2"/>
    <circle r="15" fill="rgba(200,160,100,0.5)" stroke="rgba(100,60,30,0.8)" stroke-width="3"/>
  </g>

  <!-- Decorative Sea Monster (Kraken / Serpent) -->
  <g transform="translate(180, 250) scale(1.2)" fill="none" stroke="rgba(100,60,30,0.5)" stroke-width="2">
    <path d="M -50 30 Q -35 10, -25 30 T 0 30 M -50 30 Q -55 20, -65 25 M 0 30 Q 15 60, 25 30 T 50 30 M 50 30 Q 65 0, 75 15 T 100 20 M 100 20 Q 110 25, 115 15 T 125 5 Q 115 -5, 105 5 M -20 23 L -22 16 M 20 30 L 20 21 M 70 17 L 70 9 M 112 15 L 117 9" />
    <path d="M -60 36 Q -45 30, -30 36 T 0 36 T 30 36 T 60 36 T 90 36 T 120 36" stroke="rgba(100,60,30,0.3)" stroke-width="1"/>
    <path d="M -50 42 Q -35 36, -20 42 T 10 42 T 40 42 T 70 42 T 100 42" stroke="rgba(100,60,30,0.2)" stroke-width="1"/>
  </g>

  <!-- Decorative Ship -->
  <g transform="translate(1600, 800) scale(1)" fill="none" stroke="rgba(100,60,30,0.6)" stroke-width="2">
    <path d="M -40 20 L 40 20 L 50 0 L -50 0 Z" fill="rgba(100,60,30,0.2)" />
    <line x1="-15" y1="0" x2="-15" y2="-50" />
    <line x1="15" y1="0" x2="15" y2="-60" />
    <path d="M -15 -10 Q -30 -15, -15 -45 Q -5 -15, -15 -10 Z" fill="rgba(200,180,150,0.4)" />
    <path d="M 15 -10 Q -5 -15, 15 -55 Q 35 -15, 15 -10 Z" fill="rgba(200,180,150,0.4)" />
    <path d="M 15 -20 Q 30 -25, 45 -40 L 15 -40" />
    <path d="M -15 -50 L -5 -55 L -15 -60 Z" fill="rgba(150,60,30,0.5)" />
    <path d="M 15 -60 L 25 -65 L 15 -70 Z" fill="rgba(150,60,30,0.5)" />
    <path d="M -60 25 Q -30 15, 0 25 T 60 25" stroke="rgba(100,60,30,0.4)" stroke-width="1.5" />
    <path d="M -50 35 Q -20 25, 10 35 T 70 35" stroke="rgba(100,60,30,0.2)" stroke-width="1" />
  </g>

  <!-- Mountain Range Definition -->
  <defs>
    <g id="mountain1">
      <path d="M 0 30 L 20 0 L 40 30 Z" fill="rgba(150,120,90,0.3)" stroke="rgba(90,50,20,0.7)" stroke-width="1.5"/>
      <path d="M 20 0 L 25 30" stroke="rgba(90,50,20,0.7)" stroke-width="1" fill="none"/>
    </g>
    <g id="mountain2">
      <path d="M 0 40 L 25 -10 L 50 40 Z" fill="rgba(150,120,90,0.3)" stroke="rgba(90,50,20,0.7)" stroke-width="1.5"/>
      <path d="M 25 -10 L 32 40" stroke="rgba(90,50,20,0.7)" stroke-width="1" fill="none"/>
    </g>
    <g id="tree">
      <path d="M 0 10 Q 5 0, 10 10 Z" fill="rgba(100,120,80,0.4)" stroke="rgba(60,80,40,0.7)" stroke-width="1"/>
    </g>
    <g id="castle">
      <path d="M -15 20 L -15 -10 L -5 -10 L -5 0 L 5 0 L 5 -10 L 15 -10 L 15 20 Z M -20 20 L 20 20 L 20 25 L -20 25 Z" fill="rgba(120,100,80,0.4)" stroke="rgba(90,50,20,0.8)" stroke-width="1.5"/>
      <rect x="-3" y="10" width="6" height="10" fill="rgba(90,50,20,0.8)"/>
      <path d="M -10 -10 L -10 -25 L -2 -20 L -2 -10 Z" fill="rgba(150,50,30,0.6)" stroke="rgba(90,50,20,0.8)" stroke-width="1"/>
      <path d="M 10 -10 L 10 -25 L 18 -20 L 18 -10 Z" fill="rgba(150,50,30,0.6)" stroke="rgba(90,50,20,0.8)" stroke-width="1"/>
    </g>
    <g id="village">
      <path d="M -10 10 L -10 0 L 0 -10 L 10 0 L 10 10 Z" fill="rgba(140,110,80,0.4)" stroke="rgba(90,50,20,0.7)" stroke-width="1.5"/>
      <path d="M -15 0 L 0 -15 L 15 0" stroke="rgba(90,50,20,0.7)" stroke-width="1.5" fill="none"/>
      <path d="M 15 15 L 15 5 L 25 -5 L 35 5 L 35 15 Z" fill="rgba(140,110,80,0.4)" stroke="rgba(90,50,20,0.7)" stroke-width="1.5"/>
      <path d="M 10 5 L 25 -10 L 40 5" stroke="rgba(90,50,20,0.7)" stroke-width="1.5" fill="none"/>
    </g>
    <g id="ancient-symbol1">
      <circle r="15" fill="none" stroke="rgba(120,80,50,0.5)" stroke-width="2"/>
      <circle r="10" fill="none" stroke="rgba(120,80,50,0.5)" stroke-width="1" stroke-dasharray="2 2"/>
      <path d="M 0 -10 L 0 10 M -10 0 L 10 0 M -7 -7 L 7 7 M -7 7 L 7 -7" stroke="rgba(120,80,50,0.5)" stroke-width="1.5"/>
    </g>
    <g id="ancient-symbol2">
      <path d="M -10 -10 L 10 -10 L 0 10 Z" fill="none" stroke="rgba(120,80,50,0.5)" stroke-width="2"/>
      <circle cy="0" r="4" fill="rgba(120,80,50,0.5)"/>
    </g>
  </defs>

  <!-- Placing Mountain Ranges (Avoiding Center 960, 540) -->
  <g transform="translate(1300, 150) scale(1.5)">
    <use href="#mountain1" x="0" y="0"/>
    <use href="#mountain2" x="20" y="-10"/>
    <use href="#mountain1" x="50" y="5"/>
    <use href="#mountain2" x="70" y="-5"/>
    <use href="#mountain1" x="-30" y="10"/>
  </g>
  
  <g transform="translate(450, 200) scale(1.2)">
    <use href="#mountain2" x="0" y="0"/>
    <use href="#mountain1" x="30" y="10"/>
    <use href="#mountain2" x="-20" y="15"/>
    <use href="#mountain1" x="50" y="-5"/>
  </g>

  <g transform="translate(1400, 650) scale(1.3)">
    <use href="#mountain1" x="0" y="0"/>
    <use href="#mountain2" x="25" y="-15"/>
    <use href="#mountain1" x="55" y="5"/>
    <use href="#mountain1" x="-20" y="20"/>
  </g>

  <g transform="translate(350, 750) scale(1.4)">
    <use href="#mountain2" x="0" y="0"/>
    <use href="#mountain1" x="30" y="15"/>
    <use href="#mountain2" x="60" y="-10"/>
    <use href="#mountain1" x="90" y="20"/>
  </g>

  <g transform="translate(700, 100) scale(1)">
    <use href="#mountain1" x="0" y="0"/>
    <use href="#mountain2" x="30" y="-10"/>
    <use href="#mountain1" x="60" y="5"/>
  </g>

  <!-- Forests -->
  <g transform="translate(550, 250) scale(1.5)">
    <use href="#tree" x="0" y="0"/> <use href="#tree" x="10" y="5"/> <use href="#tree" x="5" y="15"/>
    <use href="#tree" x="-10" y="8"/> <use href="#tree" x="20" y="-2"/> <use href="#tree" x="15" y="20"/>
  </g>
  <g transform="translate(1200, 300) scale(1.5)">
    <use href="#tree" x="0" y="0"/> <use href="#tree" x="15" y="10"/> <use href="#tree" x="-10" y="15"/>
    <use href="#tree" x="-20" y="5"/> <use href="#tree" x="10" y="-5"/> <use href="#tree" x="5" y="20"/>
  </g>
  <g transform="translate(450, 650) scale(1.5)">
    <use href="#tree" x="0" y="0"/> <use href="#tree" x="10" y="-10"/> <use href="#tree" x="20" y="5"/>
    <use href="#tree" x="-10" y="-5"/> <use href="#tree" x="-5" y="15"/> <use href="#tree" x="15" y="15"/>
  </g>
  <g transform="translate(1450, 800) scale(1.5)">
    <use href="#tree" x="0" y="0"/> <use href="#tree" x="-10" y="10"/> <use href="#tree" x="10" y="15"/>
    <use href="#tree" x="-20" y="0"/> <use href="#tree" x="20" y="5"/> <use href="#tree" x="0" y="20"/>
  </g>

  <!-- Castles and Villages -->
  <use href="#castle" x="450" y="500" transform="scale(1.5) translate(-150,-166)"/>
  <use href="#village" x="650" y="450" transform="scale(1.2) translate(-108,-75)"/>
  <use href="#castle" x="800" y="400" transform="scale(1.2) translate(-133,-66)"/>
  <use href="#village" x="1000" y="450" transform="scale(1) translate(0,0)"/>
  <use href="#castle" x="1150" y="500" transform="scale(1.5) translate(-383,-166)"/>
  <use href="#village" x="1350" y="400" transform="scale(1.2) translate(-225,-66)"/>
  <use href="#village" x="600" y="700" transform="scale(1.2) translate(-100,-116)"/>
  <use href="#castle" x="750" y="900" transform="scale(1.5) translate(-250,-300)"/>
  <use href="#castle" x="1200" y="750" transform="scale(1.2) translate(-200,-125)"/>

  <!-- Location Names (Muted text) -->
  <g fill="rgba(90,50,20,0.5)" font-family="serif" font-size="20" font-weight="bold" font-style="italic" text-anchor="middle">
    <text x="450" y="550">Frostwatch</text>
    <text x="650" y="490">Oakhaven</text>
    <text x="800" y="450">High Keep</text>
    <text x="1150" y="560">Ebonstone Guard</text>
    <text x="1350" y="440">River Bend</text>
    <text x="750" y="960">Southmark Fortress</text>
    <text x="1200" y="800">King's Gate</text>
    <text x="1400" y="250" font-size="28" fill="rgba(120,50,30,0.4)">DRAGON'S TEETH</text>
    <text x="400" y="250" font-size="28" fill="rgba(120,50,30,0.4)">THE SHIVERING PEAKS</text>
    <text x="100" y="100" font-size="36" fill="rgba(120,50,30,0.3)">MARE FRIGIDUM</text>
    <text x="1800" y="1000" font-size="36" fill="rgba(120,50,30,0.3)">GREAT EASTERN OCEAN</text>
  </g>

  <!-- Ancient Symbols -->
  <use href="#ancient-symbol1" x="200" y="600"/>
  <use href="#ancient-symbol2" x="1700" y="400"/>
  <use href="#ancient-symbol1" x="1000" y="150"/>
  <use href="#ancient-symbol2" x="850" y="800"/>

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

