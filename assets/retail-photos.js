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
   Une photo choisie à la main dans la fiche du tableau de bord (`artPicked`,
   assets/retail-icon-picker.js) passe devant le nom : le commerçant l'a vue
   et l'a voulue. Les fiches d'avant n'ont pas ce drapeau et gardent la règle.
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
  gandoura: 'gandoura|gandora|qamis|kamis',
  jabador: 'jabador|jabadour',
  selham: 'selham|burnous|bournous',
  tarbouche: 'tarbouche|tarbouch|fez|chechia',
  mdamma: 'mdamma|mdama|ceinture caftan|ceinture doree',
  foulard: 'foulard|carre soie|bandana|sebniya|sabniya',
  chale: 'chale|etole|pashmina|shawl',
  broche: 'broche|brooch|epingle|bijou',
  babouche: 'babouche|belgha|balgha|bolgha|بلغة',
  babouche_brodee: 'babouche brodee|babouche femme',
  cherbil: 'cherbil|charbil|chrabel',
  babouche_enfant: 'babouche enfant|babouche bebe',
  djellaba_femme: 'djellaba femme|jellaba femme|djellaba brodee|jellaba brodee|jellaba sfifa|djellaba sfifa',
  djellaba_enfant: 'djellaba enfant|jellaba enfant|djellaba bebe|jellaba bebe|djellaba garcon|jellaba garcon',
  caftan_enfant: 'caftan enfant|caftan fille|caftan bebe|kaftan enfant',
  gilet_brode: 'gilet brode|gilet traditionnel|gilet marocain|bdaia|bedaia',
  sarwal: 'sarwal|seroual|sarouel|serwal|kandrissi|qandrissi',
  chech: 'cheche|chech|chache|cheich|turban',
  melhfa: 'melhfa|mlahfa|malhfa|haik',
  khlala: 'khlala|fibule|tizerzai|bijou berbere',
  /* ── Mode pudique, bain ── */
  abaya: 'abaya|abaya femme|عباية',
  hijab: 'hijab|voile|turban femme|حجاب',
  burkini: 'burkini|burqini|maillot couvrant|maillot integral|maillot islamique|بوركيني',
  tunique: 'tunique|tunic',
  kimono: 'kimono',
  maillot: 'maillot bain|swimsuit|monokini',
  /* ── Chaussures, couvre-chef ── */
  chaussures: 'chaussure|soulier|shoe',
  basket: 'basket|sneaker|tennis|trainer',
  botte: 'botte|boot',
  sandale: 'sandale|sandal|nu pied',
  chaussettes: 'chaussette|sock',
  casquette: 'casquette|cap|snapback',
  bonnet: 'bonnet|beanie|cagoule',
  /* ── Vêtements ── */
  tshirt: 't shirt|tee shirt|tshirt|tee|haut',
  polo: 'polo',
  chemise: 'chemise|shirt',
  debardeur: 'debardeur|marcel|caraco|tank',
  pull: 'pull|pullover|sweater|tricot|maille',
  sweat: 'sweat|sweat shirt|sweatshirt|hoodie|capuche|capuchon',
  veste: 'veste|bomber|jacket|jackett',
  manteau: 'manteau|caban|coat',
  trench: 'trench|tranch|trenche|impermeable|imper',
  cape: 'cape|poncho',
  doudoune: 'doudoune|dodon|puffer',
  gilet_doudoune: 'gilet doudoune|doudoune sans manche|bodywarmer|vest',
  costume: 'costume|tailleur|smoking|suit',
  ensemble: 'ensemble|coord|co ord|two piece',
  ensemble_jean: 'ensemble jean|ensemble denim',
  survetement: 'survetement|survette|survet|tracksuit|ensemble jogging',
  robe: 'robe|dress|gown',
  jupe: 'jupe|skirt',
  pantalon: 'pantalon|chino|trouser|pant',
  jean: 'jean|denim',
  short: 'short|bermuda',
  combinaison: 'combinaison|combi|jumpsuit',
  /* ── Accessoires, sacs, bijoux ── */
  cravate: 'cravate|tie',
  echarpe: 'echarpe|snood|scarf',
  gants: 'gant|mitaine|glove',
  ceinture: 'ceinture|belt',
  sac_main: 'sac main|handbag',
  sac: 'sac|bag',
  cabas: 'cabas|tote|shopping',
  pochette: 'pochette|clutch|minaudiere|trousse',
  sac_dos: 'sac dos|backpack',
  portefeuille: 'portefeuille|porte monnaie|wallet',
  valise: 'valise|bagage|trolley|suitcase',
  parapluie: 'parapluie|umbrella',
  chapeau: 'chapeau|panama|fedora|capeline|bob|hat',
  lunettes: 'lunette|solaire|sunglasse|glasse',
  montre: 'montre|watch',
  parfum: 'parfum|eau toilette|musc|oud|perfume|fragrance',
  collier: 'collier|chaine|sautoir|necklace',
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
  bougeoir: 'bougeoir|chandelier|porte bougie|candle holder',
  /* ── Maison : table et décoration ── */
  assiette: 'assiette|plate',
  bol: 'bol|bowl',
  tasse: 'tasse|cup',
  verre: 'verre|glass',
  carafe: 'carafe|decanter',
  coupe: 'coupe|coupelle',
  plateau: 'plateau|tray',
  miroir: 'miroir|mirror',
  vase: 'vase|soliflore',
  coussin: 'coussin|cushion',
  plaid: 'plaid|jete|throw|couverture',
  /* ── Souk : hammam, beauté, maison marocaine ── */
  kessa: 'kessa|kassa|gant hammam|gant gommage',
  ghassoul: 'ghassoul|rhassoul|ghasoul',
  savon_noir: 'savon noir|savon beldi|sabon beldi|savon',
  henne: 'henne|henna|hena|حناء',
  argan: 'argan|huile argan',
  bkhour: 'bkhour|bakhour|bkhor',
  tapis: 'tapis|zarbia|kilim|boucherouite|beni ourain|rug',
  pouf: 'pouf|pouffe',
  lanterne: 'lanterne|fanous|lampe marocaine|lantern',
  theiere: 'theiere|berrad|brrad|teapot',
  tajine: 'tajine|tagine|tajin|plat tajine',
  verre_the: 'verre the|verre beldi|kass|tea glass',
  panier: 'panier|doum|couffin',
  /* Pièces ajoutées le 30 octobre 2026 : les mots les plus précis
     quittent la pièce générale (« mocassin » n'est plus une chaussure
     quelconque, « photophore » n'est plus un bougeoir). */
  /* ── Chaussures ── */
  mocassin: 'mocassin|loafer',
  derby: 'derby|richelieu|oxford',
  escarpin: 'escarpin|talon|heel|pump',
  ballerine: 'ballerine|ballet flat',
  mule: 'mule',
  espadrille: 'espadrille',
  tong: 'tong|flip flop|claquette doigt',
  claquette: 'claquette|slide|claquette piscine',
  bottine: 'bottine|chelsea|ankle boot|boots cheville',
  sabot: 'sabot|clog|crocs',
  running: 'running|chaussure running|chaussure sport|chaussure course|trail',
  compensee: 'compensee|wedge|sandale compensee|chaussure compensee',
  chausson: 'chausson|pantoufle|charentaise|slipper',
  chaussure_bebe: 'chaussure bebe|chausson bebe|premier pas|baby shoe',
  /* ── Vêtements ── */
  chemisier: 'chemisier|blouse',
  top: 'top',
  crop_top: 'crop top|crop',
  body: 'body',
  cardigan: 'cardigan|gilet|gilet maille|gilet laine',
  gilet: 'gilet sans manche|pull sans manche|gilet costume|waistcoat',
  col_roule: 'col roule|roule|turtleneck|sous pull',
  legging: 'legging',
  jogging: 'jogging|jogger|sweatpant|bas survetement|pantalon jogging',
  salopette: 'salopette|overall|dungaree',
  cargo: 'cargo|pantalon cargo',
  blazer: 'blazer|veston|veste costume',
  blouson_cuir: 'blouson|perfecto|biker|veste cuir|blouson cuir',
  parka: 'parka|anorak',
  /* ── Nuit, lingerie, bain, enfant ── */
  pyjama: 'pyjama|pijama',
  chemise_nuit: 'chemise nuit|nuisette|nightgown|nightdress',
  soutien_gorge: 'soutien gorge|soutif|bra',
  boxer: 'boxer|slip|calecon|underwear',
  bikini: 'bikini|maillot deux piece',
  peignoir: 'peignoir|robe chambre|sortie bain|bathrobe',
  khimar: 'khimar|jilbab|خمار',
  body_bebe: 'body bebe|body naissance|onesie',
  grenouillere: 'grenouillere|pyjama bebe|dors bien|sleepsuit',
  ensemble_enfant: 'ensemble enfant|ensemble garcon|ensemble fille|tenue enfant',
  robe_fille: 'robe fille|robe enfant|robe bebe|robe princesse',
  /* ── Accessoires et sacs ── */
  noeud_papillon: 'noeud papillon|papillon|bow tie',
  bretelles: 'bretelle|suspender',
  boutons_manchette: 'bouton manchette|cufflink',
  pochette_costume: 'pochette costume|pochette poche|pocket square',
  chouchou: 'chouchou|scrunchie|elastique cheveux',
  barrette: 'barrette|pince cheveux|epingle cheveux|hair clip',
  collants: 'collant|tights|bas collant|bas nylon',
  pendentif: 'pendentif|pendant|medaille',
  porte_cles: 'porte cle|porte clef|keyring|keychain',
  sac_banane: 'sac banane|banane|banana|fanny pack|belt bag',
  sac_bandouliere: 'bandouliere|sac bandouliere|besace|crossbody',
  cartable: 'cartable|sac ecole|school bag',
  porte_cartes: 'porte carte|cardholder|card holder',
  porte_documents: 'porte document|mallette|attache case|briefcase|cartable cuir',
  sac_sport: 'sac sport|sac gym|sac voyage|duffel|polochon',
  /* ── Maison : bougies, encens ── */
  photophore: 'photophore|lumignon|tealight holder',
  encens: 'encens|porte encens|baton encens|incense',
  mijmar: 'mijmar|mbakhra|mbekhra|mabkhara|encensoir|brule encens|brule parfum',
  chauffe_plat: 'chauffe plat|bougie chauffe plat|tealight|tea light',
  /* ── Maison : table, vaisselle, couverts ── */
  plat: 'plat|plat service|serving dish',
  couvert: 'couvert|menagere|cutlery|cutlery set',
  saladier: 'saladier|salad bowl',
  saliere: 'saliere|poivriere|poivrier|moulin sel|moulin poivre',
  corbeille: 'corbeille|corbeille pain|panier pain|bread basket',
  sous_assiette: 'sous assiette|charger plate',
  assiette_creuse: 'assiette creuse|assiette soupe|soup plate',
  assiette_dessert: 'assiette dessert|petite assiette|dessert plate',
  ramequin: 'ramequin|ramekin',
  soupiere: 'soupiere|tureen',
  sauciere: 'sauciere|gravy boat',
  beurrier: 'beurrier|butter dish',
  coquetier: 'coquetier|egg cup',
  presentoir: 'presentoir|presentoir gateau|cake stand|plateau etage',
  fourchette: 'fourchette|fork',
  couteau: 'couteau|knife',
  cuillere: 'cuillere|cuiller|spoon|cuillere soupe',
  petite_cuillere: 'petite cuillere|cuillere cafe|cuillere the|teaspoon',
  couverts_salade: 'couvert salade|salad server',
  pelle_tarte: 'pelle tarte|pelle gateau|cake server',
  porte_couteau: 'porte couteau|knife rest',
  coupe_fruits: 'coupe fruit|corbeille fruit|fruit bowl|compotier',
  /* ── Maison : thé, café, verrerie ── */
  sucrier: 'sucrier|sugar bowl',
  seau: 'seau|seau glace|ice bucket|vasque',
  mug: 'mug',
  pichet: 'pichet|cruche|jug|pitcher',
  cafetiere: 'cafetiere|french press|piston|machine cafe',
  cafetiere_italienne: 'cafetiere italienne|moka|bialetti',
  bouilloire: 'bouilloire|kettle',
  boite_the: 'boite the|boite cafe|tea tin',
  tasse_expresso: 'tasse expresso|tasse espresso|tasse cafe|espresso cup',
  soucoupe: 'soucoupe|sous tasse|saucer',
  samovar: 'samovar',
  flute: 'flute|flute champagne|coupe champagne',
  verre_pied: 'verre pied|verre vin|wine glass|calice',
  gobelet: 'gobelet|tumbler|timbale',
  sous_verre: 'sous verre|dessous verre|coaster',
  /* ── Maison : cuisine ── */
  plat_four: 'plat four|plat gratin|moule gratin|baking dish',
  louche: 'louche|ladle',
  bocal: 'bocal|bocaux|pot verre|jar|mason',
  huilier: 'huilier|vinaigrier|bouteille huile|oil cruet',
  pot_miel: 'pot miel|miel|honey',
  casserole: 'casserole|marmite|faitout|saucepan',
  poele: 'poele|wok|frying pan',
  couscoussier: 'couscoussier|keskes|kaskas',
  planche: 'planche|planche decouper|cutting board',
  passoire: 'passoire|egouttoir|colander',
  tablier: 'tablier|apron',
  gant_four: 'gant four|manique|oven mitt',
  boite_conservation: 'boite conservation|tupperware|lunch box|boite repas',
  boite_epices: 'boite epice|epice|spice',
  /* ── Maison : linge ── */
  nappe: 'nappe|tablecloth',
  serviette: 'serviette|serviette table|napkin',
  set_table: 'set table|placemat|napperon',
  chemin_table: 'chemin table|table runner',
  housse_couette: 'housse couette|couette|parure lit|duvet',
  drap: 'drap|drap housse|bed sheet',
  oreiller: 'oreiller|traversin|pillow',
  serviette_bain: 'serviette bain|drap bain|serviette plage|towel',
  rideau: 'rideau|voilage|curtain',
  torchon: 'torchon|essuie|tea towel',
  tapis_bain: 'tapis bain|bath mat',
  /* ── Maison : décoration, mobilier ── */
  cadre: 'cadre|cadre photo|photo frame|frame',
  boite: 'boite|boite bijoux|coffret bijoux|jewellery box|jewelry box',
  suspension: 'suspension|lustre|plafonnier|pendant lamp',
  lampe: 'lampe|lampe poser|lampadaire|abat jour|veilleuse|lamp',
  tabouret: 'tabouret|stool',
  gueridon: 'gueridon|table appoint|bout canape|table basse|side table',
  horloge: 'horloge|pendule|reveil|clock',
  statuette: 'statuette|statue|figurine|sculpture',
  plante: 'plante|monstera|cactus|succulente|plant',
  cache_pot: 'cache pot|pot fleur|pot plante|jardiniere',
  tableau: 'tableau|peinture|affiche|poster|canvas',
  vide_poche: 'vide poche|catch all',
  cendrier: 'cendrier|ashtray',
  zellige: 'zellige|zelige|carreau|tile',
  boule_deco: 'boule deco|boule decorative|boule rotin',
  /* ── Divers ── */
  tag: 'carte cadeau|bon achat|etiquette|gift card',
  cintre: 'cintre|hanger',
};

export const PHOTO_KEYS = Object.keys(WORDS);
/* Les mots qui désignent une pièce, pour la recherche du sélecteur. */
export const wordsOf = (key) => (WORDS[key] || '').split('|');
const KNOWN = new Set(PHOTO_KEYS);
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'd', 'l', 'en', 'et', 'pour', 'avec', 'sans', 'of', 'for', 'and', 'with']);

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
  if (p && p.artPicked && KNOWN.has(art)) return art;
  return keyForName(p && p.name) || (art !== FORM_DEFAULT && KNOWN.has(art) ? art : neutral);
}

/* ── La couleur (owner, 28 octobre 2026 : « pas de hoodie noir, ni de jean
   noir ») ── Les pièces que l'on vend dans plusieurs couleurs ont une photo
   par famille de couleur de la palette (assets/color-palette.js), dans
   assets/retail-photos/<clé>-<couleur>.webp. La couleur vient, dans l'ordre :
   de la ligne du ticket (la couleur vendue), d'un mot du nom (« Black jean »,
   « Hoodie Blue », « costume noir »), puis des couleurs du produit. Un gris
   seul ne compte pas : le catalogue le met d'office quand rien n'est dit.
   Sans couleur connue, ou dans une couleur qui n'a pas sa photo, la photo
   de base reste. */
export const COLOURS = ['noir', 'blanc', 'gris', 'bleu', 'rouge', 'vert', 'beige', 'marron', 'rose'];
export const COLOUR_KEYS = ['tshirt', 'polo', 'chemise', 'sweat', 'pull', 'pantalon', 'jean', 'short', 'veste', 'manteau',
  'trench', 'doudoune', 'gilet_doudoune', 'survetement', 'costume', 'casquette', 'ensemble',
  'djellaba', 'djellaba_femme', 'gandoura', 'abaya', 'hijab', 'burkini', 'caftan', 'babouche', 'jabador'];
const IN_COLOUR = new Set(COLOUR_KEYS);
const COLOUR_WORDS = {
  noir: 'noir|noire|black|nero|negro|k7al|kahla|كحل|أسود',
  blanc: 'blanc|blanche|white|ivoire|ivory|bianco|blanco|byed|أبيض',
  gris: 'gris|grise|grey|gray|anthracite|chine',
  bleu: 'bleu|bleue|blue|navy|marine|nuit|indigo|azur|ciel|turquoise|أزرق',
  rouge: 'rouge|red|bordeaux|burgundy|grenat|cerise|أحمر',
  vert: 'vert|verte|green|kaki|khaki|olive|emeraude|sapin|أخضر',
  beige: 'beige|sable|sand|creme|cream|ecru|nude|بيج',
  marron: 'marron|brown|chocolat|cognac|camel|taupe|caramel|terracotta|بني',
  rose: 'rose|pink|fuchsia|poudre|وردي',
  /* Des familles de la palette sans photo : connues, pour qu'une ligne vendue
     en jaune ne prenne pas le bleu du nom, mais la pièce reste sans couleur. */
  jaune: 'jaune|yellow|moutarde|safran|dore|doree|gold',
  orange: 'orange',
  violet: 'violet|purple|mauve|lilas|prune',
};
const COLOUR_OF = new Map(Object.entries(COLOUR_WORDS).flatMap(([c, list]) => list.split('|').map((w) => [nameTokens(w)[0], c])));
const colourWord = (word) => COLOUR_OF.get(nameTokens(word)[0]) || null;

/* La famille de couleur d'un produit, ou null. */
export function colourOf(p, colour) {
  const given = colour && colourWord(colour);
  if (given) return given;
  if (!p || typeof p !== 'object') return null;
  for (const t of nameTokens(p.name)) { const c = COLOUR_OF.get(t); if (c) return c; }
  const list = (Array.isArray(p.colors) ? p.colors : []).map(colourWord).filter(Boolean);   // « multi » ne dit rien
  if (list.length === 1 && list[0] === 'gris' && p.colors.length === 1) return null;
  return list[0] || null;
}

/* Le fichier photo d'un produit : la pièce, dans sa couleur quand elle l'a. */
export function photoFile(p, fallback = DEFAULT_KEY, colour) {
  const key = photoKey(p, fallback);
  if (!IN_COLOUR.has(key)) return key;
  const c = colourOf(typeof p === 'string' ? null : p, colour);
  return c && COLOURS.includes(c) ? `${key}-${c}` : key;
}

const FILES = new Set([...PHOTO_KEYS, ...COLOUR_KEYS.flatMap((k) => COLOURS.map((c) => `${k}-${c}`))]);
export const PHOTO_FILES = [...FILES];
export const photoSrc = (file) => `assets/retail-photos/${FILES.has(file) ? file : DEFAULT_KEY}.webp?v=${PHOTOS_V}`;

/* L'image d'un produit, sans texte alternatif : le nom est écrit à côté.
   `cls` est la classe de la caisse (bq-art-photo, mz-art-photo), `colour` la
   couleur vendue quand on la connaît (une ligne de ticket). */
export const photoImg = (p, cls = 'bq-art-photo', fallback = DEFAULT_KEY, colour) =>
  `<img class="${cls}" src="${photoSrc(photoFile(p, fallback, colour))}" alt="" loading="lazy" decoding="async" draggable="false">`;
