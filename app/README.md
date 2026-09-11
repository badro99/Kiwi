# Kiwi Pro — app native (Capacitor)

Coque native autour des surfaces web du dépôt. Rien ici n'est une deuxième base de
code : `www/` est la **sortie** de `node tools/build-app-www.mjs` (gitignorée).

- Plan et décisions : `docs/roadmaps/KIWI_APP_PLAN.md`
- Runbook (build, bundle, CORS, release) : `docs/ops/APP.md`

```bash
npm ci && npm run build && npx cap sync && npx cap open ios
```
