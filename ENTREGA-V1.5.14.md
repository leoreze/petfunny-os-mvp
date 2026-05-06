# PetFunny OS v1.5.14 — Agenda com calendário operacional

## O que foi ajustado
- Calendário da Agenda com mini foto do pet nos agendamentos.
- Quando o pet não tem foto, aparece avatar com as iniciais.
- Menu de três pontinhos em cada agendamento do calendário.
- Ações no menu: editar, cancelar, comanda e recibo.
- Botão Recibo aparece apenas quando o status de pagamento é Pago.
- Tags compactas de slots usados/capacidade por horário, dia, semana e mês.
- Botão rápido “+” para novo agendamento quando houver vaga no slot.
- Lista de agendamentos em cards responsivos com espaçamento entre cards.
- Backend da Agenda passa a retornar foto do pet nos agendamentos.

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
- Acesse `/admin/agenda`.
- Confira mini foto/avatar nos cards do calendário.
- Abra o menu de três pontinhos no card.
- Verifique se Recibo aparece apenas para agendamento pago.
- Clique no botão `+` de um slot disponível.
- Confira a lista de agendamentos em cards responsivos.
