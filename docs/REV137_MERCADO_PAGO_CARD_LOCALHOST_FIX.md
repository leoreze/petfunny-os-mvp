# REV 137 — Correção Checkout Cartão Mercado Pago no App do Tutor

## Problema
Ao selecionar cartão de crédito/débito no App do Tutor, o endpoint `POST /api/app/appointments` retornava `400 Bad Request`.

## Causa técnica
A criação da preferência de Checkout Pro do Mercado Pago estava usando `auto_return`/`back_urls` também em ambiente local (`localhost`). Algumas contas/credenciais do Mercado Pago rejeitam essa combinação quando a URL de retorno não é pública HTTPS, causando erro 400 no backend.

## Correção
- Mantido Pix sem alteração.
- Mantido cartão via Checkout Seguro Mercado Pago.
- `auto_return` agora só é usado quando `APP_URL` é HTTPS público.
- Em localhost, a preferência é criada sem retorno automático obrigatório.
- Adicionado fallback: se o Mercado Pago rejeitar `auto_return/back_urls`, o backend tenta criar a preferência novamente sem esses campos.

## Arquivos alterados
- `backend/src/app.js`

## Como testar
1. `npm start`
2. Entrar no App do Tutor.
3. Criar agendamento.
4. Selecionar cartão de crédito/débito.
5. Confirmar que o endpoint `/api/app/appointments` retorna `201` com `checkoutUrl`.

## Observação
Para produção com retorno automático, configure `APP_URL` com domínio HTTPS real, exemplo:

```env
APP_URL=https://seudominio.com.br
```
