# Delivery platform logos

The app icons of the three delivery apps Kiwi offers as presets, used only to
show which platform an order came from (platform picker, till, kitchen ticket,
KDS). They are the platforms' trademarks, not Kiwi's: never recolour, crop into
a new shape, or use them in marketing.

| File | App | Source | Brand colour |
| --- | --- | --- | --- |
| `glovo.png` | Glovo: Food & Grocery Delivery (Glovoapp 23 SL) | App Store id 951812684 | `#FFC244` |
| `kooul.png` | Kooul: Food Delivery (ORA Technologies SAS) | App Store id 6502602776 | `#FC3C53` |
| `yassir.png` | Yassir (Yassir Inc.) | App Store id 1239926325 | `#6316DB` |

128 × 128 PNG, resized from the 512 px store icon on 2026-11-24. Refresh them
when an app changes its icon:

```bash
curl -s "https://itunes.apple.com/lookup?id=951812684&country=ma" | python3 -c "import sys,json;print(json.load(sys.stdin)['results'][0]['artworkUrl512'])"
```

Note: « Kool Delivery » on the App Store is a different, inactive app published
by Yassir Inc. The Moroccan app owners mean when they say « Kool » is Kooul.
