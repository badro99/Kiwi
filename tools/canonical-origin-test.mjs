#!/usr/bin/env node

import { onRequest } from '../functions/_middleware.js';

let checks = 0;
const failures = [];
const ok = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};

async function call(url, method = 'GET') {
  let nextCalls = 0;
  const response = await onRequest({
    request: new Request(url, { method, headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } }),
    env: {},
    next: async () => {
      nextCalls += 1;
      return new Response('origin', { status: 200 });
    },
  });
  return { response, nextCalls };
}

{
  const { response, nextCalls } = await call('https://kiwi-os.com/?utm_source=test');
  ok(response.status === 308, 'apex root returns a permanent redirect');
  ok(response.headers.get('location') === 'https://kiwi-os.com/fr/?utm_source=test', 'apex root redirects directly to slash-final French');
  ok(nextCalls === 0, 'root redirect does not read the duplicate static document');
}
{
  const { response, nextCalls } = await call('https://www.kiwi-os.com/ar/guides/%D9%86%D9%82%D8%B7%D8%A9/?ref=mail');
  ok(response.status === 308, 'www returns a permanent redirect');
  ok(response.headers.get('location') === 'https://kiwi-os.com/ar/guides/%D9%86%D9%82%D8%B7%D8%A9/?ref=mail', 'www preserves the path and query on the apex host');
  ok(nextCalls === 0, 'www redirect never reaches an application route');
}
{
  const { response } = await call('https://www.kiwi-os.com/index.html');
  ok(response.headers.get('location') === 'https://kiwi-os.com/fr/', 'www root canonicalizes host and locale in one hop');
}
{
  const { response, nextCalls } = await call('https://kiwi-os.com/fr/');
  ok(response.status === 200 && nextCalls === 1, 'canonical locale document passes through unchanged');
}
{
  const { response, nextCalls } = await call('http://kiwi-os.com/en/guides/restaurant-food-cost/?from=http');
  ok(response.status === 308, 'HTTP apex URLs return a permanent redirect');
  ok(response.headers.get('location') === 'https://kiwi-os.com/en/guides/restaurant-food-cost/?from=http', 'HTTP upgrades in one hop without changing path or query');
  ok(nextCalls === 0, 'HTTP apex redirect never reaches an application route');
}
{
  const { response, nextCalls } = await call('https://preview.pages.dev/');
  ok(response.status === 200 && nextCalls === 1, 'preview hosts stay usable');
}
{
  const { response, nextCalls } = await call('https://www.kiwi-os.com/api/sale', 'POST');
  ok(response.status === 308 && nextCalls === 0, 'www API requests preserve their method through a 308 redirect');
}

if (failures.length) {
  console.error(`\n  ✗ canonical origin — ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error('     · ' + failure));
  process.exit(1);
}
console.log(`  ✓ canonical origin (${checks} controls: apex, www, slash and query preservation)`);
