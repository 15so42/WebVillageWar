import re

with open("src/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

css = re.sub(
    r"\.med-menu-crest-new\s*\{[^}]*filter:\s*drop-shadow[^}]*\}",
    ".med-menu-crest-new { display: flex; justify-content: center; margin-bottom: 10px; }",
    css
)

with open("src/styles.css", "w", encoding="utf-8") as f:
    f.write(css)
