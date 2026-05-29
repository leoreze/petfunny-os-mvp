# FunnyOS v1.5.135 — Correção listagem Mimos configurados no admin

## Correção
- Ajustada a rota `GET /api/roleta/gifts` para não retornar vazio quando a tabela principal `gifts` não encontra registros, mas existem mimos cadastrados em estrutura legada/compatível.
- O admin agora faz fallback automático para as tabelas compatíveis da Roleta antes de exibir “Nenhum mimo cadastrado.”
- Mantido o layout atual do card “Cadastro / Mimos configurados”.
- Incluído log seguro no console do frontend apenas quando a API realmente retornar zero itens, para facilitar diagnóstico sem travar a página.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/roleta-de-mimos/index.html`

## Teste
1. Rodar `npm run db:migrate`.
2. Rodar `npm start`.
3. Acessar `/admin/roleta-de-mimos`.
4. Conferir se o card “Mimos configurados” lista os mimos cadastrados com status e ações.
