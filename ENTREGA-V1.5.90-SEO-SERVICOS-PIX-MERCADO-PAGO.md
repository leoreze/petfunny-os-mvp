# PetFunny OS v1.5.90 — SEO, serviços por porte e Pix Mercado Pago no App

## O que foi feito

### Landing page
- A landing agora aplica de forma mais completa o SEO cadastrado em Configurações do admin.
- Atualiza dinamicamente:
  - title;
  - description;
  - keywords;
  - Open Graph;
  - Twitter Card;
  - canonical;
  - JSON-LD estruturado como PetStore.
- A seção Serviços recebeu combo por porte.
- O visitante pode filtrar os serviços por porte do pet.
- Os serviços continuam sem exibir preço na landing.

### App do Tutor — agendamento pago por Pix
- Ao criar agendamento pelo app, o sistema não salva mais o agendamento imediatamente.
- O backend valida pet, serviços, horário e valor.
- O backend gera uma intenção de pagamento Pix via Mercado Pago.
- O app abre a página `/app/pagamento-pix` com:
  - valor total do agendamento;
  - QR Code Pix;
  - Pix copia e cola;
  - status de confirmação.
- O QR Code expira em 5 minutos.
- O app consulta a confirmação no Mercado Pago.
- O agendamento só é criado depois que o Mercado Pago retorna pagamento aprovado.
- Após confirmação, o app mostra: “Agendamento pago e realizado com sucesso.”

## Novas rotas/endpoints

```txt
GET  /app/pagamento-pix
POST /api/app/appointments
GET  /api/app/appointments/payment/:intentId
POST /api/mercado-pago/webhook
```

## Nova tabela

```txt
appointment_payment_intents
```

Ela guarda temporariamente o payload do agendamento enquanto o Pix está pendente.

## Variáveis de ambiente necessárias

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
APP_URL=https://seu-dominio.com
```

Em produção, configure o webhook do Mercado Pago apontando para:

```txt
https://seu-dominio.com/api/mercado-pago/webhook
```

## Arquivos alterados
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/scripts/migrate.js`
- `frontend/index.html`
- `frontend/assets/js/landing.js`
- `frontend/assets/js/client-shell.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `.env.example`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Configure `MERCADO_PAGO_ACCESS_TOKEN` no `.env`.
2. Rode `npm run db:migrate`.
3. Acesse `/app/login`.
4. Entre como tutor.
5. Vá em Agenda.
6. Crie um agendamento.
7. O app abrirá `/app/pagamento-pix`.
8. Pague o Pix.
9. Aguarde a confirmação.
10. O agendamento será salvo somente após o retorno aprovado do Mercado Pago.

## Observações
- Sem `MERCADO_PAGO_ACCESS_TOKEN`, o app informa que o Pix está indisponível.
- Em localhost, webhook externo do Mercado Pago não consegue chamar seu computador sem túnel/HTTPS. Ainda assim, a página consulta o status pelo backend enquanto estiver aberta.
