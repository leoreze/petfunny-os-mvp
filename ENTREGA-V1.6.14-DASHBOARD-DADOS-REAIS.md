# FunnyOS v1.6.14 — Dashboard com Dados Reais

## Ajustes

- `/admin/dashboard` passou a consumir somente dados reais do banco.
- O resumo `/api/dashboard/summary` agora ignora registros claramente demonstrativos criados por seeds antigas, como tutores com tag/e-mail demo e agendamentos com observações de exemplo.
- Métricas do dashboard foram alinhadas com as tabelas reais:
  - appointments
  - financial_transactions
  - payments
  - tutors
  - pets
  - customer_packages
  - gifts
- Agenda do dia, próximos horários, calendário, status e uso de slots também passaram pelo mesmo filtro de dados reais.

## Sem alteração

- Não altera layout global.
- Não altera banco.
- Não remove dados existentes.
- Não precisa migration.

## Como rodar

```bash
npm start
```
