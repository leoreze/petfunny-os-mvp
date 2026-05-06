# PetFunny OS v1.5.5 — Agenda, Configurações e Serviços Compatíveis

## Ajustes entregues
- Tipos de Serviços em Configurações agora aceitam Tipo de Pet e Porte.
- Novo Agendamento recebeu campo principal de WhatsApp do cliente.
- Busca automática por WhatsApp carrega o tutor e seus pets.
- Ao selecionar o pet, os serviços aparecem agrupados por Tipo de Serviço.
- A lista de serviços respeita Tipo de Pet e Porte cadastrados.
- Migration adiciona filtros opcionais em service_categories: pet_type_code e pet_size_code.

## Como testar
1. Rode npm run db:migrate e npm run db:seed.
2. Acesse /admin/configuracoes e edite Tipos de Serviços.
3. Configure Tipo de Pet e Porte para cada tipo de serviço, se desejar restringir.
4. Acesse /admin/agenda e clique Novo agendamento.
5. Digite o WhatsApp do tutor para carregar tutor e pets automaticamente.
6. Selecione o pet e confira os serviços agrupados e filtrados.
