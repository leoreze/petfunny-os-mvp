# PetFunny OS v1.5.101 — Render build sem travar no push opcional

## Problema corrigido

O deploy no Render travava durante:

```bash
npm --prefix backend install --omit=dev --no-audit --no-fund --legacy-peer-deps
```

A causa provável era a instalação do pacote `web-push` e suas dependências internas durante o build de produção.

## Correção

- `web-push` e dependências auxiliares foram movidos para `optionalDependencies`.
- O build do Render agora instala o backend com `--omit=optional`.
- O sistema sobe normalmente sem push real instalado.
- Push continua opcional: se quiser ativar depois, rode `npm run install:backend:push` ou `npm run push:repair`.

## Build Command no Render

```bash
npm run render:build
```

## Start Command no Render

```bash
npm start
```

## Observação

O App, Admin, landing, Pix e banco não dependem de `web-push` para subir. Se o pacote não estiver instalado, o painel de notificações mostra push indisponível, mas o sistema continua funcionando.
