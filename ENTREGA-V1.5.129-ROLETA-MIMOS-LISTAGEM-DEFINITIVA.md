# FunnyOS v1.5.129 — Roleta de Mimos: listagem definitiva

## Correção aplicada
- A listagem de **Mimos configurados** agora busca mimos em todas as tabelas compatíveis já usadas por versões anteriores: `gifts`, `mimos`, `roleta_mimos`, `roulette_gifts` e `roulette_rewards`.
- O backend não ignora mais registros antigos quando a tabela `gifts` existe vazia.
- O CRUD resolve automaticamente em qual tabela o mimo está antes de editar, ativar/inativar ou excluir.
- Mantido o layout atual da página.
- Mantido o menu de ações com 3 pontinhos na listagem.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/roleta-de-mimos/index.html`

## Como testar
1. Rodar o backend normalmente.
2. Entrar em `/admin/roleta-de-mimos`.
3. Confirmar que o bloco **Mimos configurados** lista todos os mimos cadastrados.
4. Testar: criar, editar, inativar/ativar e excluir pelo menu de 3 pontinhos.
