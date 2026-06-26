#!/usr/bin/env bash
# Regenerates the Review Master app icons (the "Review Note" mark: a review
# bubble over a +/- diff) for every platform electron-builder targets.
#
# Source of truth for the artwork is the ImageMagick draw pipeline below — we
# draw with native primitives rather than rasterising an SVG because the macOS
# ImageMagick here has no librsvg delegate (SVG gradients render black).
#
# Outputs (electron-builder auto-detects these under build/):
#   build/icon.icns  (macOS)   build/icon.ico  (Windows)   build/icon.png (Linux, 1024)
#
# Requires: ImageMagick (magick), iconutil, sips. Run from the build/ dir:
#   ./make-icons.sh
set -euo pipefail
cd "$(dirname "$0")"

VIOLET_TOP='#8a6bff'
VIOLET_BOT='#5b7bff'
ADD='#3ddc97'
DEL='#ff5c7a'

echo "→ rendering 1024px master (build/icon.png)"
magick -size 1024x1024 gradient:"${VIOLET_TOP}"-"${VIOLET_BOT}" _grad.png
magick -size 1024x1024 xc:none -fill white -draw "roundrectangle 100,100,924,924,184,184" _mask.png
magick _grad.png _mask.png -alpha Off -compose CopyOpacity -composite _tile.png
magick _tile.png -draw "fill white stroke none \
  roundrectangle 300,325,724,600,56,56 \
  polygon 360,592 300,702 452,600 \
  stroke-linecap round fill none \
  stroke ${ADD} stroke-width 40 line 378,432 648,432 \
  stroke ${DEL} stroke-width 40 line 378,512 536,512" icon.png

echo "→ building macOS .icns"
rm -rf icon.iconset && mkdir icon.iconset
for spec in "16:16x16" "32:16x16@2x" "32:32x32" "64:32x32@2x" \
            "128:128x128" "256:128x128@2x" "256:256x256" "512:256x256@2x" \
            "512:512x512" "1024:512x512@2x"; do
  px="${spec%%:*}"; name="${spec##*:}"
  sips -z "$px" "$px" icon.png --out "icon.iconset/icon_${name}.png" >/dev/null
done
iconutil -c icns icon.iconset -o icon.icns

echo "→ building Windows .ico"
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

echo "→ cleanup"
rm -f _grad.png _mask.png _tile.png
rm -rf icon.iconset

echo "✓ done: icon.icns, icon.ico, icon.png"
