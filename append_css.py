import os

css = """
/* ============================================================
   MEDIEVAL TABLETOP BOARD GAME UI - TOTAL OVERHAUL
   ============================================================ */
:root {
  --med-bg: rgb(45, 55, 50);
  --med-gold: rgb(210, 160, 80);
  --med-dark: rgb(25, 25, 22);
  --med-blue: rgb(100, 180, 210);
  --med-wood-1: #2a1b12;
  --med-wood-2: #4a3320;
  --med-iron: #36393b;
  --med-parchment: #e2cca8;
  --med-ruby: #8a251c;
  
  --font-title: 'Cinzel', 'MedievalSharp', serif;
  --font-body: 'Playfair Display', serif;
}

/* Base resets for overridden HUD */
.pc-medieval-hud {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none; /* Let clicks pass to canvas */
  z-index: 10;
}
.pc-medieval-hud > * {
  pointer-events: auto;
}
.hud-meters { display: none; } /* We will hide the original meters and reconstruct visually or re-use them */

/* Re-style the hud-meters as the Top Command Plaque */
.pc-medieval-hud .hud-meters {
  display: flex !important;
  position: absolute;
  top: -10px; /* Hidden top edge */
  left: 50%;
  transform: translateX(-50%);
  
  /* Wooden board background */
  background: linear-gradient(180deg, var(--med-wood-1) 0%, var(--med-wood-2) 100%);
  border: 4px solid var(--med-iron);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  box-shadow: 
    inset 0 0 0 2px var(--med-dark),
    inset 0 0 0 4px var(--med-gold),
    0 15px 35px rgba(0,0,0,0.8);
  
  padding: 24px 40px 16px 40px !important;
  gap: 30px !important;
  align-items: flex-end !important;
}

/* Metal Rivets on Command Plaque */
.pc-medieval-hud .hud-meters::before,
.pc-medieval-hud .hud-meters::after {
  content: '';
  position: absolute;
  bottom: 12px;
  width: 14px;
  height: 14px;
  background: radial-gradient(circle at 30% 30%, #777, var(--med-iron), #111);
  border-radius: 50%;
  border: 2px solid #111;
  box-shadow: inset 1px 1px 2px rgba(255,255,255,0.2), 2px 2px 5px rgba(0,0,0,0.9);
}
.pc-medieval-hud .hud-meters::before { left: 12px; }
.pc-medieval-hud .hud-meters::after { right: 12px; }

/* HUD Meters */
.pc-medieval-hud .meter {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  gap: 4px !important;
}

.pc-medieval-hud .meter span {
  font-family: var(--font-body) !important;
  font-size: 11px !important;
  color: #a8947a !important;
  text-transform: uppercase !important;
  letter-spacing: 2px !important;
}

.pc-medieval-hud .meter strong {
  font-family: var(--font-title) !important;
  font-size: 24px !important;
  color: #fff2c7 !important;
  font-weight: 900 !important;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.9) !important;
}

/* Icons for meters via pseudo-elements */
.pc-medieval-hud .meter-base::before { content: '🏰'; font-size: 24px; filter: drop-shadow(2px 2px 4px black); }
.pc-medieval-hud .meter-wave::before { content: '⚔️'; font-size: 24px; filter: drop-shadow(2px 2px 4px black); }
.pc-medieval-hud .meter-time::before { content: '⏳'; font-size: 24px; filter: drop-shadow(2px 2px 4px black); }
.pc-medieval-hud .meter-silver::before { content: '🪙'; font-size: 24px; filter: drop-shadow(2px 2px 4px black); }
.pc-medieval-hud .meter-units::before { content: '🛡️'; font-size: 24px; filter: drop-shadow(2px 2px 4px black); }

.pc-medieval-hud .meter span { display: none !important; } /* Hide the ugly default text entirely, rely on icons + values */

/* ----------------------------------
   CARDS (Magic Scroll Style)
   ---------------------------------- */
.card-hand {
  bottom: 30px !important;
  gap: 12px !important;
}

.card {
  width: 140px !important;
  height: 220px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  overflow: visible !important;
  pointer-events: auto !important;
  cursor: pointer !important;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

.card:hover {
  transform: translateY(-20px) scale(1.05) !important;
  z-index: 20 !important;
}

.med-card-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.med-card-bg {
  position: absolute;
  inset: 0;
  /* Parchment textured background */
  background: radial-gradient(circle at center, var(--med-parchment) 0%, #b89f78 100%);
  /* Cut corners for scroll look */
  clip-path: polygon(15px 0, calc(100% - 15px) 0, 100% 15px, 100% calc(100% - 15px), calc(100% - 15px) 100%, 15px 100%, 0 calc(100% - 15px), 0 15px);
  /* The border will be simulated by multiple layered shadows in a parent, but clip-path breaks shadows. 
     We'll use borders on a slightly smaller inset div or use standard border with border-radius */
}

/* Let's redefine card shape to be more reliable with borders */
.med-card-bg {
  clip-path: none;
  border-radius: 8px;
  box-shadow: 
    inset 0 0 20px rgba(0,0,0,0.5),
    0 10px 20px rgba(0,0,0,0.8);
}

/* Dynamic Borders Based on Cost/Rarity */
.card[data-cost="0"] .med-card-bg, .card[data-cost="1"] .med-card-bg, .card[data-cost="2"] .med-card-bg {
  border: 4px solid var(--med-iron);
}
.card[data-cost="3"] .med-card-bg {
  border: 4px solid var(--med-blue);
}
.card[data-cost="4"] .med-card-bg {
  border: 4px solid #6a3b8c;
}
.card[data-cost="5"] .med-card-bg, .card[data-cost="6"] .med-card-bg, .card[data-cost="7"] .med-card-bg, .card[data-cost="8"] .med-card-bg {
  border: 4px solid var(--med-gold);
}

/* The Cost Circle */
.med-card-cost {
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  background: var(--med-ruby);
  border: 3px solid var(--med-gold);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 
    inset -2px -2px 6px rgba(0,0,0,0.6),
    0 5px 10px rgba(0,0,0,0.8);
  z-index: 5;
}
.med-card-cost span {
  font-family: var(--font-title);
  font-size: 18px;
  font-weight: 900;
  color: #fff2c7;
  text-shadow: 1px 1px 3px rgba(0,0,0,0.9);
}

/* Inner Layout */
.med-card-face {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px 8px 8px 8px; /* Leave space for cost circle */
  box-sizing: border-box;
}

.med-card-art-container {
  flex: 1;
  width: 100%;
  border: 2px solid var(--med-wood-1);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
  background: #111;
  position: relative;
}

/* Antique filter for card art */
.med-card-art-container img, .med-card-art-container svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: sepia(0.4) contrast(1.2) brightness(0.9);
}

.med-card-bottom {
  height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  margin-top: 8px;
}

.med-card-name {
  font-family: var(--font-title);
  font-size: 14px;
  font-weight: 900;
  color: var(--med-dark);
  text-align: center;
  border-bottom: 1px solid rgba(0,0,0,0.2);
  padding-bottom: 2px;
  margin-bottom: 4px;
  width: 90%;
}

.med-card-desc {
  font-family: var(--font-body);
  font-size: 10px;
  color: #33261d;
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
}

/* ----------------------------------
   ENERGY CRYSTAL (Bottom Left)
   ---------------------------------- */
.energy-panel {
  position: absolute !important;
  left: 30px !important;
  bottom: 30px !important;
  width: max-content !important;
  transform: none !important;
  background: linear-gradient(180deg, var(--med-wood-1), var(--med-wood-2)) !important;
  border: 4px solid var(--med-iron) !important;
  border-radius: 8px !important;
  box-shadow: 
    inset 0 0 0 2px var(--med-dark),
    inset 0 0 0 4px var(--med-gold),
    0 15px 35px rgba(0,0,0,0.8) !important;
  padding: 16px 24px !important;
  display: flex !important;
  align-items: center !important;
  gap: 20px !important;
}

/* Rivets for Energy Panel */
.energy-panel::before, .energy-panel::after {
  content: '';
  position: absolute;
  top: 10px;
  width: 12px;
  height: 12px;
  background: radial-gradient(circle at 30% 30%, #777, var(--med-iron), #111);
  border-radius: 50%;
  border: 2px solid #111;
  box-shadow: inset 1px 1px 2px rgba(255,255,255,0.2), 2px 2px 5px rgba(0,0,0,0.9);
}
.energy-panel::before { left: 10px; }
.energy-panel::after { right: 10px; }

.energy-title {
  width: 80px !important;
  height: 80px !important;
  background: radial-gradient(circle at 30% 30%, #c4e4ff, var(--med-blue), #0d2636) !important;
  border: 4px solid var(--med-gold) !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 
    inset -4px -4px 15px rgba(0,0,0,0.7),
    0 0 30px rgba(100,180,210,0.6),
    0 10px 20px rgba(0,0,0,0.8) !important;
  margin: 0 !important;
  position: relative;
  z-index: 2;
}

.energy-title span { display: none !important; }

.energy-title .energy-value {
  font-family: var(--font-title) !important;
  font-size: 22px !important;
  color: #fff !important;
  text-shadow: 2px 2px 6px rgba(0,0,0,0.9) !important;
}

.energy-subtitle { display: none !important; }
.energy-progress { display: none !important; }

.energy-cells {
  display: flex !important;
  gap: 8px !important;
}

.energy-cell {
  width: 16px !important;
  height: 16px !important;
  background: #222 !important;
  border: 2px solid var(--med-iron) !important;
  transform: rotate(45deg) !important;
  box-shadow: inset 0 0 8px rgba(0,0,0,0.9) !important;
  transition: all 0.3s ease;
}

.energy-cell.is-filled {
  background: var(--med-blue) !important;
  border-color: #c4e4ff !important;
  box-shadow: 0 0 15px var(--med-blue) !important;
}

/* ----------------------------------
   BUTTONS (Wooden Plaques)
   ---------------------------------- */
button, .btn, .run-shop-toggle {
  background: linear-gradient(180deg, var(--med-wood-1), var(--med-wood-2)) !important;
  border: 2px solid var(--med-iron) !important;
  border-radius: 4px !important;
  color: #d8c8b8 !important;
  font-family: var(--font-title) !important;
  font-weight: 700 !important;
  padding: 8px 16px !important;
  box-shadow: 
    inset 0 0 0 1px rgba(255,255,255,0.05),
    inset 0 0 0 2px var(--med-dark),
    0 6px 12px rgba(0,0,0,0.6) !important;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.9) !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

button:hover, .btn:hover, .run-shop-toggle:hover {
  border-color: var(--med-gold) !important;
  color: #fff !important;
  box-shadow: 
    inset 0 0 0 1px var(--med-gold),
    inset 0 0 0 2px var(--med-dark),
    0 8px 16px rgba(0,0,0,0.8) !important;
  transform: translateY(-2px) !important;
}

button:active, .btn:active, .run-shop-toggle:active {
  transform: translateY(2px) !important;
  box-shadow: 
    inset 0 0 0 1px var(--med-gold),
    inset 0 0 0 2px var(--med-dark),
    inset 0 4px 8px rgba(0,0,0,0.8) !important;
}

/* Toolbar (Settings, FPS) */
.hud-toolbar {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex !important;
  gap: 12px;
}
.game-settings-button {
  width: 40px !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 20px !important;
  padding: 0 !important;
}

/* Selected Info Panel (Parchment pinned to wood) */
.hud-selected {
  background: var(--med-parchment) !important;
  border: 4px solid var(--med-wood-1) !important;
  border-radius: 4px !important;
  box-shadow: 
    inset 0 0 15px rgba(0,0,0,0.4),
    0 10px 25px rgba(0,0,0,0.7) !important;
  color: var(--med-dark) !important;
  font-family: var(--font-body) !important;
  padding: 16px !important;
  position: absolute !important;
  right: 20px !important;
  top: 80px !important; /* Below toolbar */
  width: 260px !important;
}

#selected-name {
  font-family: var(--font-title) !important;
  font-size: 16px !important;
  font-weight: 900 !important;
  color: var(--med-ruby) !important;
  border-bottom: 2px solid var(--med-wood-2) !important;
  padding-bottom: 6px !important;
  margin-bottom: 10px !important;
  text-align: center;
}

#selected-stats, #selected-enchants {
  color: #33261d !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

/* Hide run-shop toggle default positioning if we want it bottom right */
.run-shop-toggle {
  position: absolute !important;
  bottom: 30px !important;
  right: 30px !important;
  font-size: 16px !important;
  padding: 12px 24px !important;
}

.brand {
  position: absolute;
  top: 30px;
  left: 30px;
  font-family: var(--font-title);
  font-size: 24px;
  font-weight: 900;
  color: var(--med-gold);
  text-shadow: 2px 2px 5px rgba(0,0,0,0.9);
}

.wave-preview {
  display: none !important; /* Hide original wave preview in favor of the plaque stats */
}

/* Fix CardUseBar layout inside the new card */
.card-use-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 4px;
  z-index: 10;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("CSS Overrides Appended.")
