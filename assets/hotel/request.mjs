/* Reception and commercial requests: bounded reads, no automatic write retry. */
import { deadlineFetch } from '../request-deadline.mjs';
const uncertain = new Set();
export async function hotelRequest(url, options = {}, tx = value => value) {
  const write = !['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase());
  let command = {};
  try { command = JSON.parse(options.body || '{}'); } catch (_) {}
  const key = url + '|' + [command.merchant, command.id || command.clientRef || command.item?.id].join('|');
  const readUrl = url === '/api/store' ? '/api/store?' + new URLSearchParams({ feature: command.feature, merchant: command.merchant }) : url + '?' + new URLSearchParams({ merchant: command.merchant, includeCancelled: '1' });
  async function reconcile() {
    const response = await deadlineFetch(readUrl, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error('read-failed');
    uncertain.delete(key);
  }
  try {
    if (write && uncertain.has(key)) await reconcile();
    const response = await deadlineFetch(url, options, write ? 20000 : 15000);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid-response');
    response.json = async () => data;
    return response;
  } catch (error) {
    if (write) {
      uncertain.add(key);
      try { await reconcile(); } catch (_) {}
    }
    throw Object.assign(new Error(tx(write ? 'Résultat incertain. Rouvrez le dossier pour vérifier avant de réessayer.' : 'Chargement impossible. Réessayez.')), { cause: error, uncertain: write });
  }
}
