# PetFunny OS v1.5.76 — Correção Push Diagnóstico

## Correções
- O backend agora carrega `.env` da raiz do projeto e também `backend/.env`.
- O endpoint `/api/app/push/public-key` informa quais variáveis VAPID estão faltando.
- O endpoint `/api/push/status` informa separadamente:
  - `vapidConfigured`;
  - `webPushAvailable`;
  - `missing`;
  - `envFile`.
- Logs do push agora mostram se o problema é chave VAPID ausente ou pacote `web-push` indisponível.

## Como corrigir localmente
1. Gere as chaves:
```bash
npm run push:keys
```

2. Coloque no `.env` da raiz do projeto ou em `backend/.env`:
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contato@petfunny.com.br
```

3. Garanta o pacote no backend:
```bash
cd backend
npm install web-push@3.6.7 --save --no-audit --no-fund
cd ..
```

4. Reinicie:
```bash
npm start
```

## Validação
- `node --check backend/src/app.js`
- `node --check backend/src/config/env.js`
