#!/bin/zsh
# A merchant's own menu photos turned into till icons, in the style of the
# library (README.md, "A merchant's own photos"). The sheet file lists, per
# sheet, up to nine [key, description, reference photo, dish name] rows; the
# references are attached to the Codex call in the same order as the cells.
D=${DISH_WORK:?set DISH_WORK to a scratch folder}; S=${OWN_SHEETS:?set OWN_SHEETS to the sheet file}
s=$1; cd $D
refs=(${(f)"$(python3 -c "import json;[print(x[2]) for x in json.load(open('$S'))['$s']]")"})
list=$(python3 -c "import json;d=json.load(open('$S'))['$s'];print('; '.join(f'cell {i+1}: attached photo {i+1}, {x[1]}' for i,x in enumerate(d)))")
timeout 900 codex exec --skip-git-repo-check -s workspace-write -C "$D" -i ${refs[@]} -- "Use your image generation tool with a TRANSPARENT background (PNG with alpha) to create one square 1024x1024 image and save it as $s.png in the current directory. Confirm with: python3 -c \"from PIL import Image; im=Image.open('$s.png'); print(im.mode, im.size)\".

The attached photos are a restaurant's own menu photos, in order. Turn each one into an icon for its till app: a 3x3 grid, filled left to right, top to bottom, one product per cell and the remaining cells left fully transparent. Reproduce each product faithfully from its photo: the same dish, the same plate, cup, bottle or can, the same colours, garnish and printed label, so the cashier recognises it at a glance. Remove the table and the background entirely: each product is isolated on full transparency, centred in its own cell with even padding, never touching another product, all at the same visual size and the same three-quarter top-down camera angle, soft studio light from the top left, realistic appetising photography, no added text, no shadow outside the product. Cells: $list." < /dev/null > $D/$s.log 2>&1
echo "$s done: $(ls -la $D/$s.png 2>/dev/null | awk '{print $5}')"
