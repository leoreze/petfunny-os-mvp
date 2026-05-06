# PetFunny OS v1.5.71 — Correção App Options / Payment Methods

## Correção aplicada

Corrigido erro no endpoint do App do Tutor:

```txt
column "type" does not exist
```

## Causa

O endpoint `GET /api/app/options` buscava a coluna `type` na tabela `payment_methods`:

```sql
SELECT id, name, type FROM payment_methods
```

Mas a tabela `payment_methods` do projeto não possui essa coluna.

## Solução

A query agora retorna um campo compatível usando `NULL::text AS type`, preservando o contrato do frontend sem exigir migration:

```sql
SELECT id, name, NULL::text AS type FROM payment_methods
```

## Arquivo alterado

- `backend/src/app.js`

## Validação

```bash
node --check backend/src/app.js
```

## Migration

Não há migration obrigatória nesta versão.
