import urllib.parse
import re

svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="background-color: #d2b897;">
  <defs>
    <!-- Parchment Texture -->
    <filter id="parchmentNoise">
      <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" result="noise"/>
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 0.9 0 0 0  0 0.7 0 0 0  0 0 0 0.3 0" in="noise" result="coloredNoise"/>
      <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" />
    </filter>
    
    <!-- Old paper gradient -->
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="40%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(60,30,10,0.4)"/>
    </radialGradient>

    <g id="mountain1">
      <path d="M 0 30 L 20 0 L 40 30 Z" fill="rgba(160,130,100,0.15)" stroke="rgba(110,80,50,0.3)" stroke-width="1"/>
      <path d="M 20 0 L 25 30" stroke="rgba(110,80,50,0.3)" stroke-width="0.5" fill="none"/>
    </g>
    <g id="mountain2">
      <path d="M 0 40 L 25 -10 L 50 40 Z" fill="rgba(160,130,100,0.15)" stroke="rgba(110,80,50,0.3)" stroke-width="1"/>
      <path d="M 25 -10 L 32 40" stroke="rgba(110,80,50,0.3)" stroke-width="0.5" fill="none"/>
    </g>
    <g id="castle">
      <path d="M -10 15 L -10 -5 L -5 -5 L -5 0 L 5 0 L 5 -5 L 10 -5 L 10 15 Z M -15 15 L 15 15 L 15 20 L -15 20 Z" fill="rgba(140,110,90,0.15)" stroke="rgba(110,80,50,0.4)" stroke-width="1"/>
      <path d="M -8 -5 L -8 -15 L -2 -12 L -2 -5 Z" fill="rgba(140,80,60,0.2)" stroke="rgba(110,80,50,0.4)" stroke-width="0.5"/>
      <path d="M 8 -5 L 8 -15 L 14 -12 L 14 -5 Z" fill="rgba(140,80,60,0.2)" stroke="rgba(110,80,50,0.4)" stroke-width="0.5"/>
    </g>
  </defs>

  <!-- Base Texture -->
  <rect width="100%" height="100%" fill="#d2b897" filter="url(#parchmentNoise)"/>

  <!-- Coastlines & Water/Land Boundaries (Very faint) -->
  <path d="M 0 150 Q 200 200, 300 100 T 600 50 T 800 200 T 1200 150 T 1500 300 T 1920 200 L 1920 0 L 0 0 Z" fill="rgba(180,160,130,0.15)" stroke="rgba(110,80,50,0.2)" stroke-width="1"/>
  <path d="M 0 160 Q 200 210, 300 110 T 600 60 T 800 210 T 1200 160 T 1500 310 T 1920 210" fill="none" stroke="rgba(110,80,50,0.1)" stroke-width="0.5"/>
  <path d="M 0 170 Q 200 220, 300 120 T 600 70 T 800 220 T 1200 170 T 1500 320 T 1920 220" fill="none" stroke="rgba(110,80,50,0.05)" stroke-width="0.5"/>

  <path d="M 0 900 Q 300 850, 500 950 T 1000 850 T 1400 950 T 1920 850 L 1920 1080 L 0 1080 Z" fill="rgba(180,160,130,0.15)" stroke="rgba(110,80,50,0.2)" stroke-width="1"/>

  <!-- Thin Faint Roads/Paths -->
  <g fill="none" stroke="rgba(110,80,50,0.3)" stroke-width="1" stroke-dasharray="4 4">
    <!-- Top Left to middle left -->
    <path d="M 200 300 Q 300 400, 400 350 T 500 500"/>
    <!-- Top Right to middle right -->
    <path d="M 1600 300 Q 1500 500, 1400 400 T 1300 600"/>
    <!-- Bottom Right -->
    <path d="M 1500 800 Q 1300 750, 1200 850 T 1000 800"/>
  </g>

  <!-- Placing Sparse Mountains -->
  <g transform="translate(1400, 150) scale(1.2)">
    <use href="#mountain1" x="0" y="0"/>
    <use href="#mountain2" x="20" y="-10"/>
    <use href="#mountain1" x="-30" y="10"/>
  </g>
  <g transform="translate(300, 300) scale(1)">
    <use href="#mountain2" x="0" y="0"/>
    <use href="#mountain1" x="30" y="10"/>
  </g>
  <g transform="translate(1500, 750) scale(1.1)">
    <use href="#mountain1" x="0" y="0"/>
    <use href="#mountain2" x="-25" y="10"/>
  </g>
  <g transform="translate(400, 800) scale(1.3)">
    <use href="#mountain2" x="0" y="0"/>
    <use href="#mountain1" x="30" y="15"/>
  </g>

  <!-- Sparse Castles -->
  <use href="#castle" x="500" y="500" transform="scale(1.2) translate(-80,-80)"/>
  <use href="#castle" x="1300" y="600" transform="scale(1.2) translate(-210,-100)"/>
  <use href="#castle" x="1400" y="300" transform="scale(1) translate(0,0)"/>

  <!-- Compass (Simple, small, top right) -->
  <g transform="translate(1700, 200) scale(0.6)" fill="none" stroke="rgba(110,80,50,0.3)" stroke-width="1">
    <circle r="40" stroke-width="0.5" stroke-dasharray="2 2" />
    <circle r="30" />
    <path d="M 0 -40 L 5 -10 L 0 0 L -5 -10 Z" fill="rgba(110,80,50,0.2)" />
    <path d="M 0 40 L 5 10 L 0 0 L -5 10 Z" fill="rgba(110,80,50,0.1)" />
    <path d="M 40 0 L 10 5 L 0 0 L 10 -5 Z" fill="rgba(110,80,50,0.1)" />
    <path d="M -40 0 L -10 5 L 0 0 L -10 -5 Z" fill="rgba(110,80,50,0.1)" />
  </g>

  <!-- Vignette overlay -->
  <rect width="100%" height="100%" fill="url(#vignette)" pointer-events="none"/>
</svg>"""

encoded_svg = urllib.parse.quote(svg_content)
data_uri = f"data:image/svg+xml;utf8,{encoded_svg}"

with open("src/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

bg_css = f""".med-meta-menu {{
    /* Procedurally generated full-screen medieval parchment map - Faint version */
    background: url('{data_uri}') center center / cover no-repeat !important;
    background-color: #d6b88b !important;
}}"""

css = re.sub(
    r"\.med-meta-menu\s*\{[^}]*\}",
    bg_css.strip(),
    css,
    flags=re.DOTALL
)

with open("src/styles.css", "w", encoding="utf-8") as f:
    f.write(css)
