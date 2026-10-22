// La source entière de OrderPro.html, pour les tests qui la lisent.
// La page ne porte plus elle-même sa grande feuille de style ni son grand
// script : ils vivent dans assets/orderpro-page.css et assets/orderpro-page.js,
// chargés à la même place (<link> à la place du <style>, <script src> classique
// à la place du <script>). Ce module remet leur contenu en ligne, à l'octet,
// là où les balises les appellent : un test qui cherche un texte, extrait un
// bloc <script>…</script> ou compte des lignes voit la page telle qu'elle était.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = 'OrderPro.html';
const CSS = 'assets/orderpro-page.css';
const JS = 'assets/orderpro-page.js';

const esc = (rel) => rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function orderProTestSource(root = ROOT) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  let html = read(PAGE);
  const css = new RegExp(`<link rel="stylesheet" href="${esc(CSS)}(?:\\?v=\\d+)?" />`);
  const js = new RegExp(`<script src="${esc(JS)}(?:\\?v=\\d+)?"></script>`);
  if (!css.test(html)) throw new Error(`${PAGE} ne charge plus ${CSS}`);
  if (!js.test(html)) throw new Error(`${PAGE} ne charge plus ${JS}`);
  html = html.replace(css, () => `<style>\n${read(CSS)}  </style>`);
  html = html.replace(js, () => `<script>\n${read(JS)}  </script>`);
  return html;
}

orderProTestSource.files = [PAGE, CSS, JS];
module.exports = orderProTestSource;
