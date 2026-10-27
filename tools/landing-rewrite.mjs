// A structural rewrite of the built landing either applies or is already in
// place (the generator runs again over its own output). Anything else means the
// exported Next.js page changed shape: the generator stops instead of shipping
// a page that silently kept English or lost its CTA wiring (blind rating 11,
// landing#1).
export function rewrite(text, from, to, label) {
  if (text.includes(from)) return text.replace(from, to);
  if (to && text.includes(to)) return text;
  throw new Error(`rebuild-landing-locales: "${label}" not found; the built page changed shape, fix the pattern before rebuilding`);
}
