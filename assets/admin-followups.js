/* A small translated administration surface. APIs retain authority and identity. */
(function () {
  'use strict';
  var COPY = {
    fr: {
      console:'Console opérateur',title:'Suivis et notes',scope:'Suivis internes des établissements. Chaque modification est attribuée à votre session opérateur.',
      merchant:'Établissement',refresh:'Rafraîchir',tasks:'Suivis',edit:'Mettre à jour le suivi',status:'État',outcome:'Résultat / preuve (requis pour résoudre)',
      snooze:'Reprendre le suivi le',invalid:'Choisissez une date future pour le report.',save:'Enregistrer',reload:'Relire la version serveur en gardant mon résultat',cancel:'Annuler',notes:'Notes internes',note:'Nouvelle note',saveNote:'Enregistrer la note',
      privacy:'Visible par l’équipe opérateur. Ne pas ajouter de code personnel, de mot de passe ou de donnée de paiement.',
      open:'À faire',in_progress:'En cours',snoozed:'Reporté',resolved:'Résolu',loading:'Lecture en cours…',ready:'Lecture serveur confirmée.',empty:'Aucun suivi.',noNotes:'Aucune note.',
      forbidden:'Une session opérateur nommée est requise. Ouvrez la console pour vous connecter.',unavailable:'Service indisponible. Aucune modification confirmée. Réessayez.',
      conflict:'Ce suivi a changé. Relisez la version serveur avant de confirmer à nouveau. Votre résultat est conservé.',required:'Un résultat est requis pour résoudre.',
      sources:'Sources indisponibles. Les écritures sont suspendues ; aucune liste vide n’est déduite de cet échec.',saved:'Modification confirmée par le serveur.',
      choose:'Choisissez un établissement.',noteSaved:'Note confirmée par le serveur.',missing:'Ce suivi n’est plus disponible. Fermez l’éditeur et rafraîchissez.'
    },
    en: {
      console:'Operator console',title:'Followups and notes',scope:'Internal merchant followups. Every change is attributed to your operator session.',
      merchant:'Merchant',refresh:'Refresh',tasks:'Followups',edit:'Update followup',status:'Status',outcome:'Outcome / evidence (required to resolve)',
      snooze:'Resume followup on',invalid:'Choose a future date to snooze.',save:'Save',reload:'Reload server version and keep my outcome',cancel:'Cancel',notes:'Internal notes',note:'New note',saveNote:'Save note',
      privacy:'Visible to the operator team. Do not add personal codes, passwords or payment details.',
      open:'To do',in_progress:'In progress',snoozed:'Snoozed',resolved:'Resolved',loading:'Loading…',ready:'Server read confirmed.',empty:'No followups.',noNotes:'No notes.',
      forbidden:'A named operator session is required. Open the console to sign in.',unavailable:'Service unavailable. No change confirmed. Try again.',
      conflict:'This followup has changed. Reload the server version before confirming again. Your outcome is preserved.',required:'An outcome is required to resolve.',
      sources:'Sources unavailable. Writes are paused; this failure is not treated as an empty list.',saved:'Change confirmed by the server.',
      choose:'Choose a merchant.',noteSaved:'Note confirmed by the server.',missing:'This followup is no longer available. Close the editor and refresh.'
    },
    ar: {
      console:'لوحة المشغّل',title:'المتابعات والملاحظات',scope:'متابعات داخلية للمؤسسات. يُنسب كل تغيير إلى جلسة المشغّل الخاصة بك.',
      merchant:'المؤسسة',refresh:'تحديث',tasks:'المتابعات',edit:'تحديث المتابعة',status:'الحالة',outcome:'النتيجة / الدليل (مطلوب للحل)',
      snooze:'استئناف المتابعة في',invalid:'اختر تاريخا مستقبليا لتأجيل المتابعة.',save:'حفظ',reload:'قراءة نسخة الخادم مع الاحتفاظ بالنتيجة',cancel:'إلغاء',notes:'ملاحظات داخلية',note:'ملاحظة جديدة',saveNote:'حفظ الملاحظة',
      privacy:'مرئية لفريق المشغّلين. لا تضف رموزا شخصية أو كلمات مرور أو بيانات دفع.',
      open:'للتنفيذ',in_progress:'قيد التنفيذ',snoozed:'مؤجلة',resolved:'تم الحل',loading:'جارٍ التحميل…',ready:'تم تأكيد القراءة من الخادم.',empty:'لا توجد متابعات.',noNotes:'لا توجد ملاحظات.',
      forbidden:'يجب تسجيل الدخول بجلسة مشغّل مسمّى. افتح اللوحة لتسجيل الدخول.',unavailable:'الخدمة غير متاحة. لم يتم تأكيد أي تغيير. أعد المحاولة.',
      conflict:'تغيرت هذه المتابعة. اقرأ نسخة الخادم قبل التأكيد مجددا. تم الاحتفاظ بالنتيجة.',required:'النتيجة مطلوبة لحل المتابعة.',
      sources:'المصادر غير متاحة. تم تعليق التغييرات؛ لا يُعتبر هذا الفشل قائمة فارغة.',saved:'أكد الخادم التغيير.',
      choose:'اختر مؤسسة.',noteSaved:'أكد الخادم الملاحظة.',missing:'هذه المتابعة لم تعد متاحة. أغلق المحرر وحدّث الصفحة.'
    }
  };
  var requested = new URLSearchParams(location.search).get('lang');
  try { requested = requested || localStorage.getItem('kiwiLang'); } catch (_) {}
  var lang = Object.hasOwn(COPY, requested) ? requested : 'fr', c = COPY[lang];
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.title = 'Kiwi · ' + c.title;
  document.querySelectorAll('[data-copy]').forEach(function (el) { el.textContent = c[el.dataset.copy]; });
  var $ = function (id) { return document.getElementById(id); };
  var rows = [], editing = null, noteAttempt = null, reading = 0, ready = false;
  ['open','in_progress','snoozed','resolved'].forEach(function (s) { $('task-status').add(new Option(c[s], s)); });
  function message(error) {
    return error.status === 403 ? c.forbidden : error.code === 'version-conflict' ? c.conflict : error.code === 'outcome-required' ? c.required : error.code === 'invalid-task-state' ? c.invalid : c.unavailable;
  }
  async function api(route, method, body) {
    var res = await fetch('/api/admin/' + route, { method:method || 'GET', credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}) });
    var data = await res.json();
    if (!res.ok) { var err = new Error(); err.status = res.status; err.code = data.error; throw err; }
    return data;
  }
  function taskFocus(id) { var button = Array.from(document.querySelectorAll('[data-task]')).find(function (b) { return b.dataset.task === id; }); (button || $('merchant')).focus(); }
  function closeEditor() { var id = editing && editing.id; editing = null; $('task-editor').hidden = true; taskFocus(id); }
  function snoozeField() { $('snooze-field').hidden = $('task-status').value !== 'snoozed'; }
  $('task-status').onchange = snoozeField;
  function setEditing(task) {
    editing = {...task}; $('task-title').textContent = task.title; $('task-status').value = task.status; $('task-outcome').value = task.outcome || '';
    var date = task.snoozed_until ? new Date(task.snoozed_until) : null;
    $('task-snooze').value = date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''; snoozeField();
    $('task-error').textContent = ''; $('task-editor').hidden = false; $('save-task').disabled = false; $('task-status').focus();
  }
  function render(data) {
    ready = !!(data.sources && data.sources.tasks && data.sources.tasks.available && data.sources.notes && data.sources.notes.available);
    $('save-note').disabled = !ready; $('save-task').disabled = !ready;
    if (!ready) throw new Error(c.sources);
    rows = data.sources.tasks.rows.filter(function (r) { return r.merchant === $('merchant').value; });
    $('tasks').replaceChildren();
    rows.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.task = r.id; b.textContent = r.title + ' · ' + (c[r.status] || r.status);
      b.onclick = function () { setEditing(r); }; $('tasks').appendChild(b);
    });
    if (!rows.length) $('tasks').textContent = c.empty;
    $('notes').replaceChildren();
    data.sources.notes.rows.filter(function (r) { return r.merchant === $('merchant').value; }).forEach(function (r) {
      var p = document.createElement('p'); p.textContent = r.actor + ' · ' + r.body; $('notes').appendChild(p);
    });
    if (!$('notes').children.length) $('notes').textContent = c.noNotes;
  }
  async function load() {
    var turn = ++reading, merchant = $('merchant').value;
    ready = false; $('save-note').disabled = true; $('save-task').disabled = true; $('page-error').textContent = ''; $('read-state').textContent = c.loading;
    if (!merchant) { $('tasks').replaceChildren(); $('notes').replaceChildren(); $('read-state').textContent = c.choose; return false; }
    try {
      var data = await api('workspace?merchant=' + encodeURIComponent(merchant));
      if (turn !== reading || merchant !== $('merchant').value) return false;
      render(data); $('read-state').textContent = c.ready; return true;
    } catch (err) {
      if (turn !== reading) return false;
      $('page-error').textContent = err.message === c.sources ? c.sources : message(err); $('read-state').textContent = ''; return false;
    }
  }
  $('merchant').onchange = function () { editing = null; noteAttempt = null; $('task-editor').hidden = true; $('note-body').value = ''; load(); };
  $('refresh').onclick = function () { if (editing) { $('save-task').disabled = true; $('task-error').textContent = c.conflict; } load(); };
  $('cancel-task').onclick = closeEditor;
  $('reload-task').onclick = async function () {
    $('reload-task').disabled = true;
    try {
      if (await load()) {
        var task = rows.find(function (r) { return editing && r.id === editing.id; });
        if (task) { editing = {...task}; $('task-title').textContent = task.title; $('task-error').textContent = ''; $('save-task').disabled = false; }
        else { $('task-error').textContent = c.missing; $('save-task').disabled = true; }
      }
    } finally { $('reload-task').disabled = false; }
  };
  $('task-form').onsubmit = async function (event) {
    event.preventDefault(); if (!editing || !ready || $('save-task').disabled) return;
    var task = {...editing}, outcome = $('task-outcome').value.trim(), status = $('task-status').value;
    if (status === 'resolved' && outcome.length < 3) { $('task-error').textContent = c.required; return; }
    var snooze = $('task-snooze').value ? new Date($('task-snooze').value).getTime() : null;
    if (status === 'snoozed' && !(snooze > Date.now())) { $('task-error').textContent = c.invalid; return; }
    $('save-task').disabled = true; $('task-error').textContent = '';
    try {
      await api('tasks', 'PATCH', { id:task.id, merchant:task.merchant, version:task.version, status:status, outcome:outcome, snoozed_until:snooze });
      if (editing && editing.id === task.id) { await load(); closeEditor(); $('read-state').textContent = c.saved; }
    } catch (err) { $('task-error').textContent = message(err); $('save-task').disabled = err.code === 'version-conflict' || !ready; }
  };
  $('note-form').onsubmit = async function (event) {
    event.preventDefault(); if (!ready || $('save-note').disabled) return;
    var body = $('note-body').value.trim(), merchant = $('merchant').value; if (!body) return;
    if (!noteAttempt || noteAttempt.body !== body || noteAttempt.merchant !== merchant) noteAttempt = {id:crypto.randomUUID(),merchant:merchant,body:body};
    $('save-note').disabled = true; $('note-error').textContent = '';
    try {
      await api('notes','POST',noteAttempt);
      if (merchant === $('merchant').value) { $('note-body').value = ''; noteAttempt = null; await load(); $('read-state').textContent = c.noteSaved; }
    } catch (err) { $('note-error').textContent = message(err); $('save-note').disabled = !ready; }
  };
  (async function () {
    try {
      var data = await api('clients');
      $('merchant').add(new Option(c.choose, ''));
      data.clients.filter(function (r) { return !r.demo; }).forEach(function (r) { $('merchant').add(new Option(r.business || r.merchant, r.merchant)); });
      $('merchant').disabled = false;
      if ($('merchant').options.length > 1) { $('merchant').selectedIndex = 1; await load(); }
    } catch (err) { $('page-error').textContent = message(err); }
  })();
})();
