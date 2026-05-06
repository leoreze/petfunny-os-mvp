# Entrega v1.0 — Financeiro

Versão entregue: `petfunny-os-v1.0-financeiro.zip`

## O que foi feito
- Módulo Financeiro real com dados do PostgreSQL.
- Endpoint `GET /api/financeiro/summary` para métricas de caixa, recebíveis, vencidos, contas a pagar e fluxo dos últimos 7 dias.
- Endpoint `GET /api/financeiro/transactions` com filtros por busca, tipo, status e categoria.
- Endpoint `POST /api/financeiro/transactions` para lançamento manual de entrada ou saída.
- Endpoint `PATCH /api/financeiro/transactions/:id/pay` para baixa de pagamento/recebimento.
- Endpoint `PATCH /api/financeiro/transactions/:id/status` para alteração de status.
- Endpoint `DELETE /api/financeiro/transactions/:id` para cancelamento lógico.
- Endpoint `GET /api/financeiro/options` para formas de pagamento, tutores e categorias.
- Página `/admin/financeiro` com cards de big numbers, fluxo, categorias, listagem filtrável, modal de lançamento e modal de baixa.
- Seed financeiro com receitas e despesas demo.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- Acesse `/admin/login`.
- Entre com `admin@petfunny.local` e `PetFunny@2026`.
- Acesse `/admin/financeiro`.
- Crie um lançamento de entrada ou saída.
- Baixe um pagamento pendente.
- Confira se os cards atualizam.

## Observações
- O financeiro usa dados reais das tabelas `financial_transactions`, `payments` e `payment_methods`.
- Não depende de Mercado Pago, WhatsApp, OpenAI ou integração externa para funcionar.
- Não há tenant, tenant_id, SaaS ou master admin.

## Próxima versão sugerida
`petfunny-os-v1.1-comandas-recibos.zip`
