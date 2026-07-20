import re

with open("src/systems/MetaGameSystem.js", "r", encoding="utf-8") as f:
    js = f.read()

# Replace the crest group up to the straps
replacement = """
            <div class="med-menu-crest-group" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <!-- Horizontal Banner Behind Crest -->
                <div class="med-menu-horizontal-banner" style="position: absolute; top: 15px; width: 300px; height: 100px; z-index: -1;">
                    <svg viewBox="0 0 300 100" width="100%" height="100%">
                        <!-- Banner Body: red cloth with forked ends -->
                        <path d="M 10 20 L 290 20 L 290 80 L 10 80 Z" fill="#7a1c1c" stroke="#d4af37" stroke-width="2" filter="drop-shadow(0px 8px 6px rgba(0,0,0,0.6))"/>
                        <!-- Forked cutouts -->
                        <path d="M 0 20 L 30 50 L 0 80 Z" fill="transparent" stroke="none"/> <!-- We can just draw the polygon to have forks -->
                    </svg>
                </div>
"""

# Let's write a better horizontal banner SVG.
horizontal_banner_svg = """
                <!-- Horizontal Banner Behind Crest -->
                <div class="med-menu-horizontal-banner" style="position: absolute; top: 15px; width: 340px; height: 80px; z-index: -1;">
                    <svg viewBox="0 0 340 80" width="100%" height="100%">
                        <!-- Banner Background -->
                        <path d="M 10 10 L 330 10 L 310 40 L 330 70 L 10 70 L 30 40 Z" fill="#7a1c1c" stroke="#d4af37" stroke-width="3" filter="drop-shadow(0px 6px 4px rgba(0,0,0,0.6))"/>
                        <!-- Gold Trim Inner -->
                        <path d="M 18 16 L 315 16 L 298 40 L 315 64 L 18 64 L 35 40 Z" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="4 2"/>
                    </svg>
                </div>
"""

# Let's replace everything from <div class="med-menu-vertical-banner" to <div class="med-menu-title-container">
start_tag = r'<div class="med-menu-vertical-banner".*?</svg>\s*</div>'
ribbon_tag = r'<!-- Ribbon and Gold lines connecting Crest and Title -->\s*<div class="med-menu-ribbon-bg">.*?</svg>\s*</div>'
straps_tag = r'<!-- Cloth straps connecting shield and title -->\s*<div class="med-menu-straps".*?</svg>\s*</div>'

js = re.sub(start_tag, horizontal_banner_svg.strip(), js, flags=re.DOTALL)
js = re.sub(ribbon_tag, "", js, flags=re.DOTALL)
js = re.sub(straps_tag, "", js, flags=re.DOTALL)

# Reduce the specularity in the bevel filter
js = js.replace('specularConstant="1"', 'specularConstant="0.3"')
js = js.replace('specularExponent="20"', 'specularExponent="10"')

# Also remove the drop shadow from the shield backing if it exists
js = js.replace('filter="url(#crest-shadow-v2)"', '')

with open("src/systems/MetaGameSystem.js", "w", encoding="utf-8") as f:
    f.write(js)
