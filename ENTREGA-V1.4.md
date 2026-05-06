# PetFunny OS — v1.4 Configurações

## Versão entregue
petfunny-os-v1.4-configuracoes.zip

## O que foi feito
- Incluído cadastro de status de pagamento em Configurações.
- Incluídos status padrão: Pago e Pendente.
- Incluído cadastro de formas de pagamento em Configurações.
- Incluídas formas padrão: Dinheiro, Pix, Cartão de Crédito e Cartão de Débito.
- Financeiro passa a carregar status e formas de pagamento do banco.
- Mantido o sistema sem tenant, sem SaaS e sem master admin.
- Mantidos módulos anteriores: Roleta, CRM, Comandas/Recibos, Financeiro, Pacotes, Agenda, Serviços, Tutores/Pets.

## Endpoints adicionados
- POST /api/configuracoes/payment-statuses
- PUT /api/configuracoes/payment-statuses/:id
- DELETE /api/configuracoes/payment-statuses/:id
- POST /api/configuracoes/payment-methods
- PUT /api/configuracoes/payment-methods/:id
- DELETE /api/configuracoes/payment-methods/:id

## Como rodar
1. npm install
2. npm run db:migrate
3. npm run db:seed
4. npm start

## Como testar
- /admin/configuracoes
- /admin/financeiro

## Observações
- O seed mantém Pago/Pendente e as quatro formas principais ativas.
- Formas antigas como Transferência/Cortesia, caso existam de versões anteriores, são inativadas pelo seed.
