# PetFunny OS v1.5.123 — Cor oficial #F8A198 e rolagem única em Franquias

## O que foi ajustado

- Substituído o rosa/salmão anterior pela cor oficial `#F8A198` nos principais ambientes visuais.
- Aplicado `#F8A198` em botões, CTAs, badges, estados de formulário, theme-color, app do tutor, landing principal e landing de franquias.
- Reforçada a página `/franquias` para usar apenas a rolagem principal do documento, sem scroll interno duplicado.

## Arquivos principais alterados

- `frontend/assets/css/app.css`
- `frontend/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/primeiro-acesso/index.html`
- `frontend/pages/roleta-de-mimos/index.html`
- `frontend/pages/relatorios/index.html`
- `frontend/assets/js/toast.js`
- `frontend/manifest.webmanifest`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

```bash
npm start
```

Acesse:

- `http://localhost:3000/`
- `http://localhost:3000/franquias`
- `http://localhost:3000/app/home`

Não precisa rodar migration nesta versão.
