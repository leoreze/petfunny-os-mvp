# PetFunny OS v1.5.99 — Correção FOR UPDATE no Pix do App

## Problema corrigido

Ao consultar o status de pagamento do Pix do app do tutor em:

```txt
GET /api/app/appointments/payment/:intentId
```

o backend podia retornar erro 500 com a mensagem:

```txt
FOR UPDATE cannot be applied to the nullable side of an outer join
```

## Causa

A função `finalizePaidAppointmentIntent()` fazia `LEFT JOIN tutors` e aplicava `FOR UPDATE` no resultado inteiro da query. No PostgreSQL, `FOR UPDATE` não pode ser aplicado ao lado anulável de um `LEFT JOIN`.

## Correção aplicada

O lock agora é aplicado somente na tabela principal `appointment_payment_intents`, usando:

```sql
FOR UPDATE OF api
```

Isso mantém a proteção contra dupla finalização do mesmo pagamento e evita o erro no join com tutor.

## Arquivo alterado

- `backend/src/app.js`

## Como testar

1. Reinicie o servidor.
2. Crie um agendamento pelo app.
3. Gere o Pix.
4. Acesse/aguarde a rota de status:

```txt
/api/app/appointments/payment/:intentId
```

5. A rota não deve mais retornar erro 500 por `FOR UPDATE`.

## Migration

Não precisa rodar migration.
