# PetFunny OS v1.5.2 — Correção Drag & Drop da Agenda

Base: v1.5.1-polimento-copy-ux.

## Correção aplicada

- Corrigido falso erro `Horário fora do funcionamento configurado.` ao reagendar por drag & drop no calendário.
- A validação de slot agora usa a data/hora local do PetFunny (`America/Sao_Paulo`) e compara diretamente com os horários configurados em Configurações.
- A contagem de capacidade por horário também passou a considerar o horário local do PetFunny.
- O backend continua validando dia aberto, faixa de funcionamento e limite de vagas por hora.

## Arquivo alterado

- `backend/src/app.js`

## Como testar

1. Rode `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm start`.
2. Acesse `/admin/agenda`.
3. Arraste um agendamento para um horário que aparece no calendário dentro do funcionamento configurado.
4. O sistema deve salvar o novo horário sem falso erro de expediente.
