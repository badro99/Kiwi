#!/usr/bin/env python3
"""Construit assets/data/ciqual-lite.json depuis les publications officielles Anses.

Valeurs nutritionnelles : Table Ciqual 2025, DOI 10.57745/RDMHWY.
Noms anglais : table Anses-Ciqual 2020, jointe par alim_code, car la livraison
2025 ne publie plus cette colonne. Licence : Licence Ouverte / Etalab 2.0.

Sans argument, le script télécharge les deux archives dans un répertoire
temporaire. Les options --xlsx et --xml-zip permettent une reconstruction
hors ligne à partir de copies déjà téléchargées.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

CIQUAL_2025_URL = "https://entrepot.recherche.data.gouv.fr/api/access/datafile/:persistentId?persistentId=doi:10.57745/RPWYZD"
CIQUAL_2025_MD5 = "0d9758ce23f3f13dd63a005bc1bb4f2c"
CIQUAL_2020_XML_URL = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip"
CIQUAL_2020_XML_MD5 = "9dcc7cdc29d4894326b7bae02acf322b"
TARGET_COUNT = 1000
EXCLUDED_SUBGROUPS = {"0603", "1101", "1102", "1103", "1104"}
ALLERGEN_ORDER = ["gluten", "crustaces", "oeufs", "poissons", "arachides", "soja", "lait", "fruits_a_coque", "celeri", "moutarde", "sesame", "sulfites", "lupin", "mollusques"]

# Noms courants saisis au Maroc, en français ou en darija translittérée.
# Une correspondance ouvre toujours la fiche Ciqual canonique : le commerçant
# voit donc exactement quel aliment il choisit avant d'enregistrer ses valeurs.
MOROCCAN_ALIASES = {
    "smen": "16402", "smen beldi": "16402", "beurre beldi": "16402",
    "khlii": "28860", "khlea": "28860", "khli3": "28860",
    "louiza": "18022", "lwiza": "18022",
    "harcha": "9610", "harsha": "9610",
    "bsla": "20034", "btata": "4023",
    "qzbor": "11094", "kosbor": "11094", "kasbour": "11094",
    "maadnous": "11014", "ma3dnous": "11014",
    "naanaa": "11027", "na3na3": "11027",
    "homs": "20516",
    "denjal": "20053", "badenjal": "20053",
    "zitoun": "13184",
    "djaj": "36016", "kefta": "6254",
    "creme fraiche": "19410", "crème fraîche": "19410",
    "lben": "19805", "leben": "19805", "raib": "19593", "rayeb": "19593",
    "matecha": "20276", "maticha": "20276", "zit zitoun": "17270",
    "khizzo": "20009", "khizo": "20009", "hamed": "13009", "l7amed": "13009",
}

PORTION_SUGGESTIONS = {
    "egg": {"grams": 50, "labelFr": "œuf moyen", "labelEn": "medium egg", "labelAr": "بيضة متوسطة"},
    "tomato": {"grams": 120, "labelFr": "tomate moyenne", "labelEn": "medium tomato", "labelAr": "طماطم متوسطة"},
    "bread_slice": {"grams": 30, "labelFr": "tranche de pain", "labelEn": "slice of bread", "labelAr": "شريحة خبز"},
    "onion": {"grams": 110, "labelFr": "oignon moyen", "labelEn": "medium onion", "labelAr": "بصلة متوسطة"},
    "potato": {"grams": 170, "labelFr": "pomme de terre moyenne", "labelEn": "medium potato", "labelAr": "بطاطس متوسطة"},
    "apple": {"grams": 150, "labelFr": "pomme moyenne", "labelEn": "medium apple", "labelAr": "تفاحة متوسطة"},
    "zucchini": {"grams": 200, "labelFr": "courgette moyenne", "labelEn": "medium zucchini", "labelAr": "كوسة متوسطة"},
    "lemon": {"grams": 60, "labelFr": "citron moyen, chair", "labelEn": "medium lemon, flesh", "labelAr": "ليمونة متوسطة"},
    "banana": {"grams": 120, "labelFr": "banane moyenne, sans peau", "labelEn": "medium banana, peeled", "labelAr": "موزة متوسطة مقشرة"},
    "orange": {"grams": 150, "labelFr": "orange moyenne, chair", "labelEn": "medium orange, flesh", "labelAr": "برتقالة متوسطة"},
    "carrot": {"grams": 80, "labelFr": "carotte moyenne", "labelEn": "medium carrot", "labelAr": "جزرة متوسطة"},
    "cucumber": {"grams": 250, "labelFr": "concombre moyen", "labelEn": "medium cucumber", "labelAr": "خيارة متوسطة"},
}
PORTION_CATEGORY_BY_ID = {
    "22000": "egg", "20276": "tomato", "7200": "bread_slice",
    "20034": "onion", "4008": "potato", "13039": "apple", "20020": "zucchini",
    "13009": "lemon", "13005": "banana", "13034": "orange", "20009": "carrot", "20019": "cucumber",
}


def download(url: str, target: Path) -> Path:
    request = urllib.request.Request(url, headers={"User-Agent": "Kiwi-Ciqual-Builder/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response, target.open("wb") as out:
        out.write(response.read())
    return target


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def xlsx_rows(path: Path):
    with zipfile.ZipFile(path) as archive:
        strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared = ["".join(node.text or "" for node in item.findall(".//x:t", ns)) for item in strings_root.findall("x:si", ns)]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in sheet.findall(".//x:sheetData/x:row", ns):
            values = [None] * 84
            for cell in row.findall("x:c", ns):
                value = cell.find("x:v", ns)
                if value is None:
                    continue
                raw = value.text or ""
                values[column_index(cell.attrib["r"])] = shared[int(raw)] if cell.attrib.get("t") == "s" else raw
            yield values


def english_names(path: Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as archive:
        text = archive.read("alim_2020_07_07.xml").decode("cp1252", errors="replace")
    result = {}
    for block in re.findall(r"<ALIM>(.*?)</ALIM>", text, flags=re.S):
        code = re.search(r"<alim_code>\s*(.*?)\s*</alim_code>", block, flags=re.S)
        name = re.search(r"<alim_nom_eng>\s*(.*?)\s*</alim_nom_eng>", block, flags=re.S)
        if code and name:
            result[code.group(1).strip()] = name.group(1).replace("&amp;", "&").strip()
    return result


def number(value):
    """Lit une cellule Ciqual. Retourne (valeur, bornée).

    Ciqual écrit « < 0,5 » quand la teneur est sous le seuil de quantification et
    « traces » quand elle est négligeable. La première version rejetait ces
    lignes entières : la tomate crue, le citron, la carotte, l'ail, l'huile
    d'olive, l'orange et la banane disparaissaient de la table, soit les
    aliments les plus courants d'une cuisine marocaine (décision du
    2026-08-23). Une borne « < x » est une information, pas une inconnue : on
    garde x, la borne supérieure, celle qu'une étiquette afficherait, et on
    marque le nutriment comme borné pour que l'interface puisse dire « ≤ ».
    « traces » vaut 0. Une cellule vide ou « - » reste une vraie inconnue et
    continue d'exclure la ligne."""
    text = str(value or "").strip().replace(",", ".").lower()
    if text in {"traces", "trace"}:
        return 0.0, True
    bounded = re.fullmatch(r"<\s*(\d+(?:\.\d+)?)", text)
    if bounded:
        return float(bounded.group(1)), True
    if not re.fullmatch(r"\d+(?:\.\d+)?", text):
        return None, False
    return float(text), False


def compact_number(value: float):
    rounded = round(value, 3)
    return int(rounded) if rounded.is_integer() else rounded


def folded(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(char) != "Mn")


def allergen_hints(name_fr: str, name_en: str, subgroup: str) -> list[str]:
    text = " " + folded(name_fr + " " + name_en).replace("'", " ") + " "
    found = set()
    patterns = {
        "gluten": r"\b(ble|wheat|orge|barley|seigle|rye|avoine|oat|epeautre|spelt|pain|bread|pates?|pasta|couscous)\b",
        "crustaces": r"\b(crevette|shrimp|prawn|crabe|crab|homard|lobster|langouste|ecrevisse|crayfish)\b",
        "oeufs": r"\b(oeuf|oeufs|egg|eggs|mayonnaise)\b",
        "poissons": r"\b(poisson|fish|saumon|salmon|thon|tuna|sardine|anchois|anchov|truite|trout|cabillaud|cod|merlu|hake)\b",
        "arachides": r"\b(arachide|arachides|cacahuete|cacahuetes|peanut|peanuts)\b",
        "soja": r"\b(soja|soy|tofu|tempeh)\b",
        "lait": r"\b(lait|milk|beurre|butter|creme|cream|fromage|cheese|yaourt|yogurt|whey|lactose)\b",
        "fruits_a_coque": r"\b(amande|almond|noisette|hazelnut|noix|walnut|pistache|pistachio|cajou|cashew|pecan|macadamia)\b",
        "celeri": r"\b(celeri|celery)\b",
        "moutarde": r"\b(moutarde|mustard)\b",
        "sesame": r"\b(sesame|tahini)\b",
        "lupin": r"\b(lupin|lupine)\b",
        "mollusques": r"\b(moule|mussel|huitre|oyster|calamar|squid|poulpe|octopus|seiche|cuttlefish|escargot|snail|coquille)\b",
    }
    for allergen, pattern in patterns.items():
        if re.search(pattern, text):
            found.add(allergen)
    if subgroup in {"0405", "0406"}:
        found.add("poissons")
    if subgroup == "0410":
        found.add("oeufs")
    return [allergen for allergen in ALLERGEN_ORDER if allergen in found]


def preference(row: dict) -> tuple:
    """Plus petit = préféré. Ciqual nomme l'aliment de base « Citron, chair sans
    peau, sans pépins, cru » et la préparation « Citron givré (sorbet) » : compter
    les virgules faisait gagner le sorbet. L'aliment cru ou frais est celui qu'une
    cuisine pèse, il passe devant ; les préparations (sorbet, tarte, jus, nectar,
    salade, sauce, plat) reculent."""
    name = folded(row["nameFr"])
    words = re.sub(r"[^a-z0-9]+", " ", name).split()
    penalties = ["preemballe", "aliment moyen", "non precise", "sans precision", "de restauration", "industriel", "surgele", "appertise"]
    penalty = sum(20 for marker in penalties if marker in name)
    if any(word in {"cru", "crue", "crus", "crues", "frais", "fraiche", "fraiches"} for word in words):
        penalty -= 30
    if any(word in {"sorbet", "tarte", "jus", "nectar", "salade", "sauce", "soupe", "compote", "confiture", "sirop", "glace", "gateau", "biscuit", "chips", "pizza", "sandwich", "plat", "gratin", "puree", "poudre", "seche", "sec", "deshydrate", "deshydratee", "confit", "confite"} for word in words):
        penalty += 15
    penalty += name.count(",") * 2 + max(0, len(name) - 72) // 8
    return penalty, len(name), name, row["id"]


PRIORITY_PATTERNS = [
    r"^tomate pulpe et peau crue$", r"^tomate\b", r"^oignon\b", r"^ail\b", r"^carotte\b", r"^courgette\b", r"^aubergine\b",
    r"^poivron\b", r"^pomme de terre\b", r"^pois chiche\b", r"^lentille\b", r"^haricot blanc\b",
    r"^olive\b", r"^citron\b", r"^orange\b", r"^banane\b", r"^pomme\b", r"^datte\b", r"^amande\b",
    r"^noix\b", r"^riz\b", r"^semoule de ble\b", r"^farine de ble\b", r"^pain\b", r"^poulet\b",
    r"^boeuf\b", r"^agneau\b", r"^veau\b", r"^dinde\b", r"^oeuf\b", r"^sardine\b", r"^thon\b",
    r"^saumon\b", r"^crevette\b", r"^lait\b", r"^yaourt\b", r"^fromage\b", r"^beurre\b",
    r"^huile d olive\b", r"^sucre\b", r"^miel\b", r"^sel\b", r"^cumin\b", r"^cannelle\b",
    r"^paprika\b", r"^persil\b", r"^coriandre\b", r"^menthe\b", r"^cafe\b", r"^the\b", r"^chocolat\b",
    # Ajout du 2026-08-23 : les aliments crus que la première sélection perdait
    # (voir preference), les légumes, fruits, épices et produits laitiers d'une
    # cuisine marocaine, et quelques bases de pâtisserie.
    r"^concombre\b", r"^citron vert\b", r"^navet\b", r"^chou\b", r"^chou fleur\b", r"^haricot vert\b", r"^petit pois\b",
    r"^fenouil\b", r"^celeri\b", r"^poireau\b", r"^epinard\b", r"^betterave\b", r"^artichaut\b", r"^champignon\b",
    r"^potiron\b", r"^courge\b", r"^patate douce\b", r"^avocat\b", r"^piment\b", r"^echalote\b", r"^mais\b",
    r"^fraise\b", r"^melon\b", r"^pasteque\b", r"^raisin\b", r"^figue\b", r"^abricot\b", r"^peche\b", r"^poire\b",
    r"^grenade\b", r"^kiwi\b", r"^ananas\b", r"^mangue\b", r"^nectarine\b", r"^cerise\b", r"^prune\b", r"^clementine\b",
    r"^pamplemousse\b", r"^raisin sec\b", r"^pruneau\b", r"^noix de coco\b", r"^cacahuete\b", r"^sesame\b", r"^pistache\b",
    r"^noisette\b", r"^noix de cajou\b", r"^graine de tournesol\b", r"^graine de lin\b",
    r"^gingembre\b", r"^curcuma\b", r"^safran\b", r"^poivre\b", r"^clou de girofle\b", r"^anis\b", r"^fenugrec\b",
    r"^muscade\b", r"^laurier\b", r"^thym\b", r"^origan\b", r"^basilic\b", r"^vinaigre\b", r"^harissa\b",
    r"^huile de tournesol\b", r"^huile d arachide\b", r"^huile de colza\b", r"^margarine\b", r"^levure\b", r"^bicarbonate\b",
    r"^creme 30% mg epaisse\b", r"^creme 30% mg fluide\b", r"^creme 12 a 25% mg legere epaisse\b", r"^creme chantilly\b",
    r"^lait fermente a boire ou lait ribot nature au lait entier\b", r"^fromage blanc\b", r"^mozzarella\b", r"^emmental\b", r"^gruyere\b", r"^parmesan\b",
    r"^mascarpone\b", r"^feta\b", r"^ricotta\b", r"^lait concentre\b", r"^lait en poudre\b", r"^lait de coco\b",
    r"^lait fermente\b", r"^lben\b", r"^petit suisse\b", r"^cacao\b", r"^vanille\b", r"^confiture\b", r"^sirop\b",
    r"^mayonnaise\b", r"^ketchup\b", r"^moutarde\b", r"^concentre de tomate\b", r"^capre\b", r"^cornichon\b",
    r"^feve\b", r"^haricot rouge\b", r"^quinoa\b", r"^flocons d avoine\b", r"^orge\b", r"^boulgour\b", r"^vermicelle\b",
    r"^pates\b", r"^nouilles\b", r"^pain complet\b", r"^pain de mie\b", r"^baguette\b", r"^croissant\b", r"^brioche\b",
    r"^merlan\b", r"^dorade\b", r"^calamar\b", r"^moule\b", r"^sole\b", r"^maquereau\b", r"^anchois\b", r"^cabillaud\b",
    r"^foie\b", r"^mouton\b", r"^caille\b", r"^lapin\b", r"^chevre\b", r"^eau\b", r"^jus d orange\b", r"^olive verte\b",
    r"^huile d olive vierge\b", r"^tomate ronde\b", r"^tomate cerise\b", r"^banane\b",
]


def build(xlsx: Path, old_xml_zip: Path) -> list[dict]:
    names_en = english_names(old_xml_zip)
    groups = defaultdict(list)
    for index, row in enumerate(xlsx_rows(xlsx)):
        if index == 0:
            continue
        code, name_fr, subgroup = str(row[6] or "").strip(), str(row[7] or "").strip(), str(row[1] or "").strip().zfill(4)
        name_en = names_en.get(code, "")
        parsed = [number(row[column]) for column in (10, 14, 16, 17, 18, 49)]
        values = [value for value, _bounded in parsed]
        if not code or not name_fr or not name_en or subgroup in EXCLUDED_SUBGROUPS or any(value is None for value in values):
            continue
        kcal, protein, carbs, fat, sugars, salt = values
        item = {
            "id": code, "nameFr": name_fr, "nameEn": name_en,
            "kcal": compact_number(kcal), "protein": compact_number(protein),
            "carbs": compact_number(carbs), "fat": compact_number(fat),
            "sugars": compact_number(sugars), "salt": compact_number(salt),
            "allergenHints": allergen_hints(name_fr, name_en, subgroup),
        }
        bounded_keys = [key for key, (_value, bounded) in zip(("kcal", "protein", "carbs", "fat", "sugars", "salt"), parsed) if bounded]
        if bounded_keys:
            item["bounded"] = bounded_keys
        if code in PORTION_CATEGORY_BY_ID:
            item["portionCategory"] = PORTION_CATEGORY_BY_ID[code]
        groups[subgroup].append(item)
    for rows in groups.values():
        rows.sort(key=preference)
    selected, selected_ids = [], set()
    candidates = [row for rows in groups.values() for row in rows]
    by_id = {row["id"]: row for row in candidates}
    forced_ids = set(MOROCCAN_ALIASES.values()) | set(PORTION_CATEGORY_BY_ID)
    missing_targets = sorted(forced_ids - set(by_id))
    if missing_targets:
        raise ValueError("Cibles Ciqual locales absentes : " + ", ".join(missing_targets))
    for target_id in dict.fromkeys([*MOROCCAN_ALIASES.values(), *PORTION_CATEGORY_BY_ID]):
        hit = by_id.get(target_id)
        if hit and hit["id"] not in selected_ids:
            selected.append(hit)
            selected_ids.add(hit["id"])
    for pattern in PRIORITY_PATTERNS:
        matches = [row for row in candidates if re.search(pattern, re.sub(r"[^a-z0-9]+", " ", folded(row["nameFr"])).strip())]
        if matches:
            hit = min(matches, key=preference)
            if hit["id"] not in selected_ids:
                selected.append(hit)
                selected_ids.add(hit["id"])
    depth = 0
    ordered_groups = sorted(groups)
    while len(selected) < TARGET_COUNT:
        added = False
        for subgroup in ordered_groups:
            if depth < len(groups[subgroup]):
                row = groups[subgroup][depth]
                if row["id"] in selected_ids:
                    continue
                selected.append(row)
                selected_ids.add(row["id"])
                added = True
                if len(selected) == TARGET_COUNT:
                    break
        if not added:
            break
        depth += 1
    return sorted(selected, key=lambda row: (folded(row["nameFr"]), row["id"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path)
    parser.add_argument("--xml-zip", type=Path)
    parser.add_argument("--output", type=Path, default=Path("assets/data/ciqual-lite.json"))
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="kiwi-ciqual-") as temp:
        xlsx = args.xlsx or download(CIQUAL_2025_URL, Path(temp) / "ciqual-2025.xlsx")
        old_xml = args.xml_zip or download(CIQUAL_2020_XML_URL, Path(temp) / "ciqual-2020-xml.zip")
        digest = hashlib.md5(xlsx.read_bytes()).hexdigest()
        if digest != CIQUAL_2025_MD5:
            raise SystemExit(f"Source Ciqual 2025 inattendue : MD5 {digest}")
        old_digest = hashlib.md5(old_xml.read_bytes()).hexdigest()
        if old_digest != CIQUAL_2020_XML_MD5:
            raise SystemExit(f"Source Ciqual 2020 inattendue : MD5 {old_digest}")
        foods = build(xlsx, old_xml)
        if len(foods) != TARGET_COUNT:
            raise SystemExit(f"Sélection incomplète : {len(foods)} aliments sur {TARGET_COUNT}")
        payload = {
            "source": {
                "citation": "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual",
                "doi": "10.57745/RDMHWY", "licence": "Licence Ouverte / Etalab 2.0",
                "englishNames": "Anses-Ciqual 2020, jointure par alim_code",
                "boundedValues": "« < x » conservé comme x (borne supérieure), « traces » comme 0 ; les nutriments concernés sont listés dans `bounded`",
            },
            "aliases": MOROCCAN_ALIASES,
            "portionSuggestions": PORTION_SUGGESTIONS,
            "foods": foods,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{len(foods)} aliments · {args.output.stat().st_size} octets · {args.output}")


if __name__ == "__main__":
    main()
