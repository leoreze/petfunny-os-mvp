# PetFunny OS v0.3 — Login e Autenticação

## Versão entregue
`petfunny-os-v0.3-auth.zip`

## O que foi feito
- Implementado login real com PostgreSQL.
- Implementado JWT com `jsonwebtoken`.
- Implementado `POST /api/auth/login`.
- Implementado `GET /api/auth/me` protegido.
- Implementado `POST /api/auth/logout`.
- Implementado `GET /api/dashboard/summary` protegido como base para a futura v0.5.
- Criado middleware real `requireAuth`.
- Frontend agora usa uma única chave de token: `petfunny_token`.
- `api.js` agora envia `Authorization: Bearer <token>` em chamadas autenticadas.
- 401 limpa o token e redireciona para `/admin/login`.
- Página de login foi recriada com formulário funcional.
- Shell administrativo exige autenticação antes de renderizar páginas internas.
- Logout no menu de perfil limpa sessão e volta para login.
- Mantido CSS aprovado da v0.1.6 com copyright e post-it.
- Mantido sem tenant, sem SaaS, sem master admin e sem DDL no runtime.

## Arquivos principais alterados
- `backend/src/app.js`
- `backend/src/middlewares/authMiddleware.js`
- `frontend/pages/login/index.html`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/js/api.js`
- `frontend/assets/js/auth.js`
- `frontend/assets/js/shell.js`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
1. Acesse `http://localhost:3000/admin/login`.
2. Entre com:
   - Email: `admin@petfunny.local`
   - Senha dev: `PetFunny@2026`
3. Confirme que o navegador redireciona para `/admin/dashboard`.
4. Clique em `Testar /api/auth/me` no dashboard.
5. Abra o menu de perfil e clique em `Sair`.
6. Confirme que o token `petfunny_token` foi removido.

## Endpoints
- `GET /api/health`
- `GET /api/db/status`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard/summary`

## Observações
- O login depende do seed da v0.2.
- O runtime não cria nem altera schema.
- O endpoint `/api/dashboard/summary` já existe como base técnica, mas a tela real do dashboard com dados completos será tratada na v0.5.

## Próxima versão
`petfunny-os-v0.4-admin-shell.zip`
