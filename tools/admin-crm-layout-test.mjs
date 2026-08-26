import fs from 'node:fs';

const html = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
let passed = 0;

function check(name, condition){
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
}

check('new Kiwi favicon is used', html.includes('assets/kiwi-favicon-new.svg'));
check('new inverse Kiwi mark is used', html.includes('assets/kiwi-newlogo-inverse.svg'));
check('CRM cockpit is discoverable', html.includes('id="crm-command"') && html.includes('Centre de relation client'));
check('lifecycle pipeline is present', html.includes('id="crm-pipeline"') && html.includes('Cycle de vie'));
check('priority queue is present', html.includes('id="crm-focus"') && html.includes('À traiter'));
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
check('expiring subscriptions are surfaced at the top', html.includes('id="billing-alerts"') && html.includes('renderBillingAlerts(CRM_CLIENTS)'));
check('store suspension remains available', html.includes('toggleStoreSuspend(c)'));
check('account suspension remains available', html.includes('toggleSuspend(c)'));
check('destructive store deletion remains guarded', html.includes('askDeleteStore(c)'));
check('operator access remains present', html.includes('id="operators"'));
check('responsive cockpit collapses on phones', html.includes('.crm-pipeline{grid-template-columns:1fr}'));
check('user-visible business copy hides raw SQL', !html.includes("hint.textContent = 'Les colonnes ville"));
check('CRM preserves honest metric wording', html.includes('Signal portefeuille, jamais un revenu Kiwi'));

console.log(`admin-crm-layout-test: ${passed} controls passed`);
