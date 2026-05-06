# PetFunny OS v0.1.2 — Base visual corrigida

## O que foi ajustado

- Paleta visual alterada para azul/ciano e rosa da logo PetFunny.
- Verde deixou de ser a cor predominante.
- Logo horizontal `logo-petfunny-full.png` passou a ser a logo principal.
- Sidebar administrativa recebeu ícones antes dos textos.
- Clique na logo recolhe e expande o menu lateral.
- Menu recolhido mostra apenas ícones e logo compacta.
- CSS centralizado por variáveis em `frontend/assets/css/app.css`.
- Animações leves adicionadas em botões, cards, sidebar e painéis.
- Layout responsivo para desktop, tablet e mobile.
- Rotas `/admin/*` mantidas como padrão administrativo.

## Arquivos principais alterados

- `frontend/assets/css/app.css`
- `frontend/assets/js/shell.js`
- `frontend/index.html`
- `frontend/pages/login/index.html`
- `frontend/pages/dashboard/index.html`
- `frontend/pages/*/index.html`
- `README.md`
- `package.json`
- `backend/package.json`

## Como testar

```bash
npm install
npm start
```

Acessar:

- `http://localhost:3000/`
- `http://localhost:3000/admin/dashboard`
- `http://localhost:3000/admin/agenda`
- `http://localhost:3000/api/health`

## Testes realizados

- `/api/health` retornou 200.
- `/` retornou 200.
- `/admin/dashboard` retornou 200.
- `/admin/agenda` retornou 200.
- `/admin/configuracoes` retornou 200.
- `/dashboard` retornou 200.

## Próxima versão

`petfunny-os-v0.2-database.zip`

- Conexão PostgreSQL.
- `npm run db:migrate` real.
- `npm run db:seed` real.
- Schema exclusivo PetFunny sem `tenant_id`.
- Usuário admin inicial.
