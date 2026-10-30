# Dish photos

The till's dish pictures (`assets/dishes/<key>.webp`, 128 px, transparent) are
cut-out food photos generated in one series on 25 October 2026 with the image
generation of the Codex CLI (ChatGPT plan, no paid API). One sheet of nine per
call keeps the light, angle and scale the same across the set.

The set grew to 231 dishes the same evening (Moroccan home cooking, café and
bakery, snacks and fast food, Italian, seafood, juices, desserts), so a real
menu rarely falls back to the cloche.
On 30 October 2026 sheets `s28`…`s30` added 27 more (Lebanese, Greek and
Turkish, Spanish, Asian and Indian dishes, latte, bubble tea, lemonade,
karantika, medfouna, berkoukes): 267 in all.

Add or redo dishes:

1. Add `[key, description]` pairs to a sheet in `sheets.json` (nine per sheet).
2. `DISH_WORK=/path/to/scratch tools/dish-photos/gen.sh s27` asks Codex for the sheet.
3. `DISH_WORK=/path/to/scratch SIZE=128 ONLY=s27 python3 tools/dish-photos/slice.py`
   cuts each dish out. It groups solid shapes by their 3x3 cell and cuts two
   plates that touch at the thinnest line between them.
4. `python3 tools/dish-photos/despeck.py $DISH_WORK/out/*.png` clears the slivers of
   the neighbouring cell the slicer sometimes keeps on an edge. Skip it for a
   piece with a fine chain or thread (it reads thin parts as slivers) and check
   that piece by eye.
5. `cwebp -quiet -q 82 -alpha_q 90 -m 6 <key>.png -o assets/dishes/<key>.webp`.
6. Give the key its words in `DISH_WORDS` (`assets/caisse/catalogue.js`): all
   the words of a keyword must be in the dish name, in any order; the keyword
   with the most words wins, then the one whose word comes first in the name;
   prefix an ingredient or a flavour with `~` so it only counts when nothing
   else matches. Bump `DISH_PHOTOS_V` there when a photo is redrawn.

`tools/caisse-product-art-test.mjs` fails when a key has no photo, a photo
has no key, a known trap picks the wrong dish, or a sample menu name falls
back to the cloche.

## Boutique and Maison

The boutique and Maison tills share one set of product pictures
(`assets/retail-photos/<key>.webp`, 128 px): 252 pieces of clothing, Moroccan
traditional wear, shoes, underwear, children's wear, bags, jewellery, candles,
tableware, cutlery, kitchen, household linen and decor.
They were made the same way on 28 October 2026, with a shop prompt:
ghost-mannequin clothing, objects at a three-quarter angle.

1. Add `[key, description]` pairs to `retail-sheets.json` (nine per sheet).
2. `DISH_WORK=/path/to/scratch tools/dish-photos/gen-retail.sh b11`.
3. `DISH_WORK=/path/to/scratch SHEETS=retail-sheets.json SIZE=128 ONLY=b11 python3 tools/dish-photos/slice.py`.
4. `python3 tools/dish-photos/despeck.py $DISH_WORK/out/*.png` (see the dishes).
5. `cwebp -quiet -q 82 -alpha_q 90 -m 6 <key>.png -o assets/retail-photos/<key>.webp`.
6. Give the key its name in three languages and its family in `NAMES` and
   `GROUPS` (`assets/retail-icon-picker.js`), and its words in `WORDS`
   (`assets/retail-photos.js`): every word
   of a keyword must be in the product name; more words win, then the word
   that comes first in the name. The name decides before the icon picked in
   the product form, and the form's default T-shirt never counts as a choice.
   Bump `PHOTOS_V` there when a photo is redrawn.

Colours: the pieces listed in `COLOUR_KEYS` also have one photo per colour
in `COLOURS` (`<key>-<colour>.webp`, sheets `c1`…`c17` for everyday clothes
and `mc1`…`mc9` for djellabas, gandoura, abaya, hijab, burkini, caftan,
babouches and jabador, the same item with only its colour changed). Sheets
`m1`…`m3` hold the modest-wear, souk and hammam pieces. Sheets `n1`…`n6` (30 October 2026) hold
shoes, tops, nightwear, children's wear and small accessories, `n7`…`n15`
the Maison table, cutlery, tea and coffee, glassware, kitchen, linen and
decor. A new piece takes its most precise words from the general piece that
held them (« mocassin » left the shoes, « photophore » the candlestick). The colour comes from the ticket line, then a word
of the name, then the product's colours. To give another piece its colours,
add a sheet of nine `<key>-<colour>` cells and add the key to `COLOUR_KEYS`.

`tools/retail-product-art-test.mjs` fails when a key has no photo, a photo
has no key, or a real merchant's product name picks the wrong piece. When a
merchant adds products, run their names through `keyForName` and add the
ones that fall through.
