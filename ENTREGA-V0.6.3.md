# PetFunny OS v0.6.3 — Loading real e espaçamento premium

Base: petfunny-os-v0.6.2-configuracoes-operacionais.zip

## O que foi feito
- Adicionado o GIF `loading-dog.gif` em `frontend/assets/img/`.
- Criado modal global de carregamento no estilo post-it.
- O loading abre ao carregar páginas admin, landing e app do cliente.
- O loading fecha após renderização, imagens e chamadas de dados finalizarem, com timeout de segurança para nunca travar.
- Aumentado o espaçamento vertical entre seções, cards, grids e painéis.
- Mantido sem MutationObserver e sem beforeunload.

## Arquivos principais alterados
- `frontend/assets/js/loading.js`
- `frontend/assets/js/shell.js`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`
- `frontend/index.html`
- `frontend/pages/login/index.html`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/primeiro-acesso/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/pages/tutores/index.html`
- `frontend/pages/pets/index.html`
- `frontend/pages/configuracoes/index.html`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Próxima versão
- `petfunny-os-v0.7-servicos.zip`
