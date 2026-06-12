# FunnyOS v1.6.106 — Bolão da Copa migration fix

## Correção

Corrige o erro ao rodar `npm run db:migrate` após a v1.6.105:

```txt
relation "world_cup_games" does not exist
```

## O que foi ajustado

- A migration agora cria `world_cup_games` antes de executar `ALTER TABLE` nela.
- A migration agora cria `world_cup_predictions` antes de executar `ALTER TABLE` nela.
- O script ficou idempotente para banco novo e banco já existente.
- O envio/edição de palpite agora usa conflito parcial compatível com palpites ativos.

## Arquivos alterados

- `backend/src/scripts/migrate.js`
- `backend/src/app.js`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

```bash
npm install
npm run db:migrate
npm start
```

Depois acessar:

- `/admin/bolao-copa`
- `/app/bolao-copa`

