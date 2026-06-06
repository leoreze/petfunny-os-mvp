# FunnyOS v1.6.94 — Agenda Tags de Pagamento

## O que foi corrigido

- Em `/admin/agenda`, todos os cards de agendamento passam a exibir tag visual de pagamento.
- Pagamento pendente aparece como tag vermelha: `Pendente`.
- Pagamento pago aparece como tag verde: `Pago`.
- Aplicado na lista de agendamentos, na Visão por status e nos cards do calendário.
- Mantida a forma de pagamento como texto auxiliar quando existir.

## Arquivos alterados

- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/agenda`.
2. Abra a lista de agendamentos.
3. Confira cards com pagamento pendente: tag vermelha `Pendente`.
4. Confira cards pagos: tag verde `Pago`.
5. Teste também no calendário e na Visão por status.
