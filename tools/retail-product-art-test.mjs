/* The boutique and Maison tills' product pictures. Since 28 October 2026 they
 * are cut-out photographs (assets/retail-photos/<key>.webp, 128 px), made the
 * same way as the restaurant's dishes, replacing two copies of 57 line
 * drawings that looked pale next to them (owner).
 *
 * What this holds: every key has its file and every file a key; the name
 * picks the photo first, like the restaurant and pressing tills, then a
 * hand-picked icon (not the T-shirt the form proposes by default), then the
 * till's neutral photo; and every product name the real boutique and Maison
 * merchants had on 28 October 2026 (Santos Store, La Maison en Vogue,
 * Maison 121) lands on the right piece. How the two tills are wired to it is
 * read in retail-photos-wiring-test.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PHOTO_KEYS, PHOTO_FILES, COLOURS, COLOUR_KEYS, DEFAULT_KEY, PHOTOS_V, photoKey, photoFile, colourOf, keyForName, photoImg, photoSrc, nameTokens } from '../assets/retail-photos.js';

let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

/* Files and keys, one for one. */
const files = fs.readdirSync(new URL('../assets/retail-photos/', import.meta.url)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
eq(JSON.stringify(files), JSON.stringify([...PHOTO_FILES].sort()), 'every photo (each piece, and each piece in each of its colours) has its .webp, and every .webp is used');
for (const k of COLOUR_KEYS) ok(PHOTO_KEYS.includes(k), k + ' is a piece before it is a colour');
ok(PHOTO_KEYS.includes(DEFAULT_KEY) && PHOTO_KEYS.includes('tag'), 'both neutral photos exist');
for (const f of files) ok(fs.statSync(new URL('../assets/retail-photos/' + f + '.webp', import.meta.url)).size < 16000, f + '.webp stays small');

/* Which picture a product gets. */
eq(photoKey({ name: 'Hoodie Blue', art: 'chemise' }), 'sweat', 'the name wins over a mis-picked icon');
eq(photoKey({ name: 'Robe lin', art: 'tshirt' }), 'robe', 'the default T-shirt lets the name decide');
eq(photoKey({ name: 'Article 42', art: 'caftan' }), 'caftan', 'a hand-picked icon speaks when the name does not');
eq(photoKey({ name: 'A71030TA', art: 'tshirt' }), DEFAULT_KEY, 'the form default T-shirt is not a choice');
eq(photoKey({ name: 'A71030TA', art: 'tshirt' }, 'tag'), 'tag', 'the Maison neutral photo');
eq(photoKey({ name: 'Article 42', art: 'disparu' }), DEFAULT_KEY, 'an unknown icon key never renders blank');
eq(photoKey(null), DEFAULT_KEY, 'no product: the neutral photo');
eq(photoKey('polo'), 'polo', 'a key passed as such (the picker)');
eq(photoKey('tshirt'), 'tshirt', 'the picker still shows the T-shirt');
eq(photoKey('nope', 'tag'), 'tag', 'an unknown key passed as such');

/* Every product name the real merchants had on 28 October 2026, and the
   piece it must show. A bare stock code says nothing: null. */
const real = {
  /* Santos Store */
  'Manteau cape': 'manteau', 'ensemble vercase': 'ensemble', 'Chemise P': 'chemise', 'veste classe': 'veste',
  'Ensemble Classe': 'ensemble', 'Manteau Cachemire': 'manteau', 'survette': 'survetement', 'Trench': 'trench',
  'bomber': 'veste', 'ensemble jean': 'ensemble_jean', 'robe jean': 'robe', 'jacket dodon': 'veste',
  'Ensemble en maille': 'ensemble', 'ensemble jupe en maille': 'ensemble', 'pantalon classe': 'pantalon',
  'jean': 'jean', 'jogging': 'jogging', 'Trenche cuir': 'trench', 'Mini Trench': 'trench',
  'manteau fourrure': 'manteau', 'tranch': 'trench', 'Top': 'top', 'trench  barry': 'trench',
  'trench rebecca': 'trench', 'trench seven': 'trench', 'manteau leopard': 'manteau',
  'ensemble en maille avec strass': 'ensemble', 'ensemble jogging pailleté': 'survetement', 'manteau Flam': 'manteau',
  'Capuchon adidas': 'sweat', 'Ensemble jean raye': 'ensemble_jean', 'cape avec ceinture': 'cape', 'jupe daim': 'jupe',
  'Ensemble avec ceinture': 'ensemble', 'veste boutonnée': 'veste', 'Cardigan': 'cardigan', 'Cardigan court': 'cardigan',
  /* La Maison en Vogue */
  'Giftbox Gentelmen': 'coffret', 'Giftbox platinium': 'coffret', 'Giftbox tomorrowland 2026': 'coffret',
  'Stone marble max24': 'bougie', 'Lodge stone marble': 'bougie', 'Stone lazuli max10': 'bougie',
  'Arabian nights max16': 'bougie', 'Lodge Arabian nights': 'bougie', 'Encre de chine max24': 'bougie',
  'Sand siloli max10': 'bougie', 'Black pearls max24': 'bougie', 'White pearls max10': 'bougie',
  'MFB Diffuseur tomorrowland 2026': 'diffuseur', 'Car diffuseur black pearls': 'diffuseur_voiture',
  'Car diffuseur platinum': 'diffuseur_voiture', 'Snuffer': 'eteignoir', 'Wick trimmer': 'coupe_meche',
  'Cloche max10': 'cloche', 'Stone agate max24': 'bougie', 'Paloma max16': 'bougie',
  'M-1-23': null, 'A71030TA': null, '50666-Chariot': null,
  /* Maison 121 */
  'T-Shirt Slim Fit': 'tshirt', 'Polo Stretch': 'polo', 'Tracksuit Jackett / Pants': 'survetement',
  'Classic Pants': 'pantalon', 'Reversible Vest 121': 'gilet_doudoune', 'Linen Pants': 'pantalon',
  'Stretch Shorts': 'short', 'Tracksuit Polo / Short': 'survetement', 'Linen Shirt': 'chemise',
  'Pantalon Classic G': 'pantalon', 'Jackett V': 'veste', 'POLO long sleeve': 'polo', 'GILET': 'cardigan',
  'HUGO BOSS Casquette': 'casquette', 'Jackett Capuche Double Face': 'veste', 'Shorts PP': 'short',
  'T Shirt Oversize': 'tshirt', 'Gilet doudoune': 'gilet_doudoune', 'Jacket PP': 'veste',
  /* Amira Boutique (owner's test shop) */
  'Black jean': 'jean', 'Normal Shirt': 'chemise', 'Hoodie Gris': 'sweat', 'costume noir': 'costume',
};
for (const [name, key] of Object.entries(real)) eq(keyForName(name), key, `« ${name} » → ${key}`);

/* The colour (owner's partner, 28 October 2026: « no black hoodie, or black
   jeans »). The sold colour first, then a word of the name, then the
   product's colours; a lone grey is the catalogue's default, not a colour. */
const colour = {
  /* Amira Boutique, as the partner saw it */
  'Black jean|noir': 'jean-noir', 'Jean White|marron': 'jean-blanc', 'Hoodie Blue|bleu': 'sweat-bleu',
  'Hoodie Gris|gris': 'sweat-gris', 'costume noir|noir,blanc': 'costume-noir', 'Normal Shirt|blanc,violet': 'chemise-blanc',
  /* Maison 121, the products without their own photo */
  'POLO long sleeve|beige,marron': 'polo-beige', 'HUGO BOSS Casquette|noir': 'casquette-noir',
  'Jackett Capuche Double Face|rouge,vert,bleu': 'veste-rouge', 'Pantalon 121|noir': 'pantalon-noir',
  'Shorts PP|noir': 'short-noir', 'T shirt 121|beige,noir,gris': 'tshirt-beige', 'T Shirt Oversize|marron,beige': 'tshirt-marron',
  'Gilet doudoune|marron,beige,bleu': 'gilet_doudoune-marron', 'Jacket PP|noir': 'veste-noir',
  /* Santos Store: « multi » says nothing, a real colour does */
  'survette|multi,blanc,rouge': 'survetement-blanc', 'jean|multi,bleu': 'jean-bleu', 'Trench|vert': 'trench-vert',
  'Ensemble avec ceinture|bleu': 'ensemble-bleu', 'Manteau Cachemire|multi': 'manteau', 'manteau leopard|beige': 'manteau-beige',
  'Ensemble jean raye|bleu': 'ensemble_jean', 'jupe daim|jaune': 'jupe', 'Top|multi': 'top',
  /* the catalogue's default grey, and names in other words */
  'jean|gris': 'jean', 'Sweat capuche kahla|': 'sweat-noir', 'Pull bordeaux|': 'pull-rouge', 'Polo navy|': 'polo-bleu',
  'Manteau camel|': 'manteau-marron', 'Bougie noire|noir': 'bougie',
  /* the Moroccan pieces sold in many colours */
  'Djellaba homme|bleu': 'djellaba-bleu', 'Jellaba femme brodée rose|': 'djellaba_femme-rose', 'Abaya noire|': 'abaya-noir',
  'Hijab jersey|beige': 'hijab-beige', 'Burkini|marine': 'burkini-bleu', 'Caftan vert émeraude|': 'caftan-vert',
  'Babouche cuir homme|marron': 'babouche-marron', 'Gandoura blanche|': 'gandoura-blanc', 'Jabador bordeaux|': 'jabador-rouge',
  'Caftan velours|rouge': 'caftan_velours', 'Savon noir|': 'savon_noir', 'Djellaba|jaune': 'djellaba',
};
for (const [spec, file] of Object.entries(colour)) {
  const [name, cs] = spec.split('|');
  eq(photoFile({ name, colors: cs ? cs.split(',') : [] }), file, `« ${name} » (${cs || 'no colour'}) → ${file}`);
}
eq(photoFile({ name: 'Hoodie', colors: ['gris'] }, 'cintre', 'noir'), 'sweat-noir', 'a ticket line shows the colour sold');
eq(photoFile({ name: 'Hoodie Blue' }, 'cintre', 'violet'), 'sweat', 'a colour without its photo keeps the plain piece');
eq(photoFile('jean'), 'jean', 'the picker shows the plain piece');
eq(colourOf({ name: 'Robe', colors: ['emeraude', 'nuit'] }), 'vert', 'the demo shades fold into palette families');
eq(COLOURS.length * COLOUR_KEYS.length + PHOTO_KEYS.length, PHOTO_FILES.length, 'one photo per piece and per colour');
ok(photoImg({ name: 'Black jean' }).includes('retail-photos/jean-noir.webp'), 'the tile shows black jeans');

/* A broad sample of shop names, French first. */
const sample = {
  'Caftan Velours': 'caftan_velours', 'Caftan soirée perlé': 'caftan_perle', 'Takchita Mariage': 'takchita_mariage',
  'Takchita Zellige': 'takchita', 'Djellaba homme laine': 'djellaba', 'Ceinture caftan dorée': 'mdamma',
  'Ceinture cuir': 'ceinture', 'Babouche brodée femme': 'babouche_brodee', 'Babouches enfant': 'babouche_enfant',
  'Cherbil perlé': 'cherbil', 'Tee-shirt oversize': 'tshirt', 'Sweat-shirt à capuche': 'sweat',
  'Chemise en jean': 'chemise', 'Veste en jean': 'veste', 'Short en jean': 'short', 'Combinaison pantalon': 'combinaison',
  'Doudoune légère': 'doudoune', 'Sac à main cuir': 'sac_main', 'Sac à dos toile': 'sac_dos', 'Porte-monnaie cuir': 'portefeuille',
  'Boucles d\'oreilles dorées': 'boucles', 'Lunettes de soleil': 'lunettes', 'Eau de parfum 100 ml': 'parfum',
  'Hijab jersey': 'hijab', 'Chaussettes coton x3': 'chaussettes', 'Escarpins vernis': 'escarpin',
  'Carte cadeau 500': 'tag', 'Bougie parfumée ambre': 'bougie', 'Coffret cadeau': 'coffret', 'Plaid laine': 'plaid',
  'Assiettes plates x6': 'assiette', 'Verres à thé': 'verre_the', 'Verre à eau': 'verre', 'Plateau laiton': 'plateau', 'Miroir rond': 'miroir',
  /* the souk and modest wear (owner, 28 October 2026: « djellabas, burkinis ») */
  'Jellaba femme brodée': 'djellaba_femme', 'Djellaba enfant laine': 'djellaba_enfant', 'Caftan fille': 'caftan_enfant',
  'Abaya Dubai': 'abaya', 'Voile mousseline': 'hijab', 'Burkini 3 pièces': 'burkini', 'Maillot de bain une pièce': 'maillot',
  'Tunique longue lin': 'tunique', 'Seroual coton': 'sarwal', 'Kimono long': 'kimono', 'Gilet brodé homme': 'gilet_brode',
  'Gilet laine': 'cardigan', 'Chèche touareg': 'chech', 'Melhfa sahraouie': 'melhfa', 'Fibule berbère argent': 'khlala',
  'Kessa hammam': 'kessa', 'Gant de gommage': 'kessa', 'Ghassoul 250 g': 'ghassoul', 'Savon beldi eucalyptus': 'savon_noir',
  'Henné naturel': 'henne', 'Huile d\'argan bio': 'argan', 'Bkhour oud': 'bkhour', 'Tapis Beni Ourain': 'tapis',
  'Zarbia 2x3': 'tapis', 'Pouf cuir': 'pouf', 'Lanterne cuivre': 'lanterne', 'Théière argentée': 'theiere',
  'Berrad 1 L': 'theiere', 'Plat à tajine': 'tajine', 'Panier doum': 'panier', 'Cabas plage': 'cabas',
  'Coussin berbère': 'coussin', 'Bougeoir laiton': 'bougeoir', 'Costume trois pièces': 'costume', 'قفطان مغربي': 'caftan',
  /* 30 October 2026: shoes, underwear, children, small accessories, and the
     Maison table, kitchen, linen and decor (the starter templates' own names) */
  'Mocassin cuir marron': 'mocassin', 'Derby noir': 'derby', 'Ballerines nœud': 'ballerine', 'Mules talon bloc': 'mule',
  'Espadrilles marine': 'espadrille', 'Tongs plage': 'tong', 'Claquettes piscine': 'claquette', 'Bottines daim': 'bottine',
  'Sabots blancs': 'sabot', 'Chaussure running': 'running', 'Sandale compensée': 'compensee', 'Chaussons bébé': 'chaussure_bebe',
  'Pantoufles': 'chausson', 'Chemisier soie': 'chemisier', 'Crop top côtelé': 'crop_top', 'Body manches longues': 'body',
  'Gilet sans manches': 'gilet', 'Pull col roulé': 'col_roule', 'Legging noir': 'legging', 'Pantalon cargo': 'cargo',
  'Salopette denim': 'salopette', 'Blazer marine': 'blazer', 'Perfecto cuir': 'blouson_cuir', 'Parka capuche': 'parka',
  'Pyjama rayé': 'pyjama', 'Nuisette dentelle': 'chemise_nuit', 'Soutien-gorge dentelle': 'soutien_gorge', 'Boxer coton': 'boxer',
  'Bikini corail': 'bikini', 'Maillot de bain': 'maillot', 'Robe de chambre': 'peignoir', 'Khimar long': 'khimar',
  'Body bébé': 'body_bebe', 'Grenouillère étoiles': 'grenouillere', 'Robe fille tulle': 'robe_fille', 'Ensemble garçon': 'ensemble_enfant',
  'Nœud papillon satin': 'noeud_papillon', 'Bretelles cuir': 'bretelles', 'Boutons de manchette': 'boutons_manchette',
  'Pochette de costume': 'pochette_costume', 'Sac banane': 'sac_banane', 'Sac bandoulière': 'sac_bandouliere', 'Cartable école': 'cartable',
  'Porte-cartes cuir': 'porte_cartes', 'Porte-clés': 'porte_cles', 'Chouchous velours': 'chouchou', 'Barrette perles': 'barrette',
  'Collants voile': 'collants', 'Pendentif or': 'pendentif', 'Collier perles': 'collier', 'Mallette cuir': 'porte_documents', 'Sac de sport': 'sac_sport',
  'Plat de service ovale 40 cm': 'plat', 'Ménagère 24 couverts inox': 'couvert', 'Seau à glace en verre': 'seau',
  'Encens & porte-encens laiton': 'encens', 'Photophore verre ciselé': 'photophore', 'Cadre photo bois de cèdre': 'cadre',
  'Boîte à bijoux nacrée': 'boite', 'Nappe brodée main': 'nappe', 'Set de table tissé (lot de 6)': 'set_table',
  'Serviettes de table (lot de 6)': 'serviette', 'Suspension raphia 45 cm': 'suspension', 'Lampe à poser céramique': 'lampe',
  'Tabouret cuir tressé': 'tabouret', 'Guéridon bois sculpté': 'gueridon', 'Assiette creuse 22 cm': 'assiette_creuse',
  'Flûtes à champagne (set de 6)': 'flute', 'Mug céramique': 'mug', 'Saladier bois': 'saladier', 'Pichet émaillé': 'pichet',
  'Sucrier porcelaine': 'sucrier', 'Salière et poivrier': 'saliere', 'Corbeille à pain': 'corbeille', 'Chemin de table': 'chemin_table',
  'Sous-assiette dorée': 'sous_assiette', 'Assiette à dessert': 'assiette_dessert', 'Ramequins (lot de 4)': 'ramequin',
  'Plat à four': 'plat_four', 'Soupière': 'soupiere', 'Saucière': 'sauciere', 'Beurrier verre': 'beurrier', 'Coquetier': 'coquetier',
  'Présentoir à gâteau': 'presentoir', 'Fourchettes (lot de 6)': 'fourchette', 'Couteau à steak': 'couteau', 'Cuillères à soupe': 'cuillere',
  'Petites cuillères': 'petite_cuillere', 'Couverts à salade': 'couverts_salade', 'Pelle à tarte': 'pelle_tarte', 'Louche inox': 'louche',
  'Porte-couteaux': 'porte_couteau', 'Cafetière à piston': 'cafetiere', 'Cafetière italienne': 'cafetiere_italienne',
  'Bouilloire rétro': 'bouilloire', 'Boîte à thé': 'boite_the', 'Tasses expresso': 'tasse_expresso', 'Soucoupe': 'soucoupe',
  'Mbakhra laiton': 'mijmar', 'Samovar': 'samovar', 'Verre à pied': 'verre_pied', 'Gobelets': 'gobelet', 'Bocal hermétique': 'bocal',
  'Huilier verre': 'huilier', 'Sous-verres liège': 'sous_verre', 'Pot à miel': 'pot_miel', 'Casserole inox': 'casserole',
  'Poêle 28 cm': 'poele', 'Couscoussier': 'couscoussier', 'Planche à découper': 'planche', 'Passoire': 'passoire', 'Tablier lin': 'tablier',
  'Gant de four': 'gant_four', 'Boîte de conservation': 'boite_conservation', 'Boîte à épices': 'boite_epices',
  'Housse de couette': 'housse_couette', 'Drap housse': 'drap', 'Oreiller': 'oreiller', 'Serviette de bain': 'serviette_bain',
  'Rideau lin': 'rideau', 'Torchons (lot de 3)': 'torchon', 'Tapis de bain': 'tapis_bain', 'Tapis berbère': 'tapis',
  'Horloge murale': 'horloge', 'Statuette bois': 'statuette', 'Plante monstera': 'plante', 'Cache-pot jonc': 'cache_pot',
  'Tableau abstrait': 'tableau', 'Vide-poche cuir': 'vide_poche', 'Corbeille à fruits': 'coupe_fruits', 'Bougies chauffe-plat': 'chauffe_plat',
  'Cendrier verre': 'cendrier', 'Carreau zellige': 'zellige', 'Boules déco rotin': 'boule_deco', 'Bougeoir laiton': 'bougeoir'
};
for (const [name, key] of Object.entries(sample)) eq(keyForName(name), key, `« ${name} » → ${key}`);
eq(keyForName(''), null, 'an empty name says nothing');
eq(JSON.stringify(nameTokens("Boucles d'oreilles")), JSON.stringify(['boucle', 'oreille']), 'accents, elisions and plurals fold');

/* The markup: no alt text (the name sits next to it), versioned URL. */
const img = photoImg({ name: 'Robe lin', art: 'tshirt' });
ok(img.includes('src="assets/retail-photos/robe.webp?v=' + PHOTOS_V + '"'), 'the photo URL carries its version');
ok(/alt=""/.test(img) && /class="bq-art-photo"/.test(img), 'decorative image, the boutique class by default');
ok(photoImg('bougie', 'mz-art-photo').includes('class="mz-art-photo"'), 'the Maison class');
eq(photoSrc('nope'), 'assets/retail-photos/' + DEFAULT_KEY + '.webp?v=' + PHOTOS_V, 'an unknown key resolves to the hanger');

console.log(`✓ retail product photos: ${n} checks`);
