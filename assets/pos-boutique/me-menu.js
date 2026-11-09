/* Le menu du caissier sous la peau 2027, pour les caisses boutique et maison
 * (propriétaire, 2026-11-09 : « fais-le aussi pour la boutique et la maison »).
 * Même menu que la caisse restaurant (assets/caisse/till-frame.js ›
 * tillKitOpenMe) : la pastille du rail ouvre un <k-popover> à côté d'elle,
 * avec qui tient la caisse, Changer de caissier, FR / EN / ع et la vraie
 * sortie du compte, nommée puis confirmée. Il décharge le tiroir Plus, qui
 * ne porte plus ni Verrouiller ni la langue.
 *
 * Le menu n'invente aucune action. « Changer de caissier » clique le bouton
 * Verrouiller LIVRÉ (o.lockSel) : son écouteur ferme la clôture puis appelle
 * KiwiPosDispatch.lock, comme avant. La sortie suit le lien /auth/logout de la
 * caisse, le même que « Sortir » au restaurant. Kit absent : on rend false et
 * l'appelant ne fait rien de plus qu'avant. */
const kt = (key, fb) => {
  try { const K = window.KiwiKit; const v = K && typeof K.t === 'function' ? K.t(key) : ''; if (v && v !== key) return v; } catch (_) {}
  return fb;
};
const LOGOUT = '.quick-actions a[href^="/auth/logout"]';

/* o.root          l'écran du métier (#pos-boutique, #pos-maison)
   o.who()         { name, role } du caissier à l'écran
   o.lockSel       le bouton Verrouiller livré
   o.beforeOpen()  referme ce qui couvrirait le menu (le tiroir Plus)
   o.repaint()     repeint le rail après un changement de langue
   o.anchor()      la pastille du rail, une fois repeinte */
function posMeMenu(o) {
  if (!customElements.get('k-popover') || !customElements.get('k-list')) return null;
  let pop = null, ask = false;

  function paint() {
    const who = o.who() || {};
    const lang = window.KiwiCaisseLang;
    const heading = who.name || kt('till.me.title', 'Caissier');
    pop.setAttribute('heading', heading);
    /* <k-popover> ne dessine son titre qu'une fois : le nom et la langue changent. */
    const ti = pop.shadowRoot && pop.shadowRoot.querySelector('.ti');
    if (ti) ti.textContent = heading;
    pop.textContent = '';
    if (who.role) {
      const p = document.createElement('p'); p.className = 'k-foot k-ink2'; p.style.margin = '-4px 0 12px';
      p.textContent = lang && lang.tr ? lang.tr(who.role) : who.role;
      pop.appendChild(p);
    }
    if (ask) {
      const p = document.createElement('p'); p.className = 'k-body'; p.style.margin = '0 0 12px';
      p.textContent = kt('till.me.logout_confirm', "Pour revenir sur cette caisse, il faudra l'e-mail et le mot de passe du compte Kiwi.");
      pop.appendChild(p);
      [['logout-go', kt('till.me.logout_go', 'Oui, se déconnecter'), 'danger'], ['logout-back', kt('action.back', 'Retour'), 'secondary']].forEach(([id, label, v]) => {
        const b = document.createElement('k-button');
        b.setAttribute('label', label); b.setAttribute('variant', v); b.setAttribute('full', ''); b.setAttribute('data-me', id);
        if (id === 'logout-go') b.setAttribute('autofocus', '');
        b.style.display = 'block'; b.style.marginBlockEnd = '8px';
        pop.appendChild(b);
      });
      return;
    }
    const list = document.createElement('k-list');
    list.setAttribute('label', heading);
    const rows = [];
    if (o.root.querySelector(o.lockSel)) rows.push({ id: 'switch', icon: 'lock', title: kt('till.me.switch', 'Changer de caissier') });
    list.rows = rows;
    list.style.marginBlockEnd = '12px';
    if (rows.length) pop.appendChild(list);
    if (lang && typeof lang.set === 'function') {
      const seg = document.createElement('k-segmented');
      seg.setAttribute('label', kt('till.me.language', 'Langue'));
      seg.setAttribute('size', 'compact');
      seg.options = [{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }];
      seg.setAttribute('value', lang.get());
      seg.setAttribute('data-me', 'lang');
      seg.style.marginBlockEnd = '16px';
      pop.appendChild(seg);
    }
    if (document.querySelector(LOGOUT)) {
      const b = document.createElement('k-button');
      b.setAttribute('label', kt('till.me.logout', 'Se déconnecter de Kiwi')); b.setAttribute('icon', 'logout');
      b.setAttribute('variant', 'tonal-danger'); b.setAttribute('full', ''); b.setAttribute('data-me', 'logout');
      b.style.display = 'flow-root';
      pop.appendChild(b);
    }
  }

  function build() {
    pop = document.createElement('k-popover');
    pop.addEventListener('kiwi:action', (e) => {
      const d = e.detail || {};
      if (d.action === 'k.popover.close') { ask = false; return; }
      const host = e.composedPath().find((n) => n && n.getAttribute && n.hasAttribute('data-me'));
      const me = host ? host.getAttribute('data-me') : '';
      if (d.action === 'k.list.select' && d.id === 'switch') {
        e.stopPropagation();
        pop.removeAttribute('open');
        const b = o.root.querySelector(o.lockSel);
        if (b) b.click();
        return;
      }
      if (d.action === 'k.segmented.select' && me === 'lang') {
        e.stopPropagation();
        const v = d.value && d.value.value;
        if (v && window.KiwiCaisseLang) window.KiwiCaisseLang.set(v);
        /* Le rail se repeint dans la nouvelle langue : le menu se raccroche à la pastille neuve. */
        requestAnimationFrame(() => {
          try { o.repaint(); } catch (_) {}
          const a = pop.anchor && pop.anchor.isConnected ? pop.anchor : o.anchor();
          pop.anchor = a || null;
          paint(); pop.place();
        });
        return;
      }
      if (d.action !== 'k.button.press') return;
      e.stopPropagation();
      if (me === 'logout' || me === 'logout-back') { ask = me === 'logout'; paint(); pop.place(); return; }
      if (me === 'logout-go') {
        pop.removeAttribute('open');
        const a = document.querySelector(LOGOUT);
        /* Le lien livré, pas une copie : il marche même si la session est déjà révoquée. */
        if (a) a.click();
      }
    });
    /* Sur <body>, comme au restaurant : z-index 900, au-dessus de l'écran du
       métier (90), et hors de son transform d'entrée, qui décalerait un fixed. */
    document.body.appendChild(pop);
  }

  return {
    open(anchor) {
      if (!pop) build();
      if (pop.hasAttribute('open')) { pop.removeAttribute('open'); return; }
      try { o.beforeOpen(); } catch (_) {}
      const a = anchor && anchor.isConnected ? anchor : o.anchor();
      ask = false;
      paint();
      pop.anchor = a || null;
      pop.setAttribute('open', '');
    },
    close() { if (pop) pop.removeAttribute('open'); },
  };
}

export { posMeMenu };
