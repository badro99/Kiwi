/* Booking recovery · "Retrouver ma réservation".
 *
 * A guest who lost the management link (another phone, cleared browser, no
 * e-mail) finds the booking again with its code and the phone or e-mail it was
 * made with. The server answers with the link only when both match, and with
 * the same 404 for every miss (functions/api/booking.js, action "recover";
 * note 13, booking#2).
 *
 * Standalone on purpose: the booking page's split modules are pinned by a
 * layout map (tools/fixtures/booking/split.json), so this form adds itself to
 * the side panel after each render instead of joining their exports. It reads
 * no global and writes none; the page language comes from <html lang>.
 */
import { deadlineFetch } from './request-deadline.mjs';

const S = {
  fr: { title: 'Retrouver ma réservation', code: 'Code de réservation', contact: 'Téléphone ou e-mail de la réservation', go: 'Retrouver', busy: 'Recherche…', miss: 'Aucune réservation ne correspond. Vérifiez le code et le contact.', slow: 'Délai de réponse dépassé. Réessayez.', busyServer: 'Trop d’essais. Réessayez dans quelques minutes.' },
  en: { title: 'Find my booking', code: 'Booking code', contact: 'Phone or email used for the booking', go: 'Find it', busy: 'Searching…', miss: 'No booking matches. Check the code and the contact.', slow: 'The request timed out. Please try again.', busyServer: 'Too many attempts. Try again in a few minutes.' },
  ar: { title: 'استرجاع حجزي', code: 'رمز الحجز', contact: 'الهاتف أو البريد الإلكتروني المستعمل في الحجز', go: 'استرجاع', busy: 'جارٍ البحث…', miss: 'لا يوجد حجز مطابق. تحقق من الرمز ووسيلة الاتصال.', slow: 'انتهت مهلة الطلب. أعد المحاولة.', busyServer: 'محاولات كثيرة. أعد المحاولة بعد بضع دقائق.' },
};

const params = new URLSearchParams(location.search);
const merchant = String(params.get('merchant') || '').trim().toLowerCase();
const app = document.getElementById('booking-app');

function strings() {
  const lang = String(document.documentElement.lang || 'fr').slice(0, 2);
  return S[lang] || S.fr;
}

export function recoverMarkup(s = strings()) {
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<details class="bk-recover"><summary>' + esc(s.title) + '</summary><form data-recover novalidate>'
    + '<label>' + esc(s.code) + '<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="R-1A2B3C4D" maxlength="24" required></label>'
    + '<label>' + esc(s.contact) + '<input name="contact" autocomplete="tel email" maxlength="160" required></label>'
    + '<p class="bk-recover-msg" role="status" aria-live="polite"></p><button type="submit">' + esc(s.go) + '</button></form></details>';
}

/* The side panel is rebuilt on every render; put the form back each time. */
function place() {
  const aside = app && app.querySelector('.bk-aside');
  if (!aside || aside.querySelector('.bk-recover')) return;
  aside.insertAdjacentHTML('beforeend', recoverMarkup());
}

async function submit(e) {
  const form = e.target;
  if (!form || !form.matches || !form.matches('[data-recover]')) return;
  e.preventDefault();
  const s = strings(), msg = form.querySelector('.bk-recover-msg'), btn = form.querySelector('button');
  const code = form.elements.code.value.trim(), contact = form.elements.contact.value.trim();
  if (!code || !contact) { msg.textContent = s.miss; return; }
  btn.disabled = true; msg.textContent = s.busy;
  try {
    const r = await deadlineFetch('/api/booking', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recover', merchant, code, contact }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.manageToken) throw new Error(r.status === 429 ? 'rate-limited' : (j.error || 'not-found'));
    location.assign('booking.html?merchant=' + encodeURIComponent(merchant) + '&manage=' + encodeURIComponent(j.manageToken));
  } catch (err) {
    btn.disabled = false;
    msg.textContent = err.message === 'request-timeout' ? s.slow : err.message === 'rate-limited' ? s.busyServer : s.miss;
  }
}

if (app && merchant && !params.get('manage')) {
  new MutationObserver(place).observe(app, { childList: true });
  app.addEventListener('submit', submit);
  place();
}
