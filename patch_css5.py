css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL (V4 - Manual Cover)
   ============================================================ */

.med-menu-crest-group {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: -10px;
}

.med-menu-ribbon-bg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    z-index: 0;
}

.med-menu-crest-new {
    position: relative;
    z-index: 1;
}

/* Corner Delete Button */
.med-btn-epic-danger-corner {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: transparent;
    border: none;
    color: rgba(100, 70, 30, 0.5);
    cursor: pointer;
    transition: all 0.2s;
    z-index: 10;
    padding: 10px;
    border-radius: 50%;
}
.med-btn-epic-danger-corner:hover {
    color: #a55;
    background: rgba(0, 0, 0, 0.2);
    transform: scale(1.1);
}

/* Base Epic Button overriding previous CSS */
.med-meta-menu .med-btn-epic, 
.med-meta-menu .med-btn-epic-small {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.2" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 1" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(45, 30, 20), rgb(25, 15, 10)) !important;
    background-color: rgb(35, 20, 15) !important;
    border: 3px solid #1a110a !important; /* Worn iron edge */
    color: rgb(160, 140, 110) !important;
    box-shadow: 
        inset 0 0 15px rgba(0,0,0,0.9),
        inset 0 1px 0 rgba(255,255,255,0.03),
        0 8px 12px rgba(0,0,0,0.6),
        0 4px 0 #0d0805 !important;
}

.med-meta-menu .med-btn-epic:hover,
.med-meta-menu .med-btn-epic-small:hover {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.25" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 1" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(55, 35, 25), rgb(30, 18, 12)) !important;
    transform: translateY(1px) !important;
    box-shadow: 
        inset 0 0 15px rgba(0,0,0,0.9),
        inset 0 1px 0 rgba(255,255,255,0.05),
        0 5px 8px rgba(0,0,0,0.7),
        0 3px 0 #0d0805 !important;
    color: rgb(210, 190, 150) !important;
}

.med-meta-menu .med-btn-epic:active,
.med-meta-menu .med-btn-epic-small:active {
    transform: translateY(4px) !important;
    box-shadow: 
        inset 0 0 20px rgba(0,0,0,0.95),
        0 1px 3px rgba(0,0,0,0.8),
        0 0 0 #0d0805 !important;
}

/* Primary Embark Button Overriding */
.med-meta-menu .med-btn-epic-primary {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.25" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(130, 35, 25), rgb(70, 15, 10)) !important;
    background-color: rgb(90, 20, 15) !important;
    border: 4px solid #D2A046 !important; /* Brighter Gold Iron Edge */
    color: #F2D06B !important;
    box-shadow: 
        inset 0 0 25px rgba(0,0,0,0.9),
        inset 0 2px 2px rgba(242, 208, 107, 0.4), /* stronger inner gold highlight */
        0 12px 25px rgba(0,0,0,0.85), /* prominent shadow */
        0 0 20px rgba(194, 144, 38, 0.3), /* gold glow */
        0 6px 0 #614104 !important; /* thick gold bottom */
}

.med-meta-menu .med-btn-epic-primary:hover {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.3" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(150, 40, 30), rgb(80, 20, 15)) !important;
    transform: translateY(2px) !important;
    box-shadow: 
        inset 0 0 30px rgba(0,0,0,0.9),
        inset 0 2px 3px rgba(255, 230, 150, 0.6),
        0 8px 15px rgba(0,0,0,0.8),
        0 0 30px rgba(242, 208, 107, 0.5), /* stronger glow */
        0 4px 0 #614104 !important;
    color: #FFF3C4 !important;
}

.med-meta-menu .med-btn-epic-primary:active {
    transform: translateY(6px) !important;
    box-shadow: 
        inset 0 0 40px rgba(0,0,0,0.95),
        inset 0 1px 1px rgba(242, 208, 107, 0.3),
        0 2px 5px rgba(0,0,0,0.9),
        0 0 15px rgba(194, 144, 38, 0.3),
        0 0 0 #614104 !important;
}

/* Adjust illustration opacity to be subtle */
.med-menu-illustration {
    opacity: 1 !important; /* We control opacity inside the SVG */
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS V5")
