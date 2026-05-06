# PetFunny OS v1.5.100 — Correção de install no Render

## Problema
O deploy no Render podia ficar travado em `npm install` por causa de lockfiles gerados em ambiente local/interno e por comandos de instalação encadeados.

## Correções
- Removido `package-lock.json` da raiz.
- Removido `backend/package-lock.json` para o Render resolver pacotes direto do registry público.
- Adicionado `.npmrc` com registry público e flags para instalação mais rápida.
- Adicionado script `render:build` na raiz.
- Ajustado `install:backend` para instalar dependências apenas do backend com flags seguras.
- Adicionado `render.yaml` com build/start commands recomendados.
- Ajustado engines para `>=20 <25`.

## Render
Use:

Build Command:
```bash
npm run render:build
```

Start Command:
```bash
npm start
```

## Variáveis importantes no Render
Configure no painel do Render:
- DATABASE_URL
- JWT_SECRET
- APP_URL
- MERCADO_PAGO_ACCESS_TOKEN
- MERCADO_PAGO_PUBLIC_KEY
- MERCADO_PAGO_WEBHOOK_SECRET
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT

## Se ainda travar
No Render, limpe o cache do deploy e rode novamente usando exatamente `npm run render:build`.
