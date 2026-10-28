#!/bin/zsh
D=${DISH_WORK:?set DISH_WORK to a scratch folder}; mkdir -p $D; cp "$(dirname "$0")/retail-sheets.json" $D/sheets.json; cd $D
s=$1
list=$(python3 -c "import json;d=json.load(open('sheets.json'))['$s'];print('; '.join(f'{i+1} {x[1]}' for i,x in enumerate(d)))")
timeout 900 codex exec --skip-git-repo-check -s workspace-write -C "$D" "Use your image generation tool with a TRANSPARENT background (PNG with alpha) to create one square 1024x1024 image and save it as $s.png in the current directory. Confirm with: python3 -c \"from PIL import Image; im=Image.open('$s.png'); print(im.mode, im.size)\".

Image: a 3x3 grid of nine product photographs cut out as icons for a fashion boutique and home-goods shop till app. Each product is isolated on full transparency, centred in its own cell with even padding, never touching another product, all at the same visual size. Realistic e-commerce product photography: clothing shown front view on an invisible mannequin (ghost mannequin, no person, no hanger), shoes, bags, accessories and home objects at a slight three-quarter angle, soft studio light from the top left, true natural fabric colours and textures, no text, no logos, no labels, no brand marks, no shadow outside the product. Cells left to right, top to bottom: $list." < /dev/null > $D/$s.log 2>&1
echo "$s done: $(ls -la $D/$s.png 2>/dev/null | awk '{print $5}')"
