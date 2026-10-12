/* Kiwi · bug-bash pilot (tester-army/e2e, Apache-2.0). See README.md.
 *
 * Every target is the repo served by serve.mjs on a free loopback port:
 * demo data only, no /api, no merchant reachable. The model is Workers AI
 * (@cf/ only, the repo's AI policy), reached through its OpenAI-compatible
 * endpoint with the CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN of the
 * shell. Neither value is ever written to a file. */
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const account = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const workersAI = createOpenAICompatible({
  name: 'workers-ai',
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
  apiKey: process.env.CLOUDFLARE_API_TOKEN || '',
  /* The planner asks for a JSON schema; Workers AI honours response_format. */
  supportsStructuredOutputs: true,
});
const model = workersAI(process.env.KIWI_EXPLORE_MODEL || '@cf/zai-org/glm-5.3-flash');

const serve = { executable: process.execPath, args: [new URL('./serve.mjs', import.meta.url).pathname, '{port}'] };
const target = (name: string, page: string) => ({
  name,
  engine: web({ viewport: { width: 1366, height: 900 }, locale: 'fr-MA', timezoneId: 'Africa/Casablanca' }),
  app: { url: `http://127.0.0.1:0/${page}`, command: serve },
});

/* True for any tester on Kiwi: names, where things live, what is by design. */
const context = [
  'Kiwi is a point-of-sale product for Moroccan merchants. The interface is French by default; English and Arabic (right to left) are available.',
  'dashboard.html is the owner dashboard (sales, orders, team, menu, stock). kiwi-caisse.html is the till (« la caisse »): pick items, then « Encaisser » to take payment. kiwi-serveur.html is the waiter app (tables, orders sent to the kitchen).',
  'This copy runs on DEMO data with no server: requests to /api fail by design and figures follow the clock. Do not report a failed /api request, missing Google Fonts, or demo numbers changing between visits as bugs.',
  'Amounts are in MAD (dirhams) with a comma decimal separator. The business day starts at 05:00, not midnight.',
  'Some screens ask for a four-digit staff code. Do not guess codes; if a code screen blocks the goal, say the step is blocked.',
].join('\n');

/* GLM thinks before it answers; at the default effort a planning call ran
   past its step budget. 'low' is what the product's own GLM routes use. */
const providerOptions = { 'workers-ai': { reasoning_effort: 'low' } };
const persona = (system: string) => ({ model, context, system, maxSteps: 30, maxModelCalls: 30, providerOptions });

export default {
  targets: [
    target('dashboard', 'dashboard.html'),
    target('caisse', 'kiwi-caisse.html'),
    target('serveur', 'kiwi-serveur.html'),
  ],
  agents: {
    default: persona('You are a careful tester. Verify what the screen says before you conclude a step, and report only what you observed.'),
    newcomer: persona('You are a merchant using Kiwi for the first time. You follow labels literally. Report anything confusing, mislabelled, or that does not do what its label says.'),
    numbers: persona('You check numbers and copy. Recompute every total, count and percentage you see from its parts. Report arithmetic that does not add up, wrong currency formatting, untranslated or mixed-language text, and typos.'),
    edges: persona('You try edge input: empty fields, zero and negative quantities, very long names, many items, double taps. Report crashes, frozen screens, and values that should have been refused.'),
    reload: persona('You check state across reloads and navigation. Do something, reload or leave and come back, and report anything that was lost, duplicated, or reverted.'),
  },
  trace: 'on',
  output: '.e2e',
} satisfies E2EConfig;
