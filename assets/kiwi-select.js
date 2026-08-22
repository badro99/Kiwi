(function () {
  'use strict';

  var enhanced = new WeakMap();
  var openControl = null;
  var sequence = 0;
  var searchThreshold = 8;
  var skipSelector = [
    '[multiple]',
    '[size]:not([size="1"])',
    '[data-kiwi-native-select]',
    '.kh-sel',
    '[data-act="from"]',
    '[data-act="to"]'
  ].join(',');

  var icons = {
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3a6.5 6.5 0 1 0 3.98 11.64L19.85 21 21 19.85l-6.36-6.37A6.5 6.5 0 0 0 9.5 3zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.29 19.7l-1.41-1.42L9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.3z"/></svg>'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function languageCopy() {
    var lang = String(document.documentElement.lang || navigator.language || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return { search: 'بحث', empty: 'لا توجد نتائج', close: 'إغلاق', choose: 'اختر' };
    if (lang.indexOf('en') === 0) return { search: 'Search options', empty: 'No matching options', close: 'Close', choose: 'Choose' };
    return { search: 'Rechercher une option', empty: 'Aucune option correspondante', close: 'Fermer', choose: 'Choisir' };
  }

  function optionData(option) {
    return {
      option: option,
      label: String(option.textContent || '').trim(),
      meta: option.dataset.description || option.dataset.meta || '',
      color: option.dataset.color || option.dataset.kiwiColor || '',
      group: option.parentElement && option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '',
      disabled: option.disabled || !!(option.parentElement && option.parentElement.disabled)
    };
  }

  function selectLabel(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    if (select.id) {
      var label = document.querySelector('label[for="' + CSS.escape(select.id) + '"]');
      if (label) return String(label.textContent || '').trim();
    }
    var parentLabel = select.closest('label');
    if (parentLabel) {
      var clone = parentLabel.cloneNode(true);
      Array.from(clone.querySelectorAll('select,input,textarea,button')).forEach(function (node) { node.remove(); });
      var text = String(clone.textContent || '').trim();
      if (text) return text;
    }
    return languageCopy().choose;
  }

  function createTrigger(select, id) {
    var wrapper = document.createElement('span');
    wrapper.className = 'kiwi-select';
    wrapper.dataset.kiwiSelectFor = id;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'kiwi-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', id + '-popover');
    trigger.setAttribute('aria-label', selectLabel(select));
    trigger.innerHTML = '<span class="kiwi-select-value"><span class="kiwi-select-dot" hidden></span><span class="kiwi-select-value-copy"><span class="kiwi-select-value-label"></span><span class="kiwi-select-value-meta"></span></span></span><span class="kiwi-select-chevron">' + icons.expand + '</span>';

    wrapper.appendChild(trigger);
    select.insertAdjacentElement('afterend', wrapper);
    return { wrapper: wrapper, trigger: trigger };
  }

  function sync(control) {
    var select = control.select;
    if (!select.isConnected) return;
    var selected = select.selectedOptions && select.selectedOptions[0] ? optionData(select.selectedOptions[0]) : null;
    var label = control.trigger.querySelector('.kiwi-select-value-label');
    var meta = control.trigger.querySelector('.kiwi-select-value-meta');
    var dot = control.trigger.querySelector('.kiwi-select-dot');
    label.textContent = selected ? selected.label : languageCopy().choose;
    meta.textContent = selected ? selected.meta : '';
    dot.hidden = !(selected && selected.color);
    dot.style.setProperty('--kiwi-option-color', selected && selected.color ? selected.color : 'var(--atlas, #0fbf88)');
    control.trigger.disabled = select.disabled;
    control.wrapper.classList.toggle('is-disabled', select.disabled);
    control.wrapper.classList.toggle('is-invalid', !select.validity.valid);
    control.trigger.setAttribute('aria-label', selectLabel(select) + ': ' + label.textContent);
  }

  function visibleOptions(control) {
    if (!control.popover) return [];
    return Array.from(control.popover.querySelectorAll('.kiwi-select-option:not([hidden]):not(:disabled)'));
  }

  function setActive(control, index, focus) {
    var options = visibleOptions(control);
    if (!options.length) return;
    index = Math.max(0, Math.min(index, options.length - 1));
    options.forEach(function (button, optionIndex) {
      button.classList.toggle('is-active', optionIndex === index);
      button.tabIndex = optionIndex === index ? 0 : -1;
    });
    control.activeIndex = index;
    if (focus) options[index].focus({ preventScroll: true });
    options[index].scrollIntoView({ block: 'nearest' });
  }

  function optionMarkup(entry, index, selectedIndex) {
    var color = entry.color ? ' style="--kiwi-option-color:' + esc(entry.color) + '"' : '';
    return '<button type="button" class="kiwi-select-option" role="option" data-option-index="' + index + '" aria-selected="' + (index === selectedIndex ? 'true' : 'false') + '"' + (entry.disabled ? ' disabled' : '') + '>' +
      '<span class="kiwi-select-option-main"><span class="kiwi-select-dot"' + (entry.color ? color : ' hidden') + '></span><span class="kiwi-select-option-copy"><span class="kiwi-select-option-label">' + esc(entry.label) + '</span><span class="kiwi-select-option-meta">' + esc(entry.meta) + '</span></span></span>' +
      '<span class="kiwi-select-check">' + icons.check + '</span></button>';
  }

  function renderPopover(control) {
    var select = control.select;
    var copy = languageCopy();
    var entries = Array.from(select.options).map(optionData);
    var selectedIndex = select.selectedIndex;
    var showSearch = entries.length > searchThreshold;
    var groups = [];
    var currentGroup = null;
    entries.forEach(function (entry, index) {
      var groupName = entry.group || '';
      if (!currentGroup || currentGroup.name !== groupName) {
        currentGroup = { name: groupName, rows: [] };
        groups.push(currentGroup);
      }
      currentGroup.rows.push(optionMarkup(entry, index, selectedIndex));
    });

    var popover = document.createElement('div');
    popover.className = 'kiwi-select-popover';
    popover.id = control.id + '-popover';
    popover.setAttribute('role', 'listbox');
    popover.setAttribute('aria-label', selectLabel(select));
    popover.innerHTML = '<div class="kiwi-select-popover-titlebar"><span class="kiwi-select-popover-title">' + esc(selectLabel(select)) + '</span><button type="button" class="kiwi-select-close" aria-label="' + esc(copy.close) + '">' + icons.close + '</button></div>' +
      (showSearch ? '<div class="kiwi-select-popover-head"><label class="kiwi-select-search"><span class="kiwi-select-search-icon">' + icons.search + '</span><input type="search" autocomplete="off" spellcheck="false" placeholder="' + esc(copy.search) + '" aria-label="' + esc(copy.search) + '"></label></div>' : '') +
      '<div class="kiwi-select-options">' + groups.map(function (group) {
        return '<div class="kiwi-select-group">' + (group.name ? '<div class="kiwi-select-group-label">' + esc(group.name) + '</div>' : '') + group.rows.join('') + '</div>';
      }).join('') + '<div class="kiwi-select-empty" hidden>' + esc(copy.empty) + '</div></div>';

    document.body.appendChild(popover);
    control.popover = popover;
    control.search = popover.querySelector('input[type="search"]');

    popover.addEventListener('click', function (event) {
      var closeButton = event.target.closest('.kiwi-select-close');
      if (closeButton) return close(control, true);
      var optionButton = event.target.closest('.kiwi-select-option');
      if (!optionButton || optionButton.disabled) return;
      choose(control, Number(optionButton.dataset.optionIndex));
    });

    popover.addEventListener('keydown', function (event) {
      var options = visibleOptions(control);
      if (!options.length) return;
      var current = Math.max(0, options.indexOf(document.activeElement));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive(control, Math.min(current + 1, options.length - 1), true);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(control, Math.max(current - 1, 0), true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActive(control, 0, true);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActive(control, options.length - 1, true);
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        close(control, event.key === 'Escape');
      }
    });

    if (control.search) {
      control.search.addEventListener('input', function () { filter(control, control.search.value); });
      control.search.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive(control, 0, true);
        }
      });
    }
  }

  function filter(control, query) {
    var needle = String(query || '').trim().toLocaleLowerCase();
    var shown = 0;
    Array.from(control.popover.querySelectorAll('.kiwi-select-option')).forEach(function (button) {
      var visible = !needle || String(button.textContent || '').toLocaleLowerCase().indexOf(needle) !== -1;
      button.hidden = !visible;
      if (visible) shown += 1;
    });
    Array.from(control.popover.querySelectorAll('.kiwi-select-group')).forEach(function (group) {
      group.hidden = !group.querySelector('.kiwi-select-option:not([hidden])');
    });
    control.popover.querySelector('.kiwi-select-empty').hidden = shown !== 0;
    setActive(control, 0, false);
  }

  function position(control) {
    if (!control.popover || window.innerWidth <= 640) return;
    var rect = control.trigger.getBoundingClientRect();
    var margin = 10;
    var width = Math.min(Math.max(rect.width, 260), window.innerWidth - margin * 2);
    control.popover.style.width = width + 'px';
    var height = Math.min(control.popover.offsetHeight, window.innerHeight - margin * 2);
    var below = window.innerHeight - rect.bottom - margin;
    var above = rect.top - margin;
    var top = below >= Math.min(height, 280) || below >= above ? rect.bottom + 7 : Math.max(margin, rect.top - height - 7);
    var left = document.documentElement.dir === 'rtl' ? rect.right - width : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    control.popover.style.left = left + 'px';
    control.popover.style.top = Math.max(margin, top) + 'px';
  }

  function backdrop(open) {
    var node = document.querySelector('.kiwi-select-backdrop');
    if (!node) {
      node = document.createElement('div');
      node.className = 'kiwi-select-backdrop';
      node.addEventListener('click', function () { if (openControl) close(openControl, true); });
      document.body.appendChild(node);
    }
    node.classList.toggle('is-open', !!open);
  }

  function open(control) {
    if (control.select.disabled) return;
    if (openControl && openControl !== control) close(openControl, false);
    if (control.popover) return close(control, true);
    sync(control);
    renderPopover(control);
    openControl = control;
    control.trigger.setAttribute('aria-expanded', 'true');
    backdrop(true);
    position(control);
    var options = visibleOptions(control);
    var selected = options.findIndex(function (button) { return button.getAttribute('aria-selected') === 'true'; });
    setActive(control, selected < 0 ? 0 : selected, false);
    requestAnimationFrame(function () {
      if (control.search) control.search.focus();
      else if (options[Math.max(0, selected)]) options[Math.max(0, selected)].focus({ preventScroll: true });
    });
  }

  function close(control, restoreFocus) {
    if (!control || !control.popover) return;
    control.popover.remove();
    control.popover = null;
    control.search = null;
    control.trigger.setAttribute('aria-expanded', 'false');
    if (openControl === control) openControl = null;
    backdrop(false);
    if (restoreFocus && control.trigger.isConnected) control.trigger.focus({ preventScroll: true });
  }

  function choose(control, optionIndex) {
    var select = control.select;
    var option = select.options[optionIndex];
    if (!option || option.disabled) return;
    var changed = select.selectedIndex !== optionIndex;
    select.selectedIndex = optionIndex;
    select.setCustomValidity('');
    sync(control);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close(control, true);
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || enhanced.has(select) || select.matches(skipSelector)) return null;
    var id = 'kiwi-select-' + (++sequence);
    var parts = createTrigger(select, id);
    var control = { id: id, select: select, wrapper: parts.wrapper, trigger: parts.trigger, popover: null, search: null, activeIndex: 0 };
    enhanced.set(select, control);
    select.classList.add('kiwi-select-native');
    select.dataset.kiwiSelectEnhanced = 'true';
    select.tabIndex = -1;

    parts.trigger.addEventListener('click', function () { open(control); });
    parts.trigger.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(control);
      }
    });
    select.addEventListener('change', function () { sync(control); });
    select.addEventListener('invalid', function (event) {
      event.preventDefault();
      sync(control);
      parts.trigger.focus();
    });
    sync(control);
    return control;
  }

  function enhanceAll(root) {
    if (!root) return;
    if (root.matches && root.matches('select')) enhance(root);
    if (root.querySelectorAll) Array.from(root.querySelectorAll('select')).forEach(enhance);
  }

  function refresh(select) {
    var control = enhanced.get(select);
    if (!control) return enhance(select);
    sync(control);
    if (control.popover) {
      close(control, false);
      open(control);
    }
    return control;
  }

  function init() {
    enhanceAll(document);
    var observer = new MutationObserver(function (mutations) {
      var selects = new Set();
      mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) enhanceAll(node);
          });
        }
        var target = mutation.target;
        var select = target instanceof HTMLSelectElement ? target : target.closest && target.closest('select');
        if (select) selects.add(select);
      });
      selects.forEach(refresh);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'value', 'hidden'] });
    document.addEventListener('change', function (event) {
      if (event.target instanceof HTMLSelectElement) refresh(event.target);
    }, true);
    document.addEventListener('pointerdown', function (event) {
      if (openControl && !openControl.popover.contains(event.target) && !openControl.trigger.contains(event.target)) close(openControl, false);
    }, true);
    document.addEventListener('reset', function (event) {
      setTimeout(function () { enhanceAll(event.target); }, 0);
    }, true);
    window.addEventListener('resize', function () { if (openControl) position(openControl); }, { passive: true });
    window.addEventListener('scroll', function () { if (openControl) position(openControl); }, { passive: true, capture: true });
  }

  window.KiwiSelect = { enhance: enhance, enhanceAll: enhanceAll, refresh: refresh, close: function () { if (openControl) close(openControl, false); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
