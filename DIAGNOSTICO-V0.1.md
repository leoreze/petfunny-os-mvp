# Diagnóstico técnico inicial — ZIP atual PetFunny

## Estrutura atual encontrada

O ZIP enviado contém uma aplicação com:

- `backend/` com Node.js, Express, PostgreSQL, dotenv, JWT e rotas por domínio.
- `frontend/` com páginas HTML, assets CSS/JS e múltiplos shells.
- `docs/` com várias revisões incrementais.
- `node_modules/` dentro do ZIP, que não deve ser versionado nem entregue nas próximas versões.

## Tecnologias usadas

- Node.js com ES Modules.
- Express.
- PostgreSQL via `pg`.
- dotenv.
- jsonwebtoken.
- Frontend HTML/CSS/JS modular.

## Principais arquivos do backend atual

- `backend/src/app.js`
- `backend/src/server.js`
- `backend/src/config/db.js`
- `backend/src/config/env.js`
- `backend/src/middleware/auth.js`
- `backend/src/controllers/authController.js`
- `backend/src/services/authService.js`
- `backend/src/services/tenantService.js`
- `backend/src/services/managementService.js`
- `backend/src/scripts/bootstrapDb.js`
- `backend/src/scripts/ensureFullSchema.js`
- `backend/src/scripts/migrate.js`
- `backend/src/scripts/seed.js`

## Principais arquivos do frontend atual

- `frontend/assets/js/api.js`
- `frontend/assets/js/auth.js`
- `frontend/assets/js/state.js`
- `frontend/assets/js/navigation.js`
- `frontend/assets/js/dashboard.js`
- `frontend/assets/js/agenda.js`
- `frontend/assets/js/management-pages.js`
- `frontend/assets/js/tenant-auth.js`
- `frontend/layouts/shell-tenant.html`
- `frontend/pages/auth/tenant-login.html`
- `frontend/pages/tenant/*`

## Onde existe lógica SaaS/tenant

- Rotas `/api/tenant` e `/api/petfunny` usando os mesmos serviços herdados.
- JWT com `tenantId`, `tenantSlug` e `petfunnyId`.
- Banco com tabelas `tenants`, `tenant_users`, `tenant_settings`, `tenant_services`, `tenant_agenda_items`, `tenant_tutors`, `tenant_pets`, `tenant_customer_packages` e outras `tenant_*`.
- Frontend com `tenant-auth.js`, `shell-tenant.html` e páginas em `frontend/pages/tenant`.
- Variável `LOCKED_TENANT_SLUG` / `lockedTenantSlug`.

## Onde existe autenticação

- `backend/src/services/authService.js` consulta `tenant_users` com join em `tenants`.
- `backend/src/middleware/auth.js` valida JWT com contexto tenant/petfunny.
- `frontend/assets/js/auth.js` usa múltiplas chaves de token e cache de branding/perfil.

## Onde existe loading/global state arriscado

- `frontend/assets/js/api.js` mistura API client com feedback/loading global.
- `frontend/assets/js/auth.js` gerencia token, cache, branding, sessão e palette ao mesmo tempo.
- Há múltiplas fontes de token: `token`, `petfunny_token`, `pf_token`, além de estruturas antigas em localStorage/sessionStorage.

## Riscos de travamento

- Loading/feedback global acoplado ao client de API.
- Estado global distribuído entre vários arquivos.
- Fluxos que dependem de autenticação, branding e dashboard simultaneamente.
- Histórico de bootstrap/schema pesado e rotas com consultas em tabelas antigas.
- Frontend antigo com múltiplos módulos tentando inicializar a mesma página.

## Chamadas para banco

- Centralizadas em `backend/src/config/db.js`, mas distribuídas nos services.
- Muitas queries ainda exigem `tenant_id`.
- Serviços executam lógica de schema em funções `ensure*`.

## Migrations, seeds e schema

- `backend/src/scripts/bootstrapDb.js`
- `backend/src/scripts/ensureFullSchema.js`
- `backend/src/scripts/migrate.js`
- `backend/src/scripts/seed.js`
- `backend/src/scripts/seedSimulatedOps.js`

Há DDL espalhado em scripts e services. A nova arquitetura deve concentrar DDL apenas em `npm run db:migrate`.

## Arquivos a remover

- Toda camada `tenant` do frontend e backend.
- `tenantService.js`, `tenantRoutes.js`, `tenant-auth.js`, `shell-tenant.html`.
- Rotas core/master admin.
- Scripts baseados em `tenant_*`.
- `node_modules` do ZIP.
- `.env` com credenciais reais.

## Arquivos a aproveitar

- Logos e imagens oficiais do PetFunny.
- Alguns estilos visuais e tokens, reescritos com CSS limpo.
- Regras de negócio mapeadas nos docs, não o código SaaS antigo.

## Arquivos a recriar

- Backend `app.js`, `server.js`, `env.js`, `db.js`.
- Migrations limpas sem `tenant_id`.
- Auth com tabela `users`.
- Frontend `api.js`, `auth.js`, `loading.js`, `toast.js`, `router.js`.
- Shell admin novo.
- Todos os módulos por versões.

## Nova arquitetura

A nova arquitetura nasce em `petfunny-os/`, com backend e frontend separados, módulos claros, sem tenant e sem SaaS ativo.

## Plano de reconstrução

- v0.1 base limpa.
- v0.2 banco e migrations.
- v0.3 login e autenticação.
- v0.4 shell admin.
- v0.5 dashboard.
- v0.6 tutores e pets.
- v0.7 serviços.
- v0.8 agenda.
- v0.9 pacotes e assinaturas.
- v1.0 financeiro.
- v1.1 comandas e recibos.
- v1.2 CRM e marketing.
- v1.3 roleta de mimos.
- v1.4 configurações.
- v1.5 final.
