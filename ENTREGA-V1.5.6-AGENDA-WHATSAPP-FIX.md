# PetFunny OS v1.5.6 — Correção Agenda WhatsApp

## Correção
- Corrigido erro `Cannot read properties of null (reading 'addEventListener')` na página `/admin/agenda`.
- Reintroduzido o campo principal `WhatsApp do cliente` no modal de Novo Agendamento com o ID correto `client-whatsapp-search`.
- O JavaScript da Agenda agora também é defensivo ao registrar eventos nos campos do modal.

## Fluxo preservado
- Busca automática por WhatsApp.
- Carregamento automático de tutor e pets.
- Serviços agrupados por tipo de serviço.
- Filtro de serviços por tipo de pet e porte.
