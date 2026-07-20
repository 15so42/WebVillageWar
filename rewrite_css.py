import re

with open('src/styles.css', 'r') as f:
    css = f.read()

# We will just append our overrides to styles.css
# But first, we might want to disable some aggressive global styles for cards.
css = re.sub(r'\.card \{.*?\}', '.card {}', css, flags=re.DOTALL)
css = re.sub(r'\.card-face \{.*?\}', '.card-face {}', css, flags=re.DOTALL)
css = re.sub(r'\.hud-primary \{.*?\}', '.hud-primary {}', css, flags=re.DOTALL)

with open('src/styles.css', 'w') as f:
    f.write(css)

print("CSS cleaned.")
