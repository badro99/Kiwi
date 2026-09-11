import fs from 'node:fs';

const html = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/admin-workspace.css', import.meta.url), 'utf8');
const policy = fs.readFileSync(new URL('../assets/admin-policy.js', import.meta.url), 'utf8');
let passed = 0;

function check(name, condition){
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
}

check('new Kiwi favicon is used', html.includes('assets/kiwi-favicon-new.svg'));
check('new inverse Kiwi mark is used', html.includes('assets/kiwi-newlogo-inverse.svg'));
check('operational cockpit is discoverable', html.includes('id="op-workspace"') && html.includes('href="#today"'));
check('lifecycle uses shared access and commercial policy', workspace.includes('P.commercial(c,Date.now())') && workspace.includes('Parcours client'));
check('priority queue is not a five-item preview', workspace.includes('Votre file de travail') && workspace.includes('q.map(function(t)') && !workspace.includes('.slice(0,5)'));
check('CRM metrics are derived from real roster', html.includes('renderCrmHub(CRM_CLIENTS)'));
check('filters cover operational states', ['data-filter="active"','data-filter="pending"','data-filter="suspended"'].every(x => html.includes(x)));
check('sorting supports recency revenue and name', ['value="recent"','value="revenue"','value="name"'].every(x => html.includes(x)));
check('customer search remains available', html.includes('id="cli-q"'));
check('dashboard action remains available', html.includes('openDashboard(c.merchant)'));
check('confidential view remains available', html.includes('openPrivateDashboard(c.merchant)'));
check('caisse access remains available', html.includes('openCaisse(c)'));
check('subscription activation remains available', html.includes('activateSubscription(c)'));
check('monthly and annual billing are available', html.includes('value="monthly"') && html.includes('value="annual"'));
check('paid subscriptions carry start and end dates', html.includes('id="biz-sub-start"') && html.includes('id="biz-sub-end"'));
check('trials carry selectable duration and dates', html.includes('id="biz-trial-days"') && html.includes('id="biz-trial-start"') && html.includes('id="biz-trial-end"'));
check('expiring subscriptions generate actionable work', policy.includes("add('renewal-soon'") && workspace.includes('P.signals(state.clients'));
check('store suspension remains available', html.includes('toggleStoreSuspend(c)'));
check('account suspension remains available', html.includes('toggleSuspend(c)'));
check('destructive store deletion remains guarded', html.includes('askDeleteStore(c)'));
check('operator access remains present', html.includes('id="operators"'));
check('responsive cockpit uses phone bottom navigation', css.includes('@media(max-width:720px)') && css.includes('inset:auto 0 0'));
check('user-visible business copy hides raw SQL', !html.includes("hint.textContent = 'Les colonnes ville"));
check('CRM preserves honest metric wording', html.includes('Signal portefeuille, jamais un revenu Kiwi'));
check('dossier tools are separated into focused tabs', html.includes('data-dossier-panel="configuration"') && workspace.includes("onboarding:'Mise en route'"));
check('notes are append-only server requests', workspace.includes("request('/notes'") && workspace.includes('crypto.randomUUID()'));
check('forms are protected from automatic polling', workspace.includes("state.route!=='merchant'") && workspace.includes("dialog[open]"));
check('freshness is explicit', html.includes('id="op-freshness"') && workspace.includes('données anciennes'));
check('missing fleet coverage is never healthy', workspace.includes('Un résultat absent n’est pas un résultat sain'));
check('keyboard search available', workspace.includes("e.key.toLowerCase()==='k'"));
check('unattributed telemetry has an explicit diagnostic view', workspace.includes('errorList(m)') && workspace.includes('aucun client n’est deviné'));

console.log(`admin-crm-layout-test: ${passed} controls passed`);
