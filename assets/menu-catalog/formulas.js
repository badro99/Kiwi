/* Menu formulas. Exports: saveFormulaTemplate, deleteFormulaTemplate.
 * Reads injected: store, cleanFormula, nid. Window reads are declared in split.json. */
(function (parts) {
  parts.formulas = function (context) {
    'use strict';
    const { store, cleanFormula, nid } = context;
  function saveFormulaTemplate(name, formula) {
    return store.update((d) => {
      const clean = cleanFormula(formula, d.items);
      const label = String(name || '').trim().slice(0, 80);
      if (!clean || !label) return d;
      d.formulaTemplates = Array.isArray(d.formulaTemplates) ? d.formulaTemplates : [];
      const existing = d.formulaTemplates.find((t) => t && t.name.toLowerCase() === label.toLowerCase());
      if (existing) { existing.name = label; existing.formula = clean; }
      else d.formulaTemplates.push({ id: nid(d, 'ft'), name: label, formula: clean });
      return d;
    });
  }

  function deleteFormulaTemplate(id) {
    return store.update((d) => { d.formulaTemplates = (d.formulaTemplates || []).filter((t) => t && t.id !== id); return d; });
  }

    return { saveFormulaTemplate, deleteFormulaTemplate };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
