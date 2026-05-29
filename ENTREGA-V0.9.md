# Entrega v0.9 — Pacotes e Assinaturas

## Versão entregue
petfunny-os-v0.9-pacotes-assinaturas.zip

## O que foi feito
- Módulo de Pacotes com CRUD real.
- Serviços inclusos no pacote via package_items.
- Venda de pacote para tutor/pet.
- Geração automática de agenda para sessões do pacote.
- Regra 4/mês = intervalo de 7 dias.
- Regra 2/mês = intervalo de 15 dias.
- Progresso do pacote do cliente: usado/total.
- Módulo de Assinaturas com CRUD real.
- Tabela subscriptions.
- Integração com tutores, pets e pacotes.
- Mantido sem tenant, sem SaaS e sem master admin.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- /admin/pacotes
- /admin/assinaturas
- /admin/agenda
