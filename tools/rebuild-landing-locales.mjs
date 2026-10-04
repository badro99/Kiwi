import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourcePath = 'en/index.html';
const localePaths = ['de/index.html', 'it/index.html', 'nl/index.html'];
const source = fs.readFileSync(sourcePath, 'utf8');

function visibleText(html) {
  const withoutRuntime = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  return [...withoutRuntime.matchAll(/>([^<>]+)</g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

const sourceText = visibleText(source);
const dictionaries = {};

for (const localePath of localePaths) {
  const locale = localePath.split('/')[0];
  // The first localization commit contains the complete reviewed copy. Read
  // that immutable snapshot so repeated rebuilds never translate translations.
  const translated = execFileSync('git', ['show', `bf309397:${localePath}`], { encoding: 'utf8' });
  const translatedText = visibleText(translated);
  if (translatedText.length !== sourceText.length) {
    throw new Error(`${localePath}: expected ${sourceText.length} text nodes, found ${translatedText.length}`);
  }

  const replacements = new Map();
  sourceText.forEach((english, index) => {
    const localized = translatedText[index];
    if (english !== localized && !replacements.has(english)) replacements.set(english, localized);
  });
  dictionaries[locale] = Object.fromEntries(replacements);

  const output = source
    .replace('<html lang="en" dir="ltr">', `<html lang="${locale}" dir="ltr">`)
    .split('https://kiwi-os.com/en/').join(`https://kiwi-os.com/${locale}/`)
    .replace(`hrefLang="en" href="https://kiwi-os.com/${locale}/"`, 'hrefLang="en" href="https://kiwi-os.com/en/"')
    .replace(`\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/${locale}/\\"`, `\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/en/\\"`)
    .replace('</body>', '<script src="/assets/landing-runtime-translations.js" defer></script></body>');
  fs.writeFileSync(localePath, output);
}

// -------------------------------------------------------------
// Spanish (es) - Built from reviewed content/landing-es.json
// -------------------------------------------------------------
const esJsonPath = 'content/landing-es.json';
const esDictionary = JSON.parse(fs.readFileSync(esJsonPath, 'utf8'));
dictionaries['es'] = esDictionary;

const ariaMap = {
  "Kiwi · home": "Kiwi · inicio",
  "Choose language": "Elegir idioma",
  "Open menu": "Abrir menú",
  "The Kiwi dashboard: revenue, orders, average spend, and payment mix for Café Atlas.": "El panel de control de Kiwi: facturación, pedidos, ticket medio y métodos de pago de Café Atlas.",
  "Choose a trade": "Elegir un sector",
  "A restaurant floor plan: a banquette and three tables for two on the left, a round table for six and a table for four in the centre, two tables for two merged under the cursor on the right, a bar, and a door. Each table shows its status · free, waiting, eating, or ready for the bill.": "El plano de una sala: una bancada y tres mesas de dos a la izquierda, una mesa redonda de seis y una mesa de cuatro en el centro, dos mesas de dos fusionadas a la derecha bajo el cursor, una barra y una puerta. Cada mesa muestra su estado · libre, esperando, comiendo o pidiendo la cuenta.",
  "A question for Kiwi IQ · what were yesterday’s sales · and the answer: 12,480 MAD, up 18% on the week, a seven-day bar chart, a warning about falling juice margins, and a suggested action.": "Una consulta planteada a Kiwi IQ · cuáles fueron las ventas de ayer · y la respuesta: 12 480 MAD, un 18 % más en la semana, gráfico de barras semanal, aviso de margen a la baja en zumos y acción sugerida.",
  "One thread links four stages: the order is taken on the floor, appears on the kitchen screen, is paid at the till, and is filed in the dashboard. The same ticket, number 248, travels from one end to the other.": "Un solo hilo conecta cuatro fases: el pedido se toma en sala, aparece en la pantalla de cocina, se cobra en caja y se archiva en el panel de control. El mismo ticket, número 248, recorre todo el circuito de principio a fin.",
  "A readable receipt at the counter, then the same content encrypted into unreadable blocks in the network link and on the locked disk. An offline branch keeps receipts encrypted and waiting when the connection drops.": "Un ticket legible en el mostrador, y el mismo contenido cifrado en bloques ilegibles en la conexión de red y en el disco protegido. Una cola sin conexión mantiene los tickets cifrados en espera si se interrumpe la red.",
  "A Kiwi till connected to a thermal printer, payment terminal, barcode scanner, floor tablet, kitchen display, and cash drawer.": "Un TPV Kiwi conectado a una impresora térmica, datáfono, lector de código de barras, tableta de sala, pantalla de cocina y cajón portamonedas.",
  "Your data sits at the centre. One route leaves it, towards you, and keeps moving. Three others · sold, rented, shared · are blocked at the gate.": "Sus datos en el centro. Una única vía sale hacia usted y permanece abierta. Otras tres · vendidos, alquilados, compartidos · quedan bloqueadas en el acceso.",
  "A globe centred on Europe and Africa: Kiwi is developed in Cologne, Germany, and made for Morocco.": "Un globo terráqueo centrado en Europa y África: Kiwi se desarrolla en Colonia, Alemania, y está creado para Marruecos.",
  "Billing period": "Periodicidad de facturación",
  "Product": "Producto",
  "Proof": "Demostración",
  "Legal": "Aviso legal"
};

// Also copy aria translations to dictionaries.es
for (const [k, v] of Object.entries(ariaMap)) {
  dictionaries['es'][k] = v;
}

// Replace text nodes outside <script> and <style>
function replaceTextNodes(html, dict) {
  const parts = html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/gi);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].toLowerCase().startsWith('<script') && !parts[i].toLowerCase().startsWith('<style')) {
      parts[i] = parts[i].replace(/>([^<>]+)</g, (match, text) => {
        const trimmed = text.trim();
        if (dict[trimmed]) {
          return '>' + text.replace(trimmed, dict[trimmed]) + '<';
        }
        return match;
      });
    }
  }
  return parts.join('');
}

let esOutput = source
  .replace('<html lang="en" dir="ltr">', '<html lang="es" dir="ltr">')
  .split('https://kiwi-os.com/en/').join('https://kiwi-os.com/es/')
  .replace('hrefLang="en" href="https://kiwi-os.com/es/"', 'hrefLang="en" href="https://kiwi-os.com/en/"')
  .replace('\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/es/\\"', '\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/en/\\"')
  // Meta title & description
  .split('<title>Kiwi · The operating system for Moroccan businesses</title>').join('<title>Kiwi · El sistema operativo para los comercios marroquíes</title>')
  .split('name="description" content="Your till, floor, kitchen, stock, team, and reporting in one system, in French and Arabic. From 249 MAD a month, or 199 MAD a month on an annual plan. 15 days free, no commitment."').join('name="description" content="Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe. Desde 249 MAD al mes, o 199 MAD al mes con plan anual. 15 días gratis, sin compromiso."')
  // Open Graph & Twitter
  .split('property="og:title" content="Kiwi · The operating system for Moroccan businesses"').join('property="og:title" content="Kiwi · El sistema operativo para los comercios marroquíes"')
  .split('property="og:description" content="Your till, floor, kitchen, stock, team, and reporting in one system, in French and Arabic. From 249 MAD a month, or 199 MAD a month on an annual plan. 15 days free, no commitment."').join('property="og:description" content="Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe. Desde 249 MAD al mes, o 199 MAD al mes con plan anual. 15 días gratis, sin compromiso."')
  .split('property="og:locale" content="en_US"').join('property="og:locale" content="es_ES"')
  .split('name="twitter:title" content="Kiwi · The operating system for Moroccan businesses"').join('name="twitter:title" content="Kiwi · El sistema operativo para los comercios marroquíes"')
  .split('name="twitter:description" content="Your till, floor, kitchen, stock, team, and reporting in one system, in French and Arabic. From 249 MAD a month, or 199 MAD a month on an annual plan. 15 days free, no commitment."').join('name="twitter:description" content="Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe. Desde 249 MAD al mes, o 199 MAD al mes con plan anual. 15 días gratis, sin compromiso."')
  // Next.js flight data strings
  .split('\\"Kiwi · The operating system for Moroccan businesses\\"').join('\\"Kiwi · El sistema operativo para los comercios marroquíes\\"')
  .split('\\"Your till, floor, kitchen, stock, team, and reporting in one system, in French and Arabic. From 249 MAD a month, or 199 MAD a month on an annual plan. 15 days free, no commitment.\\"').join('\\"Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe. Desde 249 MAD al mes, o 199 MAD al mes con plan anual. 15 días gratis, sin compromiso.\\"')
  .split('\\"en_US\\"').join('\\"es_ES\\"');

// Replace aria-labels
esOutput = esOutput.replace(/aria-label="([^"]+)"/g, (match, val) => {
  if (ariaMap[val]) return `aria-label="${ariaMap[val]}"`;
  return match;
});

// Replace text nodes
esOutput = replaceTextNodes(esOutput, esDictionary);

// Add runtime translation helper
esOutput = esOutput.replace('</body>', '<script src="/assets/landing-runtime-translations.js" defer></script></body>');

if (!fs.existsSync('es')) fs.mkdirSync('es', { recursive: true });
fs.writeFileSync('es/index.html', esOutput);

// -------------------------------------------------------------
// Write assets/landing-runtime-translations.js
// -------------------------------------------------------------
const runtime = `(() => {
  const dictionaries = ${JSON.stringify(dictionaries)};
  const locale = document.documentElement.lang.split('-')[0];
  const dictionary = dictionaries[locale];
  if (!dictionary) return;
  let translating = false;
  const translate = () => {
    if (translating) return;
    translating = true;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script, style')) continue;
      const value = node.nodeValue;
      const trimmed = value.trim();
      if (dictionary[trimmed]) node.nodeValue = value.replace(trimmed, dictionary[trimmed]);
    }
    const title = document.title.trim();
    if (dictionary[title]) document.title = dictionary[title];

    const ariaNodes = document.querySelectorAll('[aria-label]');
    for (const el of ariaNodes) {
      const label = el.getAttribute('aria-label');
      if (dictionary[label]) el.setAttribute('aria-label', dictionary[label]);
    }
    translating = false;
  };
  const start = () => {
    translate();
    new MutationObserver(translate).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
fs.writeFileSync('assets/landing-runtime-translations.js', runtime);
console.log('Rebuild complete for de, it, nl, es.');
