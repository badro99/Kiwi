# Dish photos

The till's dish pictures (`assets/dishes/<key>.webp`, 128 px, transparent) are
cut-out food photos generated in one series on 25 October 2026 with the image
generation of the Codex CLI (ChatGPT plan, no paid API). One sheet of nine per
call keeps the light, angle and scale the same across the set.

Add or redo dishes:

1. Add `[key, description]` pairs to a sheet in `sheets.json` (nine per sheet).
2. `DISH_WORK=/path/to/scratch tools/dish-photos/gen.sh s7` asks Codex for the sheet.
3. `DISH_WORK=/path/to/scratch SIZE=192 python3 tools/dish-photos/slice.py`
   cuts each dish out (`DIL=0` if two dishes come out joined).
4. Resize to 128 px and `cwebp -q 82 -alpha_q 90 -m 6` into `assets/dishes/`.
5. Point a rule at the key in `MENU_ART_RULES` (`assets/caisse-app.js`) and bump
   `DISH_PHOTOS_V` in `assets/caisse/catalogue.js` when a photo changes.

`tools/caisse-product-art-test.mjs` fails when a key has no photo or a photo
no rule reaches.
