// LiveHub — une salle par commerçant, et RIEN d'autre.
//
// Le problème qu'il règle : jusqu'ici, tout ce qui est « temps réel » chez Kiwi
// est un sondage. La caisse relit /api/service/events UNE FOIS PAR SECONDE pour
// voir si un serveur a changé l'état d'une table ; le serveur relit toutes les
// six secondes. C'est 86 400 requêtes par jour et par caisse pour, la plupart du
// temps, s'entendre répondre « rien de neuf ».
//
// LA RÈGLE DE CE FICHIER, ET ELLE EST LA SEULE QUI COMPTE : ce Durable Object
// NE STOCKE AUCUNE DONNÉE MÉTIER. D1 reste la seule source de vérité. On ne fait
// transiter ici qu'un signal creux — « quelque chose a bougé sur `feature`, à
// telle heure » — et chaque appareil va relire par SA route habituelle, avec SES
// droits. Aucun état de table, aucun prix, aucun nom de client ne passe par la
// socket. C'est ce qui rend la chose sûre : une salle mal cadrée ne peut pas
// fuiter les données d'un commerçant, puisqu'il n'y a pas de données dedans.
//
// Conséquence directe : la suppression du binding suffit à tout annuler. Sans
// `env.LIVE`, les Pages Functions n'appellent plus rien et les navigateurs
// retombent sur leurs sondages. Aucune migration, aucune donnée à récupérer.
//
// La salle est nommée par le SLUG du commerçant, jamais par un venueId : les
// venueId sont frappés sur l'horloge du navigateur (`'v' + Date.now()`), donc
// deux appareils du même commerce n'en partagent jamais un. Le slug, lui, est
// calculé pareil par la caisse, le serveur et le tableau de bord.

const MAX_BODY = 512;

export class LiveHub {
  constructor(state) {
    this.state = state;
  }

  /* Diffuse à tout le monde dans la salle. Une socket morte ne doit jamais
   * empêcher les suivantes d'être servies — d'où le try par socket. */
  broadcast(text) {
    let sent = 0;
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(text); sent++; } catch (_) { /* socket morte, on continue */ }
    }
    return sent;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Un écrivain (Pages Function) signale un changement. Il a déjà vérifié les
    // droits de son côté ; ce chemin n'est joignable que par un binding, jamais
    // depuis l'internet public.
    if (url.pathname === '/poke') {
      let body = null;
      try { body = await request.json(); } catch (_) { body = null; }
      const feature = String((body && body.feature) || '').slice(0, 64);
      const ts = Number(body && body.ts) || Date.now();
      const text = JSON.stringify({ t: 'poke', feature, ts });
      if (text.length > MAX_BODY) return new Response('too-large', { status: 413 });
      return Response.json({ ok: true, sent: this.broadcast(text) });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected-websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    /* Hibernation : le Durable Object peut être évincé de la mémoire tant qu'il
     * ne se passe rien, et les sockets survivent. C'est ce qui rend une salle
     * ouverte toute la journée à peu près gratuite — sans ça, chaque commerce
     * ouvert paierait un objet vivant du matin au soir. */
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /* Le seul message entrant admis est le battement de cœur du navigateur. On ne
   * lit RIEN d'autre : un client ne peut pas se servir de la salle pour parler
   * aux autres appareils, seulement pour écouter. */
  webSocketMessage(ws, message) {
    if (message === 'ping') { try { ws.send('pong'); } catch (_) {} }
  }

  webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code === 1006 ? 1000 : code, reason); } catch (_) {}
  }

  webSocketError() { /* la socket part d'elle-même */ }
}

/* Le Worker lui-même n'expose aucune route. On n'entre dans une salle que par le
 * binding, depuis /api/live/socket, qui a d'abord prouvé de quel commerçant il
 * s'agit. Une URL workers.dev ouverte serait une salle sans porte. */
export default {
  async fetch() {
    return new Response('kiwi-live: no public route', { status: 404 });
  },
};
