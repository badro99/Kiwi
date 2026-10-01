/* Shared, display-only catalog chrome. Models and normal product handlers stay authoritative. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (key, fr) => window.KiwiI18n?.T?.[window.KiwiI18n.getLang()]?.['catalog.' + key] || fr;
  const label = (key, fr) => `<span data-i18n="catalog.${key}">${esc(text(key, fr))}</span>`;
  const icon = name => `<img class="catalog-icon" draggable="false" src="assets/icons/material/${name}.svg" alt="" aria-hidden="true"/>`;
  const rowSelectors = '.mi-pill-row,.mi-subchips,.st-tabs,.st-item-subtabs,.st-filter-row,.st-view-toggle,.st-venue-row';
  function capture(root) {
    return [...root.querySelectorAll(rowSelectors)].map(row => ({ left:row.scrollLeft, active:row.querySelector('.on')?.textContent }));
  }
  function settle(root, previous = []) {
    if (!root) return;
    root.querySelectorAll(rowSelectors).forEach((row, i) => {
      row.classList.add('catalog-rail'); row.dataset.lensDemo = '';
      const buttons=[...row.querySelectorAll(':scope > button')];
      row.setAttribute('role', 'tablist');
      buttons.forEach(button => {
        button.type='button';
        if (!/(?:add|manage|rename|delete|classify)/.test(button.dataset.action || '')) {
          button.dataset.lensItem='';button.setAttribute('role','tab');
          button.setAttribute('aria-selected', String(button.classList.contains('on')));
        }
      });
      if(previous[i])row.scrollLeft=previous[i].left;
      const active=buttons.find(button=>button.classList.contains('on'));
      // Reveal a changed selection, not on every poll or ordinary scroll.
      if(active && active.textContent !== previous[i]?.active) {
        const r=row.getBoundingClientRect(), a=active.getBoundingClientRect();
        if(a.left<r.left+8)row.scrollLeft+=a.left-r.left-8;
        else if(a.right>r.right-8)row.scrollLeft+=a.right-r.right+8;
      }
      const edges=()=>{
        const r=row.getBoundingClientRect();const first=buttons[0]?.getBoundingClientRect(),last=buttons.at(-1)?.getBoundingClientRect();
        row.classList.toggle('catalog-fade-left', !!first && Math.min(first.left,last.left)<r.left-1);
        row.classList.toggle('catalog-fade-right', !!last && Math.max(first.right,last.right)>r.right+1);
      };
      if(!row.dataset.catalogBound){row.dataset.catalogBound='1';row.addEventListener('scroll',edges,{passive:true});
        row.addEventListener('keydown',e=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
          const tabs=buttons.filter(b=>b.dataset.lensItem!==undefined);const at=tabs.indexOf(document.activeElement);if(at<0)return;
          const rtl=getComputedStyle(row).direction==='rtl';
          const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowRight'?(rtl?-1:1):(rtl?1:-1))+tabs.length)%tabs.length;
          e.preventDefault();tabs[n].click();root.querySelectorAll(rowSelectors)[i]?.querySelectorAll('[data-lens-item]')[n]?.focus();
        });
      }
      requestAnimationFrame(edges);
    });
  }
  function replace(root, html) {
    if (!root || root.__catalogHTML===html) return false;
    const previous=capture(root), input=document.activeElement;
    const selector=input?.matches('[data-stock-search-input]')?'[data-stock-search-input]':input?.matches('[data-rmw-search]')?'[data-rmw-search]':null;
    const position=selector?input.selectionStart:null;
    root.innerHTML=html;root.__catalogHTML=html;settle(root,previous);
    if(selector){const next=root.querySelector(selector);next?.focus({preventScroll:true});try{next?.setSelectionRange(position,position);}catch(_){} }
    return true;
  }
  window.KiwiCatalogUI={text,label,icon,settle,capture,replace};
})();
