# REV139 — Correção Card Payment Brick Mercado Pago

## Problema
Ao pagar com cartão no App do Tutor, o SDK do Mercado Pago retornava:

`Payment Method (bank_transfer): [none] is invalid. Those are all the possible options for (bank_transfer): pix.`

## Causa
O frontend estava usando o Brick genérico `payment` e tentando desabilitar `bankTransfer` com `none`.
Para o Mercado Pago, `bank_transfer` aceita `pix`, e essa configuração inválida travava a renderização/processamento.

## Correção
- Cartão agora usa `cardPayment` Brick exclusivo para crédito/débito.
- Pix continua no fluxo próprio já existente.
- Removida configuração inválida `bankTransfer: 'none'`.
- Mantido backend de tokenização transparente para `/api/app/appointments/payment/:intentId/card` e `/api/app/packages/payment/:intentId/card`.
- Sem alteração de layout global.

## Como testar
1. Configure `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_PUBLIC_KEY`.
2. Inicie o sistema.
3. No App do Tutor, escolha cartão de crédito/débito.
4. O formulário seguro deve aparecer dentro do app, sem redirecionar para Checkout Pro.
