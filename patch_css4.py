css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL (V3 - Epic UI)
   ============================================================ */

.med-menu-illustration {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    opacity: 0.6; /* SVG opacity is 0.08, this dims it further to fit 5-10% requirement */
}

/* Make sure inner content stays above the illustration */
.med-menu-crest-new,
.med-menu-title-container,
.med-menu-divider-epic,
.med-menu-nav,
.med-version-mark {
    position: relative;
    z-index: 1;
}

/* Epic Title Styling */
.med-menu-title-epic {
    font-family: 'Cinzel', 'Times New Roman', serif;
    font-size: 38px;
    font-weight: 900;
    text-align: center;
    color: #2b1d11;
    margin: 5px 0 0 0;
    letter-spacing: 4px;
    text-shadow: 
        1px 1px 0 rgba(255,255,255,0.4),
        0 4px 10px rgba(0,0,0,0.3);
}

.med-menu-subtitle-epic {
    font-family: 'STZhongsong', 'SimSun', serif;
    font-size: 18px;
    font-weight: bold;
    text-align: center;
    color: #4a331f;
    margin: 0;
    letter-spacing: 12px;
    padding-left: 12px; /* balance letter spacing */
    text-shadow: 1px 1px 0 rgba(255,255,255,0.3);
}

.med-menu-divider-epic {
    display: flex;
    justify-content: center;
    margin: 15px 0 25px 0;
}

/* Generic Epic Button Base (Dark Gray Wood) */
.med-meta-menu .med-btn-epic, 
.med-meta-menu .med-btn-epic-small,
.med-meta-menu .med-btn-epic-danger {
    position: relative;
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.1 0.8" numOctaves="2" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(55, 55, 55), rgb(35, 35, 35));
    background-size: cover;
    background-color: rgb(40, 40, 40);
    border: 3px solid #151515;
    border-radius: 3px;
    color: rgb(180, 180, 180);
    box-shadow: 
        inset 0 0 10px rgba(0,0,0,0.8),
        inset 0 1px 0 rgba(255,255,255,0.05),
        0 6px 10px rgba(0,0,0,0.7),
        0 3px 0 #0a0a0a;
    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
    text-shadow: 1px 2px 2px rgba(0,0,0,0.9);
    padding: 10px 20px;
    font-family: 'STZhongsong', 'SimSun', serif;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
}

.med-meta-menu .med-btn-epic span,
.med-meta-menu .med-btn-epic-danger span {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    opacity: 0.6;
    font-weight: normal;
}

/* 4 Rivets for Generic Epic Button */
.med-meta-menu .med-btn-epic::before,
.med-meta-menu .med-btn-epic-small::before,
.med-meta-menu .med-btn-epic-danger::before {
    content: '';
    position: absolute;
    inset: 4px;
    pointer-events: none;
    background-image: 
        radial-gradient(circle at 0 0, #555 0, #111 2px, transparent 3px),
        radial-gradient(circle at 100% 0, #555 0, #111 2px, transparent 3px),
        radial-gradient(circle at 0 100%, #555 0, #111 2px, transparent 3px),
        radial-gradient(circle at 100% 100%, #555 0, #111 2px, transparent 3px);
    background-position: 0 0, 100% 0, 0 100%, 100% 100%;
    background-repeat: no-repeat;
    background-size: 8px 8px;
    opacity: 0.7;
}

.med-meta-menu .med-btn-epic:hover,
.med-meta-menu .med-btn-epic-small:hover {
    transform: translateY(1px);
    box-shadow: 
        inset 0 0 15px rgba(0,0,0,0.9),
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 3px 8px rgba(0,0,0,0.8),
        0 2px 0 #0a0a0a;
    color: #e0e0e0;
}

.med-meta-menu .med-btn-epic:active,
.med-meta-menu .med-btn-epic-small:active,
.med-meta-menu .med-btn-epic-danger:active {
    transform: translateY(3px);
    box-shadow: 
        inset 0 0 20px rgba(0,0,0,0.95),
        0 1px 3px rgba(0,0,0,0.8),
        0 0 0 #0a0a0a;
}

.med-meta-menu .med-btn-epic-small {
    padding: 8px 12px;
    font-size: 16px;
    flex: 1;
}

/* Danger button hover red */
.med-meta-menu .med-btn-epic-danger:hover {
    transform: translateY(1px);
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.1" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.1 0.8" numOctaves="2" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(80, 30, 30), rgb(45, 15, 15));
    border-color: #2a1111;
    box-shadow: 
        inset 0 0 15px rgba(0,0,0,0.9),
        inset 0 1px 0 rgba(255,100,100,0.1),
        0 3px 8px rgba(0,0,0,0.8),
        0 2px 0 #110000;
    color: #f88;
}

/* PRIMARY EMBARK BUTTON (Epic Primary) */
.med-meta-menu .med-btn-epic-primary {
    position: relative;
    background-image: 
        url('data:image/svg+xml;utf8,<svg opacity="0.15" xmlns="http://www.w3.org/2000/svg" width="100" height="20"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.5" numOctaves="3" result="noise"/></filter><rect width="100" height="20" filter="url(%23n)"/></svg>'),
        linear-gradient(180deg, rgb(110, 30, 20), rgb(60, 15, 10));
    background-size: cover;
    background-color: rgb(70, 20, 15);
    border: 4px solid #C29026; /* Gold Iron Edge */
    border-radius: 4px;
    color: #F2D06B;
    box-shadow: 
        inset 0 0 20px rgba(0,0,0,0.9),
        inset 0 1px 1px rgba(242, 208, 107, 0.3), /* inner gold highlight */
        0 10px 20px rgba(0,0,0,0.8), /* prominent shadow */
        0 0 15px rgba(194, 144, 38, 0.2), /* slight glow */
        0 5px 0 #614104; /* thick gold bottom */
    transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
    text-shadow: 2px 2px 4px rgba(0,0,0,1);
    padding: 16px 24px;
    font-family: 'STZhongsong', 'SimSun', serif;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
}

.med-meta-menu .med-btn-epic-primary .btn-text-main {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: 4px;
    padding-left: 4px;
}
.med-meta-menu .med-btn-epic-primary .btn-text-sub {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    opacity: 0.8;
    letter-spacing: 2px;
}

/* Primary 4 Rivets */
.med-meta-menu .med-btn-epic-primary::before {
    content: '';
    position: absolute;
    inset: 5px;
    pointer-events: none;
    background-image: 
        radial-gradient(circle at 0 0, #FFE082 0, #8c6213 3px, transparent 4px),
        radial-gradient(circle at 100% 0, #FFE082 0, #8c6213 3px, transparent 4px),
        radial-gradient(circle at 0 100%, #FFE082 0, #8c6213 3px, transparent 4px),
        radial-gradient(circle at 100% 100%, #FFE082 0, #8c6213 3px, transparent 4px);
    background-position: 0 0, 100% 0, 0 100%, 100% 100%;
    background-repeat: no-repeat;
    background-size: 10px 10px;
    opacity: 0.9;
}

.med-meta-menu .med-btn-epic-primary:hover {
    transform: translateY(2px);
    box-shadow: 
        inset 0 0 25px rgba(0,0,0,0.9),
        inset 0 1px 2px rgba(255, 230, 150, 0.4),
        0 6px 15px rgba(0,0,0,0.8),
        0 0 25px rgba(242, 208, 107, 0.4), /* stronger glow */
        0 3px 0 #614104;
    color: #FFF3C4;
    border-color: #F2D06B;
}

.med-meta-menu .med-btn-epic-primary:active {
    transform: translateY(5px);
    box-shadow: 
        inset 0 0 30px rgba(0,0,0,0.95),
        inset 0 1px 1px rgba(242, 208, 107, 0.2),
        0 1px 5px rgba(0,0,0,0.9),
        0 0 10px rgba(194, 144, 38, 0.2),
        0 0 0 #614104;
}
"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS V4")
