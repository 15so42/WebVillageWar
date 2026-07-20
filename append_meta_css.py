css = """
/* ============================================================
   MEDIEVAL META MENU (Main Menu & Level Selector)
   ============================================================ */

.med-meta-menu, .med-meta-levels {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: radial-gradient(circle at center, rgba(30, 40, 35, 0.8), rgba(10, 15, 12, 0.95));
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.med-menu-board {
  background: var(--med-parchment) url('data:image/svg+xml;utf8,<svg opacity="0.05" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>');
  border: 6px solid var(--med-wood-1);
  border-radius: 8px;
  box-shadow: 
    inset 0 0 0 2px var(--med-gold),
    inset 0 0 50px rgba(0,0,0,0.5),
    0 20px 50px rgba(0,0,0,0.8);
  padding: 40px 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  width: 400px;
}

.med-menu-crest {
  font-size: 48px;
  margin-bottom: -10px;
  filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.5));
}

.med-menu-title {
  font-family: var(--font-title);
  font-size: 42px;
  font-weight: 900;
  color: var(--med-ruby);
  text-shadow: 1px 2px 2px rgba(0,0,0,0.3);
  margin: 0;
  text-align: center;
  letter-spacing: 2px;
}

.med-menu-subtitle {
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--med-dark);
  margin: 0 0 20px 0;
  letter-spacing: 4px;
}

.med-menu-divider {
  width: 80%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--med-iron), transparent);
  margin-bottom: 30px;
}

.med-menu-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.med-btn, .med-btn-primary, .med-btn-danger, .med-btn-small, .med-btn-back, .med-map-node, .med-btn-embark, .med-btn-icon {
  font-family: var(--font-title);
  font-weight: 700;
  background: linear-gradient(180deg, var(--med-wood-1), var(--med-wood-2));
  border: 2px solid var(--med-iron);
  border-radius: 4px;
  color: var(--med-parchment);
  padding: 12px 20px;
  cursor: pointer;
  box-shadow: 
    inset 0 0 0 1px rgba(255,255,255,0.05),
    0 6px 12px rgba(0,0,0,0.6);
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  transition: all 0.15s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.med-btn:hover, .med-btn-primary:hover, .med-btn-small:hover, .med-btn-back:hover, .med-btn-embark:hover, .med-btn-icon:hover {
  border-color: var(--med-gold);
  color: #fff;
  box-shadow: 
    inset 0 0 0 1px var(--med-gold),
    0 8px 16px rgba(0,0,0,0.8);
  transform: translateY(-2px);
}

.med-btn:active, .med-btn-primary:active, .med-btn-small:active, .med-btn-back:active, .med-btn-embark:active, .med-btn-icon:active {
  transform: translateY(2px);
  box-shadow: inset 0 4px 8px rgba(0,0,0,0.8);
}

.med-btn span {
  font-family: var(--font-body);
  font-size: 12px;
  color: #a8947a;
}

.med-btn-primary {
  border-color: var(--med-gold);
  background: linear-gradient(180deg, var(--med-ruby), #4a1510);
  font-size: 18px;
  padding: 16px 20px;
}
.med-btn-primary span { color: var(--med-gold-bright); }

.med-btn-danger {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: #888;
  font-size: 12px;
  justify-content: center;
  margin-top: 10px;
}
.med-btn-danger:hover {
  color: var(--med-ruby);
  background: rgba(138,37,28,0.1);
  box-shadow: none;
  transform: none;
}

.med-menu-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.med-btn-small {
  padding: 8px 10px;
  font-size: 11px;
  flex: 1;
  justify-content: center;
}

.med-version-mark {
  position: absolute;
  bottom: 10px;
  right: 15px;
  font-family: var(--font-body);
  font-size: 10px;
  color: #888;
}

/* Level Selector */
.med-levels-board {
  background: var(--med-parchment);
  border: 6px solid var(--med-wood-1);
  border-radius: 8px;
  box-shadow: 
    inset 0 0 0 2px var(--med-gold),
    inset 0 0 50px rgba(0,0,0,0.4),
    0 20px 50px rgba(0,0,0,0.8);
  padding: 30px;
  width: 800px;
  max-width: 95vw;
  position: relative;
}

.med-btn-back {
  position: absolute;
  top: -20px;
  left: 20px;
  padding: 6px 12px;
  font-size: 12px;
  background: var(--med-wood-1);
}

.med-levels-layout {
  display: flex;
  gap: 30px;
  margin-top: 10px;
  height: 500px;
}

.med-map-scroll {
  flex: 1;
  border-right: 2px solid var(--med-iron);
  padding-right: 20px;
  display: flex;
  flex-direction: column;
}

.med-scroll-title {
  font-family: var(--font-title);
  color: var(--med-dark);
  border-bottom: 2px solid var(--med-iron);
  padding-bottom: 10px;
  margin: 0 0 15px 0;
}

.med-map-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 10px;
}

.med-map-node {
  background: transparent;
  border: 2px solid var(--med-iron);
  color: var(--med-dark);
  box-shadow: none;
  text-shadow: none;
  justify-content: flex-start;
  gap: 10px;
}
.med-map-node:hover {
  background: rgba(0,0,0,0.05);
  border-color: var(--med-dark);
  color: var(--med-dark);
  box-shadow: none;
  transform: translateX(5px);
}
.med-map-node.is-selected {
  background: var(--med-wood-1);
  color: var(--med-gold-bright);
  border-color: var(--med-gold);
}
.node-icon { font-size: 18px; }
.node-name { flex: 1; text-align: left; }
.node-status { font-family: var(--font-body); font-size: 12px; opacity: 0.8; }

.med-briefing-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.med-briefing-title {
  font-family: var(--font-title);
  font-size: 28px;
  color: var(--med-ruby);
  margin: 0 0 10px 0;
}

.med-briefing-desc {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--med-dark);
  line-height: 1.6;
  margin: 0 0 20px 0;
  flex: 1;
}

.med-briefing-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}
.med-stat {
  display: flex;
  flex-direction: column;
}
.med-stat span { font-family: var(--font-body); font-size: 11px; color: #666; }
.med-stat strong { font-family: var(--font-title); font-size: 18px; color: var(--med-dark); }

.med-difficulty-selector {
  background: rgba(0,0,0,0.05);
  border: 1px solid var(--med-iron);
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  text-align: center;
}
.med-difficulty-selector h4 { margin: 0 0 10px 0; font-family: var(--font-body); color: var(--med-dark); }

.med-diff-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.med-diff-display {
  font-family: var(--font-title);
  font-size: 24px;
  font-weight: 900;
  color: var(--med-ruby);
  width: 60px;
}

.med-btn-icon {
  padding: 4px 12px;
  font-size: 18px;
  justify-content: center;
}
.med-btn-icon[disabled] { opacity: 0.5; pointer-events: none; }

.med-btn-embark {
  font-size: 18px;
  padding: 16px;
  background: linear-gradient(180deg, var(--med-ruby), #4a1510);
  border-color: var(--med-gold);
  justify-content: center;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Meta CSS Appended.")
