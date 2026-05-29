# REV 136 — Roleta de Mimos: correção da listagem no admin

## Problema
Na página `/admin/roleta-de-mimos`, o card **Cadastro / Mimos configurados** exibia “Nenhum mimo cadastrado.” mesmo com mimos ativos aparecendo no App do Tutor.

## Causa raiz
A rota `GET /api/roleta/gifts` tratava busca vazia com `cleanText('')`, que retorna `null`. Em seguida montava o filtro SQL como `%null%`, fazendo a consulta procurar títulos/descrições contendo a palavra `null`, retornando lista vazia.

## Correção
- Busca vazia agora vira string vazia real (`''`).
- O filtro SQL passa a usar `%%`, listando todos os mimos quando o campo de busca está vazio.
- O status vazio também volta para `all` com fallback seguro.

## Arquivo alterado
- `backend/src/app.js`

## Como testar
1. Rodar `npm start`.
2. Acessar `/admin/roleta-de-mimos`.
3. Confirmar que **Mimos configurados** lista os mimos cadastrados.
4. Testar busca vazia, busca por nome e filtro de status.
