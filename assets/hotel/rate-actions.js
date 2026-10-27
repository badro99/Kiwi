/* Owner: hotel rateActions. Exports named methods below. Reads only the declared scope and browser globals in tools/fixtures/hotel/reception-interfaces.json. */
(window.__kiwiHotelSections ||= {}).rateActions = (scope) => {
'use strict';
const STAYS = scope.STAYS;
const TAPE_DAYS = scope.TAPE_DAYS;
function occupancyByDay() {
    return TAPE_DAYS.map((_, di) => {
      const cnt = STAYS.filter((s) => di >= s.s && di < s.s + s.n).length;
      return Math.min(cnt, 23);
    });
  }

function donutCss(parts) {
    let acc = 0;
    const stops = parts.map((p) => { const s = `${p.color} ${acc}% ${acc + p.pct}%`; acc += p.pct; return s; }).join(', ');
    return `background: conic-gradient(${stops});`;
  }

return Object.freeze({ occupancyByDay, donutCss });
};
