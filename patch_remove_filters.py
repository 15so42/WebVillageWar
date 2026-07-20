import re

with open("src/systems/MetaGameSystem.js", "r", encoding="utf-8") as f:
    js = f.read()

js = js.replace(' filter="url(#metal-bevel-v2)"', '')
# Also let's clean up the defs just to be safe
js = re.sub(r'<filter id="metal-bevel-v2".*?</filter>', '', js, flags=re.DOTALL)

with open("src/systems/MetaGameSystem.js", "w", encoding="utf-8") as f:
    f.write(js)
