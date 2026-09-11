import { json, readSession, readCookie, SESS_COOKIE } from '../../auth/_lib.js';
import { tenantFor, storeOwner } from '../_private.js';
import { quotaOk } from './_quota.js';
import { runWithFallback } from './_run.js';
import { parseModelResponse } from './invoice.js';

const PRIMARY_MODEL = '@cf/zai-org/glm-5.3-flash';
const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const MAX_CATEGORIES = 80;
const MAX_ITEMS = 400;
/* Compteur propre : en partageant le kind 'menuimport', un gros import de
 * carte vidait le quota des opérations de menu pour le reste de la journée. */
const DAILY_CAP = 60;

function shortText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanCatalogue(raw) {
  const categories = [];
  const categoryIds = new Set();
  for (const entry of Array.isArray(raw?.categories) ? raw.categories.slice(0, MAX_CATEGORIES) : []) {
    const id = shortText(entry?.id, 80);
    const name = shortText(entry?.name, 160);
    if (!id || !name || categoryIds.has(id)) continue;
    categoryIds.add(id);
    categories.push({ id, name });
  }
  const items = [];
  const itemIds = new Set();
  for (const entry of Array.isArray(raw?.items) ? raw.items.slice(0, MAX_ITEMS) : []) {
    const id = shortText(entry?.id, 80);
    const name = shortText(entry?.name, 180);
    const price = Number(entry?.price);
    if (!id || !name || itemIds.has(id) || !Number.isFinite(price) || price < 0) continue;
    itemIds.add(id);
    items.push({
      id,
      name,
      catId: categoryIds.has(String(entry?.catId || '')) ? String(entry.catId) : '',
      price: Math.round(price * 100) / 100,
      desc: shortText(entry?.desc, 240),
    });
  }
  return { categories, items };
}

function validateBulkProposal(raw, catalogue) {
  const proposal = raw?.proposal || raw;
  if (!proposal || proposal.action !== 'bulk_price') return null;
  const scope = ['all', 'categories', 'products'].includes(proposal.scope) ? proposal.scope : '';
  const mode = ['fixed', 'percent'].includes(proposal.mode) ? proposal.mode : '';
  const value = Number(proposal.value);
  if (!scope || !mode || !Number.isFinite(value) || value < 0) return null;
  if ((mode === 'percent' && value > 500) || (mode === 'fixed' && value > 10000)) return null;
  const categoryIds = new Set(catalogue.categories.map((entry) => entry.id));
  const itemIds = new Set(catalogue.items.map((entry) => entry.id));
  const selectedCategories = [...new Set((Array.isArray(proposal.categoryIds) ? proposal.categoryIds : []).map(String).filter((id) => categoryIds.has(id)))];
  const selectedProducts = [...new Set((Array.isArray(proposal.productIds) ? proposal.productIds : []).map(String).filter((id) => itemIds.has(id)))];
  if (scope === 'categories' && !selectedCategories.length) return null;
  if (scope === 'products' && !selectedProducts.length) return null;
  return {
    action: 'bulk_price', scope, mode, value: Math.round(value * 100) / 100,
    roundUp: mode === 'percent' && proposal.roundUp === true,
    categoryIds: scope === 'categories' ? selectedCategories : [],
    productIds: scope === 'products' ? selectedProducts : [],
    summary: shortText(proposal.summary, 280),
  };
}

function validateInspection(raw, catalogue) {
  const kinds = new Set(['duplicate', 'missing-description', 'price-inconsistency', 'category', 'translation', 'other']);
  const itemIds = new Set(catalogue.items.map((entry) => entry.id));
  const findings = [];
  for (const finding of Array.isArray(raw?.findings) ? raw.findings.slice(0, 30) : []) {
    const title = shortText(finding?.title, 180);
    const detail = shortText(finding?.detail, 500);
    if (!title || !detail) continue;
    findings.push({
      severity: finding?.severity === 'warning' ? 'warning' : 'info',
      kind: kinds.has(finding?.kind) ? finding.kind : 'other', title, detail,
      itemIds: [...new Set((Array.isArray(finding?.itemIds) ? finding.itemIds : []).map(String).filter((id) => itemIds.has(id)))].slice(0, 20),
    });
  }
  return findings;
}

async function accountMerchant(request, env, requestedMerchant) {
  if (!env.AUTH_SECRET || !env.DB) return '';
  const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (!session?.aid) return '';
  const merchant = await tenantFor(request, env, requestedMerchant, { strict: true });
  if (!merchant) return '';
  const owner = await storeOwner(env, merchant);
  if (owner && owner !== session.aid) return '';
  return merchant;
}

function systemPrompt(kind) {
  if (kind === 'bulk') return `Convert the merchant instruction into one safe Kiwi price-increase proposal. Return JSON only:
{"action":"bulk_price","scope":"all|categories|products","mode":"fixed|percent","value":number,"roundUp":boolean,"categoryIds":[],"productIds":[],"summary":"short explanation in the user's language"}
Only increases are supported. Resolve names only from the supplied catalogue and return only supplied IDs. Use scope=products for exclusions. roundUp is only valid for percentages. Never invent products, IDs, prices, or actions. If ambiguous, return {"error":"clarification-needed"}.`;
  return `Inspect this menu conservatively. Return JSON only:
{"findings":[{"severity":"info|warning","kind":"duplicate|missing-description|price-inconsistency|category|translation|other","title":"...","detail":"...","itemIds":[]}]}
Use only supplied facts and IDs. Look for likely duplicate names, missing descriptions, unusual price inconsistencies inside comparable categories, weak categorisation, and visibly missing translation text. Never infer allergens, ingredients, legality, food safety, profitability, or demand. Do not propose writes. Use the user's language. Maximum 20 high-signal findings.`;
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ ok: false, error: 'ai-unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'invalid-json' }, 400); }
  const kind = body?.kind === 'inspect' ? 'inspect' : body?.kind === 'bulk' ? 'bulk' : '';
  if (!kind) return json({ ok: false, error: 'invalid-kind' }, 400);
  const merchant = await accountMerchant(request, env, shortText(body?.merchant, 100));
  if (!merchant) return json({ ok: false, error: 'forbidden' }, 403);
  const allowed = await quotaOk(env, merchant, 'menuoperations', DAILY_CAP);
  if (!allowed) return json({ ok: false, error: 'daily-quota-exceeded' }, 429);
  const catalogue = cleanCatalogue(body?.catalogue);
  if (!catalogue.items.length) return json({ ok: false, error: 'empty-menu' }, 400);
  const instruction = shortText(body?.instruction, 700);
  if (kind === 'bulk' && !instruction) return json({ ok: false, error: 'instruction-required' }, 400);
  try {
    const run = await runWithFallback(env, PRIMARY_MODEL, FALLBACK_MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(kind) },
        { role: 'user', content: JSON.stringify({
          menu: { id: shortText(body?.menuId, 80), name: shortText(body?.menuName, 160) },
          instruction: kind === 'bulk' ? instruction : 'Inspect this menu and report only high-signal issues.', catalogue,
        }) },
      ],
      max_tokens: kind === 'inspect' ? 2600 : 1400, temperature: 0.1,
    });
    const parsed = parseModelResponse(run.result);
    if (!parsed || parsed.error) return json({ ok: false, error: parsed?.error || 'invalid-ai-response' }, 422);
    if (kind === 'bulk') {
      const proposal = validateBulkProposal(parsed, catalogue);
      if (!proposal) return json({ ok: false, error: 'unsafe-or-invalid-proposal' }, 422);
      return json({ ok: true, kind, model: run.model, proposal });
    }
    return json({ ok: true, kind, model: run.model, findings: validateInspection(parsed, catalogue) });
  } catch (error) {
    return json({ ok: false, error: 'ai-failed', detail: shortText(error?.message, 180) }, 502);
  }
}

export { cleanCatalogue, validateBulkProposal, validateInspection };
