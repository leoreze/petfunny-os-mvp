# REV 1.6.28 — Financeiro 360° v2

## Implementado

- Aba **Comissões** com cálculo estimado por colaborador no período.
- Aba **Conciliação Pix/Cartão** comparando valor previsto x recebido.
- Alertas inteligentes extras para vencidos, vencimentos do dia, divergências e margem baixa.
- Aba **Serviços & margem** com receita por serviço, ticket médio e margem estimada.
- Exportação **Excel/CSV** por período e tipo de data.
- Exportação **PDF imprimível** por período e tipo de data.

## Regras financeiras

- Previsão e vencimentos: `due_date`.
- Caixa realizado: `paid_at`.
- Auditoria: `created_at`.
- Comissões: regra PetFunny 11–12 pets/dia = 5%, 13–14 = 8%, 15+ = 10%.
- Margem por serviço: cálculo estimado sem quebrar o banco atual.

## Arquivos principais

- `backend/src/app.js`
- `frontend/pages/financeiro/index.html`

## Como testar

1. `npm install`
2. `npm run db:migrate`
3. `npm start`
4. Acessar `/admin/financeiro`.
5. Testar abas: Comissões, Conciliação e Serviços & margem.
6. Testar botões: Exportar Excel e Exportar PDF.

## Observação

Não foram adicionadas alterações destrutivas no banco. A implementação usa as tabelas atuais: `financial_transactions`, `payments`, `appointments`, `appointment_items`, `services`, `service_categories`, `collaborators`, `tutors` e `pets`.
