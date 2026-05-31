# REV 1.6.25 — Financeiro v2 por data de vencimento

## Ajuste aplicado

O módulo Financeiro passou a considerar a data de vencimento (`due_date`) como data principal de competência para entradas, gráficos, categorias, listagem por período e insights financeiros.

## Por que

Agendamentos antigos e lançamentos criados anteriormente podiam cair nos gráficos pela data de lançamento (`created_at`) ou pagamento (`paid_at`), distorcendo o caixa quando uma cobrança era lançada hoje para vencer em outro dia.

## Regra atual

- Data principal dos relatórios: `due_date`.
- Fallback: `paid_at::date`, depois `created_at::date`, apenas se não houver vencimento.
- Entradas antigas vinculadas a agendamentos recebem `due_date = appointments.starts_at::date` pela migration.
- Entradas antigas sem agendamento recebem fallback seguro em `created_at::date`.

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/financeiro/index.html`

## Como aplicar

```bash
npm run db:migrate
npm start
```
