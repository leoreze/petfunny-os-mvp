# Entrega v1.5.131 — Correção Mercado Pago cartão auto_return/back_urls

## O que foi corrigido

- Corrigido erro do Mercado Pago: `auto_return invalid. back_url.success must be defined`.
- A criação de preferência para cartão agora sempre envia `back_urls.success`, `back_urls.pending` e `back_urls.failure`.
- Quando `APP_URL` não estiver configurado, o backend usa fallback seguro `http://localhost:PORT` para ambiente local.
- Mantido `notification_url` apenas quando `APP_URL` for HTTPS, evitando webhook inválido em localhost.
- Corrigido o registro de intenção de pagamento de agendamento para salvar `payment_type = card` quando o tutor escolhe cartão.

## Arquivos alterados

- `backend/src/app.js`

## Como testar

1. Configure no `.env` do backend:

```env
MERCADO_PAGO_ACCESS_TOKEN=SEU_TOKEN
APP_URL=http://localhost:3000
```

Em produção, use:

```env
APP_URL=https://seu-dominio.com
```

2. Rode:

```bash
cd backend
npm install
npm run db:migrate
npm start
```

3. No App do Tutor, escolha pagamento por cartão em agendamento ou pacote.

4. O Mercado Pago deve abrir o checkout sem o erro de `auto_return invalid`.

## Observações

- Layout não foi alterado.
- Fluxo Pix foi preservado.
- Webhook continua opcional e só é enviado para Mercado Pago quando `APP_URL` é HTTPS.
