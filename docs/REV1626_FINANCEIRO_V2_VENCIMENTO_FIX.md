# REV 1.6.26 — Financeiro v2 vencimento funcionando

## Correção principal

- O Financeiro agora usa uma data financeira efetiva para consolidar gráficos, listagens, inadimplência e relatórios.
- Para lançamentos vinculados a agendamentos, a referência passa a ser a data do atendimento (`appointments.starts_at::date`).
- Para pacotes, a referência usa `customer_packages.starts_on` quando não houver vencimento explícito.
- Para lançamentos manuais, continua valendo `financial_transactions.due_date`.

## Pontos ajustados

- `/api/financeiro/summary`: cards, fluxo diário e categorias por vencimento real.
- `/api/financeiro/transactions`: filtros e ordenação por vencimento efetivo.
- `/api/financeiro/inadimplentes`: cobrança vencida por data real do atendimento/pacote.
- `/api/relatorios/insights`: comparativos, crescimento e fluxo dos slides usando vencimento.
- Notificações automáticas de inadimplência usando vencimento efetivo.
- Sincronização de novos lançamentos gerados por agendamento com due_date igual ao dia do atendimento.
- Migração atualizada para corrigir também registros antigos que já tinham due_date errado.

## Observação

Depois de substituir os arquivos, rode `npm run db:migrate` uma vez. Essa migração não apaga dados; ela apenas cria/valida estrutura e corrige o `due_date` dos registros financeiros antigos vinculados a agendamentos.
