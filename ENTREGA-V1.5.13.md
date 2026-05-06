# PetFunny OS v1.5.13 — Ajuste UX Novo Agendamento

## Ajustes
- Card de serviços do agendamento fica oculto até selecionar um pet.
- Serviços são renderizados somente após seleção do pet, respeitando tipo de pet e porte.
- Card de serviços recebeu margem superior de 20px.
- Campo Observações recebeu margem superior de 20px.
- Ao selecionar tutor, WhatsApp é preenchido automaticamente quando disponível.
- Quando o tutor possui apenas um pet, o pet é selecionado automaticamente.
- Ao selecionar tutor/pet, observações cadastradas são levadas para o campo Observações quando houver dados disponíveis.

## Como testar
1. Acesse /admin/agenda.
2. Clique em + Novo agendamento.
3. O card de serviços não deve aparecer antes de selecionar o pet.
4. Selecione o tutor ou digite WhatsApp.
5. Selecione o pet.
6. Confira se os serviços aparecem filtrados pelo tipo e porte do pet.
