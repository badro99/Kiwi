// Consumer failures contain operation identifiers only, never merchant records.
export function reportConsumerFailure(host, consumer, operation, merchant) {
  const key = 'kiwi:live-consumer-error:' + merchant + ':' + consumer + ':' + operation;
  const result = { consumer, operation, merchant, status: 'failed', retry: 'next-feed', at: Date.now() };
  host.KiwiLiveConsumerErrors = host.KiwiLiveConsumerErrors || {};
  const first = !host.KiwiLiveConsumerErrors[key];
  host.KiwiLiveConsumerErrors[key] = result;
  try { host.localStorage.setItem(key, JSON.stringify(result)); } catch (_) {}
  host.document.dispatchEvent(new host.CustomEvent('kiwi:live-consumer-error', { detail: result }));
  const lang = host.document.documentElement.lang;
  const COPY = {
    fr: 'Synchronisation des ventes échouée pour {consumer}. Rechargez pour réessayer. Si le problème persiste, contactez le support.',
    en: 'Sales sync failed for {consumer}. Reload to retry. If it persists, contact support.',
    ar: 'تعذرت مزامنة المبيعات مع {consumer}. أعد تحميل الصفحة للمحاولة. إذا استمر الخطأ، اتصل بالدعم.',
  };
  const copy = COPY[lang] || COPY.fr;
  if (first && host.Kiwi && host.Kiwi.toast) host.Kiwi.toast(copy.replace(/\{consumer\}/, consumer + ' · ' + operation), { type: 'error' });
  return result;
}
