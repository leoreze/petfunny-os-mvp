# PetFunny OS v1.5.1 — Polimento de Copy, UX e Agenda

## O que foi feito

- Revisão de textos visíveis para remover mensagens técnicas de versão e transformar a interface em texto definitivo de produto.
- Padronização visual dos hero cards, cards, painéis, filtros e áreas de conteúdo com CSS global.
- Loading post-it reforçado ao clicar em links do menu principal.
- O modal de loading aparece antes da navegação e permanece ativo até renderização/fetches da nova página.
- Agenda com drag & drop funcional dentro do calendário.
- Novo endpoint `PATCH /api/agenda/:id/reschedule` para reagendar atendimento ao arrastar no calendário.
- Drag & drop por status foi preservado.
- Cards do calendário agora são arrastáveis e mantêm a cor baseada no status cadastrado.
- Dia, semana e mês passam a aceitar drop em slots/dias compatíveis.

## Arquivos principais alterados

- `frontend/assets/css/app.css`
- `frontend/assets/js/shell.js`
- `frontend/assets/js/loading.js`
- `frontend/pages/agenda/index.html`
- `frontend/pages/dashboard/index.html`
- `frontend/pages/financeiro/index.html`
- `frontend/pages/tutores/index.html`
- `frontend/pages/pets/index.html`
- `frontend/pages/servicos/index.html`
- `frontend/pages/configuracoes/index.html`
- `backend/src/app.js`
- `package.json`
- `backend/package.json`

## Como testar

1. Rodar:

```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

2. Acessar:

```txt
http://localhost:3000/admin/login
http://localhost:3000/admin/dashboard
http://localhost:3000/admin/agenda
```

3. Testar menu:

- Clique nos links do menu.
- O modal de loading deve abrir antes da navegação.
- Ele deve fechar apenas após a página carregar os dados e renderizar.

4. Testar agenda:

- Abra `/admin/agenda`.
- Arraste um card do calendário para outro slot no dia/semana.
- O sistema deve chamar `PATCH /api/agenda/:id/reschedule` e atualizar data/hora.
- Arraste um card na visão por status para mudar o status.

## Observação

O sistema permanece exclusivo do PetFunny, sem tenant, sem SaaS, sem master admin e sem IA obrigatória para carregamento.
