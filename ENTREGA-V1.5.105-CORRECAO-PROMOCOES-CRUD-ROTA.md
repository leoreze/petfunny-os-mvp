# PetFunny OS v1.5.105 — Correção Promoções CRUD e rota

## O que foi corrigido
- Corrigido problema em que `/admin/promocoes` podia abrir a landing page.
- Adicionada rota explícita para `/admin/promocoes` e `/promocoes` antes da landing/fallback.
- Service Worker agora intercepta apenas rotas do App do Tutor e assets do app, não mais admin/landing.
- Mantido CRUD de promoções no admin: listar, criar, editar e remover.
- Mantida aplicação automática das promoções no agendamento do app conforme serviço, porte e dia da semana.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/service-worker.js`
- `frontend/pages/promocoes/index.html`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar
1. Rode `npm run db:migrate`.
2. Rode `npm start`.
3. Acesse `/admin/promocoes`.
4. A página deve abrir o CRUD de Promoções, não a landing.

## Observação
Se o navegador ainda abrir a landing por cache antigo, vá em DevTools > Application > Service Workers > Unregister e limpe o cache. A versão nova do service worker (`petfunny-app-v1.5.105`) evita que isso aconteça novamente.
