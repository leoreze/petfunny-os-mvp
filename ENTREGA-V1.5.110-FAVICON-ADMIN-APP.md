# PetFunny OS v1.5.110 — Favicon no Admin e App

## O que foi feito

- Adicionado favicon PetFunny nas páginas do Admin.
- Adicionado favicon PetFunny nas páginas do App do Tutor.
- Criado `frontend/favicon.ico` para navegadores que buscam o favicon na raiz.
- Criado `frontend/favicon.png` como fallback em PNG.
- Mantido `apple-touch-icon` para iOS/PWA.
- Atualizado cache do Service Worker para `petfunny-app-v1.5.110`.

## Arquivos principais alterados

- `frontend/index.html`
- `frontend/pages/**/index.html`
- `frontend/favicon.ico`
- `frontend/favicon.png`
- `frontend/service-worker.js`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Rode `npm start`.
2. Acesse `/admin`.
3. Acesse `/app/login` e `/app/home`.
4. Confira o ícone PetFunny na aba do navegador.

Se o navegador ainda mostrar favicon antigo, limpe cache ou recarregue com `Ctrl + F5`.
