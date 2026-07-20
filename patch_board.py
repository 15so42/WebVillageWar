import re

with open("src/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

css = re.sub(
    r"\.med-menu-board-wrapper\s*\{[^}]*\}",
    ".med-menu-board-wrapper { padding: 40px; position: relative; }",
    css
)

css = re.sub(
    r"\.med-menu-board-wrapper::before\s*\{[^}]*\}",
    ".med-menu-board-wrapper::before { content: none; }",
    css
)

css = re.sub(
    r"\.med-meta-menu\s+\.med-menu-board\s*\{[^}]*\}",
    ".med-meta-menu .med-menu-board { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }",
    css
)

with open("src/styles.css", "w", encoding="utf-8") as f:
    f.write(css)

