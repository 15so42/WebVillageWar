import re

# 1. Update index.html to add fonts and restructure HUD slightly if needed
with open('index.html', 'r') as f:
    html = f.read()

html = html.replace('<title>Village War Prototype</title>',
'''<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=MedievalSharp&display=swap" rel="stylesheet">
    <title>Village War</title>''')

# We can group the top wave panel into a war command plaque
html = html.replace('class="hud hud-primary"', 'class="hud hud-primary pc-medieval-hud"')

with open('index.html', 'w') as f:
    f.write(html)


# 2. Update CardSystem.js to output medieval card markup and cost/kind datasets
with open('src/systems/CardSystem.js', 'r') as f:
    js = f.read()

new_card_markup = '''    element.dataset.cost = cardEnergyCost(card);
    element.dataset.kind = card.kind;
    element.innerHTML = `
      <div class="med-card-wrapper">
        <div class="med-card-bg"></div>
        <div class="med-card-cost"><span>${cardEnergyCost(card)}</span></div>
        <div class="med-card-level" hidden>Lv.${card.level ?? 1}</div>
        ${cardUseBarMarkup(card)}
        ${cardCooldownOverlayMarkup(this, card)}
        <div class="med-card-face">
          <div class="med-card-art-container">
            ${createCardArtMarkup(card)}
          </div>
          <div class="med-card-bottom">
            <div class="med-card-name">${card.name}</div>
            <div class="med-card-desc">${card.summary}</div>
          </div>
        </div>
      </div>
    `;'''

js = re.sub(r'element\.innerHTML = `.*?</div>\s*`;', new_card_markup, js, flags=re.DOTALL)

with open('src/systems/CardSystem.js', 'w') as f:
    f.write(js)

print("Patching completed.")
