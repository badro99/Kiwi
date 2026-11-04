# Owner-delegated rulings · 4 November 2026

The owner asked the lead to "do the best and ideal solutions" for the items the
overnight ratings (15 to 18) left as product decisions. The lead ruled each one.
Format: `feature · question · ruling · why`. Ratings treat these as rulings: judge
whether the code implements them, not the ruling itself.

Kept as designed:
- hotel · paired hotel tills read guest ID-document numbers · kept for hotels only (commit 1249f64f1 already removes them from every other till) · reception fills the police form (fiche de police) at the counter; outside hotels nobody needs them.
- menu · a foreign-document 409 while publishing replaces the local carte with the server carte · kept · the server carte belongs to another device's newer publish; keeping the local one would overwrite it.

Implemented (or being implemented) as ruled:
- stock · the boutique catalogue never shows negative stock · it shows 0 with a visible "stock à vérifier · écart −N" badge, and the ledger keeps the real negative · offline sales can oversell; the merchant needs to see the gap to recount, not a negative shelf count.
- loyalty · a hand-recorded purchase without product lines · earns a visit stamp; a product stamp needs a product line, which staff can choose while recording · a product reward must rest on evidence of that product.
- loyalty · weighed products (fractional quantities) · one product stamp per qualifying purchase line with a positive quantity; unit products keep counting whole units · rounding made 0.4 kg earn nothing and 0.6 kg earn one.
- loyalty · linked product ids capped at 200, silently truncated · cap raised to 2 000; beyond it the save is refused with a translated message, never truncated · a silent cut stops earning on products nobody chose to drop.
- app · native confirmations used window.confirm · the branded native sheet (app/src/native-runtime.js) asks; the system dialog stays only as a fallback when the sheet is unavailable · one visual language, focus-managed, translated.
- pressing · the light workspace was pure white · it uses --paper like every surface · CLAUDE.md §4 forbids pure white backgrounds.
- sync · corrupt sales-queue copies kept to the newest five, older ones deleted · copies are kept until recovered or acknowledged, bounded by total size with a visible warning when the bound is near · they can hold unsent money; nothing deletes evidence silently.
- planning · payslip documents · a "relevé de paie" PDF built from Kiwi data (period, hours, rate, gross, advances, net to pay), clearly marked as not the official bulletin; CNSS, AMO and IR stay with the accountant · zero-cost and honest about what Kiwi computes.
- economat · requests while offline · queued durably with their existing idempotency key and replayed when the connection returns, with a visible pending state · the department keeps working without retyping a request.
- staff codes · sealing at rest (branch cx/r14-seal) · ships once PIN_PEPPER is set on the Pages project; the owner sets it with one command that generates the value locally (no one sees it) · setting production secrets stays with the owner.

Later the same day (rating 18 gaps that hit tests written on purpose; same delegation):
- invoices · a POST that fails with a network error was reported "offline, nothing was saved" · it is "offline" only when the browser reports offline; otherwise the write may have committed before the connection dropped, so it is reported as uncertain (the existing "may have been saved, reopen the register" message) and flagged uncertainCommit · a lost reply after commit looked identical to a request that never left.
- kitchen print · the reprint list of tickets pushed out of the queue kept 60 and dropped older ones silently · it keeps 240 (two full queues); past that the oldest leave the list with a counter warning and a logged entry · a long printer outage must not lose a dish without anyone being told.
- dashboard lock · offline validity of a proven code · manager 24 h and team 72 h (Wave Q) stay; the account owner keeps 7 days on their own signed-in dashboard · the owner is the account holder, not a delegated role.

Evening (rating 19 gaps on tests written on purpose; same delegation):
- briefing · the sales-drop card showed dirham amounts to staff · staff get their own card with the drop as a percentage, the store time and the threshold, and no amount; owner and manager keep the full card · the floor team needs to know sales are slow, not the takings, and the role model keeps money with owner and manager.

Night (eight items the rating left open; owner: "choose the ideal solutions"):
- clients · spend in integer centimes · a nullable `spend_cents` column next to the float one (migration 0020, no backfill: a NULL reads from the float through one shared expression); every writer sets both, readers use cents · totals agree to the centime and a long table rewrite in production is avoided.
- pressing · B2B discount · a per-merchant rate 0 to 50 %, default 15 % (today's behaviour), optionally overridden per B2B client; computed in centimes, the order freezes its rate, the receipt prints it ("Remise B2B -12 %"); whole-dirham rounding stays, once on the total · the rate is commercial, not a constant.
- returns · window · 0 to 90 days per merchant, default 7, edited in the dashboard returns policy; the till enforces it on the 05:00 business day and the server re-checks on refund; outside it a manager override is signed through the code check · one rule, enforced where money leaves.
- sales · customer on imported sales · `sales.client_id` (migration 0021), sent by the till and returned by the feed; older rows stay empty and read "client non renseigné" · credit notes attach to the right customer.
- payroll · pay statements · archived on the server, immutable, numbered per merchant and calendar year (RP-2026-0001) inside the insert itself; advances stored on the server per staff member and period; a reprint shows the same number; a correction is a new numbered statement naming the one it replaces (migration 0022) · a statement handed to an employee must be the same document later.
- spa · legacy cures without expiry · never expired silently: on first read after the update each gets 180 days from that day, marked "legacy-grandfathered" with the date, editable by staff, shown to the customer · nobody loses a paid cure retroactively.
- till clock · trusted time · the till learns its offset from the server's Date header on successful API replies (median of recent samples, slow round trips ignored); sales carry device and corrected time; the business day and receipt use the corrected one; the server stamps the time it received the sale (migration 0023) · a wrong tablet clock must not move a sale to another day.
- landing · Ultra · "Parler à un conseiller" opens WhatsApp with a prefilled message, no self-signup on that card · Ultra includes a dedicated account manager, so contact is the honest first step.
- deploy order · migrations 0020 to 0023 are applied to production by the owner before this code deploys; the server's minimum schema is 23 and answers 503 below it.
