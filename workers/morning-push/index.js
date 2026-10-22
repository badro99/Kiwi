import { DateTimeFormat } from '../../functions/api/_zone-law.js';
// « Le point du matin » : Worker planifié. Il ne fait qu'une chose, POSTer sur
// https://kiwi-os.com/api/push/morning avec le secret partagé. Toute la logique
// (journée commerciale, idempotence, APNs) vit dans les Pages Functions.
//
// Heure : un cron Cloudflare est toujours en UTC, et le Maroc change de
// décalage (UTC+1 toute l'année, UTC+0 pendant le Ramadan). Deux déclenchements
// sont donc déclarés (04:30 et 05:30 UTC) et le Worker n'agit que si l'heure
// de Casablanca est comprise entre 05:30 et 05:59 : un seul des deux passe,
// quel que soit le régime, et jamais avant la coupure de 5 h de la journée
// commerciale. Le serveur est de toute façon idempotent par magasin et par jour.

const DEFAULT_URL = 'https://kiwi-os.com/api/push/morning';
const ZONE = 'Africa/Casablanca';

export function casablancaTime(date) {
  const parts = Object.fromEntries(new DateTimeFormat('en-GB', {
    timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function inSendWindow(date) {
  const { hour, minute } = casablancaTime(date);
  return hour === 5 && minute >= 30;
}

export async function run(env, now = new Date()) {
  const secret = String((env && env.MORNING_PUSH_SECRET) || '');
  if (!secret) throw new Error('MORNING_PUSH_SECRET is not configured');
  if (!inSendWindow(now)) return { skipped: 'outside-window' };
  const res = await fetch(String((env && env.MORNING_URL) || DEFAULT_URL), {
    method: 'POST',
    headers: { 'X-Kiwi-Morning-Secret': secret, 'User-Agent': 'kiwi-morning-push/1' },
  });
  if (!res.ok) throw new Error(`morning endpoint returned ${res.status}`);
  return res.json();
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(run(env).then((result) => {
      if (result && result.sent) console.log(JSON.stringify({ event: 'morning-push', sent: result.sent }));
    }));
  },

  async fetch(request) {
    if (new URL(request.url).pathname !== '/health') return new Response('Not found', { status: 404 });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  },
};
