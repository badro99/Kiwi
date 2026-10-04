(() => {
  const locales = [
    ['fr', 'Français'],
    ['en', 'English'],
    ['es', 'Español'],
    ['ar', 'العربية'],
    ['de', 'Deutsch'],
    ['it', 'Italiano'],
    ['nl', 'Nederlands'],
  ];

  const labels = {
    fr: 'Choisir la langue', en: 'Choose language', es: 'Elegir idioma', ar: 'اختر اللغة',
    de: 'Sprache wählen', it: 'Scegli la lingua', nl: 'Kies een taal',
  };

  const current = document.documentElement.lang.split('-')[0];
  let mounting = false;
  const mount = () => {
    const control = document.querySelector('header [role="group"][aria-label]');
    if (!control || control.dataset.localeReady === 'true' || mounting) return;
    // React owns this exported header. Mount only after it has hydrated the
    // control; replacing its children earlier causes a hydration mismatch.
    if (!Object.keys(control).some(key => key.startsWith('__reactFiber$'))) {
      requestAnimationFrame(mount);
      return;
    }
    mounting = true;
    control.dataset.localeReady = 'true';
    control.dataset.open = 'false';
    control.classList.add('kw-locale-dropdown');
    control.setAttribute('aria-label', labels[current] || labels.en);
    control.innerHTML = `
      <button class="kw-locale-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span>${current.toUpperCase()}</span>
        <img class="kw-locale-chevron" src="/assets/icons/material/chevron_right.svg" alt=""/>
      </button>
      <div class="kw-locale-list" role="listbox">
        ${locales.map(([code, name]) => `
          <a class="kw-locale-option" role="option" hreflang="${code}" href="/${code}/"${code === current ? ' aria-current="page" aria-selected="true"' : ' aria-selected="false"'}>
            <span>${name}</span><span class="kw-locale-option-code">${code.toUpperCase()}</span>
          </a>`).join('')}
      </div>`;

    const trigger = control.querySelector('.kw-locale-trigger');
    const options = [...control.querySelectorAll('.kw-locale-option')];
    const setOpen = (open) => {
      control.dataset.open = String(open);
      trigger.setAttribute('aria-expanded', String(open));
      if (open) (options.find(option => option.getAttribute('aria-current')) || options[0]).focus();
    };

    trigger.addEventListener('click', () => setOpen(control.dataset.open !== 'true'));
    control.addEventListener('keydown', event => {
      if (event.key === 'Escape') { setOpen(false); trigger.focus(); }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      if (control.dataset.open !== 'true') return setOpen(true);
      const index = Math.max(0, options.indexOf(document.activeElement));
      options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
    });
    document.addEventListener('pointerdown', event => {
      if (!control.contains(event.target)) setOpen(false);
    });
    mounting = false;
  };

  const start = () => {
    mount();
    // Next.js can replace the server-rendered header while hydrating. Re-apply
    // the locale control whenever that happens so every locale keeps the same
    // seven-language dropdown instead of falling back to FR / EN / AR.
    new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
