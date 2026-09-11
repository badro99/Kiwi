/* Kiwi · synchro badro99 ──► zaka33333-hash, depuis Cloudflare
 *
 * Pourquoi ce Worker existe
 * ─────────────────────────
 * La production Cloudflare ne construit QUE zaka33333-hash/Kiwi, mais le
 * travail arrive sur badro99/Kiwi. Rien ne relie les deux dépôts : un commit
 * poussé chez badro99 n'atteint jamais le commerçant tant que personne ne
 * recopie la branche.
 *
 * Il a d'abord existé un agent launchd sur le Mac du propriétaire. Il marche,
 * mais il ne tourne que quand ce Mac est allumé — inutile en déplacement, et
 * c'est précisément là que l'associé pousse sans que personne ne surveille.
 *
 * Les deux autres pistes sont fermées : un `schedule` GitHub Actions ne se
 * déclenche JAMAIS dans un dépôt forké, et un miroir poussé depuis badro99
 * exigerait d'y enregistrer un secret — or le propriétaire n'y est pas
 * administrateur (`admin: false`), seul l'associé pourrait le faire.
 *
 * Cloudflare est la seule brique toujours allumée que le propriétaire contrôle
 * entièrement. D'où ce Worker.
 *
 * L'appel EST la fusion : POST /merge-upstream avance la branche. On ne
 * l'appelle donc qu'UNE fois par réveil — un second appel dirait toujours
 * « déjà à jour » et masquerait ce qui vient de se passer.
 */

const FORK = 'zaka33333-hash/Kiwi';
const UPSTREAM = 'badro99/Kiwi';

function gh(path, token, init = {}) {
  return fetch(`https://api.github.com/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub refuse les requêtes sans User-Agent.
      'User-Agent': 'kiwi-sync-worker',
      ...(init.headers || {}),
    },
  });
}

async function sync(env) {
  if (!env.GITHUB_TOKEN) {
    return { ok: false, state: 'no-token',
      detail: "Le secret GITHUB_TOKEN n'est pas configuré : wrangler secret put GITHUB_TOKEN --name kiwi-sync" };
  }

  const res = await gh(`repos/${FORK}/merge-upstream`, env.GITHUB_TOKEN, {
    method: 'POST',
    body: JSON.stringify({ branch: 'main' }),
  });
  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    // « fast-forward » = on vient de bouger, la production se reconstruit.
    // « none » = rien à faire, cas de très loin le plus fréquent.
    const moved = body.merge_type === 'fast-forward';
    return { ok: true, state: moved ? 'synced' : 'up-to-date', detail: body.message || '' };
  }

  // 409 : les deux dépôts portent chacun des commits que l'autre n'a pas.
  // Aucune machine ne peut trancher ça — réconcilier est une décision humaine.
  if (res.status === 409) {
    return { ok: false, state: 'diverged',
      detail: "Le fork porte des commits absents de badro99. Fusion manuelle requise — la production est figée." };
  }
  return { ok: false, state: 'error', detail: `HTTP ${res.status} · ${body.message || 'inconnu'}` };
}

export default {
  // Le réveil programmé : c'est lui qui fait le travail.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sync(env).then((r) => {
      // Visible dans `wrangler tail`. On ne journalise pas les « up-to-date » :
      // à 720 réveils par jour, ils noieraient les évènements qui comptent.
      if (r.state !== 'up-to-date') console.log(`[kiwi-sync] ${r.state} · ${r.detail}`);
    }));
  },

  // Une URL à ouvrir depuis un téléphone pour savoir, en déplacement, si la
  // production suit vraiment GitHub. Elle ne modifie rien : elle compare.
  async fetch(request, env) {
    if (!env.GITHUB_TOKEN) {
      return Response.json({ state: 'no-token' }, { status: 503 });
    }
    const res = await gh(`repos/${UPSTREAM}/compare/main...zaka33333-hash:main`, env.GITHUB_TOKEN);
    if (!res.ok) return Response.json({ state: 'error', http: res.status }, { status: 502 });
    const c = await res.json();
    const inSync = c.status === 'identical';
    return Response.json({
      state: inSync ? 'en phase' : c.status,
      production_en_retard_de: c.behind_by,   // commits de badro99 pas encore déployés
      fork_en_avance_de: c.ahead_by,
      derniere_verification: new Date().toISOString(),
    }, { status: inSync ? 200 : 409 });
  },
};
