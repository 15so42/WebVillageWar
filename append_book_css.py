css = """
/* ============================================================
   WAR MAP BOOK (Level Selector)
   ============================================================ */

.med-map-book-container {
  position: fixed;
  inset: 0;
  z-index: 100;
  /* Dark wooden table background */
  background: rgb(35, 30, 25) url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise"/></filter><rect width="200" height="200" filter="url(%23n)"/></svg>');
  display: flex;
  align-items: center;
  justify-content: center;
}

.book-back-btn {
  position: absolute;
  top: 30px;
  left: 40px;
  background: rgb(55, 38, 25);
  border: 2px solid rgb(210, 160, 70);
  color: rgb(210, 190, 150);
  padding: 10px 20px;
  font-family: var(--font-title);
  font-weight: bold;
  cursor: pointer;
  border-radius: 4px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.8);
  transition: all 0.2s;
  z-index: 110;
}
.book-back-btn:hover {
  transform: translateY(-2px);
  color: #fff;
  box-shadow: 0 8px 20px rgba(0,0,0,0.9);
}
.book-back-btn:active {
  transform: translateY(2px);
  box-shadow: 0 2px 10px rgba(0,0,0,0.9);
}

.med-map-book {
  display: flex;
  width: 900px;
  max-width: 95vw;
  height: 600px;
  max-height: 90vh;
  /* Parchment map base */
  background: rgb(210, 190, 150) url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>');
  border-radius: 8px;
  box-shadow: 
    inset 0 0 40px rgba(100, 70, 30, 0.5), /* worn edges */
    0 25px 50px rgba(0,0,0,0.9), /* table shadow */
    0 0 100px rgba(0,0,0,0.6);
  position: relative;
  /* Worn edge effect */
  border: 1px solid rgba(100, 70, 30, 0.3);
}

/* Leather Binding */
.med-book-binding {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 40px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, 
    rgba(0,0,0,0.4) 0%, 
    rgba(60, 30, 15, 0.8) 20%, 
    rgba(80, 40, 20, 0.9) 50%, 
    rgba(60, 30, 15, 0.8) 80%, 
    rgba(0,0,0,0.4) 100%);
  box-shadow: 
    inset 2px 0 5px rgba(255,255,255,0.1),
    inset -2px 0 5px rgba(0,0,0,0.5),
    0 0 20px rgba(0,0,0,0.8);
  z-index: 10;
  border-left: 1px solid rgba(0,0,0,0.5);
  border-right: 1px solid rgba(0,0,0,0.5);
}

/* Metal Corners */
.med-corner {
  position: absolute;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #777, rgb(50, 50, 50), #222);
  border: 2px solid #111;
  box-shadow: 
    inset 1px 1px 2px rgba(255,255,255,0.3),
    2px 2px 5px rgba(0,0,0,0.6);
  z-index: 5;
}
.med-corner.top-left { top: -2px; left: -2px; border-bottom-right-radius: 10px; clip-path: polygon(0 0, 100% 0, 0 100%); }
.med-corner.top-right { top: -2px; right: -2px; border-bottom-left-radius: 10px; clip-path: polygon(0 0, 100% 0, 100% 100%); }
.med-corner.bottom-left { bottom: -2px; left: -2px; border-top-right-radius: 10px; clip-path: polygon(0 0, 0 100%, 100% 100%); }
.med-corner.bottom-right { bottom: -2px; right: -2px; border-top-left-radius: 10px; clip-path: polygon(100% 0, 0 100%, 100% 100%); }

/* Add rivets to corners */
.med-corner::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle at 30% 30%, #999, #333);
  border-radius: 50%;
  border: 1px solid #111;
  box-shadow: inset 1px 1px 2px rgba(255,255,255,0.4), 1px 1px 2px rgba(0,0,0,0.8);
}
.med-corner.top-left::after { top: 6px; left: 6px; }
.med-corner.top-right::after { top: 6px; right: 6px; }
.med-corner.bottom-left::after { bottom: 6px; left: 6px; }
.med-corner.bottom-right::after { bottom: 6px; right: 6px; }

/* Pages */
.med-book-page {
  flex: 1;
  padding: 40px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 2;
}
.left-page {
  padding-right: 50px;
}
.right-page {
  padding-left: 50px;
}

.med-page-title {
  font-family: var(--font-title);
  color: rgb(80, 50, 30);
  font-size: 28px;
  text-align: center;
  border-bottom: 2px solid rgba(80, 50, 30, 0.3);
  padding-bottom: 10px;
  margin: 0 0 20px 0;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.4);
}

/* Chapter List - Map Tabs */
.med-chapter-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(80,50,30,0.5) transparent;
}

/* Dark wood plaque */
.med-chapter-plaque {
  position: relative;
  background: rgb(55, 38, 25);
  border: 2px solid rgb(30, 20, 15);
  border-radius: 4px;
  padding: 12px 20px;
  color: rgb(210, 190, 150);
  display: flex;
  align-items: center;
  cursor: pointer;
  box-shadow: 
    inset 0 0 0 1px rgba(255,255,255,0.1),
    4px 4px 10px rgba(0,0,0,0.5);
  transition: all 0.2s;
  text-align: left;
}
.med-chapter-plaque:hover {
  transform: translateX(5px) rotate(1deg);
  box-shadow: 6px 6px 15px rgba(0,0,0,0.6);
  border-color: rgb(210, 160, 70);
}
.med-chapter-plaque.is-selected {
  background: rgb(80, 50, 30);
  border-color: rgb(210, 160, 70);
  color: #fff;
  box-shadow: 
    inset 0 0 0 1px rgb(210, 160, 70),
    4px 4px 10px rgba(0,0,0,0.5);
}

/* Metal nails for wooden plaque */
.plaque-nail {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  background: radial-gradient(circle at 30% 30%, #777, #222);
  border-radius: 50%;
  border: 1px solid #111;
  box-shadow: inset 1px 1px 1px rgba(255,255,255,0.3), 2px 2px 3px rgba(0,0,0,0.8);
}
.left-nail { left: 8px; }
.right-nail { right: 8px; }

.plaque-content {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 0 15px; /* space for nails */
  width: 100%;
}
.chapter-icon { font-size: 24px; filter: drop-shadow(1px 1px 2px black); }
.chapter-info { display: flex; flex-direction: column; flex: 1; }
.chapter-name { font-family: var(--font-title); font-size: 18px; font-weight: bold; }
.chapter-level { font-family: var(--font-body); font-size: 12px; color: rgb(210, 160, 70); }

/* Right Page Details */
.med-region-title {
  font-family: var(--font-title);
  font-size: 36px;
  color: rgb(138, 37, 28); /* med-ruby */
  text-align: center;
  margin: 0 0 15px 0;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.4);
}

.med-region-illustration {
  width: 100%;
  height: 180px;
  border: 3px solid rgb(80, 50, 30);
  border-radius: 4px;
  box-shadow: inset 0 0 15px rgba(0,0,0,0.5), 0 5px 10px rgba(0,0,0,0.2);
  margin-bottom: 20px;
  background: rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.med-region-map-placeholder {
  font-size: 80px;
  opacity: 0.5;
  filter: sepia(1) saturate(2);
}

.med-region-desc {
  font-family: var(--font-body);
  font-size: 15px;
  color: rgb(50, 40, 30);
  line-height: 1.6;
  text-align: justify;
  margin: 0 0 20px 0;
  font-style: italic;
  flex: 1;
}

.med-region-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 25px;
  border-top: 1px dashed rgba(80, 50, 30, 0.3);
  border-bottom: 1px dashed rgba(80, 50, 30, 0.3);
  padding: 10px 0;
}
.med-stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.stat-label {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgb(80, 50, 30);
  font-weight: bold;
}
.stat-value {
  font-family: var(--font-title);
  font-size: 20px;
  color: rgb(30, 20, 15);
  font-weight: 900;
}

/* Difficulty Selector in Book */
.med-difficulty-book-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
}
.diff-label {
  font-family: var(--font-body);
  font-size: 14px;
  color: rgb(80, 50, 30);
  font-weight: bold;
}
.diff-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}
.diff-display {
  font-family: var(--font-title);
  font-size: 28px;
  font-weight: 900;
  color: rgb(138, 37, 28);
  width: 70px;
  text-align: center;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.4);
}
.diff-btn {
  background: transparent;
  border: none;
  font-size: 24px;
  color: rgb(80, 50, 30);
  cursor: pointer;
  transition: transform 0.2s;
  padding: 0 10px;
}
.diff-btn:hover { transform: scale(1.2); color: rgb(138, 37, 28); }
.diff-btn[disabled] { opacity: 0.3; pointer-events: none; }

/* Large Wood War Start Button */
.med-war-start-btn {
  background: linear-gradient(180deg, rgb(138, 37, 28), rgb(74, 21, 16));
  border: 3px solid rgb(210, 160, 70);
  border-radius: 6px;
  padding: 16px;
  width: 100%;
  box-shadow: 
    inset 0 0 0 2px rgba(255,255,255,0.1),
    inset 0 0 10px rgba(0,0,0,0.5),
    0 10px 20px rgba(0,0,0,0.6);
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.med-war-start-btn::before, .med-war-start-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background: radial-gradient(circle at 30% 30%, #ddd, #555);
  border-radius: 50%;
  border: 1px solid #111;
  box-shadow: inset 1px 1px 2px rgba(255,255,255,0.5), 1px 1px 2px rgba(0,0,0,0.8);
}
.med-war-start-btn::before { left: 15px; }
.med-war-start-btn::after { right: 15px; }

.btn-inner-text {
  font-family: var(--font-title);
  font-size: 22px;
  font-weight: 900;
  color: rgb(210, 160, 70);
  text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
  letter-spacing: 2px;
}

.med-war-start-btn:hover {
  background: linear-gradient(180deg, rgb(160, 45, 35), rgb(90, 25, 20));
  box-shadow: 
    inset 0 0 0 2px rgb(210, 160, 70),
    0 15px 25px rgba(0,0,0,0.8);
  transform: translateY(-3px);
}
.med-war-start-btn:hover .btn-inner-text {
  color: #fff;
  text-shadow: 0 0 10px rgb(210, 160, 70);
}
.med-war-start-btn:active {
  transform: translateY(2px);
  box-shadow: inset 0 5px 15px rgba(0,0,0,0.8);
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended book UI CSS to styles.css")
