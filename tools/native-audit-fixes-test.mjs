#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* Kiwi Pro · audit natif du 2026-10-12, ce qui a été corrigé et doit le rester.
 *
 *  · api-base.js rend au signal son contrat : dans l'app, CapacitorHttp ignore
 *    `signal`, et une attente « 12 s puis file » devenait dix minutes.
 *  · Le paiement n'attend plus le numéro cuisine canonique plus de 2,5 s.
 *  · Exports et impressions : blob → feuille de partage, fenêtre vide → document
 *    dans l'app, print() → vrai PDF A4 rendu par WebKit (printHtml).
 *  · Les messages disent ce qui s'est passé (« PDF prêt », pas « imprimé »).
 *  · Coquille iOS : dialogues traduits et sûrs, retour par balayage, iPad.
 *  · Runtime : caisse iPad ancrée, capsule cachée sous la note, hors ligne
 *    honnête par écran, feuilles qu'on tire vers le bas, liens Kiwi in-app.
 *  · Le paquet de l'app ne transporte plus 20 Mo de pages vitrine. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readNativeRuntime } from './native-runtime-source.mjs';

const read = (rel) => coreTestSource.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
let controls = 0;
function check(label, value) { assert.ok(value, label); controls++; console.log('  ✓ ' + label); }

const apiBase = read('assets/api-base.js');
const runtime = readNativeRuntime();
const runtimeCss = read('app/src/native-runtime.css');
const shellJs = read('app/src/native-shell.js');
const swift = read('app/ios/App/App/KiwiNativeShell.swift');
const plugin = read('app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift');
const pluginTs = read('app/plugins/kiwi-printer-socket/src/definitions.ts');
const caisse = caisseTestSource(read('kiwi-caisse.html')).replace(/<link rel="stylesheet" href="assets\/caisse-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + read('assets/caisse-shell.css') + '</style>');
const dashboard = read('dashboard.html').replace(/<link rel="stylesheet" href="assets\/dashboard-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + read('assets/dashboard-shell.css') + '</style>');
const bridge = read('assets/printer-bridge.js') + '\n' + read('assets/printer/pairing-ui.js');
const build = read('tools/build-app-www.mjs');
const plist = read('app/ios/App/App/Info.plist');

/* ── 1. api-base : un abandon rejette tout de suite, même si le natif traîne ── */
async function apiBaseAbort() {
  const pending = [];
  const w = {
    fetch: () => new Promise((resolve) => { pending.push(resolve); }), // CapacitorHttp : ne lit jamais signal
    XMLHttpRequest: function () {}, navigator: {}, document: { addEventListener() {} }, location: { replace() {} },
    URL, Request: class { constructor(u) { this.url = String(u); } }, Object, Promise, DOMException,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  };
  w.XMLHttpRequest.prototype.open = function () {};
  w.window = w;
  vm.createContext(w);
  vm.runInContext(apiBase, w, { filename: 'api-base.js' });
  const controller = new AbortController();
  const started = Date.now();
  const request = w.fetch('/api/order/queue', { method: 'POST', signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  let error = null;
  try { await request; } catch (e) { error = e; }
  check('natif : fetch POST abandonné rejette en AbortError au lieu d’attendre CapacitorHttp', error && error.name === 'AbortError' && Date.now() - started < 1000);
  const pre = new AbortController(); pre.abort();
  let early = null;
  try { await w.fetch('/api/sale', { method: 'POST', signal: pre.signal }); } catch (e) { early = e; }
  check('natif : un signal déjà abandonné rejette sans attendre', early && early.name === 'AbortError');
  const ok = w.fetch('/api/me', {});
  pending[pending.length - 1]({ ok: true, status: 200 });
  check('natif : sans signal, la réponse passe telle quelle', (await ok).status === 200);
  const web = { ...w, Capacitor: undefined, fetch: () => Promise.resolve('web') };
  web.window = web; vm.createContext(web); vm.runInContext(apiBase, web);
  check('web : le fetch d’origine n’est pas enveloppé', web.fetch.name !== 'kiwiFetch');
}
await apiBaseAbort();

/* ── 2. Paiement : le numéro canonique est attendu 2,5 s au plus ──────────── */
{
  const start = caisse.indexOf('async function awaitCanonicalTicketNumber');
  const body = caisse.slice(start, caisse.indexOf('\n    }', start));
  check('le paiement borne l’attente du numéro cuisine (2,5 s, en parallèle)',
    start > 0 && /CANONICAL_NUMBER_WAIT_MS = 2500/.test(body) && /Promise\.race\(\[allocated, deadline\]\)/.test(body) && /Promise\.all\(/.test(body));
}

/* ── 3. Exports et impressions dans l'app ────────────────────────────────── */
{
  const exportsBlock = runtime.slice(runtime.indexOf('Exports et documents imprimables'));
  check('un lien blob:/data: part dans la feuille de partage (shareFile)', /plugin\.shareFile\(/.test(exportsBlock) && /URL\.createObjectURL = function/.test(exportsBlock) && /URL\.revokeObjectURL = function/.test(exportsBlock));
  check('un document ouvert vide devient une feuille dans l’app avec Fermer et Imprimer ou partager', /function openDocumentSheet\(\)/.test(exportsBlock) && /'kiwi-native-doc'|kiwi-native-doc/.test(exportsBlock) && /share:'Imprimer ou partager'/.test(exportsBlock));
  check('print() produit un PDF rendu par WebKit (printHtml), exportInvoice en repli', /can\('printHtml'\) \? 'printHtml' : \(can\('exportInvoice'\)/.test(exportsBlock));
  check('le toast d’erreur de la caisse reçoit sa durée avant son type', /KiwiCaisseToast\(message, 4200, 'danger'\)/.test(exportsBlock));
  check('les pages kiwi-os.com s’ouvrent dans la feuille Safari de l’app', /function kiwiPage\(href\)/.test(exportsBlock) && /postMessage\(\{ openURL: href \}\)/.test(exportsBlock));
  const kp = exportsBlock.slice(exportsBlock.indexOf('function kiwiPage(href)'), exportsBlock.indexOf('function safariSheet'));
  const ctx = { URL, location: { href: 'capacitor://localhost/kiwi-caisse.html' } };
  vm.createContext(ctx); vm.runInContext(kp, ctx);
  check('seul https://kiwi-os.com (et ses sous-domaines) est envoyé à la feuille Safari',
    ctx.kiwiPage('https://kiwi-os.com/privacy.html') && ctx.kiwiPage('https://app.kiwi-os.com/x') && !ctx.kiwiPage('https://evil-kiwi-os.com/') && !ctx.kiwiPage('http://kiwi-os.com/') && !ctx.kiwiPage('kiwi-serveur.html'));
  check('plugin iOS : printHtml et shareFile déclarés et typés', /CAPPluginMethod\(name: "printHtml"/.test(plugin) && /CAPPluginMethod\(name: "shareFile"/.test(plugin) && /printHtml\(options:/.test(pluginTs) && /shareFile\(options:/.test(pluginTs));
  check('plugin iOS : PDF A4 multipage par viewPrintFormatter, taille bornée', /class HtmlPdfJob/.test(plugin) && /viewPrintFormatter\(\)/.test(plugin) && /markup\.utf8\.count <= 4_000_000/.test(plugin));
}

/* ── 4. Les messages d'impression disent la vérité ─────────────────────── */
{
  check('caisse : « prêt · imprimer ou partager le PDF » dans l’app, « ouvert dans l’impression système » sur le web',
    caisse.includes("'Ticket prêt · imprimer ou partager le PDF'") && caisse.includes("'Ticket ouvert dans l\\'impression système'"));
  check('printer-bridge : l’impression système annonce pdf dans l’app', /function systemPrintVia\(\)/.test(bridge));
  check('printer-bridge : pas de bloc Bluetooth dans l’app (WKWebView et WebView Android n’ont pas Web Bluetooth)',
    /var showBt = !!navigator\.bluetooth \|\| !inApp;/.test(bridge) && /\(showBt \? '<div class="kpr-bt">'/.test(bridge) && /if \(\$\('#kpr-bt-connect'\)\)/.test(bridge));
}

/* ── 5. Coquille iOS (SwiftUI) ───────────────────────────────────────────── */
{
  check('dialogues JS traduits, confirmations destructrices en rouge, codes en champ masqué',
    /final class KiwiDialogDelegate: NSObject, WKUIDelegate/.test(swift) && /copy\("Annuler", "Cancel", "إلغاء"\)/.test(swift) && /runJavaScriptConfirmPanelWithMessage/.test(swift) && /field\.isSecureTextEntry = true/.test(swift));
  {
    const promptStart = swift.indexOf('runJavaScriptTextInputPanelWithPrompt prompt: String');
    const promptBody = swift.slice(promptStart, swift.indexOf('let alert = UIAlertController', promptStart));
    check('le pont synchrone de Capacitor (prompt JSON « type ») repart vers Capacitor, jamais en dialogue',
      /payload\["type"\] is String/.test(promptBody) && /fallback\.webView\?\(webView, runJavaScriptTextInputPanelWithPrompt: prompt/.test(promptBody) && /return/.test(promptBody));
  }
  check('balayage depuis le bord = retour sur les écrans de configuration', /UIScreenEdgePanGestureRecognizer\(target: self, action: #selector\(edgeSwipe/.test(swift) && /edgeBack\?\.edges = /.test(swift));
  check('pas d’aperçu de lien au toucher long (une caisse n’est pas un navigateur)', /allowsLinkPreview = false/.test(swift));
  check('capsule centrée sur le menu quand la note est ancrée (trailingInset)', /var trailingInset: Double = 0/.test(swift) && /tabCenterConstraint\?\.constant = CGFloat\(context\.trailingInset \/ 2\)/.test(swift));
  check('un rôle touché montre sa progression et bloque le second toucher', /@State private var pendingChoice: String\?/.test(swift) && /if pendingChoice == choice\.id \{ ProgressView\(\)/.test(swift));
  check('les champs montrent un exemple, pas leur propre libellé', /placeholder: copy\("nom@commerce\.ma"/.test(swift) && /placeholder: "192\.168\.1\.50"/.test(swift));
  check('le bouton principal remonte au-dessus du clavier', /proxy\.scrollTo\("kiwi-actions", anchor: \.bottom\)/.test(swift));
  check('libellés de la capsule : taille plafonnée, grand aperçu au toucher long', /\.dynamicTypeSize\(\.\.\.DynamicTypeSize\.large\)/.test(swift) && /\.accessibilityShowsLargeContentViewer/.test(swift));
  check('la caméra n’annonce pas un scan code-barres que WebKit ne sait pas faire', !/code-barres|barcode/i.test((plist.match(/<key>NSCameraUsageDescription<\/key>\s*<string>([^<]*)/) || [])[1] || 'barcode'));
}

/* ── 6. Runtime natif ────────────────────────────────────────────────────── */
{
  check('iPad portrait : la note s’ancre à côté du menu', /function nativeDockedTill\(\)/.test(runtime) && /width >= 700 && width <= 900 && height >= 700/.test(runtime) && /kiwi-native-docked:not\(\.is-pos\):not\(#kno\) \.rightpanel\{position:relative!important/.test(runtimeCss));
  check('la capsule disparaît quand la note du téléphone est ouverte', /var sheetUp = !docked && document\.body\.classList\.contains\('ticket-open'\);/.test(runtime) && /\|\| sheetUp \|\|/.test(runtime));
  check('la liste des onglets suit la rotation et le Split View', /window\.addEventListener\('resize', function \(\) \{\s*if \(tabsResizeQueued\) return;/.test(runtime));
  const offline = runtime.slice(runtime.indexOf('function offlineCopy()'), runtime.indexOf('function ensureOfflineBanner()'));
  const pages = {};
  ['kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html', 'dashboard.html'].forEach((page) => {
    const ctx = { root: { lang: 'fr' }, location: { pathname: '/' + page } };
    vm.createContext(ctx); vm.runInContext(offline, ctx);
    pages[page] = ctx.offlineCopy();
  });
  check('hors ligne : chaque écran dit ce qui se passe vraiment chez lui',
    /restent sur cette caisse/.test(pages['kiwi-caisse.html']) && /ne partent pas en cuisine/.test(pages['kiwi-serveur.html']) && /nouveaux bons/.test(pages['kiwi-cuisine.html']) && /dernière connexion/.test(pages['dashboard.html']));
  check('une feuille à poignée se ferme en la tirant vers le bas', /function initSheetDrag\(\)/.test(runtime) && /dismissNativeLayer\(d\.layer\)/.test(runtime) && /initSheetDrag\(\);/.test(runtime));
  check('sur téléphone, chaque dialogue de la caisse est une feuille du bas', /body\.kiwi-native-till \.modal-veil\.is-open>\.modal\{box-sizing:border-box;width:100%/.test(runtimeCss));
  check('le tiroir de la caisse masque la barre d’état', /body\.kiwi-native-till \.sidebar\{border-top:var\(--kiwi-safe-top\) solid var\(--ink-bg/.test(runtimeCss));
  check('les feuilles collées en bas glissent (--glide) au lieu de rebondir', !/\.rightpanel\{clip-path:[^}]*var\(--spring\)/.test(runtimeCss) && !/kiwi-native-order-sheet \.kiwi-modal\{transform:translateY\(100%\);transition:transform 310ms var\(--spring/.test(runtimeCss));
  check('la carte de compte suit le mode sombre', /@media \(prefers-color-scheme:dark\)\{\s*html\.kiwi-native \.kiwi-native-account\{/.test(runtimeCss));
  check('le clavier ne s’additionne plus à la zone sûre du bas', /root\.classList\.toggle\('kiwi-keyboard-open', keyboard > 80\)/.test(runtime) && /kiwi-keyboard-open body:not\(\.native-shell-page\)\{padding-bottom:var\(--kiwi-keyboard\)!important\}/.test(runtimeCss));
  check('Android : les zones sûres publiées par Capacitor sont prises en compte', /var\(--safe-area-inset-bottom,0px\)\)/.test(runtimeCss));
  check('Android : le zoom texte de la WebView n’est pas recompté par --type-scale',
    /if \(result && typeof result\.hostTextZoom === 'number'\) scale = 1;/.test(runtime) && /if \(res && typeof res\.hostTextZoom === 'number'\) scale = 1;/.test(shellJs)
    && /applyScale\(result\.scale, result\)/.test(runtime) && /applyScale\(data\.scale, data\)/.test(shellJs));
  check('iPhone : la taille du texte système agrandit toute la page', /'-webkit-text-size-adjust', percent, 'important'/.test(runtime));
  check('changer de rôle et se déconnecter ne laissent pas l’espace dans l’historique',
    /location\.replace\('index\.html\?choose=1'\)/.test(runtime) && /location\.replace\('index\.html\?setup=1'\)/.test(runtime) && /location\.replace\(ROLES\[role\]\)/.test(shellJs));
  check('la démo dit « Quitter la démo » et ne demande pas de mot de passe', /function nativeDemoSession\(\)/.test(runtime) && /'Quitter la démo'/.test(runtime) && /action === 'sign-out' && !nativeDemoSession\(\)/.test(runtime));
  check('Android : se déconnecter demande confirmation même sans feuille native', /if \(!window\.confirm\(ask\.title \+ '\\n\\n' \+ ask\.message\)\) return;/.test(runtime));
  check('toucher la pastille de synchronisation dit ce que le toucher a fait', /'Toujours conservé sur cette caisse · rien n’est perdu'/.test(runtime) && /'Tout est envoyé'/.test(runtime));
}

/* ── 7. Caisse et tableau de bord ───────────────────────────────────────── */
{
  check('la carte n’est repeinte que si elle a changé, et jamais sous un doigt', /if \(previous === raw && menuItems\.length\) return false;/.test(caisse) && /function rebuildCarteWhenIdle\(\)/.test(caisse));
  check('une caisse de démo le dit à côté du titre', /\(function demoBadge\(\)/.test(caisse) && /badge\.className = 'demo-badge'/.test(caisse));
  check('écran tactile : la réimpression du journal est visible', /@media \(hover: none\) \{\s*\.jr-entry-reprint \{ opacity: 1;/.test(caisse));
  /* « écran tactile : retirer une station est visible » (.mi-station-x) gardait
   * un bouton de l'ancienne carte de assets/venues.js, retirée le 2026-10-12
   * avec sa CSS. tools/legacy-venue-modals-test.mjs veille à ce qu'elle ne
   * revienne pas. */
  check('la chorégraphie des cartes ne rejoue pas à chaque déverrouillage', /function enterCards\(\)/.test(dashboard) && (dashboard.match(/document\.body\.classList\.add\('cards-enter'\)/g) || []).length === 1);
  check('les statistiques Équipe et Stock sont visibles au repos (l’entrée remplit vers l’arrière)', /@keyframes eq-rise \{ from \{ opacity: 0;/.test(dashboard) && /@keyframes st-rise \{ from \{ opacity: 0;/.test(dashboard) && !/\.eq-stat \{[^}]*opacity: 0;/.test(dashboard));
  {
    const lang = read('assets/caisse-lang.js');
    check('mouvement de caisse : « Entrée » ne devient plus la touche « Enter »',
      (caisse.match(/<span class="cm-type-label" data-nolang>/g) || []).length === 2
      && /en: \{ out: 'Cash out', in: 'Cash in' \}/.test(caisse) && /function paintCmTypeLabels\(\)/.test(caisse)
      && /KiwiCaisseLang\.subscribe\(paintCmTypeLabels\)/.test(caisse));
    check('mouvement de caisse : la feuille entière parle la langue de la caisse',
      ['Mouvement de caisse', 'Caisse actuelle', 'Montant', 'Achat fournisseur', 'Appoint monnaie', 'Mouvements ce service', 'Aucun mouvement enregistré.', 'Entrée de caisse', 'Sortie de caisse']
        .every((k) => lang.includes(`'${k}': [`)));
  }
  check('nuit : « Carte » s’inverse au lieu de blanc sur presque blanc', /html\[data-caisse-theme="dark"\] #pay-card\.pay-icon \{ color: var\(--paper\); \}/.test(caisse));
  check('nuit, téléphone et iPad : « Envoyer en cuisine » en menthe, pas en atlas sur charbon', /html\.kiwi-native\[data-caisse-theme="dark"\] body\.kiwi-native-till\[data-mode="vrap"\] #rp-send-kitchen\{color:#7DF2B0;/.test(runtimeCss));
  check('iPad ancré : « Encaisser » au-dessus du montant, chacun sur une ligne', /kiwi-native-docked:not\(\.is-pos\):not\(#kno\) #pay-charge\{flex-direction:column;/.test(runtimeCss) && /kiwi-native-docked:not\(\.is-pos\):not\(#kno\) #pay-charge \.pay-charge-total\{white-space:nowrap;/.test(runtimeCss));
  check('plus de fond #FFFFFF froid sur les cartes du plan',!/\.tbl-cell\.is-designed \.tbl \{\s*border-color: rgba\(10,15,13,0\.12\);\s*background: #FFFFFF;/.test(caisse));
}

/* ── 8. Paquet ──────────────────────────────────────────────────────────── */
{
  check('ni la mascotte ni les illustrations des guides dans le paquet de l’app', /rel\.startsWith\('assets\/mascot\/'\) \|\| rel\.startsWith\('assets\/articles\/'\)/.test(build));
  check('JetBrains Mono embarquée (le web la charge par Google Fonts, que le paquet retire)', /'native-fonts\/jetbrains-mono-latin\.woff2'/.test(build) && /font-family:"JetBrains Mono";src:url\("native-fonts\/jetbrains-mono-latin\.woff2"\)/.test(runtimeCss));
  check('l’archive installe exactement le lockfile avant de construire', /npm ci --no-audit --no-fund/.test(read('tools/app-archive.sh')));
}

/* ── 9. Fidélisation clients sur téléphone, sombre ──────────────────────── */
{
  const vexel = read('assets/design-vexel.css');
  const bare = vexel.match(/--n-\d{3}:\s*[\d.]+\s*;/g) || [];
  check('les gris --n-* du skin Vexel sont des couleurs, pas des nombres nus (points de sous-titre invisibles en sombre)', bare.length === 0);
  const opaque = /background:\s*linear-gradient\(var\(--surface\),\s*var\(--surface\)\),\s*var\(--kno-bg,\s*var\(--paper\)\)/;
  check('colonne épinglée opaque : fidélisation, répertoire clients, tableaux mobiles', opaque.test(read('assets/customer-retention.js')) && opaque.test(read('assets/clients-directory.js')) && opaque.test(read('assets/mobile.css')));
  const retention = read('assets/customer-retention.js');
  check('fidélisation : de l’air entre les compteurs et la liste', /'\.cr-kpis\+\*\{margin-top:16px;\}'/.test(retention));
  check('fidélisation sombre : « Vient moins souvent » et « Inactif » lisibles', /\.cr-tag\.less\{background:rgba\(240,196,90,\.14\);color:#F1C865;\}/.test(retention) && /\.cr-tag\.inactive\{background:rgba\(255,120,95,\.14\);color:#FF9A85;\}/.test(retention));
  check('l’onglet suit Kiwi.activePage, plus la dernière page visitée', /var CLIENT_PAGES = \{ crm:1, retention:1, clients:1 \}/.test(runtime) && !/lastPage/.test(runtime));
}

/* ── 10. iPad : ce que le tiroir du téléphone stylait seul ──────────────── */
{
  const wide = (runtimeCss.match(/@media \(min-width:601px\)\{([\s\S]*?)\n\}/) || [])[1] || '';
  check('iPad : le titre de page n’est masqué que sur téléphone (plus de bloc vide au-dessus des périodes)',
    /@media \(max-width:600px\)\{html\.kiwi-native \[data-dr-label\]\{display:none!important\}\}/.test(runtimeCss)
    && !/^html\.kiwi-native \[data-dr-label\]\{display:none!important\}$/m.test(runtimeCss));
  check('iPad : la rangée d’actions rapides du téléphone ne double pas les boutons du tableau de bord', /\.kiwi-native-owner-actions\{display:none!important\}/.test(wide));
  check('iPad : le groupe compte a ses boutons, plus des liens bleus de WebKit', /\.kno-account button\{[^}]*color:inherit;[^}]*appearance:none/.test(wide) && /\.kno-account i\{[^}]*mask:var\(--kno-icon\)/.test(wide));
  check('iPad : un seul « Se déconnecter », celui du groupe compte qui demande confirmation', /body\.kiwi-native-owner \.merchant-logout\{display:none!important\}/.test(wide));
  check('iPad : aucun :hover dans le bloc large (il laissait l’écran de verrouillage vide dans WKWebView)', !/:hover/.test(wide.replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log(`native-audit-fixes-test: ${controls} controls passed`);
