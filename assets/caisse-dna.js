/* Kiwi Caisse · shared visual DNA for every non-restaurant vertical.
 *
 * Compatibility rule: this module never replaces markup, moves controls, reads
 * business state, or binds an existing action. It only adds semantic skinning
 * classes and two presentation-only fragments (service state + local clock)
 * after a vertical has mounted its own fully-wired rail.
 */
(function () {
  'use strict';

  const clocks = new WeakMap();
  const navObservers = new WeakMap();
  const LABELS = {
    pressing: 'Pressing', boutique: 'Boutique', spa: 'Spa', hotel: 'Hôtel',
    fastfood: 'Fast-food', boulangerie: 'Boulangerie', pizzeria: 'Pizzeria',
    traiteur: 'Traiteur', foodtruck: 'Food truck', epicerie: 'Épicerie',
    pharmacie: 'Pharmacie', librairie: 'Librairie', fleuriste: 'Fleuriste',
    coiffure: 'Salon', gym: 'Club', autre: 'Caisse'
  };

  function hasSuffix(el, suffix) {
    return !!el && Array.from(el.classList || []).some((name) => name.endsWith(suffix));
  }

  function first(root, tag, suffix) {
    return Array.from(root.querySelectorAll(tag)).find((el) => hasSuffix(el, suffix)) || null;
  }

  function paintClock(root) {
    const time = root.querySelector('.kiwi-dna-clock-time');
    const date = root.querySelector('.kiwi-dna-clock-date');
    if (!time || !date) return;
    const now = new Date();
    time.textContent = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    date.textContent = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).format(now);
  }

  function classifyNav(nav) {
    const items = Array.from(nav.querySelectorAll(':scope > button'));
    nav.style.setProperty('--kiwi-dna-primary-count', String(Math.max(1, Math.min(3, items.length))));
    items.forEach((button, index) => {
      button.classList.remove('kiwi-dna-primary', 'kiwi-dna-secondary');
      button.classList.add('kiwi-dna-nav-item', index < 3 ? 'kiwi-dna-primary' : 'kiwi-dna-secondary');
    });
  }

  function enhance(root, id) {
    if (!root || root.classList.contains('kiwi-dna')) return;

    const rail = first(root, 'aside', '-rail');
    if (!rail) return;
    const brand = first(rail, 'div', '-brand');
    const venue = first(rail, 'div', '-venue');
    const nav = rail.querySelector('nav');
    const foot = Array.from(rail.children).find((el) => hasSuffix(el, '-rail-foot') || hasSuffix(el, '-foot'));
    const main = root.querySelector('main');

    root.classList.add('kiwi-dna');
    root.dataset.kiwiDnaVertical = id || '';
    rail.classList.add('kiwi-dna-rail');
    if (main) main.classList.add('kiwi-dna-main');
    if (brand) brand.classList.add('kiwi-dna-brand');
    if (venue) venue.classList.add('kiwi-dna-venue');
    if (foot) foot.classList.add('kiwi-dna-foot');

    if (brand && !rail.querySelector('.kiwi-dna-service')) {
      const service = document.createElement('div');
      service.className = 'kiwi-dna-service';
      service.setAttribute('role', 'status');
      service.innerHTML = '<i aria-hidden="true"></i><span>En service</span>';
      brand.insertAdjacentElement('afterend', service);
    }

    if (venue && !venue.querySelector('.kiwi-dna-clock')) {
      const clock = document.createElement('div');
      clock.className = 'kiwi-dna-clock';
      clock.setAttribute('aria-hidden', 'true');
      clock.innerHTML = '<span class="kiwi-dna-clock-time"></span><span class="kiwi-dna-clock-date"></span>';
      venue.appendChild(clock);
      paintClock(root);
      clocks.set(root, window.setInterval(() => paintClock(root), 30000));
    }

    if (nav) {
      nav.classList.add('kiwi-dna-nav');
      nav.setAttribute('aria-label', `${LABELS[id] || 'Caisse'} · navigation`);
      classifyNav(nav);
      if (!navObservers.has(nav) && typeof MutationObserver === 'function') {
        const observer = new MutationObserver(() => classifyNav(nav));
        observer.observe(nav, { childList: true });
        navObservers.set(nav, observer);
      }
      if (!rail.querySelector('.kiwi-dna-nav-label')) {
        const label = document.createElement('div');
        label.className = 'kiwi-dna-nav-label';
        label.textContent = LABELS[id] || 'Caisse';
        nav.insertAdjacentElement('beforebegin', label);
      }
    }
  }

  window.KiwiCaisseDna = { enhance };
})();
