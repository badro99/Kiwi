/* Photos produit des caisses boutique et Maison (owner, 28 octobre 2026).
   Les dessins au trait paraissaient pâles à côté des plats photographiés de
   la caisse restaurant : chaque icône est maintenant une photo détourée,
   générée une fois par planches de neuf (tools/dish-photos, README
   « Boutique et Maison ») et rangée dans assets/retail-photos/<clé>.webp.

   Quelle photo pour quel produit, dans l'ordre des caisses restaurant et
   pressing :
   1. le nom, quand un mot le dit : « Robe lin » prend la robe, « Giftbox
      Rio » le coffret, même si l'icône enregistrée est restée sur le T-shirt
      que la fiche propose par défaut (89 bougies sur 91 chez un client réel) ;
   2. sinon l'icône choisie dans la fiche, sauf le T-shirt proposé par défaut,
      qui ne dit rien (« A71030TA » n'est pas un T-shirt dans une boutique de
      bougies) ;
   3. sinon la photo neutre de la caisse (le cintre, l'étiquette à la Maison).
   Un mot-clé de plusieurs mots passe devant un mot seul (« caftan velours »
   avant « caftan »), puis le mot le plus tôt dans le nom, qui en français est
   le nom de la pièce (« Veste en jean » est une veste). */

export const PHOTOS_V = 1;
export const DEFAULT_KEY = 'cintre';
const FORM_DEFAULT = 'tshirt';   // l'icône que la fiche produit propose d'office

const WORDS = {
  /* ── Traditionnel marocain ── */
  caftan: 'caftan|kaftan|qaftan|قفطان',
  caftan_perle: 'caftan perle|caftan soiree|caftan paillette|caftan strass',
  caftan_jawhara: 'jawhara|caftan signature|caftan brode|caftan fassi',
  caftan_ete: 'caftan ete|caftan coton|caftan lin',
  caftan_velours: 'caftan velours',
  takchita: 'takchita|takshita|tekchita|تكشيطة',
  takchita_mariage: 'takchita mariage|tenue mariage|tenue mariee|robe mariee',
  djellaba: 'djellaba|jellaba|jalaba|djelaba|جلابة',
  gandoura: 'gandoura|gandora|qamis|kamis|abaya',
  jabador: 'jabador|jabadour',
  selham: 'selham|burnous|bournous',
  tarbouche: 'tarbouche|tarbouch|fez|chechia',
  mdamma: 'mdamma|mdama|ceinture caftan|ceinture doree',
  foulard: 'foulard|hijab|voile|carre soie|bandana',
  chale: 'chale|etole|pashmina|shawl',
  broche: 'broche|brooch|epingle|bijou',
  babouche: 'babouche|belgha|balgha|bolgha|slipper|mule|بلغة',
  babouche_brodee: 'babouche brodee|babouche femme',
  cherbil: 'cherbil|charbil|chrabel',
  babouche_enfant: 'babouche enfant|babouche bebe',
  /* ── Chaussures, couvre-chef ── */
  chaussures: 'chaussure|soulier|mocassin|derby|richelieu|escarpin|ballerine|talon|shoe|loafer|heel',
  basket: 'basket|sneaker|tennis|running|trainer',
  botte: 'botte|bottine|boot',
  sandale: 'sandale|sandal|nu pied|tong|claquette|espadrille',
  chaussettes: 'chaussette|sock|collant',
  casquette: 'casquette|cap|snapback',
  bonnet: 'bonnet|beanie|cagoule',
  /* ── Vêtements ── */
  tshirt: 't shirt|tee shirt|tshirt|tee|top|haut|body',
  polo: 'polo',
  chemise: 'chemise|chemisier|blouse|tunique|shirt',
  debardeur: 'debardeur|marcel|caraco|tank',
  pull: 'pull|pullover|sweater|tricot|gilet|cardigan|maille',
  sweat: 'sweat|sweat shirt|sweatshirt|hoodie|capuche|capuchon',
  veste: 'veste|blazer|blouson|perfecto|bomber|jacket|jackett',
  manteau: 'manteau|parka|caban|coat',
  trench: 'trench|tranch|trenche|impermeable|imper',
  cape: 'cape|poncho',
  doudoune: 'doudoune|dodon|puffer',
  gilet_doudoune: 'gilet doudoune|doudoune sans manche|bodywarmer|vest',
  costume: 'costume|tailleur|smoking|suit',
  ensemble: 'ensemble|coord|co ord|two piece',
  ensemble_jean: 'ensemble jean|ensemble denim',
  survetement: 'survetement|survette|survet|jogging|tracksuit|ensemble jogging',
  robe: 'robe|dress|gown',
  jupe: 'jupe|skirt',
  pantalon: 'pantalon|chino|jogger|legging|sarouel|cargo|trouser|pant',
  jean: 'jean|denim',
  short: 'short|bermuda',
  combinaison: 'combinaison|combi|salopette|jumpsuit',
  /* ── Accessoires, sacs, bijoux ── */
  cravate: 'cravate|noeud papillon|tie',
  echarpe: 'echarpe|snood|scarf',
  gants: 'gant|mitaine|glove',
  ceinture: 'ceinture|belt',
  sac_main: 'sac main|handbag',
  sac: 'sac|besace|bandouliere|bag',
  cabas: 'cabas|panier|tote|shopping',
  pochette: 'pochette|clutch|minaudiere|trousse',
  sac_dos: 'sac dos|backpack|cartable',
  portefeuille: 'portefeuille|porte monnaie|porte carte|wallet|cardholder',
  valise: 'valise|bagage|trolley|suitcase',
  parapluie: 'parapluie|umbrella',
  chapeau: 'chapeau|panama|fedora|capeline|bob|hat',
  lunettes: 'lunette|solaire|sunglasse|glasse',
  montre: 'montre|watch',
  parfum: 'parfum|eau toilette|musc|oud|perfume|fragrance',
  collier: 'collier|pendentif|chaine|sautoir|necklace',
  bracelet: 'bracelet|jonc|gourmette|manchette',
  bague: 'bague|alliance|anneau|ring',
  boucles: 'boucle oreille|creole|puce oreille|earring',
  /* ── Maison : bougies et parfum d'intérieur ── */
  bougie: 'bougie|candle|lodge|max10|max16|max24|cire',
  diffuseur: 'diffuseur|diffuser|brume|parfum interieur|recharge diffuseur',
  diffuseur_voiture: 'diffuseur voiture|car diffuseur|car diffuser|parfum voiture',
  coffret: 'coffret|giftbox|gift box|box',
  eteignoir: 'eteignoir|snuffer',
  coupe_meche: 'coupe meche|wick trimmer|trimmer',
  cloche: 'cloche|dome|globe',
  bougeoir: 'bougeoir|chandelier|photophore|porte bougie|candle holder',
  /* ── Maison : table et décoration ── */
  assiette: 'assiette|plate|plat',
  bol: 'bol|bowl|saladier',
  tasse: 'tasse|mug|cup',
  verre: 'verre|glass|gobelet',
  carafe: 'carafe|pichet|decanter',
  coupe: 'coupe|coupelle|compotier',
  plateau: 'plateau|tray',
  miroir: 'miroir|mirror',
  vase: 'vase|soliflore',
  coussin: 'coussin|cushion',
  plaid: 'plaid|jete|throw|couverture',
  /* ── Divers ── */
  tag: 'carte cadeau|bon achat|etiquette|gift card',
  cintre: 'cintre|hanger',
};

export const PHOTO_KEYS = Object.keys(WORDS);
const KNOWN = new Set(PHOTO_KEYS);
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'd', 'l', 'en', 'et', 'pour', 'avec', 'sans', 'the', 'of', 'for', 'and', 'with']);

/* Minuscules, sans accents ni ponctuation, pluriel simple retiré : « Boucles
   d'oreilles » et « boucle oreille » donnent les mêmes mots. */
export function nameTokens(name) {
  return String(name == null ? '' : name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim().split(' ')
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && /[a-z][sx]$/.test(t) ? t.slice(0, -1) : t));
}

let index = null;
const entries = () => index || (index = Object.entries(WORDS).flatMap(([key, list]) =>
  list.split('|').map((word) => ({ key, toks: nameTokens(word) })).filter((e) => e.toks.length)));

/* La clé photo que le nom désigne, ou null. */
export function keyForName(name) {
  const toks = nameTokens(name);
  if (!toks.length) return null;
  let best = null;
  for (const e of entries()) {
    let pos = Infinity;
    if (!e.toks.every((t) => { const i = toks.indexOf(t); if (i < 0) return false; pos = Math.min(pos, i); return true; })) continue;
    if (!best || e.toks.length > best.n || (e.toks.length === best.n && pos < best.pos)) best = { key: e.key, n: e.toks.length, pos };
  }
  return best && best.key;
}

/* La clé photo d'un produit, ou d'une clé d'icône passée telle quelle (le
   sélecteur de la fiche). `fallback` : la photo neutre de la caisse. */
export function photoKey(p, fallback = DEFAULT_KEY) {
  const neutral = KNOWN.has(fallback) ? fallback : DEFAULT_KEY;
  if (typeof p === 'string') return KNOWN.has(p) ? p : neutral;
  const art = p && p.art;
  return keyForName(p && p.name) || (art !== FORM_DEFAULT && KNOWN.has(art) ? art : neutral);
}

export const photoSrc = (key) => `assets/retail-photos/${KNOWN.has(key) ? key : DEFAULT_KEY}.webp?v=${PHOTOS_V}`;

/* L'image d'un produit, sans texte alternatif : le nom est écrit à côté.
   `cls` est la classe de la caisse (bq-art-photo, mz-art-photo). */
export const photoImg = (p, cls = 'bq-art-photo', fallback = DEFAULT_KEY) =>
  `<img class="${cls}" src="${photoSrc(photoKey(p, fallback))}" alt="" loading="lazy" decoding="async" draggable="false">`;
