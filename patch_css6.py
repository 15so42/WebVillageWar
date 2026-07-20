css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL (V5 - Details)
   ============================================================ */

/* Title Emboss Effect */
.med-menu-title-epic {
    text-shadow: 
        -1px -1px 0 rgba(255,255,255,0.1),
        1px 1px 0 rgba(0,0,0,0.8),
        0 4px 10px rgba(0,0,0,0.5) !important;
}

.med-menu-subtitle-epic {
    text-shadow: 
        -1px -1px 0 rgba(255,255,255,0.1),
        1px 1px 0 rgba(0,0,0,0.6) !important;
}

/* Primary Button Text adjustment to avoid overlap with engraving */
.med-meta-menu .med-btn-epic-primary .btn-text-main,
.med-meta-menu .med-btn-epic-primary .btn-text-sub {
    position: relative;
    z-index: 2;
}

/* Slight wood wear for the primary button */
.med-meta-menu .med-btn-epic-primary {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.35" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/><path d="M 10 0 L 15 20 M 85 0 L 80 20 M 30 10 L 70 10" stroke="%233a0c08" stroke-width="0.5" fill="none" opacity="0.3"/></svg>'),
        linear-gradient(180deg, rgb(130, 35, 25), rgb(70, 15, 10)) !important;
}

.med-meta-menu .med-btn-epic-primary:hover {
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.4" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="4" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/><path d="M 10 0 L 15 20 M 85 0 L 80 20 M 30 10 L 70 10" stroke="%233a0c08" stroke-width="0.5" fill="none" opacity="0.3"/></svg>'),
        linear-gradient(180deg, rgb(150, 40, 30), rgb(80, 20, 15)) !important;
}

/* Small button icons */
.med-meta-menu .med-btn-epic-small svg {
    color: #D2A046;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS V6")
