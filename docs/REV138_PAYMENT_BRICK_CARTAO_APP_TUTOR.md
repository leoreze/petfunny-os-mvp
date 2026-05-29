# REV 138 — Payment Brick cartão no App do Tutor

## Objetivo
Substituir o fluxo de cartão via Checkout Pro/redirecionamento externo por Checkout Transparente com Mercado Pago Payment Brick dentro do App do Tutor.

## Ajustes
- App do Tutor agora renderiza o Payment Brick na página de pagamento quando o tutor escolhe cartão.
- Backend cria intent de cartão sem gerar preferência de Checkout Pro.
- Novo endpoint para processar cartão de agendamento: `POST /api/app/appointments/payment/:intentId/card`.
- Novo endpoint para processar cartão de pacote: `POST /api/app/packages/payment/:intentId/card`.
- Pix Mercado Pago mantido sem alteração.
- Sem uso de `auto_return` e `back_urls` para cartão.

## Variáveis necessárias
```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-ou-TEST-...
MERCADO_PAGO_PUBLIC_KEY=APP_USR-ou-TEST-...
APP_URL=http://localhost:3000
```

## Observação
Para cartão em sandbox, use cartões e usuários de teste do Mercado Pago. A conta compradora não deve ser a mesma conta vendedora da integração.
