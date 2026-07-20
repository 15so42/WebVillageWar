css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL
   ============================================================ */

.med-menu-board-wrapper {
  padding: 20px;
  background: 
    url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="none" stroke="%233e2a1b" stroke-width="1.5" stroke-dasharray="4 4"><path d="M 50 50 Q 100 80 150 40 T 250 90 T 350 40 M 80 150 Q 120 200 180 160 T 320 180 M 40 250 Q 90 290 140 230 T 280 270 T 360 220" stroke-width="2" stroke-dasharray="none" opacity="0.5"/><circle cx="150" cy="40" r="4"/><rect x="310" y="170" width="10" height="10"/><path d="M 150 40 L 315 175" stroke-dasharray="2 2"/></svg>'),
    var(--med-parchment) url('data:image/svg+xml;utf8,<svg opacity="0.05" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>');
  border-radius: 6px;
  box-shadow: 
    inset 0 0 40px rgba(100, 70, 30, 0.6),
    0 15px 40px rgba(0,0,0,0.8);
  border: 1px solid rgba(100, 70, 30, 0.3); /* Worn edge */
  position: relative;
}
.med-menu-board-wrapper::before {
  content: '';
  position: absolute;
  inset: -15px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  pointer-events: none;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
  background: rgba(0,0,0,0.02); /* Slight curled edge shadow */
}

/* Override the old med-menu-board since we moved the parchment to the wrapper */
.med-meta-menu .med-menu-board {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 20px 40px !important;
}

.med-menu-crest-new {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  filter: drop-shadow(0 10px 10px rgba(0,0,0,0.6));
}
.med-menu-crest-new svg {
  animation: crest-float 4s ease-in-out infinite;
}
@keyframes crest-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* Wood Plaque Buttons */
.med-meta-menu .med-btn, 
.med-meta-menu .med-btn-primary, 
.med-meta-menu .med-btn-small, 
.med-meta-menu .med-btn-danger {
  position: relative !important;
  background-image: 
    radial-gradient(circle at 8px 8px, #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at calc(100% - 8px) 8px, #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at 8px calc(100% - 8px), #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at calc(100% - 8px) calc(100% - 8px), #777 0%, #222 3px, transparent 4px),
    url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.1" numOctaves="3" result="noise"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(65, 45, 30), rgb(45, 30, 20)) !important;
  background-color: transparent !important;
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100px 100px, 100% 100% !important;
  border: 3px solid #333 !important;
  border-radius: 2px !important;
  color: rgb(210, 190, 150) !important;
  box-shadow: 
    inset 0 0 10px rgba(0,0,0,0.8),
    0 5px 10px rgba(0,0,0,0.6) !important;
  transition: transform 0.1s, box-shadow 0.1s, border-color 0.1s !important;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8) !important;
}

.med-meta-menu .med-btn:hover, 
.med-meta-menu .med-btn-primary:hover, 
.med-meta-menu .med-btn-small:hover, 
.med-meta-menu .med-btn-danger:hover {
  transform: translateY(-2px) !important;
  border-color: #555 !important;
  box-shadow: 
    inset 0 0 15px rgba(0,0,0,0.9), 
    0 8px 15px rgba(0,0,0,0.8) !important;
  color: #fff !important;
}
.med-meta-menu .med-btn:active, 
.med-meta-menu .med-btn-primary:active, 
.med-meta-menu .med-btn-small:active, 
.med-meta-menu .med-btn-danger:active {
  transform: translateY(1px) !important;
  box-shadow: 
    inset 0 0 15px rgba(0,0,0,0.9), 
    0 2px 5px rgba(0,0,0,0.8) !important;
}

/* Primary Button distinct styling */
.med-meta-menu .med-btn-primary {
  border-color: rgb(210, 160, 70) !important;
  background-image: 
    radial-gradient(circle at 10px 10px, #999 0%, #333 4px, transparent 5px),
    radial-gradient(circle at calc(100% - 10px) 10px, #999 0%, #333 4px, transparent 5px),
    radial-gradient(circle at 10px calc(100% - 10px), #999 0%, #333 4px, transparent 5px),
    radial-gradient(circle at calc(100% - 10px) calc(100% - 10px), #999 0%, #333 4px, transparent 5px),
    url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.1" numOctaves="3" result="noise"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(138, 37, 28), rgb(74, 21, 16)) !important;
  color: rgb(210, 160, 70) !important;
}
.med-meta-menu .med-btn-primary:hover {
  border-color: #fff !important;
  color: #fff !important;
}

/* Danger Button distinct styling */
.med-meta-menu .med-btn-danger {
  background-image: 
    radial-gradient(circle at 8px 8px, #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at calc(100% - 8px) 8px, #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at 8px calc(100% - 8px), #777 0%, #222 3px, transparent 4px),
    radial-gradient(circle at calc(100% - 8px) calc(100% - 8px), #777 0%, #222 3px, transparent 4px),
    url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.1" numOctaves="3" result="noise"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(50, 20, 20), rgb(30, 10, 10)) !important;
  border-color: #222 !important;
  color: #a55 !important;
}
.med-meta-menu .med-btn-danger:hover {
  color: #f55 !important;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS")
