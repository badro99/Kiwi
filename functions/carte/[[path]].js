// /carte/<boutique>[/<carte>] → la page statique carte.html (assets/wallet-carte.js
// lit le chemin). Réécriture, pas redirection : l'adresse imprimée sur le
// présentoir et le ticket reste celle que le client voit. La porte du site
// laisse passer ces chemins (functions/_wallet-public.js).
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') return new Response('Not found', { status: 404 });
  const page = await env.ASSETS.fetch(new Request(new URL('/carte', request.url), { headers: request.headers }));
  const res = new Response(page.body, page);
  res.headers.set('Cache-Control', 'no-cache');
  return res;
}
