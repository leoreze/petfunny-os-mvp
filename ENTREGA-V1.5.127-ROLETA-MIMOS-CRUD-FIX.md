# Entrega v1.5.127 — Roleta de Mimos: listagem + CRUD

## Correções realizadas
- Corrigida a listagem de mimos cadastrados no admin em `/admin/roleta-de-mimos`.
- Endpoints da Roleta passaram a aceitar bancos com variações antigas do schema `gifts`, sem quebrar instalações existentes.
- CRUD revisado: criar, editar, inativar/ativar e excluir mimos.
- Modal de cadastro/edição ajustado para o padrão premium usado em Tutores, sem alterar a estrutura visual da página.
- Histórico e resumo agora falham de forma segura quando `gift_spins` ainda não existe ou está incompleta.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/roleta-de-mimos/index.html`

## Validações
- `node --check backend/src/app.js`
- `node --check` do script da página de Roleta extraído do HTML

## Observação
- Não foram incluídos `.env` nem `node_modules` no ZIP.
