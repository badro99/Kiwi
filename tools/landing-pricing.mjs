// Shared pricing source for the static export, Flight props and locale rebuild.
import fs from 'node:fs';

export const pricingCopy = JSON.parse(fs.readFileSync('content/landing-pricing.json', 'utf8'));
export const prices = [
  { monthly: 150, annual: 99, total: 1188 },
  { monthly: 300, annual: 249, total: 2988 },
  { monthly: 399, annual: 349, total: 4200, glow: true },
  { monthly: 1499, fixed: true },
];
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
export const formatPrice = (amount, locale) => new Intl.NumberFormat(pricingCopy[locale].numberLocale, { numberingSystem: 'latn', useGrouping: true }).formatToParts(amount).map(part => part.type === 'group' ? ({ fr: ' ', en: ',', ar: ',', de: '.', it: '.', nl: '.', es: ' ' }[locale]) : part.value).join('');

export function pricingHTML(html, locale) {
  const p = pricingCopy[locale];
  const start = html.indexOf('<section id="pricing"');
  const end = html.indexOf('</section>', start) + 10;
  if (start < 0) throw new Error('Missing pricing section');
  const section = html.slice(start, end);
  const spark = section.match(/<li\b[^>]*>(<svg[\s\S]*?<\/svg>)/)[1];
  const arrow = section.match(/<a\b[^>]*>[\s\S]*?(<span aria-hidden="true" class="kw-arrow[\s\S]*?)<\/a>/)[1];
  const buttonClass = 'mt-6 flex h-12 w-fit items-center justify-center gap-2.5 rounded-[999px] bg-white py-3 pe-3 ps-5 text-base font-medium tracking-[-0.04em] whitespace-nowrap text-black transition-[background-color,transform] duration-200 hover:bg-white/90 active:scale-[0.98]';
  const card = (tier, index) => {
    const ultimate = index === 4;
    const href = 'https://wa.me/212624495159' + (tier.name === 'Plus' ? '?text=plus' : '');
    return `<div class="flex w-full overflow-hidden rounded-xl bg-[rgba(0,0,0,0.3)] backdrop-blur-[10px] ${ultimate ? 'kw-contact-strip' : 'kw-plan-card'}" data-plan="${tier.name.toLowerCase()}"><div data-reveal="" class="flex w-full flex-col"><div class="relative flex w-full flex-col items-start justify-between rounded-xl border border-[var(--color-line)] kw-plan-inner">${prices[index]?.glow ? '<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[100px] bg-[var(--color-accent)] blur-[116px]"></div>' : ''}<div class="kw-plan-heading"><h3 class="text-4xl leading-9 font-normal tracking-[-0.06em] text-white">${tier.name}</h3>${ultimate ? `<p class="text-base leading-6 font-extralight text-white/80">${escape(tier.description)}</p>` : ''}</div><div class="kw-plan-body"><div class="flex w-full flex-col gap-2"><p class="kw-price-in text-5xl leading-[48px] font-normal tracking-[-0.06em] text-white">${ultimate ? `<span class="text-4xl leading-[48px]">${escape(p.quote)}</span>` : `${formatPrice(prices[index].monthly, locale)}<!-- --> <!-- -->${p.currency}<span class="text-2xl leading-6 font-extralight tracking-[-0.02em] text-white/80">${escape(p.monthlySuffix)}</span>`}</p><p class="min-h-5 text-sm leading-5 font-extralight tracking-[-0.02em] text-white/55">${escape(ultimate ? p.quoteDetail : p.billedMonthly)}</p></div><ul class="flex w-full flex-col gap-2.5">${tier.features.map(feature => `<li class="flex min-h-5 items-center gap-2.5">${spark}<span class="text-base leading-4 font-extralight tracking-[-0.02em] text-white max-md:leading-5">${escape(feature)}</span></li>`).join('')}</ul><a href="${href}" target="_blank" rel="noreferrer" class="${buttonClass}">${escape(tier.cta)}${arrow}</a></div></div></div></div>`;
  };
  const radios = p.periods.map((period, index) => `<button type="button" role="radio" aria-checked="${index === 0}" data-on="${index === 0}" tabindex="${index === 0 ? 0 : -1}" class="relative z-[1] flex h-11 items-center rounded-[999px] px-6 text-base leading-4 font-medium tracking-[-0.02em] whitespace-nowrap transition-colors duration-200 max-md:px-4 max-md:text-[15px] ${index ? 'text-white/60 hover:text-white/85' : 'text-white'}">${escape(period.label)}</button>`).join('');
  const output = `<section id="pricing" class="flex flex-col items-center gap-14 ps-10 max-md:px-5"><div class="flex w-full max-w-[746px] flex-col items-center gap-2.5"><h2 class="text-center text-5xl leading-[48px] font-normal tracking-[-0.06em] text-white max-md:text-[36px] max-md:leading-9">${escape(p.title)}</h2><p class="text-center text-xl leading-7 font-extralight tracking-[-0.02em] text-white">${escape(p.body)}</p></div><div class="flex w-full max-w-[746px] justify-center"><div role="radiogroup" aria-label="${escape(p.billingLabel)}" class="relative inline-flex items-center rounded-[999px] border border-[var(--color-line)] bg-[var(--color-glass-nav)] p-1.5 backdrop-blur-[10px]"><span aria-hidden="true" class="kw-lens"></span>${radios}</div></div><div class="kw-pricing-grid grid w-full max-w-[1400px]">${p.tiers.map(card).join('')}</div>${card(p.ultimate, 4)}</section>`;
  return html.slice(0, start) + output + html.slice(end);
}

// Pricing is a complete JSON record, not a string substitution across Flight's
// length-prefixed text records. Keep every other server component unchanged.
export function pricingFlight(flight, locale) {
  return flight.replace(/^([0-9a-f]+:)(\[.*"tiers":.*)$/gm, (line, prefix, json) => {
    const record = JSON.parse(json);
    if (!record[3]?.t?.tiers) return line;
    record[3].t = pricingCopy[locale];
    return prefix + JSON.stringify(record);
  });
}

export function applyPricing(html, locale) {
  html = pricingHTML(html, locale);
  const pattern = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  const flight = [...html.matchAll(pattern)].map(match => JSON.parse(match[1])).join('');
  let wrote = false;
  html = html.replace(pattern, () => {
    if (wrote) return '';
    wrote = true;
    return `self.__next_f.push([1,${JSON.stringify(pricingFlight(flight, locale))}])`;
  });
  // These affected hero/SEO strings also live in server components and Flight.
  // Translate both copies together so the first client render agrees with HTML.
  for (const key of ['hero', 'metadataDescription']) {
    html = html.replaceAll(pricingCopy.en[key], pricingCopy[locale][key]);
  }
  return html;
}
