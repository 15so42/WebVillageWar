css = """
/* ============================================================
   MEDIEVAL MAIN MENU OVERHAUL (V6 - Fullscreen Background Map)
   ============================================================ */

.med-meta-menu {
    /* Using the uploaded map as the full screen background */
    background: url('/bg-map.jpg') center center / cover no-repeat,
                radial-gradient(circle at center, rgba(30, 40, 35, 0.8), rgba(10, 15, 12, 0.95)) !important;
    background-blend-mode: normal; /* The image covers the screen. Gradient is fallback. */
}

/* Make the board itself slightly transparent so the background map is visible if desired, 
   or keep the board opaque if it is a book on top of the map. 
   We will keep it opaque for readability, but add a stronger drop shadow. */
.med-meta-menu .med-menu-board {
    box-shadow: 
        inset 0 0 0 2px var(--med-gold),
        inset 0 0 50px rgba(0,0,0,0.5),
        0 30px 60px rgba(0,0,0,0.9) !important;
}

"""

with open('src/styles.css', 'a') as f:
    f.write(css)

print("Appended Menu CSS V7")
