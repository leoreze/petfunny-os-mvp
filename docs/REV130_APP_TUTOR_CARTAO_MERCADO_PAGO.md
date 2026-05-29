# REV130 — App do Tutor: pagamento com cartão Mercado Pago

## O que foi implementado
- Inclusão da opção de pagamento no App do Tutor para agendamentos e pacotes:
  - Pix Mercado Pago;
  - Cartão de crédito ou débito via Checkout Mercado Pago.
- O cartão usa checkout hospedado do Mercado Pago, sem capturar ou armazenar dados sensíveis de cartão no PetFunny OS.
- Criação de preferência Mercado Pago para pagamentos por cartão.
- Confirmação automática por:
  - retorno do checkout no app;
  - consulta por `external_reference`;
  - webhook do Mercado Pago.
- Finalização mantém a regra existente: o agendamento/pacote só é criado/ativado após pagamento aprovado.

## Arquivos alterados
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/home/index.html`

## Banco de dados
A migration adiciona compatibilidade nas tabelas existentes:
- `appointment_payment_intents.payment_type`
- `appointment_payment_intents.mp_preference_id`
- `appointment_payment_intents.checkout_url`
- `package_payment_intents.payment_type`
- `package_payment_intents.mp_preference_id`
- `package_payment_intents.checkout_url`

## Como testar
1. Rode `npm run db:migrate` no backend.
2. Configure `MERCADO_PAGO_ACCESS_TOKEN` no `.env` ou Render.
3. Entre no App do Tutor.
4. Crie um agendamento ou contrate pacote.
5. Escolha “Cartão de crédito ou débito”.
6. Clique em “Pagar com cartão”.
7. Após aprovação no Mercado Pago, o sistema confirma e cria o agendamento/pacote.

## Observações
- Pix existente foi mantido.
- Layout geral não foi alterado.
- O PetFunny OS não processa dados de cartão diretamente.
