"""Generate Framewise extension icons from the FramewiseMark SVG."""
import cairosvg
import os

# Exact FramewiseMark geometry from FramewiseMark.jsx — gradient backplate,
# "F" letterform with film-frame horizontals + notch cutouts, timeline + dot.

ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#FEC9AF"/>
      <stop offset="55%"  stop-color="#F8A57F"/>
      <stop offset="100%" stop-color="#C56A43"/>
    </linearGradient>
  </defs>

  <!-- Backplate -->
  <rect x="0" y="0" width="64" height="64" rx="14" ry="14" fill="url(#g)"/>

  <!-- Inner highlight -->
  <rect x="1" y="1" width="62" height="62" rx="13" ry="13"
        fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>

  <!-- Stem -->
  <rect x="16" y="14" width="5" height="34" rx="1" fill="#FFF2DC"/>

  <!-- Top horizontal — film frame -->
  <rect x="16" y="14" width="28" height="9" rx="1.5" fill="#FFF2DC"/>
  <rect x="40" y="17" width="2" height="3" fill="url(#g)" opacity=".35"/>
  <rect x="36" y="17" width="2" height="3" fill="url(#g)" opacity=".35"/>

  <!-- Middle horizontal — second film frame -->
  <rect x="16" y="28" width="20" height="7" rx="1.5" fill="#FFF2DC"/>
  <rect x="30" y="30" width="2" height="3" fill="url(#g)" opacity=".35"/>

  <!-- Timeline baseline + marker dot -->
  <rect x="14" y="52" width="36" height="1.5" rx=".75" fill="#FFF2DC" opacity=".45"/>
  <circle cx="22" cy="52.75" r="2.25" fill="#FFE2C8"/>
</svg>"""

sizes = [16, 32, 48, 128]
icons_dir = os.path.dirname(os.path.abspath(__file__))

for size in sizes:
    out_path = os.path.join(icons_dir, f"icon{size}.png")
    cairosvg.svg2png(
        bytestring=ICON_SVG.encode(),
        write_to=out_path,
        output_width=size,
        output_height=size,
    )
    print(f"✓ Generated {out_path} ({size}×{size})")

print("\nAll icons generated.")
