css = """
/* ============================================================
   MEDIEVAL SHOP & PAUSE PANELS
   ============================================================ */

/* Shop Overlay */
.run-shop-overlay {
  background: radial-gradient(circle at center, rgba(30, 40, 35, 0.8), rgba(10, 15, 12, 0.95)) !important;
  backdrop-filter: blur(8px) !important;
}

/* Shop Panel */
.run-shop-panel, .pause-panel {
  background: var(--med-parchment) url('data:image/svg+xml;utf8,<svg opacity="0.05" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>') !important;
  border: 6px solid var(--med-wood-1) !important;
  border-radius: 8px !important;
  box-shadow: 
    inset 0 0 0 2px var(--med-gold),
    inset 0 0 50px rgba(0,0,0,0.4),
    0 20px 50px rgba(0,0,0,0.8) !important;
  color: var(--med-dark) !important;
  font-family: var(--font-body) !important;
}

.run-shop-header, .pause-panel h2 {
  border-bottom: 2px solid var(--med-wood-1) !important;
  padding-bottom: 12px !important;
  margin-bottom: 16px !important;
}

.run-shop-kicker, .pause-kicker {
  font-family: var(--font-body) !important;
  color: #666 !important;
  text-transform: uppercase !important;
  letter-spacing: 2px !important;
}

.run-shop-title, #pause-title {
  font-family: var(--font-title) !important;
  color: var(--med-ruby) !important;
  font-size: 32px !important;
  font-weight: 900 !important;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.2) !important;
}

.run-shop-close {
  background: transparent !important;
  border: none !important;
  color: var(--med-ruby) !important;
  font-size: 28px !important;
  box-shadow: none !important;
}
.run-shop-close:hover {
  transform: scale(1.2) !important;
  color: red !important;
  background: transparent !important;
  box-shadow: none !important;
}

.run-shop-balance {
  font-family: var(--font-title) !important;
  font-size: 18px !important;
  background: var(--med-wood-2) !important;
  color: var(--med-parchment) !important;
  padding: 8px 16px !important;
  border: 2px solid var(--med-iron) !important;
  border-radius: 4px !important;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.8) !important;
  display: inline-block !important;
  margin-bottom: 20px !important;
}
.run-shop-balance strong {
  color: var(--med-gold-bright) !important;
  font-size: 22px !important;
}

/* Services (Cards) inside Shop */
.run-shop-service {
  background: transparent !important;
  border: 2px solid var(--med-iron) !important;
  color: var(--med-dark) !important;
  box-shadow: none !important;
  text-shadow: none !important;
  border-radius: 8px !important;
  padding: 16px !important;
}
.run-shop-service:hover {
  background: rgba(0,0,0,0.05) !important;
  border-color: var(--med-dark) !important;
}

.run-shop-service-title {
  font-family: var(--font-title) !important;
  color: var(--med-ruby) !important;
  font-size: 18px !important;
  font-weight: 900 !important;
}
.run-shop-service-cost {
  color: var(--med-dark) !important;
  font-family: var(--font-title) !important;
  font-weight: 900 !important;
}
.run-shop-service-desc {
  color: #444 !important;
  font-family: var(--font-body) !important;
}

.run-shop-skip, .run-shop-back {
  background: var(--med-wood-1) !important;
  color: var(--med-parchment) !important;
  margin-top: 20px !important;
  width: 100% !important;
}

/* Choices List (Deck Builder etc) */
.run-shop-choice-card {
  background: var(--med-wood-1) !important;
  border: 2px solid var(--med-gold) !important;
  border-radius: 4px !important;
  color: var(--med-parchment) !important;
}
.run-shop-choice-card:hover {
  transform: translateY(-5px) !important;
  box-shadow: 0 10px 20px rgba(0,0,0,0.5) !important;
  border-color: #fff !important;
}

/* Pause settings sliders */
.pause-slider-row span {
  color: var(--med-dark) !important;
  font-family: var(--font-title) !important;
  font-weight: 700 !important;
}

.pause-primary-button {
  background: linear-gradient(180deg, var(--med-ruby), #4a1510) !important;
  border-color: var(--med-gold) !important;
  font-size: 18px !important;
  padding: 12px !important;
  margin-bottom: 12px !important;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Shop/Pause panels CSS overrides added.")
