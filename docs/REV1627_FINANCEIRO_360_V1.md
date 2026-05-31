# REV 1.6.27 — Financeiro 360° v1

## Implementado

- Tela `Admin > Financeiro` renomeada para **Financeiro 360°**.
- Cards principais ampliados para:
  - Receitas por vencimento;
  - Despesas por vencimento;
  - Lucro estimado;
  - Em aberto;
  - Em atraso;
  - Taxa de pagamento.
- Fluxo de caixa preservado, agora explicitamente baseado em vencimento.
- Novo seletor de tipo de data:
  - Data de vencimento (`due_date`);
  - Data de pagamento (`paid_at`);
  - Data de lançamento (`created_at`).
- Novos blocos:
  - Recebimentos de hoje;
  - Vencimentos próximos;
  - Alertas importantes.
- Atalhos de visualização:
  - Recebimentos;
  - Despesas;
  - Vencimentos;
  - Inadimplência.
- Compatibilidade preservada com dados atuais de `financial_transactions`, `payments`, `appointments`, `customer_packages`, `tutors` e `pets`.

## Regras financeiras

- Previsão e vencimentos: `due_date`.
- Caixa realizado: `paid_at`.
- Auditoria/histórico: `created_at`.

## Observações

- Não adiciona tabelas novas.
- Não altera o fluxo de Agenda, Pacotes ou App do Tutor.
- Não exige migration obrigatória além das migrations já existentes da versão anterior.
