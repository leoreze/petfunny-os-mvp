# PetFunny OS — v0.6.2 Configurações Operacionais

## Versão entregue
petfunny-os-v0.6.2-configuracoes-operacionais.zip

## O que foi feito
- Mantida a base aprovada da v0.6.1.
- Acrescentadas configurações de tipos de serviços/categorias operacionais.
- Acrescentada configuração de dias da semana de funcionamento.
- Acrescentada configuração de horário de abertura e fechamento por dia.
- Acrescentada matriz de slots por hora para limitar quantidade de agendamentos por dia/horário.
- Seed atualizado para usar slots oficiais de 1 em 1 hora.
- Endpoints operacionais adicionados no admin.
- Mantido sem tenant, sem SaaS, sem master admin e sem DDL em runtime.

## Endpoints adicionados
- GET /api/configuracoes/operational
- POST /api/configuracoes/service-types
- PUT /api/configuracoes/service-types/:id
- DELETE /api/configuracoes/service-types/:id
- PUT /api/configuracoes/business-hours
- PUT /api/configuracoes/time-slots

## Como rodar
1. npm install
2. npm run db:migrate
3. npm run db:seed
4. npm start

## Como testar
- Acesse /admin/login
- Entre com admin@petfunny.local / PetFunny@2026
- Acesse /admin/configuracoes
- Edite tipos de serviços
- Edite dias e horários
- Edite slots por hora e salve

## Próxima versão sugerida
petfunny-os-v0.7-servicos.zip
