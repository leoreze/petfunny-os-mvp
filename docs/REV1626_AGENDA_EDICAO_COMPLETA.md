# REV 1.6.26 — Agenda Edição Completa

## Ajustes
- Modal de edição da Agenda passa a carregar a hora original do agendamento.
- Campo de hora permanece habilitado na edição, mesmo quando o horário original não aparece mais na disponibilidade do dia.
- Horário original é inserido como opção segura: `HH:mm · horário atual do agendamento`.
- Edição permite salvar status operacional, status de pagamento e forma de pagamento sem bloquear por data/horário passado.
- Fluxo de novo agendamento permanece com validação normal de horário disponível/futuro.

## Arquivos alterados
- `frontend/pages/agenda/index.html`

## Migration
- Não exige migration.
