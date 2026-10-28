/* Pure draft rules. Dependencies are supplied by the page; no browser capabilities. */
KiwiOrderMenu.orderProParts.run('draft', function () {
  function create(scope) {
    with (scope) {
// extract:lineKey:start
    function lineKey(id, options, note) {
      const parts = [id];
      const keys = Object.keys(options || {}).sort();
      for (const k of keys) {
        const v = options[k];
        if (Array.isArray(v)) {
          if (v.length) parts.push(`${k}=${v.slice().sort().join('+')}`);
        } else if (v != null && v !== '') {
          parts.push(`${k}=${v}`);
        }
      }
      if (note) parts.push(`note=${note}`);
      return parts.join('|');
    }

// extract:lineKey:end
// extract:totals:start
    function totals() {
      let count = 0, total = 0;
      cart.forEach(line => {
        count += line.qty;
        total += line.qty * line.unitPrice;
      });
      return { count, total };
    }

// extract:totals:end
// extract:validation:start
    function initialCustomizerSelections(options) {
      const selections = {};
      for (const opt of options || []) {
        /* A published default is menu configuration, not customer consent.
           Every OrderPro option starts empty and only an explicit tap may
           select it, for ordinary modifiers and formula stages alike. */
        selections[opt.key] = opt.type === 'single' ? '' : [];
      }
      return selections;
    }

    function unansweredRequiredOption(item, selections) {
      return (item && item.options || []).find((opt) => {
        const selected = selections[opt.key];
        const count = Array.isArray(selected) ? selected.length : (selected ? 1 : 0);
        const minimum = opt.formulaSlotId ? Math.max(0, Number(opt.min) || 0) : (opt.required ? 1 : 0);
        return count < minimum;
      }) || null;
    }

// extract:validation:end
// extract:payload:start
      const makeLinesPayload = ref => linesCopy.flatMap((l, lineIndex) => {
        const item = itemOf(l.id);
        const formulaSlots = (item && item.options || []).filter(opt => opt.formulaSlotId);
        const formulaUid = formulaSlots.length ? `${ref}-${lineIndex}`.slice(0, 40) : '';
        const parent = {
          id: l.id, qty: l.qty,
          options: describeOptionChoices(l).map(p => `${groupLabel(p.group)}: ${p.label}`).join(' · '),
          optionChoices: describeOptionChoices(l),
          visuals: describeOptionVisuals(l, true),
          note: l.note || '',
        };
        if (!formulaUid) return [parent];
        Object.assign(parent, { kind: 'formula', formulaUid, formulaName: nameOf(l.id) });
        const children = [];
        formulaSlots.forEach(slot => {
          const selected = l.options?.[slot.key];
          /* Une étape facultative jamais touchée vaut '' (initialCustomizerSelections),
             pas `undefined` : `== null` la laissait passer et on envoyait un
             composant d'identifiant vide. Le serveur ne le trouvait dans aucun
             choix du créneau et refusait TOUTE la formule — « Options à
             rechoisir » sur un plat pourtant correctement composé. */
          const ids = (slot.type === 'multi' ? (Array.isArray(selected) ? selected : [])
            : (selected == null ? [] : [selected])).filter(Boolean);
          ids.forEach((id, choiceIndex) => children.push({
            id, qty: l.qty, kind: 'formula-part', formulaUid,
            formulaName: nameOf(l.id), slotLabel: slot.label || '',
            formulaSlotId: slot.formulaSlotId,
            lineId: `${formulaUid}-${slot.formulaSlotId}-${choiceIndex}`.slice(0, 60),
          }));
        });
        return [parent].concat(children);
      });

// extract:payload:end

// extract:price:start
    function customizerUnitPrice() {
      if (!customizerItem) return 0;
      let p = customizerItem.price;
      for (const opt of customizerItem.options || []) {
        const sel = customizerSelections[opt.key];
        if (opt.type === 'single' && sel) {
          const c = opt.choices.find(c => c.id === sel);
          if (c) p += (c.delta || 0);
        } else if (opt.type === 'multi' && Array.isArray(sel)) {
          for (const id of sel) {
            const c = opt.choices.find(c => c.id === id);
            if (c) p += (c.delta || 0);
          }
        }
      }
      return p;
    }

// extract:price:end
    function selectChoice(optKey, choiceId, type) {
// extract:selection:start
      if (type === 'single') {
        const definition = (customizerItem.options || []).find(opt => opt.key === optKey);
        const mayClear = !definition || (!definition.required && !(definition.formulaSlotId && Math.max(0, Number(definition.min) || 0) > 0));
        customizerSelections[optKey] = mayClear && customizerSelections[optKey] === choiceId ? '' : choiceId;
      } else {
        const arr = customizerSelections[optKey] || [];
        const i = arr.indexOf(choiceId);
        const def = (customizerItem.options || []).find(opt => opt.key === optKey);
        if (i >= 0) arr.splice(i, 1);
        else if (!def || !def.formulaSlotId || arr.length < Math.max(1, Number(def.max) || 1)) arr.push(choiceId);
        customizerSelections[optKey] = arr;
      }
// extract:selection:end
    }
    function addDraftLine(line) {
// extract:addDraftLine:start
      const key = lineKey(line.id, line.options, line.note);
      const addQty = Math.max(1, Number(line && line.qty) || 1);
      if (cart.has(key)) {
        cart.get(key).qty += addQty;
      } else {
        cart.set(key, { ...line, qty: addQty });
      }
// extract:addDraftLine:end
    }
    function decDraftLine(key) {
// extract:decDraftLine:start
      if (!cart.has(key)) return;
      const line = cart.get(key);
      line.qty -= 1;
      if (line.qty <= 0) cart.delete(key);
// extract:decDraftLine:end
    }
    function incDraftLine(key) {
// extract:incDraftLine:start
      if (!cart.has(key)) return;
      cart.get(key).qty += 1;
// extract:incDraftLine:end
    }
      return Object.freeze({ lineKey, totals, initialCustomizerSelections, unansweredRequiredOption, makeLinesPayload, customizerUnitPrice, selectChoice, addDraftLine, decDraftLine, incDraftLine });
    }
  }
  return Object.freeze({ create });
});
