# FunnyOS v1.6.24 — Google Pay / Carteira digital no App do Tutor

## O que foi feito
- Adicionada opção **Google Pay / carteira digital** nos pagamentos do App do Tutor.
- Pix permanece como fluxo Pix Mercado Pago existente.
- Cartão permanece via Card Payment Brick Mercado Pago.
- A opção de carteira digital fica oculta automaticamente quando o navegador/dispositivo não oferece suporte básico via Payment Request API em contexto seguro.
- Backend passa a aceitar `paymentType=wallet`/`paymentMethod=wallet` como fluxo card-like, sem quebrar Pix ou cartão.

## Observação técnica
A disponibilidade real do Google Pay depende do Mercado Pago, da conta, do navegador e do dispositivo. Quando não houver suporte, o botão não aparece e o tutor continua com Pix ou cartão.

## Como rodar
```bash
npm start
```

Sem migration obrigatória.
