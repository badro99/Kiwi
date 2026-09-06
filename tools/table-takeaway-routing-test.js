#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CAISSE = fs.readFileSync(path.join(ROOT, "kiwi-caisse.html"), "utf8");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }

// 1. closeRightPanel guards mode === "order"
const closeRightPanelIdx = CAISSE.indexOf("function closeRightPanel()");
const closeRightPanelFn = closeRightPanelIdx !== -1 ? CAISSE.slice(closeRightPanelIdx, closeRightPanelIdx + 400) : "";
ok("closeRightPanel exists", !!closeRightPanelFn);
ok("closeRightPanel calls backToSalle when mode === order",
  /if \(mode === .order.\)\s*\{\s*backToSalle\(\);\s*return;\s*\}/.test(closeRightPanelFn));

// 2. setMode clears cart on "order" and clears selectedId on "vrap"
const setModeIdx = CAISSE.indexOf("function setMode(newMode)");
const setModeFn = setModeIdx !== -1 ? CAISSE.slice(setModeIdx, setModeIdx + 4000) : "";
ok("setMode exists", !!setModeFn);
ok("setMode clears cart in order mode",
  /else if \(newMode === .order.\)\s*\{\s*cart = \[\];/.test(setModeFn));
ok("setMode releases table lock and clears selectedId in vrap mode",
  /if \(selectedId\) \{\s*setCaisseTableLock\(selectedId, .release.\);\s*selectedId = null;\s*\}/.test(setModeFn));

// 3. Table click directly opens order builder for a-commander or empty unbilled tables
ok("table click opens order builder for a-commander or empty tables",
  /if \(t\.status === .a-commander. \|\| \(!orders\[id\]\?\.length && !tableOrders\[id\]\?\.length && t\.status !== .bgha-ykhlass.\)\)\s*\{\s*resumeTableOrder\(id\);/
    .test(CAISSE));

// 4. Stepper and menu card clicks in mode === "order" never fall back to addToCart
const stepBtnIdx = CAISSE.indexOf("const stepBtn = e.target.closest('.step-btn');");
const stepBtnHandler = stepBtnIdx !== -1 ? CAISSE.slice(stepBtnIdx, stepBtnIdx + 800) : "";
ok("stepBtn handles order mode without falling back to addToCart on missing selectedId",
  /if \(mode === .order.\)\s*\{\s*if \(selectedId\)\s*\{[\s\S]*?\}\s*else\s*\{\s*toast\(.Aucune table sélectionnée.\);\s*backToSalle\(\);\s*\}/.test(stepBtnHandler));

const menuCardIdx = CAISSE.indexOf("const menuCard = e.target.closest('.menu-item');");
const menuCardHandler = menuCardIdx !== -1 ? CAISSE.slice(menuCardIdx, menuCardIdx + 800) : "";
ok("menuCard handles order mode without falling back to addToCart on missing selectedId",
  /if \(mode === .order.\)\s*\{\s*if \(selectedId\)\s*\{[\s\S]*?addToTableOrder\(selectedId[\s\S]*?\}\s*else\s*\{\s*toast\(.Aucune table sélectionnée.\);\s*backToSalle\(\);\s*\}/.test(menuCardHandler));

// 5. confirmNewTable stamps floor versions
const confirmNewTableIdx = CAISSE.indexOf("function confirmNewTable()");
const confirmNewTableFn = confirmNewTableIdx !== -1 ? CAISSE.slice(confirmNewTableIdx, confirmNewTableIdx + 800) : "";
ok("confirmNewTable stamps local and remote floor version",
  /serviceFloorLocalVersion\[newTableId\] = Date\.now\(\);/.test(confirmNewTableFn) &&
  /serviceFloorRemoteVersion\[newTableId\] = Math\.max\(/.test(confirmNewTableFn));

// 6. resumeTableOrder clears cart before order mode
const resumeTableOrderIdx = CAISSE.indexOf("function resumeTableOrder(id)");
const resumeTableOrderFn = resumeTableOrderIdx !== -1 ? CAISSE.slice(resumeTableOrderIdx, resumeTableOrderIdx + 800) : "";
ok("resumeTableOrder clears cart before order mode",
  /cart = \[\];\s*setMode\(.order.\);/.test(resumeTableOrderFn));

// 7. sendToKitchen never dispatches tableOrders as takeaway
const sendToKitchenIdx = CAISSE.indexOf("function sendToKitchen()");
const sendToKitchenFn = sendToKitchenIdx !== -1 ? CAISSE.slice(sendToKitchenIdx, sendToKitchenIdx + 2500) : "";
ok("sendToKitchen exists", !!sendToKitchenFn);
ok("sendToKitchen never copies tableOrders into takeaway list",
  !/tableOrders\[selectedId\]/.test(sendToKitchenFn));
ok("sendToKitchen exits order mode cleanly if selectedId missing",
  /if \(mode === .order. && !selectedId\)\s*\{\s*backToSalle\(\);/.test(sendToKitchenFn));

// 8. closedSessions loop and pollEmployeeFloor guard active table in order mode
const closedSessionsIdx = CAISSE.indexOf("(closedSessions || []).forEach((closed) => {");
const closedSessionsSnippet = closedSessionsIdx !== -1 ? CAISSE.slice(closedSessionsIdx, closedSessionsIdx + 1200) : "";
ok("closedSessions loop protects actively edited table in order mode",
  /if \(mode === .order. && selectedId === id\) return;/.test(closedSessionsSnippet));

const pollEmployeeFloorIdx = CAISSE.indexOf("function pollEmployeeFloor()");
const pollEmployeeFloorSnippet = pollEmployeeFloorIdx !== -1 ? CAISSE.slice(pollEmployeeFloorIdx, pollEmployeeFloorIdx + 4000) : "";
ok("pollEmployeeFloor protects actively edited table in order mode",
  /if \(mode === .order. && selectedId === id\) return;/.test(pollEmployeeFloorSnippet));

// 9. recordSale always sets entry.table when settlementTable is passed
const recordSaleIdx = CAISSE.indexOf("function recordSale(");
const recordSaleSnippet = recordSaleIdx !== -1 ? CAISSE.slice(recordSaleIdx, recordSaleIdx + 3000) : "";
ok("recordSale always sets entry.table on table settlements",
  /if \(settlementTable\) \{\s*entry\.table = String\(settlementTable\);[\s\S]*?const visit = phoneSessionOf/.test(recordSaleSnippet));

console.log(`\nTable vs Takeaway routing tests: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach(f => console.error("  ✗", f));
  process.exit(1);
} else {
  console.log("  ✓ all table vs takeaway routing invariants hold\n");
  process.exit(0);
}
