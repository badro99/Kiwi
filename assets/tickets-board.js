/* Tickets board. Exports: saveFilters, labelOf, taxonomyItem, replaceSelectOptions, subkindsFor, make, formatTime, daysRemaining, actionButton, actionArea, copyButton, imageGallery, classificationSummary, classificationEditor, ticketCard, emptyState, filterButton, renderFilters, ticketMatchesFilters, render, renderLoading, toggleClassification, applyFilter, activateTab.
 * Reads injected: $, FILTER_KEY, LANG, LOCALE, TAXONOMY_AR, board, followupHistory, icons, lists, plural, state, t. Browser APIs are declared in split.json.
 * Mutable shared fields belong to the data owner; other modules receive its view. */
export function createBoard({ $, FILTER_KEY, LANG, LOCALE, TAXONOMY_AR, board, followupHistory, icons, lists, plural, state, t }) {
  function saveFilters() {
    try { window.localStorage.setItem(FILTER_KEY, JSON.stringify(state.filters)); } catch (_) {}
  }

  function labelOf(item) {
    if (!item) return '';
    const label = item.label || {};
    return label[LANG] || (LANG === 'ar' ? TAXONOMY_AR[item.id] : '') || label.fr || label.en || item.id;
  }

  function taxonomyItem(group, id) {
    if (!state.taxonomy || !id) return null;
    const items = group === 'subkinds'
      ? Object.values(state.taxonomy.subkinds || {}).flat()
      : (state.taxonomy[group] || []);
    return items.find((item) => item.id === id) || null;
  }

  function replaceSelectOptions(select, items, emptyLabel, selected) {
    select.replaceChildren();
    if (emptyLabel !== null) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = emptyLabel;
      select.append(empty);
    }
    (items || []).forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = labelOf(item);
      select.append(option);
    });
    select.value = selected || '';
  }

  function subkindsFor(kind) {
    return state.taxonomy && state.taxonomy.subkinds
      ? (state.taxonomy.subkinds[kind] || [])
      : [];
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(date);
    if (sameDay) return t('time.today', { time });
    if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time });
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
  }

  function daysRemaining(timestamp) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000));
  }

  function actionButton(ticket) {
    if (ticket.status === 'done') return null;
    const button = make('button', 'move-button' + (ticket.status === 'testing' ? ' move-testing' : ''));
    button.type = 'button';
    button.dataset.action = ticket.status === 'problem' ? 'fixed' : 'tested';
    button.dataset.id = String(ticket.id);
    const label = t(ticket.status === 'problem' ? 'action.fixed' : 'action.tested');
    button.setAttribute('aria-label', t(ticket.status === 'problem' ? 'action.fixedAria' : 'action.testedAria', { number: ticket.number }));
    button.append(document.createTextNode(label));
    return button;
  }

  function actionArea(ticket) {
    if (ticket.status === 'done') return null;
    const actions = make('div', 'ticket-actions' + (ticket.status === 'testing' ? ' has-failed-action' : ''));
    if (ticket.status === 'testing') {
      const failed = make('button', 'failed-test-button', t('action.failed'));
      failed.type = 'button';
      failed.dataset.action = 'test-failed';
      failed.dataset.id = String(ticket.id);
      failed.setAttribute('aria-label', t('action.failedAria', { number: ticket.number }));
      actions.append(failed);
    }
    actions.append(actionButton(ticket));
    return actions;
  }

  function copyButton(kind, ticket, image) {
    const button = make('button', 'copy-button');
    button.type = 'button';
    button.dataset.action = kind === 'text' ? 'copy-text' : 'copy-image';
    button.dataset.id = String(ticket.id);
    if (image) button.dataset.url = image.url;
    button.append(document.createTextNode(t(kind === 'text' ? 'copy.text' : 'copy.image')));
    button.setAttribute('aria-label', t(kind === 'text' ? 'copy.textAria' : 'copy.imageAria', { number: ticket.number }));
    return button;
  }

  function imageGallery(ticket, images, altKey) {
    if (!images || !images.length) return null;
    const gallery = make('div', 'ticket-gallery');
    gallery.classList.toggle('is-single', images.length === 1);
    images.forEach((image, index) => {
      const figure = make('figure', 'ticket-photo');
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = t(altKey || 'image.alt', { number: ticket.number, index: index + 1 });
      img.loading = 'lazy';
      img.decoding = 'async';
      figure.append(img, copyButton('image', ticket, image));
      gallery.append(figure);
    });
    return gallery;
  }

  function classificationSummary(ticket) {
    const wrap = make('div', 'classification-summary');
    const chips = make('div', 'classification-chips');
    const kind = taxonomyItem('kinds', ticket.kind || 'unsorted');
    chips.append(make('span', 'classification-chip kind-chip kind-' + (ticket.kind || 'unsorted'), labelOf(kind) || t('chip.unsorted')));
    const area = taxonomyItem('areas', ticket.area);
    if (area) chips.append(make('span', 'classification-chip area-chip', labelOf(area)));
    const subkind = taxonomyItem('subkinds', ticket.subkind);
    if (subkind) chips.append(make('span', 'classification-chip subkind-chip', labelOf(subkind)));
    if (ticket.moneyAtRisk) chips.append(make('span', 'classification-chip money-chip', t('money.label')));

    const edit = make('button', 'classify-button');
    edit.type = 'button';
    edit.dataset.action = 'toggle-classification';
    edit.dataset.id = String(ticket.id);
    edit.setAttribute('aria-expanded', 'false');
    edit.setAttribute('aria-label', t('classify.aria', { number: ticket.number }));
    const icon = document.createElement('img');
    icon.className = 'material-icon';
    icon.src = 'assets/icons/material/category.svg';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    edit.append(icon, document.createTextNode(t('classify')));
    wrap.append(chips, edit);
    return wrap;
  }

  function classificationEditor(ticket) {
    const editor = make('form', 'classification-editor');
    editor.hidden = true;
    editor.dataset.classificationForm = String(ticket.id);

    const kindLabel = make('label', '', t('field.type'));
    const kind = document.createElement('select');
    kind.name = 'kind';
    kind.dataset.classificationKind = '';
    replaceSelectOptions(kind, state.taxonomy.kinds, null, ticket.kind || 'unsorted');
    kindLabel.append(kind);

    const areaLabel = make('label', '', t('field.area'));
    const area = document.createElement('select');
    area.name = 'area';
    replaceSelectOptions(area, state.taxonomy.areas, t('area.none'), ticket.area);
    areaLabel.append(area);

    const subkindLabel = make('label', '', t('field.subkind'));
    subkindLabel.dataset.classificationSubkindField = '';
    const subkind = document.createElement('select');
    subkind.name = 'subkind';
    subkindLabel.append(subkind);
    const syncSubkind = (selected) => {
      const items = subkindsFor(kind.value);
      replaceSelectOptions(subkind, items, t('subkind.none'), items.some((item) => item.id === selected) ? selected : '');
      subkindLabel.hidden = items.length === 0;
    };
    syncSubkind(ticket.subkind);
    kind.addEventListener('change', () => syncSubkind(''));

    const money = make('label', 'editor-money-toggle');
    const moneyInput = document.createElement('input');
    moneyInput.type = 'checkbox';
    moneyInput.name = 'money_at_risk';
    moneyInput.checked = Boolean(ticket.moneyAtRisk);
    money.append(moneyInput, document.createTextNode(t('money.label')));

    const save = make('button', 'classification-save', t('class.save'));
    save.type = 'submit';
    editor.append(kindLabel, areaLabel, subkindLabel, money, save);
    return editor;
  }

  function ticketCard(ticket) {
    const card = make('article', 'ticket-card' + (ticket.status === 'done' ? ' ticket-done' : ''));
    card.dataset.ticketId = String(ticket.id);
    const meta = make('div', 'ticket-meta');
    meta.append(make('span', 'ticket-number', ticket.number));
    meta.append(make('span', '', formatTime(ticket.createdAt)));
    card.append(meta, classificationSummary(ticket), classificationEditor(ticket));

    if (ticket.status === 'done') {
      card.append(make('p', '', ticket.body));
      const history = followupHistory(ticket);
      if (history) card.append(history);
      const expiry = make('div', 'expiry');
      expiry.insertAdjacentHTML('afterbegin', icons.clock);
      const days = daysRemaining(ticket.expiresAt);
      expiry.append(document.createTextNode(days === 0 ? t('expiry.today') : plural('expiry.days', days)));
      card.append(expiry);
      return card;
    }

    const copyRow = make('div', 'copy-row');
    copyRow.append(make('p', '', ticket.body));
    copyRow.append(copyButton('text', ticket));
    card.append(copyRow);

    const gallery = imageGallery(ticket, ticket.images, 'image.alt');
    if (gallery) card.append(gallery);
    const history = followupHistory(ticket);
    if (history) card.append(history);
    card.append(actionArea(ticket));
    return card;
  }

  function emptyState(status) {
    const empty = make('div', 'empty-state');
    empty.insertAdjacentHTML('afterbegin', status === 'done' ? icons.clock : icons.photo);
    empty.append(make('strong', '', t(`empty.${status}.title`)), make('span', '', t(`empty.${status}.body`)));
    return empty;
  }

  function filterButton(label, dimension, value, active) {
    const button = make('button', 'filter-pill' + (active ? ' on' : ''), label);
    button.type = 'button';
    button.dataset.lensItem = '';
    button.dataset.filterDimension = dimension;
    button.dataset.filterValue = value;
    button.setAttribute('aria-pressed', String(active));
    return button;
  }

  function renderFilters() {
    if (!state.taxonomy) return;
    const kindWrap = $('kindFilters');
    const areaWrap = $('areaFilters');
    const moneyWrap = $('moneyFilters');
    if (!kindWrap.dataset.ready) {
      kindWrap.append(filterButton(t('filter.all'), 'kind', '', !state.filters.kind));
      state.taxonomy.kinds.forEach((item) => {
        kindWrap.append(filterButton(labelOf(item), 'kind', item.id, state.filters.kind === item.id));
      });
      kindWrap.dataset.ready = '1';
    }
    if (!areaWrap.dataset.ready) {
      areaWrap.append(filterButton(t('filter.all'), 'area', '', !state.filters.area));
      state.taxonomy.areas.forEach((item) => {
        areaWrap.append(filterButton(labelOf(item), 'area', item.id, state.filters.area === item.id));
      });
      areaWrap.dataset.ready = '1';
    }
    if (!moneyWrap.dataset.ready) {
      moneyWrap.append(
        filterButton(t('filter.all'), 'money', '', !state.filters.money),
        filterButton(t('money.label'), 'money', '1', state.filters.money),
      );
      moneyWrap.dataset.ready = '1';
    }
    document.querySelectorAll('[data-filter-dimension]').forEach((button) => {
      const dimension = button.dataset.filterDimension;
      const value = button.dataset.filterValue || '';
      const active = dimension === 'money'
        ? state.filters.money === (value === '1')
        : state.filters[dimension] === value;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('resetFilters').disabled = !state.filters.kind && !state.filters.area && !state.filters.money;
    if (window.KiwiLens) window.KiwiLens.rescan();
  }

  function ticketMatchesFilters(ticket) {
    if (state.filters.kind && ticket.kind !== state.filters.kind) return false;
    if (state.filters.area && ticket.area !== state.filters.area) return false;
    if (state.filters.money && !ticket.moneyAtRisk) return false;
    return true;
  }

  function render() {
    ['problem', 'testing', 'done'].forEach((status) => {
      const tickets = state.tickets
        .filter((ticket) => ticket.status === status && ticketMatchesFilters(ticket))
        .sort((a, b) => Number(b.moneyAtRisk) - Number(a.moneyAtRisk) || b.id - a.id);
      lists[status].replaceChildren();
      if (!tickets.length) lists[status].append(emptyState(status));
      else tickets.forEach((ticket) => lists[status].append(ticketCard(ticket)));
      const suffix = status === 'problem' ? 'Problem' : status === 'testing' ? 'Testing' : 'Done';
      $('count' + suffix).textContent = String(tickets.length);
      $('tabCount' + suffix).textContent = String(tickets.length);
    });
    renderFilters();
  }

  function renderLoading() {
    Object.values(lists).forEach((list) => {
      const loading = make('div', 'loading-card');
      loading.innerHTML = '<span></span><span></span><span></span>';
      list.replaceChildren(loading);
    });
  }

  function toggleClassification(ticket, button) {
    const card = button.closest('.ticket-card');
    const editor = card && card.querySelector('[data-classification-form]');
    if (!editor) return;
    const opening = editor.hidden;
    editor.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) editor.querySelector('select').focus();
  }

  function applyFilter(button) {
    const dimension = button.dataset.filterDimension;
    const value = button.dataset.filterValue || '';
    if (dimension === 'money') state.filters.money = value === '1';
    else if (dimension === 'kind' || dimension === 'area') state.filters[dimension] = value;
    saveFilters();
    render();
  }

  function activateTab(status) {
    board.dataset.mobileStatus = status;
    document.querySelectorAll('.mobile-tab').forEach((item) => {
      const active = item.dataset.status === status;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }

  return Object.freeze({ saveFilters, labelOf, taxonomyItem, replaceSelectOptions, subkindsFor, make, formatTime, daysRemaining, actionButton, actionArea, copyButton, imageGallery, classificationSummary, classificationEditor, ticketCard, emptyState, filterButton, renderFilters, ticketMatchesFilters, render, renderLoading, toggleClassification, applyFilter, activateTab });
}
