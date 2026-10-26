/* Owner: caisse receipt line projection and hardware printing.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */

    /* L'ADDITION (pré-note remise à table). Ce n'est pas un reçu : ni numéro, ni
     * ICE, ni TVA · volontairement, parce qu'elle n'est pas une pièce fiscale.
     * Elle garde donc son propre chemin.
     *
     * Ce qu'elle n'avait pas : un repli. KiwiHardware.print() rend
     * « printer-not-configured » dès qu'aucune imprimante THERMIQUE n'est jointe
     * et s'arrête là · sur un restaurant équipé d'une imprimante branchée en
     * USB sous Windows, ce bouton ne sortait donc rien du tout. KiwiPrinter sait
     * pourtant imprimer par le pilote système (browserReceipt) ; personne ne
     * l'appelait. Et le message renvoyait vers « l'imprimante dans Réglages »,
     * un écran qui n'existe pas sur la caisse. */
    function printHardwareTicket(ticket) {
      const KP = window.KiwiPrinter;
      const viaSystem = () => {
        /* browserReceipt() et non printReceipt() : la première peint le ticket
           et le donne au pilote du système, la seconde pousse de l'ESC/POS et
           échoue exactement là où on en est. Même objet en entrée. */
        if (!KP || !KP.browserReceipt) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression indisponible sur cet appareil')); return; }
        try {
          Promise.resolve(KP.browserReceipt({
            shop: ticket && ticket.title, lines: (ticket && ticket.lines) || [],
            total: ticket && ticket.total, method: ticket && ticket.method,
          })).then(
            (r) => toast(r && r.ok ? (r.via === 'pdf' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition prête · imprimer ou partager le PDF') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition ouverte dans l\'impression système')) : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée')),
            () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée'))
          );
        } catch (_) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée')); }
      };
      if (!window.KiwiHardware) { viaSystem(); return; }
      Promise.resolve(window.KiwiHardware.print(ticket)).then(function (res) {
        if (res && res.printed) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition imprimée'));
        else if (res && res.mock) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aperçu de démonstration, aucun ticket physique imprimé'));
        else viaSystem();
      }, viaSystem);
    }
    /* Itemised lines for the receipt of the sale being tendered (non-split).
       Table → generateOrder; vente rapida → the cart. */
    /* La famille d'un plat, en clair ("Tajines", "Boissons"). Elle voyage avec
       la ligne jusqu'au rapport de fin de journée, qui regroupe les ventes par
       famille puis par plat. Résolue au moment de l'encaissement, par identifiant
       d'abord (fiable) puis par nom (les parts d'addition partagée ne portent que
       le libellé). Vide si on ne sait pas : le rapport la repêchera dans la carte,
       et il vaut mieux un plat non classé qu'un plat mal classé. */
    function lineCat(id, name) {
      const m = menuLineFind(x => (id && x.id === id) || (name && x.name === name));
      return (m && catLabels[m.cat]) || '';
    }
    /* L'identifiant du plat voyage avec la ligne. Sans lui, le moteur de
       recettes ne sait pas quoi chercher : il reçoit "Tajine poulet citron"
       et n'a qu'une table indexée par it_3. Toute vente était donc muette
       pour le stock · aucun gramme de poulet ne sortait jamais des livres. */
    function formulaPartSupplement(parent, part) {
      /* New remote orders carry this server-authoritative field. Local orders
         carry the same value from the published formula. The catalogue lookup
         keeps already-open legacy tickets itemised after a hot update. */
      if (part && Object.prototype.hasOwnProperty.call(part, 'formulaExtra')) {
        return Math.max(0, +part.formulaExtra || 0);
      }
      const item = (carteState.formulaItems || []).find(candidate => String(candidate.id) === String(parent && parent.id))
        || menuItems.find(candidate => String(candidate.id) === String(parent && parent.id));
      const slots = item && item.formula && Array.isArray(item.formula.slots) ? item.formula.slots : [];
      const slot = slots.find(candidate => String(candidate.id || '') === String((part && part.formulaSlotId) || ''));
      const choice = slot && Array.isArray(slot.choices)
        ? slot.choices.find(candidate => String(candidate.itemId || '') === String((part && part.id) || '')) : null;
      return Math.max(0, +(choice && choice.extra) || 0);
    }

    function receiptLinesFromOrder(lines) {
      const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
      return source.filter(line => line.kind !== 'formula-part').map(line => {
        const qty = Math.max(1, +line.qty || 1);
        const total = line.total != null ? +line.total || 0 : (+line.price || +line.unitPrice || 0) * qty;
        const out = {
          itemId: line.id || line.itemId || '', name: lineLabel(line),
          baseName: line.baseName || line.name, qty,
          total, cat: lineCat(line.id || line.itemId, line.name),
          kind: line.kind || '', formulaUid: line.formulaUid || '',
          promo: line.promo || null,
        };
        if (line.kind === 'formula') {
          const parts = source.filter(part => part.kind === 'formula-part'
            && String(part.formulaUid || '') === String(line.formulaUid || ''));
          const saved = Array.isArray(line.formulaChoices) ? line.formulaChoices : [];
          out.formulaChoices = (parts.length ? parts.map(part => {
            const partQty = Math.max(1, +part.qty || qty);
            const unit = formulaPartSupplement(line, part);
            return { name: lineLabel(part), qty: partQty, total: unit * partQty };
          }) : saved.map(choice => ({
            name: String((choice && choice.name) || 'Choix'),
            qty: Math.max(1, +(choice && choice.qty) || qty),
            total: Math.max(0, +(choice && choice.total) || 0),
          })));
        }
        return out;
      });
    }

    function currentSaleLines() {
      if (mode === 'vrap') return receiptLinesFromOrder(cart);
      if (selectedId && tables[selectedId]) {
        const source = Object.prototype.hasOwnProperty.call(tableOrders, selectedId)
          ? tableOrders[selectedId] : generateOrder(selectedId, tables[selectedId]);
        return receiptLinesFromOrder(source);
      }
      return [];
    }
    
