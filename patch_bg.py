import re

with open("src/styles.css", "r", encoding="utf-8") as f:
    css = f.read()

bg_css = """
.med-meta-menu {
    /* Procedurally generated full-screen medieval parchment map */
    background: 
        /* 1. Compass rose / focal point */
        radial-gradient(circle at 80% 20%, rgba(139, 111, 78, 0.15) 0%, transparent 15%),
        radial-gradient(circle at 80% 20%, rgba(139, 111, 78, 0.1) 0%, transparent 30%),
        /* 2. Abstract continent shapes / shores */
        radial-gradient(ellipse at 10% 80%, rgba(160, 130, 95, 0.15) 0%, transparent 40%),
        radial-gradient(ellipse at 30% 10%, rgba(150, 120, 85, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 90% 90%, rgba(140, 110, 80, 0.15) 0%, transparent 45%),
        /* 3. Map grid lines (rhumb lines / graticule) */
        linear-gradient(rgba(100, 70, 40, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100, 70, 40, 0.05) 1px, transparent 1px),
        /* 4. Diagonal rhumb lines */
        linear-gradient(45deg, rgba(139, 111, 78, 0.03) 1px, transparent 1px),
        linear-gradient(-45deg, rgba(139, 111, 78, 0.03) 1px, transparent 1px),
        /* 5. Fine parchment noise / turbulence */
        url('data:image/svg+xml;utf8,<svg opacity="0.3" xmlns="http://www.w3.org/2000/svg" width="400" height="400"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="5" result="noise"/></filter><rect width="400" height="400" filter="url(%23n)"/><path d="M 50 100 Q 150 50, 250 150 T 350 100" fill="none" stroke="rgba(80,50,30,0.4)" stroke-width="2" stroke-dasharray="5,5"/><path d="M 100 300 Q 200 350, 300 250" fill="none" stroke="rgba(80,50,30,0.3)" stroke-width="1.5"/></svg>'),
        /* 6. Overall parchment base colors and vignetting */
        radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(20, 10, 5, 0.6) 100%),
        linear-gradient(135deg, #d8b88e 0%, #c19b6c 40%, #a88151 80%, #7e5c35 100%) !important;
    background-size: 
        100% 100%, 100% 100%,
        100% 100%, 100% 100%, 100% 100%,
        80px 80px, 80px 80px,
        150px 150px, 150px 150px,
        400px 400px,
        100% 100%, 100% 100% !important;
    background-blend-mode: 
        multiply, multiply,
        multiply, multiply, multiply,
        multiply, multiply,
        multiply, multiply,
        multiply,
        multiply, normal !important;
    box-shadow: inset 0 0 150px rgba(40, 20, 10, 0.8);
}
"""

css = re.sub(
    r"\.med-meta-menu\s*\{[^}]*\}",
    bg_css.strip(),
    css,
    flags=re.DOTALL
)

with open("src/styles.css", "w", encoding="utf-8") as f:
    f.write(css)

