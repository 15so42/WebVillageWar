import re

with open("src/systems/MetaGameSystem.js", "r", encoding="utf-8") as f:
    js = f.read()

# Replace the filter definition
filter_regex = r'<filter id="metal-bevel-v2".*?</filter>'
new_filter = """
                         <filter id="metal-bevel-v2" x="-20%" y="-20%" width="140%" height="140%">
                            <!-- Removed specular lighting (glow) -->
                            <feDropShadow dx="0" dy="2" stdDeviation="1" flood-color="#000" flood-opacity="0.8"/>
                         </filter>
"""
js = re.sub(filter_regex, new_filter.strip(), js, flags=re.DOTALL)

with open("src/systems/MetaGameSystem.js", "w", encoding="utf-8") as f:
    f.write(js)
