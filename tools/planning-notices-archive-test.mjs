#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/planning-core.js", import.meta.url), "utf8");
const context = vm.createContext({ console, structuredClone, Date, Math, JSON, Set, Map });
vm.runInContext(source, context, { filename: "planning-core.js" });
const P = context.KiwiPlanningCore;
const member = { id: "a", name: "Amira" };

/* Une base de 260 notices (n0 la plus ancienne) : l'ancien code jeta les 60
 * premières sans retenue ni retour possible ; le nouveau les archive. */
const doc = P.blank();
for (let index = 0; index < 260; index += 1) {
  doc.notices.push({ id: `n${index}`, memberId: "a", type: "swap-approved", day: "2026-01-01", createdAt: new Date(Date.parse("2026-01-01T08:00:00Z") + index * 1000).toISOString() });
}
let normalize = P.normalize(doc);
assert.equal(normalize.notices.length, 200, "la liste courante garde son plafond de 200");
assert.equal(normalize.noticeArchive.length, 60, "les 60 plus anciennes rejoignent l'archive au lieu d'être jetées");
assert.equal(normalize.noticeArchive[0].id, "n0", "l'archive commence là où la liste s'arrête");
assert.equal(normalize.notices[0].id, "n60", "la liste courante part de la première non archivée");
assert.equal(normalize.notices.at(-1).id, "n259", "la liste courante garde les plus récentes");

let page = P.noticeArchivePage(normalize, 0, 25);
assert.equal(page.total, 60, "l'archive sait combien de notices elle garde");
assert.equal(page.pages, 3, "60 notices archivées tiennent en 3 pages de 25");
assert.equal(page.next, 1, "une page 0 non terminale offre une page suivante");
assert.equal(page.items[0].id, "n59", "la page la plus récente de l'archive d'abord");
assert.equal(P.noticeArchivePage(normalize, 2, 25).items.at(-1).id, "n0", "la dernière page remonte à la plus ancienne");
const beyond = P.noticeArchivePage(normalize, 9, 25);
assert.equal(beyond.page, 2, "au-delà de la dernière page la lecture se cale sur la dernière, sans erreur");
assert.equal(beyond.items.at(-1).id, "n0", "au-delà de la dernière page : toujours la plus ancienne en bout");
assert.equal(beyond.next, null, "au-delà de la dernière page : plus rien à relire");

/* La fusion de deux appareils ne jetait rien non plus : chacune sous 200 mais
 * l'ensemble au-delà. L'archive de l'un et de l'autre survit à la fusion. */
const mine = P.normalize(Object.assign(P.blank(), structuredClone(doc)));
const theirs = P.normalize(Object.assign(P.blank(), structuredClone(doc)));
theirs.notices[0].day = "2026-02-02";
theirs.notices[0].createdAt = "2026-12-31T08:00:00Z";
theirs.noticeArchive.push({ id: "z-old", memberId: "a", type: "swap-approved", day: "2025-12-25", createdAt: "2025-12-25T08:00:00Z" });
const merged = P.merge(mine, theirs, [member]);
assert.equal(merged.notices.length, 200);
assert.equal(merged.noticeArchive.some((item) => item.id === "z-old"), true, "l'archive de l'autre appareil survit à la fusion");
assert.equal(P.noticeArchivePage(merged, 0, 1000).items.at(-1).id, "z-old", "la lecture de l'archive trie la plus ancienne en bout, quel que soit l'ordre d'écriture");
assert.equal(merged.notices[0].day, "2026-02-02", "la fusion garde la version la plus récente d'une notice");assert.equal(merged.noticeArchive.length, 61);
const unionAboveCap = P.merge(
  P.normalize(Object.assign(P.blank(), { notices: [...doc.notices, ...theirs.notices] })),
  P.normalize(P.blank()), [member]
);
assert.equal(unionAboveCap.notices.length, 200, "la liste courante reste plafonnée après fusion");
assert.equal(unionAboveCap.noticeArchive.length > 0, true, "le débord de fusion va dans l'archive, pas à la poubelle");
assert.equal(unionAboveCap.noticeArchive.length + unionAboveCap.notices.length, 260, "aucune notice n'est perdue entre deux appareils");

/* addNotice et publish ont le même destin : sous 200, tout se voit ; au
 * débord, l'ancienne notice part dans l'archive relisible au lieu de mourir. */
let live = P.normalize(P.blank());
for (let index = 0; index < 200; index += 1) {
  live = P.addNotice(live, { id: `a${index}`, memberId: "a", type: "swap-approved", day: "2026-01-01", createdAt: new Date(Date.parse("2026-06-01T08:00:00Z") + index * 1000).toISOString() });
}
assert.equal(live.noticeArchive.length, 0);
live = P.addNotice(live, { id: "a-new", memberId: "a", type: "swap-approved", day: "2026-01-02", createdAt: "2026-07-01T08:00:00Z" });
assert.equal(live.notices.length, 200, "addNotice au-delà du plafond : la liste reste à 200");
assert.equal(live.noticeArchive.length, 1, "la notice évincée est archivée");
assert.equal(live.noticeArchive[0].id, "a0", "la plus ancienne est la première à partir");
let published = P.publish(live, {
  a: { "2026-08-10": { start: "09:00", end: "17:00" } }
}, ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"], [member], "2026-08-01T10:00:00Z");
published = published.planning;
assert.equal(published.notices.some((item) => item.type === "schedule-published"), true, "publish ajoute toujours sa notice d'équipe");
assert.equal(published.noticeArchive.length >= 1, true, "publish fait tourner le plafond par l'archive comme le reste");
assert.equal(
  P.noticeArchivePage(published, 0).items.every((item) => item.memberId !== undefined && item.id),
  true, "les pages de l'archive portent des notices complètes"
);

/* L'archive reste bornée : au-delà de 400 notices gardées, on n'embarque pas
 * une bibliothèque infinie sur un téléphone. */
const huge = P.normalize(Object.assign(P.blank(), { notices: Array.from({ length: 1300 }, (_, index) => ({ id: `h${index}`, memberId: "a", type: "swap-approved", day: "2026-01-01", createdAt: new Date(Date.parse("2026-01-01T08:00:00Z") + index * 1000).toISOString() })) }));
assert.equal(huge.noticeArchive.length, 400, "l'archive est plafonnée elle aussi");
assert.ok(JSON.stringify(huge).length < 120000, "1 300 notices tiennent sous 120 Ko : le document team (600 Ko) garde sa place");
assert.equal(huge.noticeArchive[0].id, "h700", "le plafond d'archive cède les plus anciennes d'abord");
assert.equal(huge.notices.length, 200);

/* Une notice aussi dans la liste courante ne se copie pas deux fois dans
 * l'archive (pas de doublon d'id entre liste et archive). */
const double = P.normalize(Object.assign(P.blank(), { notices: [{ id: "x1", memberId: "a", type: "swap-approved", day: "2026-01-01", createdAt: "2026-01-01T08:00:00Z" }], noticeArchive: [{ id: "x1", memberId: "a", type: "swap-approved", day: "2026-01-01", createdAt: "2026-01-01T08:00:00Z" }] }));
assert.equal(double.noticeArchive.length, 0, "une notice vivante n'occupe pas l'archive");
const doubleMerge = P.merge(structuredClone(double), structuredClone(double), [member]);
assert.equal(doubleMerge.notices.filter((item) => item.id === "x1").length, 1, "pas de doublon de notice dans la liste");

/* L'app employé lit l'archive page par page sur /api/employee (module privé) :
 * le fil du GET garde ses 20 notices récentes, la pagination reprend avant. */
const serverMod = await import(new URL("../functions/api/employee/_planning.js", import.meta.url));const teamDoc = { planning: {} };
const feed = [];
for (let index = 0; index < 25; index += 1) {
  feed.push({ id: `f${index}`, memberId: "a", type: "swap-approved", day: "2026-05-01", createdAt: new Date(Date.parse("2026-05-01T08:00:00Z") + index * 1000).toISOString() });
}
const archive = [];
for (let index = 0; index < 30; index += 1) {
  archive.push({ id: index === 0 ? "f5" : `r${index}`, memberId: "a", type: "swap-approved", day: "2026-04-01", createdAt: new Date(Date.parse("2026-04-01T08:00:00Z") + index * 1000).toISOString() });
}
teamDoc.planning.notices = feed;
teamDoc.planning.noticeArchive = archive;
const firstPage = serverMod.planningNoticesPage(teamDoc, "a", 0);
assert.equal(firstPage.items.length, serverMod.PLANNING_NOTICES_PAGE_SIZE, "une page archivée porte la taille annoncée");
assert.equal(firstPage.next, firstPage.items.length, "la première page non terminale offre un décalage de suite");
const served = feed.slice(-20).map((item) => item.id);
assert.equal(firstPage.items.some((item) => served.includes(item.id)), false, "la pagination ne ressert pas les notices du fil du GET");
assert.equal(firstPage.items.at(-1).id, "r10", "la page partagée remonte vers le passé en son bout");
const secondPage = serverMod.planningNoticesPage(teamDoc, "a", firstPage.next);
assert.equal(secondPage.items.at(-1).id, "r1", "la seconde page atteint le début de l'archive");
assert.equal(secondPage.next, null, "après la dernière page : plus rien");
assert.equal(serverMod.planningNoticesPage(teamDoc, "a", 999999).items.length, 0, "décalage hors bornes : page vide, sans erreur");
assert.equal(serverMod.planningNoticesPage(teamDoc, "b", 0).items.length, 0, "l'archive d'un employé ne fuit pas à un autre");
assert.equal(serverMod.planningNoticesPage({ planning: { notices: feed.slice(-20) } }, "a", 0).items.length, 0, "fil non plein : aucune notice plus ancienne, rien à lire");

console.log("planning-notices-archive-test: archive du planning verte");
