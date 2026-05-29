# Entrega v0.2 — Database e Migrations

## Versão entregue
`petfunny-os-v0.2-database.zip`

## O que foi feito
- Mantida a v0.1.6 como base visual oficial.
- Acrescentado copyright no footer do menu principal.
- Criada estrutura real de banco PostgreSQL exclusiva para PetFunny OS.
- Implementado `npm run db:migrate` com DDL somente em script próprio.
- Implementado `npm run db:seed` com dados iniciais idempotentes.
- Implementado `npm run db:reset` protegido por `RESET_CONFIRM=YES`.
- Criado usuário admin inicial: `admin@petfunny.local`.
- Criadas tabelas limpas sem `tenant_id`, sem `tenant_slug`, sem `tenant_*` e sem master admin.
- Criado endpoint de leitura `GET /api/db/status` para validar conexão e tabelas sem executar DDL.
- Runtime continua sem criar ou alterar schema.

## Tabelas principais
- users
- business_settings
- collaborators
- service_categories
- services
- tutors
- pets
- business_hours
- time_slot_capacities
- appointments
- appointment_items
- packages
- package_items
- customer_packages
- payment_methods
- financial_transactions
- payments
- receipts
- crm_leads
- crm_interactions
- gifts
- gift_spins
- settings
- audit_logs

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/db/status`
- `http://localhost:3000/admin/dashboard`

## Admin inicial
- Email: `admin@petfunny.local`
- Senha dev padrão: `PetFunny@2026`

Em produção/Render, defina `ADMIN_PASSWORD` antes de rodar o seed pela primeira vez.

## Observações
- Não há DDL no runtime.
- O login funcional com JWT será entregue na v0.3.
- Integrações externas continuam opcionais e não bloqueiam o sistema.

## Próxima versão
`petfunny-os-v0.3-auth.zip`
