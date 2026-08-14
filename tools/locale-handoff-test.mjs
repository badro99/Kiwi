#!/usr/bin/env node
import fs from 'node:fs';
import { onRequest } from '../functions/_middleware.js';

let pass = 0;
const failures = [];
function ok(label, condition) {
  if (condition) pass++;
  else failures.push(label);
}

const env = { AUTH_SECRET: 'test-secret' };
const documentHeaders = { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' };

async function request(path, headers = {}) {
  return onRequest({
    request: new Request('https://kiwi-os.test' + path, { headers: { ...documentHeaders, ...headers } }),
    env,
    next: async () => new Response('<!doctype html><title>landing</title>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  });
}

for (const lang of ['en', 'ar', 'fr']) {
  const path = lang === 'fr' ? '/fr/' : `/${lang}/`;
  const landing = await request(path);
  const cookie = landing.headers.get('set-cookie') || '';
  ok(`${lang} landing stores its selected language`, cookie.includes(`kiwi_lang=${lang}`));

  const gate = await request('/dashboard', { Cookie: `kiwi_lang=${lang}` });
  const html = await gate.text();
  ok(`${lang} account gate carries the HTML language`, html.includes(`<html lang="${lang}"`));
  ok(`${lang} account gate persists the app language`, html.includes(`localStorage.setItem('kiwiLang','${lang}')`));
  ok(`${lang} account gate persists a server-readable locale`, html.includes(`kiwi_lang=${lang}; Path=/`));
  ok(`${lang} login keeps the locale after authentication`, html.includes(`/dashboard?lang=${lang}`));
  ok(`${lang} onboarding redirect keeps the locale`, html.includes(`/dashboard?onboarding=1&lang=${lang}`));
}

const en = await (await request('/dashboard?lang=en')).text();
ok('English account gate translates the greeting', en.includes('Welcome <em>to Kiwi</em>.'));
ok('English account gate translates both modes', en.includes('>Sign in</button>') && en.includes('>Create an account</button>'));
ok('English account gate translates validation', en.includes('Incorrect email or password.'));
ok('English account gate translates its field example', en.includes('placeholder="you@example.com"'));

const ar = await (await request('/dashboard?lang=ar')).text();
ok('Arabic account gate uses RTL', ar.includes('<html lang="ar" dir="rtl">'));
ok('Arabic account gate translates the greeting', ar.includes('مرحباً بك <em>في Kiwi</em>.'));
ok('Arabic account gate translates account creation', ar.includes('>إنشاء حساب</button>'));

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
ok('dashboard applies an explicit locale before deferred modules', dashboard.indexOf("localStorage.setItem('kiwiLang', picked)") < dashboard.indexOf('assets/i18n.js'));
ok('dashboard applies Arabic direction before onboarding', dashboard.includes("picked === 'ar' ? 'rtl' : 'ltr'"));
ok('dashboard persists explicit locale for the account gate', dashboard.includes("document.cookie = 'kiwi_lang=' + picked"));

const i18n = fs.readFileSync(new URL('../assets/i18n.js', import.meta.url), 'utf8');
ok('in-app language switches persist for future sign-ins', i18n.includes("document.cookie = 'kiwi_lang=' + lang"));

const onboarding = fs.readFileSync(new URL('../assets/onboarding.js', import.meta.url), 'utf8');
ok('onboarding reads the persisted account locale', onboarding.includes("localStorage.getItem('kiwiLang') || 'fr'"));
ok('onboarding carries English and Arabic copy', onboarding.includes("en: 'Grow my sales'") && onboarding.includes("ar: 'زيادة مبيعاتي'"));

if (failures.length) {
  console.error(`\n  ✗ locale handoff — ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error('     · ' + failure));
  process.exit(1);
}
console.log(`  ✓ locale handoff (${pass} controls: landing → account → onboarding)`);
