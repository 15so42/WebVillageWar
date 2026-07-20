css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL (V2 - High Fidelity)
   ============================================================ */

.med-menu-board-wrapper {
  padding: 40px;
  background: 
    /* Medieval Map SVG */
    url('data:image/svg+xml;utf8,<svg opacity="0.10" xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="none" stroke="%233e2a1b"><path d="M 0 50 Q 50 70 80 150 T 150 250 T 100 400" stroke-width="3" opacity="0.4"/><path d="M -10 50 Q 40 70 70 150 T 140 250 T 90 400" stroke-width="1" opacity="0.2"/><g opacity="0.7"><path d="M 40 80 L 50 60 L 60 80 M 55 75 L 65 50 L 75 80 M 70 70 L 80 55 L 90 75" stroke-width="1.5"/><path d="M 240 280 L 250 260 L 260 280 M 255 275 L 265 250 L 275 280 M 270 270 L 280 255 L 290 275" stroke-width="1.5"/></g><path d="M 60 100 Q 150 120 200 80 T 350 150" stroke-width="2" stroke-dasharray="5 5" opacity="0.5"/><g transform="translate(350, 150) scale(0.4)" stroke-width="3"><rect x="-20" y="0" width="40" height="30"/><path d="M -25 0 L -25 -10 L -15 -10 L -15 0 M -5 0 L -5 -10 L 5 -10 L 5 0 M 15 0 L 15 -10 L 25 -10 L 25 0"/></g><g transform="translate(300, 300) scale(0.5)"><circle cx="0" cy="0" r="50" stroke-width="2"/><path d="M 0 -70 L 15 -15 L 70 0 L 15 15 L 0 70 L -15 15 L -70 0 L -15 -15 Z" stroke-width="1"/><path d="M 0 -70 L 0 70 M -70 0 L 70 0" stroke-width="2"/></g></svg>'),
    /* Worn parchment */
    var(--med-parchment) url('data:image/svg+xml;utf8,<svg opacity="0.05" xmlns="http://www.w3.org/2000/svg" width="100" height="100"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100" height="100" filter="url(%23n)"/></svg>');
  border-radius: 4px;
  /* Thick paper stack / book edge effect */
  box-shadow: 
    inset 0 0 60px rgba(100, 70, 30, 0.7),
    0 1px 1px rgba(210,190,150,1),
    0 2px 1px rgba(180,160,120,1),
    0 3px 2px rgba(150,130,100,1),
    0 4px 4px rgba(100,70,40,1),
    0 15px 40px rgba(0,0,0,0.9) !important;
  border: 1px solid rgba(100, 70, 30, 0.4) !important;
  position: relative;
}

.med-menu-board-wrapper::before {
  content: '';
  position: absolute;
  inset: -12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  pointer-events: none;
  box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
  background: rgba(0,0,0,0.05); /* Slight curled edge shadow */
}

/* Redefined Buttons as Heavy Wooden Plaques */
.med-meta-menu .med-btn, 
.med-meta-menu .med-btn-primary, 
.med-meta-menu .med-btn-small, 
.med-meta-menu .med-btn-danger {
  position: relative !important;
  background-image: 
    url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.1 1" numOctaves="3" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(65, 45, 30), rgb(40, 25, 15)) !important;
  background-size: cover !important;
  background-color: rgb(40, 25, 15) !important;
  border: 4px solid #1a1a1a !important; /* Iron edge */
  border-radius: 4px !important;
  color: rgb(210, 190, 150) !important;
  box-shadow: 
    inset 0 0 15px rgba(0,0,0,0.9), /* inner shadow */
    inset 0 0 0 2px rgba(255,255,255,0.05), /* slight inner bevel */
    0 8px 15px rgba(0,0,0,0.8), /* drop shadow */
    0 4px 0 #111 !important; /* bottom edge thickness */
  transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1) !important;
  text-shadow: 1px 2px 3px rgba(0,0,0,0.9) !important;
  padding: 12px 24px !important;
}

/* Pseudo elements for the 4 iron rivets */
.med-meta-menu .med-btn::before,
.med-meta-menu .med-btn-primary::before,
.med-meta-menu .med-btn-small::before,
.med-meta-menu .med-btn-danger::before {
  content: '' !important;
  position: absolute !important;
  inset: 6px !important;
  pointer-events: none !important;
  /* 4 dots using radial gradients */
  background-image: 
    radial-gradient(circle at 0 0, #777 0, #222 3px, transparent 4px),
    radial-gradient(circle at 100% 0, #777 0, #222 3px, transparent 4px),
    radial-gradient(circle at 0 100%, #777 0, #222 3px, transparent 4px),
    radial-gradient(circle at 100% 100%, #777 0, #222 3px, transparent 4px) !important;
  background-position: 0 0, 100% 0, 0 100%, 100% 100% !important;
  background-repeat: no-repeat !important;
  background-size: 10px 10px !important;
  opacity: 0.8 !important;
}

.med-meta-menu .med-btn:hover, 
.med-meta-menu .med-btn-primary:hover, 
.med-meta-menu .med-btn-small:hover, 
.med-meta-menu .med-btn-danger:hover {
  transform: translateY(2px) !important;
  box-shadow: 
    inset 0 0 20px rgba(0,0,0,0.9),
    inset 0 0 0 2px rgba(255,255,255,0.05),
    0 4px 10px rgba(0,0,0,0.8),
    0 2px 0 #111 !important;
  color: #fff !important;
}

.med-meta-menu .med-btn:active, 
.med-meta-menu .med-btn-primary:active, 
.med-meta-menu .med-btn-small:active, 
.med-meta-menu .med-btn-danger:active {
  transform: translateY(4px) !important;
  box-shadow: 
    inset 0 0 20px rgba(0,0,0,0.95),
    inset 0 0 0 2px rgba(255,255,255,0.02),
    0 1px 5px rgba(0,0,0,0.8),
    0 0 0 #111 !important;
  border-color: #000 !important;
}

/* Primary Button Highlighting */
.med-meta-menu .med-btn-primary {
  background-image: 
    url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.1 1" numOctaves="3" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(138, 37, 28), rgb(80, 20, 15)) !important;
  color: rgb(220, 170, 80) !important;
}

/* Danger Button Highlighting */
.med-meta-menu .med-btn-danger {
  background-image: 
    url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.1 1" numOctaves="3" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
    linear-gradient(180deg, rgb(50, 20, 20), rgb(30, 10, 10)) !important;
  color: #a55 !important;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS V2")
