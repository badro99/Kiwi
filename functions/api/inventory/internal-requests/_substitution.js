export const reservationContract = Object.freeze({
  insert: Object.freeze([]),
  update: Object.freeze([]),
  delete: false,
});
// Contrat : catalogue serveur vers commandData ou Response d'erreur ; aucune écriture de réservation.
export async function substitution({ action, commandData, readDoc, env, merchant, ECONOMAT_CATALOGUE_FEATURE, json, requestToken, catalogueItem, snapshotForUnit }) {
  if (action === 'review') {
    let central;
    try { central = await readDoc(env, merchant, ECONOMAT_CATALOGUE_FEATURE, { items: [] }); }
    catch (_) { return json({ error: 'unmigrated' }, 503); }
    const reviewedLines = Array.isArray(commandData.lines) ? commandData.lines : [];
    const trustedLines = [];
    for (const update of reviewedLines) {
      if (String(update && update.resolution || '').trim() !== 'substituted') {
        trustedLines.push(update);
        continue;
      }
      const substituteFor = requestToken(update && update.substituteFor, 80);
      const substitute = catalogueItem(central, substituteFor);
      const substituteUnit = String(update && update.substituteUnit || '').trim();
      const snapshot = substitute && substitute.active !== false
        ? snapshotForUnit(substitute, substituteUnit)
        : null;
      if (!substitute || substitute.active === false || !snapshot) {
        return json({ error: 'bad-substitute:' + (substituteFor || 'unknown') }, 422);
      }
      trustedLines.push({
        ...update,
        substituteFor,
        substituteUnit: snapshot.unit,
        substituteConversionSnapshot: { ...snapshot },
      });
    }
    commandData = { ...commandData, lines: trustedLines };
  }
  return commandData;
}
