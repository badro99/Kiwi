#!/usr/bin/env node
/* La météo du commerce : functions/api/_weather.js, functions/api/weather.js,
 * assets/weather.js et la ligne du point du matin (assets/briefing.js).
 *
 *   · la ville se trouve dans la fiche, même noyée dans une adresse ; une ville
 *     hors de la table ne donne AUCUNE météo, jamais celle d'ailleurs ;
 *   · le résumé MET : min/max, pluie sans compter deux fois la même heure, le
 *     temps de midi, les jours passés écartés ;
 *   · l'endpoint : refuse sans commerce, ne relaie pas une ville passée dans
 *     l'URL, s'identifie auprès de MET, met en cache par ville, tient le carnet
 *     (une écriture au plus toutes les trois heures, repart à zéro si la ville
 *     change) et se tait proprement quand MET ne répond pas ;
 *   · la mesure de la pluie : jours fermés écartés, même jour de la semaine,
 *     rien avant cinq jours de chaque sorte ;
 *   · le point du matin : une ligne seulement si la pluie est annoncée ET
 *     mesurée sur ce commerce, en FR, EN et AR.
 * Aucun appel réseau : MET est simulé. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import * as W from '../functions/api/_weather.js';
import { makeWeatherHandler } from '../functions/api/weather.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; console.log('  ✓ ' + msg); };

/* Une prévision MET synthétique : pas horaire, heure UTC. Le Maroc est à UTC+1
   (hors Ramadan) : 11:00Z = 12:00 à Casablanca. */
function met(steps) {
  return { properties: { meta: { updated_at: '2026-10-13T05:00:00Z' }, timeseries: steps.map(([time, temp, p1, p6, sym]) => ({
    time, data: {
      instant: { details: { air_temperature: temp } },
      ...(p1 != null ? { next_1_hours: { summary: { symbol_code: sym || 'cloudy' }, details: { precipitation_amount: p1 } } } : {}),
      ...(p6 != null ? { next_6_hours: { summary: { symbol_code: sym || 'cloudy' }, details: { precipitation_amount: p6 } } } : {}),
    },
  })) } };
}
const NOW = Date.parse('2026-10-13T07:00:00Z'); // 08:00 à Casablanca
const FIXTURE = met([
  ['2026-10-12T20:00:00Z', 30, 9, null, 'rain'],          // hier : écarté
  ['2026-10-13T06:00:00Z', 14, 0.5, 3, 'lightrain'],      // 1 h ET 6 h : on prend l'heure
  ['2026-10-13T07:00:00Z', 15, 0.5, 2, 'lightrain'],
  ['2026-10-13T11:00:00Z', 19, 0, 0, 'cloudy'],
  ['2026-10-13T12:00:00Z', 21, 0, 0, 'partlycloudy_day'],
  ['2026-10-13T22:00:00Z', 13, null, 4, 'rain'],          // 23:00 locale : encore le 13
  ['2026-10-14T05:00:00Z', 12, null, 6, 'heavyrain'],     // après le pas de 6 h : compté
  ['2026-10-14T11:00:00Z', 17, null, 1, 'rainshowers_day'],
  ['2026-10-14T17:00:00Z', 16, null, 0, 'cloudy'],
]);

console.log('\n■ La ville');
ok(W.cityCoords('Casablanca').name === 'Casablanca' && W.cityCoords('casa').name === 'Casablanca', 'a city and its nickname');
ok(W.cityCoords('12 Rue Allal Ben Abdellah, Maarif, Casablanca').name === 'Casablanca', 'a city inside an address');
ok(W.cityCoords('20250 Casablanca').name === 'Casablanca' && W.cityCoords('fès').name === 'Fès' && W.cityCoords('FEZ').name === 'Fès', 'postcodes, accents and spellings');
ok(W.cityCoords('الدار البيضاء').name === 'Casablanca' && W.cityCoords('مراكش').name === 'Marrakech', 'Arabic names');
ok(W.cityCoords('Paris') === null && W.cityCoords('') === null && W.cityCoords('Rue sans ville') === null, 'a city outside the table gives nothing, not a guess');

console.log('\n■ Le résumé MET');
const days = W.summarize(FIXTURE, NOW);
ok(days.length === 2 && days[0].day === '2026-10-13' && days[1].day === '2026-10-14', `local days from today on (${days.map((d) => d.day)})`);
ok(days[0].tmin === 13 && days[0].tmax === 21, 'today: min 13, max 21 (yesterday’s 30 °C ignored)');
ok(days[0].precip === 5, `today: 0.5 + 0.5 + 0 + 4 mm, the 6-hour totals never added on top of hourly ones (${days[0].precip})`);
ok(days[1].precip === 7, `tomorrow: 6 mm, then 1 mm once the first 6 hours are past (${days[1].precip})`);
ok(days[0].kind === 'rain' && days[1].kind === 'rain', 'a day with ≥ 1 mm is a rainy day even if noon reads « cloudy »');
ok(W.kindOf('clearsky_day') === 'clear' && W.kindOf('partlycloudy_night') === 'clear' && W.kindOf('cloudy') === 'cloudy'
  && W.kindOf('heavyrainandthunder') === 'storm' && W.kindOf('lightsleetshowers_day') === 'rain' && W.kindOf('fog') === 'fog' && W.kindOf('snow') === 'snow', 'MET symbols map to six kinds');

console.log('\n■ Le carnet');
{
  let log = W.mergeLog({}, { day: '2026-10-13', tmin: 13, tmax: 21, precip: 5, kind: 'rain' });
  log = W.mergeLog(log, { day: '2026-10-13', tmin: 15, tmax: 18, precip: 0, kind: 'cloudy' });
  ok(log['2026-10-13'].precip === 5 && log['2026-10-13'].kind === 'rain' && log['2026-10-13'].tmin === 13 && log['2026-10-13'].tmax === 21,
    'an evening reading (only the hours left) never erases the morning rain');
  let long = {};
  for (let i = 0; i < 12; i++) long = W.mergeLog(long, { day: `2026-01-${String(i + 1).padStart(2, '0')}`, precip: 0, kind: 'clear' }, 10);
  ok(Object.keys(long).length === 10 && !long['2026-01-01'] && long['2026-01-12'], 'only the most recent days are kept');
}

console.log('\n■ L’endpoint');
function database({ cityColumn = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE store_docs (merchant TEXT NOT NULL, feature TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, feature));
    CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY${cityColumn ? ', city TEXT' : ''}, updated_ts INTEGER);`);
  return {
    db,
    DB: { prepare(sql) { let args = []; return {
      bind(...v) { args = v; return this; },
      first() { return db.prepare(sql).get(...args) || null; },
      run() { db.prepare(sql).run(...args); return { success: true }; },
    }; } },
  };
}
function harness(opts = {}) {
  const { db, DB } = database(opts);
  const calls = [];
  const cache = new Map();
  let now = NOW;
  let failing = false;
  const handler = makeWeatherHandler({
    tenant: async (_req, _env, asked) => (asked === 'cafe-test' ? 'cafe-test' : ''),
    fetch: async (url, init) => {
      calls.push({ url, ua: init && init.headers && init.headers['User-Agent'] });
      if (failing) return new Response('down', { status: 503 });
      return new Response(JSON.stringify(FIXTURE), { headers: { 'Content-Type': 'application/json', Expires: new Date(now + 30 * 60e3).toUTCString() } });
    },
    /* Comme le Cache API : une entrée vit le max-age qu'on lui a donné. */
    cache: {
      match: async (k) => { const v = cache.get(k.url); return v && v.until > now ? new Response(v.body) : undefined; },
      put: async (k, r) => {
        const age = Number((/max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '') || [])[1]) || 0;
        cache.set(k.url, { body: await r.text(), until: now + age * 1000, age });
      },
    },
    now: () => now,
  });
  const get = async (q) => {
    const res = await handler({ request: new Request('https://k.test/api/weather' + q), env: { DB } });
    return { status: res.status, body: await res.json() };
  };
  const setBusiness = (legal) => db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('cafe-test', 'business', ?, 1, 0) ON CONFLICT (merchant, feature) DO UPDATE SET data = excluded.data")
    .run(JSON.stringify({ name: 'Café Test', legal }));
  const logRow = () => db.prepare("SELECT data, rev FROM store_docs WHERE merchant = 'cafe-test' AND feature = 'weather-log'").get();
  return { db, get, calls, cache, setBusiness, logRow, advance: (ms) => { now += ms; }, fail: (v) => { failing = v; } };
}
{
  const h = harness();
  ok((await h.get('?merchant=someone-else')).status === 401, 'no store of yours: 401');
  ok((await h.get('?merchant=cafe-test')).body.reason === 'no-city' && h.calls.length === 0, 'no city on the shop sheet: says so, calls nobody');
  h.setBusiness({ city: 'Paris' });
  const unknown = (await h.get('?merchant=cafe-test&city=Casablanca')).body;
  ok(unknown.reason === 'unknown-city' && h.calls.length === 0, 'a city outside the table: nothing, and the city in the URL is ignored (not an open relay)');
  h.setBusiness({ city: '', address: '12 Rue Allal Ben Abdellah, Maarif, Casablanca' });
  const first = (await h.get('?merchant=cafe-test')).body;
  ok(first.ok && first.city === 'Casablanca' && first.days.length === 2 && first.source === 'MET Norway', 'the address on the sheet is enough: Casablanca, two days, source named');
  ok(h.calls.length === 1 && /lat=33\.57&lon=-7\.59$/.test(h.calls[0].url), `one MET call, coordinates rounded (${h.calls[0].url.split('?')[1]})`);
  ok(/^KiwiOS\/1\.0 \(.*contact@kiwi-os\.com\)$/.test(h.calls[0].ua || ''), 'identifies itself to MET with a contact, as its terms require');
  ok(first.log['2026-10-13'] && first.log['2026-10-13'].precip === 5, 'today’s forecast enters the shop’s log');
  const rev1 = h.logRow().rev;
  h.advance(20 * 60e3);
  await h.get('?merchant=cafe-test');
  ok(h.calls.length === 1, 'within the Expires window the city’s forecast comes from cache');
  ok([...h.cache.values()][0].age === 1800, `cached for MET’s own Expires (30 min), clamped to 10 to 60 min (${[...h.cache.values()][0].age} s)`);
  ok(h.logRow().rev === rev1, 'and the log is not rewritten within three hours');
  h.advance(3 * 3600e3);
  await h.get('?merchant=cafe-test');
  ok(h.calls.length === 2 && h.logRow().rev === rev1 + 1, 'past both windows: one fresh MET read, one log write');
  h.setBusiness({ city: 'Tanger' });
  h.advance(10 * 60e3);
  const moved = (await h.get('?merchant=cafe-test')).body;
  ok(moved.city === 'Tanger' && Object.keys(moved.log).length === 1 && JSON.parse(h.logRow().data).city === 'Tanger', 'a new city starts a new log: Casablanca’s rain says nothing about Tanger');
  h.cache.clear(); h.fail(true); h.advance(4 * 3600e3);
  const before = h.logRow().rev;
  const down = (await h.get('?merchant=cafe-test')).body;
  ok(down.ok === false && down.reason === 'unavailable' && h.logRow().rev === before, 'MET down: a quiet « unavailable », nothing written');
}
{
  const h = harness();
  h.db.prepare("INSERT INTO merchant_config (merchant, city, updated_ts) VALUES ('cafe-test', 'Marrakech', 0)").run();
  ok((await h.get('?merchant=cafe-test')).body.city === 'Marrakech', 'no sheet city: the operator-set merchant_config.city is used');
  const old = harness({ cityColumn: false });
  ok((await old.get('?merchant=cafe-test')).body.reason === 'no-city', 'a database without the city column answers no-city, never an error');
}

console.log('\n■ Ce que la pluie fait aux ventes');
const ctxWin = { KiwiEnv: { isReal: () => true } };
vm.runInContext(fs.readFileSync(new URL('../assets/weather.js', import.meta.url), 'utf8'), vm.createContext({ window: ctxWin, Date, Math, Object, Number, String, Array, CustomEvent: class {} }));
const KW = ctxWin.KiwiWeather;
function history({ rainDays, dryDays, rainFactor, closedRain = 0 }) {
  const log = {}, rows = [];
  const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);
  let d = Date.parse('2026-06-01T12:00:00Z');
  const put = (rain, revenue) => {
    const day = dayOf(d);
    log[day] = rain ? { precip: 6, kind: 'rain' } : { precip: 0, kind: 'clear' };
    if (revenue > 0) rows.push({ ts: d, amount: revenue });
    d += 86400e3;
  };
  for (let i = 0; i < Math.max(rainDays + closedRain, dryDays); i++) {
    if (i < dryDays) put(false, 1000);
    if (i < rainDays) put(true, 1000 * rainFactor);
    else if (i < rainDays + closedRain) put(true, 0);
  }
  return { log, rows, dayOf };
}
{
  const h = history({ rainDays: 6, dryDays: 12, rainFactor: 0.8, closedRain: 3 });
  const e = KW.rainEffect(h.rows, h.log, { dayOf: h.dayOf, today: '2027-01-01' });
  ok(e && e.rainDays === 6 && e.dryDays === 12, 'closed rainy days do not count as rainy days that sold nothing');
  ok(e && Math.abs(e.change + 0.2) < 0.001, `rain days at 80 % of dry days: −20 % (${e && e.change})`);
  const few = history({ rainDays: 4, dryDays: 12, rainFactor: 0.5 });
  ok(KW.rainEffect(few.rows, few.log, { dayOf: few.dayOf, today: '2027-01-01' }) === null, 'four rainy days are not enough to say anything');
  const future = KW.rainEffect(h.rows, h.log, { dayOf: h.dayOf, today: '2026-06-02' });
  ok(future === null, 'only days before today count');
  ok(KW.isRain({ precip: 1, kind: 'cloudy' }) && KW.isRain({ precip: 0, kind: 'storm' }) && !KW.isRain({ precip: 0.5, kind: 'rain' }) && !KW.isDry({ precip: 0.5, kind: 'clear' }),
    'rain = ≥ 1 mm or a storm; between 0.2 and 1 mm the day counts as neither');
}

console.log('\n■ Le point du matin');
function briefingWith(weather) {
  const document = { readyState: 'loading', documentElement: { lang: 'fr' }, addEventListener() {}, querySelector() { return null; }, getElementById() { return null }, head: { appendChild() {} }, createElement() { return { setAttribute() {}, appendChild() {}, addEventListener() {} }; } };
  const window = { document, console, setTimeout, clearTimeout, addEventListener() {}, KiwiEnv: { isReal: () => true }, KiwiWeather: Object.assign({}, KW, { cached: () => weather }), localStorage: { getItem() { return null; }, setItem() {} } };
  window.window = window;
  vm.runInContext(fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8'), vm.createContext({ window, document, localStorage: window.localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, isFinite }), { filename: 'briefing.js' });
  return window.KiwiBriefing._test;
}
{
  const h = history({ rainDays: 6, dryDays: 12, rainFactor: 0.75 });
  const weather = { ok: true, city: 'Casablanca', days: [{ day: '2026-10-13', tmin: 19, tmax: 24, precip: 0, kind: 'clear' }, { day: '2026-10-14', tmin: 14, tmax: 18, precip: 7.5, kind: 'rain' }], log: h.log };
  const T = briefingWith(weather);
  const line = T.weatherRule({ today: '2026-10-13', rows: h.rows });
  ok(line && line.id === 'weather-rain:2026-10-14' && line.kind === 'weather', 'rain tomorrow + a measured effect: one line, keyed to the rainy day');
  ok(/Pluie annoncée demain à Casablanca \(7,5 mm\)\. Les jours de pluie, votre chiffre a été 25 % plus bas que les jours secs\./.test(line.copy.fr), line.copy.fr);
  ok(/Rain forecast tomorrow in Casablanca \(7\.5 mm\)\. On rainy days your takings have been 25% lower/.test(line.copy.en) && /أقل بنسبة 25٪/.test(line.copy.ar), 'in English and Arabic too');
  ok(line.evidence.count === 18 && /6 j\. de pluie · 12 j\. secs/.test(line.evidence.window) && /MET Norway/.test(line.evidence.source), 'the evidence says how many days carry the figure, and the source');
  ok(!!T.normalizeLine(line) && line.roles.indexOf('staff') === -1, 'a valid briefing line, for owner and manager');
  ok(!/—/.test(JSON.stringify(line.copy)), 'no em dash in the copy');
  const dryWeek = Object.assign({}, weather, { days: weather.days.map((d) => Object.assign({}, d, { precip: 0, kind: 'clear' })) });
  ok(briefingWith(dryWeek).weatherRule({ today: '2026-10-13', rows: h.rows }) === null, 'no rain forecast: no line');
  const flat = history({ rainDays: 6, dryDays: 12, rainFactor: 0.97 });
  ok(briefingWith(Object.assign({}, weather, { log: flat.log })).weatherRule({ today: '2026-10-13', rows: flat.rows }) === null, 'a 3 % difference is not worth a line');
  ok(briefingWith(Object.assign({}, weather, { log: {} })).weatherRule({ today: '2026-10-13', rows: h.rows }) === null, 'rain forecast but nothing measured yet: no line, no guess');
  ok(briefingWith({ ok: false, reason: 'no-city' }).weatherRule({ today: '2026-10-13', rows: h.rows }) === null, 'no city: silent');
}

const brief = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
ok(/weatherRule\]/.test(brief) && /'kiwi:weather'/.test(brief), 'the rule is registered and recomputed when the weather arrives');
const dash = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
ok(dash.indexOf('assets/weather.js') > 0 && dash.indexOf('assets/weather.js') < dash.indexOf('assets/briefing.js'), 'the dashboard loads weather.js before briefing.js');
ok(/'light_mode'/.test(brief) && /'water_drop'/.test(brief) && ['light_mode', 'water_drop', 'thermometer', 'bolt', 'ac_unit'].every((n) => fs.existsSync(new URL(`../assets/icons/material/${n}.svg`, import.meta.url))), 'weather icons are vendored Material Symbols');

console.log(`\nweather: ${checks} passed`);
