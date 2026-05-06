# PetFunny OS v1.5.61 — Correção App Tutor Summary 500

## Correção
- Corrigido erro 500 no endpoint `GET /api/app/summary`.
- A query do histórico do App do Tutor fazia `r.deleted_at IS NULL` na tabela `receipts`, mas essa tabela não possui a coluna `deleted_at` no schema atual.
- Removida a condição inexistente para o endpoint voltar a carregar o App do Tutor.

## Arquivo alterado
- `backend/src/app.js`

## Validação
- `node --check backend/src/app.js`

## Migration
- Não há migration obrigatória.
