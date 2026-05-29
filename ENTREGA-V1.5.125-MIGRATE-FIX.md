# PetFunny OS v1.5.125 — Correção de migration em banco zerado

## O que foi corrigido

- Corrigida a ordem de criação das tabelas no `backend/src/scripts/migrate.js`.
- A tabela `payment_methods` agora é criada antes de `appointments`, pois `appointments.payment_method_id` depende dela.
- Corrigido `backend/src/scripts/reset.js` para limpar todas as tabelas do schema `public` em ambiente local/teste com `RESET_CONFIRM=YES`.
- Removido `backend/.env` real do pacote entregue.
- Criados `.env.example` na raiz e em `backend/.env.example`.
- Adicionado `BASH-BANCO-ZERADO.md` com o bash recomendado.

## Causa do erro anterior

O erro:

```txt
relation "payment_methods" does not exist
```

acontecia durante `npm run db:migrate`, porque a tabela `appointments` referenciava `payment_methods` antes dela existir. Como a migration rodava em transação, o PostgreSQL cancelava tudo. Por isso, na sequência, o seed e o login também falhavam com:

```txt
relation "users" does not exist
```

## Como rodar

Use o bash do arquivo `BASH-BANCO-ZERADO.md`.

Login local padrão:

```txt
admin@petfunny.local
PetFunny@2026
```
