import re

with open('src/systems/MetaGameSystem.js', 'r') as f:
    js = f.read()

# Remove med-menu-illustration div
js = re.sub(r'<div class="med-menu-illustration">.*?</div>', '', js, flags=re.DOTALL)

with open('src/systems/MetaGameSystem.js', 'w') as f:
    f.write(js)
print("Menu JS Patched V6 (Removed SVG Illustration)")
