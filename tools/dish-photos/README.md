# Dish photos

The till's dish pictures (`assets/dishes/<key>.webp`, 128 px, transparent) are
cut-out food photos generated in one series on 25 October 2026 with the image
generation of the Codex CLI (ChatGPT plan, no paid API). One sheet of nine per
call keeps the light, angle and scale the same across the set.

The set grew to 231 dishes the same evening (Moroccan home cooking, café and
bakery, snacks and fast food, Italian, seafood, juices, desserts), so a real
menu rarely falls back to the cloche.

Add or redo dishes:

1. Add `[key, description]` pairs to a sheet in `sheets.json` (nine per sheet).
2. `DISH_WORK=/path/to/scratch tools/dish-photos/gen.sh s27` asks Codex for the sheet.
3. `DISH_WORK=/path/to/scratch SIZE=128 ONLY=s27 python3 tools/dish-photos/slice.py`
   cuts each dish out. It groups solid shapes by their 3x3 cell and cuts two
   plates that touch at the thinnest line between them.
4. `cwebp -quiet -q 82 -alpha_q 90 -m 6 <key>.png -o assets/dishes/<key>.webp`.
5. Give the key its words in `DISH_WORDS` (`assets/caisse/catalogue.js`): all
   the words of a keyword must be in the dish name, in any order; the keyword
   with the most words wins, then the one whose word comes first in the name;
   prefix an ingredient or a flavour with `~` so it only counts when nothing
   else matches. Bump `DISH_PHOTOS_V` there when a photo is redrawn.

`tools/caisse-product-art-test.mjs` fails when a key has no photo, a photo
has no key, a known trap picks the wrong dish, or a sample menu name falls
back to the cloche.
