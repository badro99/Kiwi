/* Kiwi · shared pressing garment silhouettes
 * One semantic product-art system for the owner dashboard and every paired till.
 */
(function () {
  'use strict';
  var art = (inner) => `<svg class="px-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  var ART = {
    chemise: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3-5 5h-6z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12l6 8 6-8" /><path class="thin" d="M32 22v30"/><circle class="thin" cx="29.5" cy="28" r=".9"/><circle class="thin" cx="29.5" cy="36" r=".9"/><circle class="thin" cx="29.5" cy="44" r=".9"/>`),
    tshirt: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M22 12c2 3.5 10 3.5 12 0" transform="translate(4 0)"/>`),
    pull: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12c1.5 3 10.5 3 12 0" /><path class="thin" d="M20 49h24M20 45.5h24"/><path class="thin" d="M16.5 28.5l3.5-2.5M47.5 28.5 44 26"/>`),
    veste: art(`<path class="fill" d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4-4-1c-2 3-8 3-12 0z"/><path d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4"/><path d="M26 11l6 13 6-13"/><path d="M32 24v30"/><circle class="thin" cx="35.5" cy="36" r="1.1"/>`),
    costume: art(`<path d="M32 5c-2.6 0-4 1.6-4 3.4 0 1.7 1.4 3 3.2 3.2L32 12"/><path d="M32 12l17 9H15z"/><path class="fill" d="M17 21l4 33h22l4-33z"/><path d="M17 21l4 33h22l4-33"/><path d="M25 21l7 11 7-11"/><path class="thin" d="M32 32v22"/>`),
    manteau: art(`<path class="fill" d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5-3-1c-2 3-9 3-13 0z"/><path d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5"/><path d="M26 9l6 11 6-11"/><path d="M20 40h24"/><path class="thin" d="M30 40h4v3h-4z"/><path class="thin" d="M32 20v34"/>`),
    pantalon: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M26.5 24v24M37.5 24v24"/>`),
    jean: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M22 21c3 3 7 3 9 0M42 21c-3 3-7 3-9 0"/><circle class="thin" cx="32" cy="13.5" r="1"/>`),
    jupe: art(`<path d="M24 11h16l1 6H23z"/><path class="fill" d="M23 17 15 51c10 4 24 4 34 0l-8-34z"/><path d="M23 17 15 51c10 4 24 4 34 0l-8-34"/><path class="thin" d="M27 20l-4 30M37 20l4 30"/>`),
    short: art(`<path class="fill" d="M20 12h24v7l3 20H33l-1-11-1 11H17l3-20z"/><path d="M20 12h24v7H20z"/><path d="M20 19l-3 20h14l1-11 1 11h14l-3-20"/><path class="thin" d="M32 22v6"/>`),
    robe: art(`<path d="M27 9c1.5 2.6 8.5 2.6 10 0l4 7-2 9"/><path d="M27 9l-4 7 2 9"/><path class="fill" d="M25 25h14c6 9 8 17 8 27H17c0-10 2-18 8-27z"/><path d="M25 25c-6 9-8 17-8 27h30c0-10-2-18-8-27"/><path d="M25 25h14"/>`),
    robe_soiree: art(`<path d="M28 8c1.3 2.2 6.7 2.2 8 0l3 5-2 9"/><path d="M28 8l-3 5 2 9"/><path class="fill" d="M27 22h10l11 30c-10 4-22 4-32 0z"/><path d="M27 22 16 52c10 4 22 4 32 0L37 22"/><path d="M27 22h10"/><path class="thin" d="M30 30 24 50M36 32l5 16"/>`),
    caftan: art(`<path class="fill" d="M26 8h12l3 7v39H23V15z"/><path d="M26 8h12l3 7v39H23V15z"/><path d="M26 9 10 23l4 5 9-7"/><path d="M38 9l16 14-4 5-9-7"/><path d="M32 15v39"/><path class="thin" d="M29 20h6M29 25h6M29 30h6M29 35h6"/>`),
    drap: art(`<rect class="fill" x="10" y="17" width="44" height="30" rx="4"/><rect x="10" y="17" width="44" height="30" rx="4"/><path class="thin" d="M10 27h44M10 37h44"/>`),
    housse: art(`<rect class="fill" x="10" y="14" width="44" height="36" rx="4"/><rect x="10" y="14" width="44" height="36" rx="4"/><path class="thin" d="M10 16l22 16 22-16"/><circle class="thin" cx="24" cy="44" r="1"/><circle class="thin" cx="32" cy="44" r="1"/><circle class="thin" cx="40" cy="44" r="1"/>`),
    couverture: art(`<path class="fill" d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M14 30c0-8 5-14 14-14h22v8H28"/><path class="thin" d="M6 39h52"/>`),
    nappe: art(`<path class="fill" d="M9 22h46l-5 22H14z"/><path d="M9 22h46l-5 22H14z"/><path d="M9 22l-3 9M55 22l3 9"/><path class="thin" d="M22 22l2 22M42 22l-2 22M12 33h40"/><path d="M18 44v10M46 44v10"/>`),
    rideaux: art(`<path d="M8 10h48"/><path class="fill" d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path class="thin" d="M21 14v13M26 14v11"/><path d="M12 34c7 4 15 4 20-1"/><path class="thin" d="M40 14h8v40h-8c2-14 2-26 0-40z"/>`),
    tapis: art(`<circle class="fill" cx="19" cy="25" r="9.5"/><circle cx="19" cy="25" r="9.5"/><circle class="thin" cx="19" cy="25" r="4"/><path class="fill" d="M19 34.5h27l9 15H13z"/><path d="M28.5 25H46l9 15.5"/><path d="M19 34.5h27l9 15H13z"/><path class="thin" d="M22 54v4M30 54v4M38 54v4M46 54v4"/>`),
    veste_cuir: art(`<path class="fill" d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4-4-2c-2 3-8 3-12 0z"/><path d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4"/><path d="M25 12l4 6-3 5"/><path d="M39 12l-4 6 3 5"/><path d="M29 23l8 31"/><path class="thin" d="M31 28l3-1M33 35l3-1M35 42l3-1"/><circle class="thin" cx="24" cy="20" r="1"/><circle class="thin" cx="40" cy="20" r="1"/>`),
    daim: art(`<path class="fill" d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4-3-1c-2 3-9 3-13 0z"/><path d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4"/><path d="M26 11c2 3 10 3 12 0"/><path d="M21 38h22"/><path class="thin" d="M24 38v8M28 38v7M32 38v8M36 38v7M40 38v8"/>`),
    doudoune: art(`<path class="fill" d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6-3-1c-2 3-10 3-12 0z"/><path d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6"/><path d="M26 11c1.5 3 10.5 3 12 0"/><path class="thin" d="M19 24c8 3 18 3 26 0M19 32c8 3 18 3 26 0M19 40c8 3 18 3 26 0M19 47.5c8 3 18 3 26 0"/><path d="M32 14v40"/>`),
    chaussures: art(`<path class="fill" d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 45h44"/><path class="thin" d="M27 30l4 3M24 33l4 3M21 36l4 3"/>`),
    baskets: art(`<path class="fill" d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44h48v3c-18 3-32 3-48 0z"/><path class="thin" d="M26 29l4 3M23 32l4 3"/><path class="thin" d="M38 31c-3 5-8 7-14 7"/>`),
    babouches: art(`<path class="fill" d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path class="thin" d="M26 34.5c4 1.5 6 4 6 7.5"/><path class="thin" d="M40 32.6c-1 4.4-1 6.6 0 9.4"/>`),
  };

  function resolve(item) {
    item = item || {};
    if (ART[item.id]) return item.id;
    var text = String((item.label || '') + ' ' + (item.id || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    var names = [
      ['robe_soiree', /robe de soiree|gown/], ['veste_cuir', /veste cuir|cuir/],
      ['tshirt', /t[ -]?shirt/], ['chemise', /chemise|shirt/], ['pull', /pull|sweat|hoodie/],
      ['costume', /costume|gilet|suit/], ['manteau', /manteau|coat/], ['doudoune', /doudoune/],
      ['pantalon', /pantalon|trouser/], ['jean', /jean/], ['jupe', /jupe|skirt/], ['short', /short/],
      ['caftan', /caftan|takchita/], ['robe', /robe|dress/], ['drap', /drap/], ['housse', /housse/],
      ['couverture', /couverture|blanket/], ['nappe', /nappe/], ['rideaux', /rideau|curtain/], ['tapis', /tapis|rug/],
      ['daim', /daim|suede/], ['baskets', /basket|sneaker/], ['babouches', /babouche/], ['chaussures', /chaussure|shoe/],
      ['veste', /veste|blazer|jacket/]
    ];
    for (var i=0;i<names.length;i++) if (names[i][1].test(text)) return names[i][0];
    if (ART[item.art]) return item.art;
    return { bas:'pantalon', robes:'robe', linge:'drap', cuir:'veste_cuir', chaussures:'chaussures' }[item.cat] || 'chemise';
  }
  function render(item, cls) {
    var svg = ART[resolve(item)] || ART.chemise;
    return cls ? svg.replace('class="px-art"', 'class="px-art ' + cls + '"') : svg;
  }
  window.KiwiPressingGarmentIcons = Object.freeze({
    render: render,
    resolve: resolve,
    has: function (id) { return !!ART[id]; },
    ids: Object.freeze(Object.keys(ART))
  });
})();
