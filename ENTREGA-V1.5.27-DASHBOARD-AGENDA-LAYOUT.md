# PetFunny OS v1.5.27 — Dashboard com layout da Agenda

## O que foi feito
- Saúde da agenda no Dashboard passou a usar o mesmo padrão da Visão por status da Agenda.
- Cards por status agora aceitam drag & drop para alterar status do agendamento.
- Calendário do Dashboard recebeu cards com visual igual ao calendário da Agenda.
- Agendamentos no calendário usam foto/avatar do pet e cores do status cadastrado.
- Calendário do Dashboard aceita drag & drop para reagendar em slots disponíveis.
- Mantidos slots, capacidade e ações rápidas sem quebrar os módulos existentes.

## Como testar
1. `npm install`
2. `npm run db:migrate`
3. `npm start`
4. Abrir `/admin/dashboard`
5. Arrastar cards na Saúde da agenda entre colunas de status.
6. Arrastar agendamentos no calendário para outro slot.

## Base
Gerado em cima da v1.5.26-sidebar-fixed-safe.
