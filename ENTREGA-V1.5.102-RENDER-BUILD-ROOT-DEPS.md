# PetFunny OS v1.5.102 — Render build com dependências na raiz

## Problema corrigido
O deploy do Render travava em:

```bash
npm --prefix backend install --omit=dev --omit=optional --no-audit --no-fund --legacy-peer-deps --progress=false
```

## Correção
A instalação separada do backend foi removida do fluxo de produção. Agora o Render instala as dependências pela raiz do projeto e executa o backend diretamente por `node backend/src/server.js`.

## Alterações principais
- `package.json` raiz agora contém as dependências reais do backend.
- `npm start` roda `node backend/src/server.js`.
- `npm run db:migrate` roda `node backend/src/scripts/migrate.js`.
- `npm run render:build` roda apenas instalação da raiz + migration.
- `install:backend` não é mais usado no Render.
- `DEPLOY_VERSION.txt` criado para forçar novo commit/deploy.

## Render
Build Command:

```bash
npm run render:build
```

Start Command:

```bash
npm start
```

Após subir no GitHub, usar **Clear build cache & deploy** no Render.

## Observação
O push continua opcional. O Render instala com `--omit=optional`, então `web-push` não bloqueia o deploy.
