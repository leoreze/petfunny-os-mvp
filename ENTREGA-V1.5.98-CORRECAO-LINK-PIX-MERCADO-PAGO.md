# PetFunny OS v1.5.98 — Correção link Pix Mercado Pago

## O que foi corrigido

- A tela de pagamento do App do Tutor não exibe mais o botão/link de cobrança do Mercado Pago.
- O pagamento agora orienta o tutor a usar somente:
  - QR Code Pix oficial retornado pelo Mercado Pago;
  - Pix copia e cola oficial retornado pelo Mercado Pago.
- Adicionada mensagem clara: se o banco informar pagamento indisponível, gere um novo Pix.
- O tempo de expiração do Pix agora é configurável por variável de ambiente.
- A data de expiração enviada ao Mercado Pago agora vai com fuso explícito de São Paulo (`-03:00`).
- Atualizado cache do PWA para `petfunny-app-v1.5.98`.

## Por que isso foi feito

O `ticket_url`/link de cobrança do Mercado Pago pode abrir como “Pagamento indisponível” quando:

- o Pix expirou;
- o usuário abriu link antigo;
- a sessão/carteira Mercado Pago mudou;
- o pagamento foi recusado, cancelado ou reembolsado;
- o token usado é de teste.

Para Pix via app de banco, o fluxo correto é usar o QR Code ou o Pix copia e cola retornado em `point_of_interaction.transaction_data`.

## Nova variável opcional

```env
MERCADO_PAGO_PIX_EXPIRATION_MINUTES=15
```

- mínimo: 5
- máximo: 60
- padrão: 15

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/config/env.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `frontend/service-worker.js`
- `.env.example`

## Como testar

```bash
npm start
```

Depois:

1. Acesse `/app/login`.
2. Entre no app.
3. Vá em Agenda.
4. Crie um agendamento.
5. A tela `/app/pagamento-pix` deve mostrar apenas QR Code e Pix copia e cola.
6. Não deve mais aparecer botão para abrir link de cobrança Mercado Pago.

## Observações

Para pagamento real em app de banco, use credenciais de produção:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
MERCADO_PAGO_PUBLIC_KEY=APP_USR-...
```

Não use `TEST-...` para pagamento real.
