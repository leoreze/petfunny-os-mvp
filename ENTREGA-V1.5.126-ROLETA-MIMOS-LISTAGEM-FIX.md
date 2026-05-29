# Entrega V1.5.126 — Correção da listagem da Roleta de Mimos

## Objetivo
Corrigir o problema em que os mimos cadastrados não apareciam no admin em **Roleta de Mimos**, sem alterar layout, sem quebrar fluxos existentes e mantendo compatibilidade com bancos já em uso.

## O que foi ajustado
- A tela `frontend/pages/roleta-de-mimos/index.html` agora carrega os blocos da roleta de forma resiliente.
- A listagem de mimos não deixa de renderizar caso resumo, opções ou histórico de sorteios apresentem falha isolada.
- O frontend normaliza diferentes formatos de resposta sem alterar o visual existente.
- O endpoint `GET /api/roleta/gifts` ganhou fallback seguro quando o banco ainda não tem a tabela/colunas do histórico de sorteios atualizadas.
- O endpoint `GET /api/roleta/summary` ganhou fallback para não bloquear a listagem de mimos.
- O endpoint `GET /api/roleta/spins` retorna lista vazia em fallback de compatibilidade, em vez de impedir o carregamento da página.
- A migration passou a garantir colunas incrementais da tabela `gifts` e `gift_spins` para bancos antigos.

## Arquivos alterados
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/roleta-de-mimos/index.html`

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
1. Entrar no admin.
2. Acessar `/admin/roleta-de-mimos`.
3. Verificar se os mimos cadastrados aparecem em **Mimos configurados**.
4. Testar filtro por status.
5. Criar um novo mimo.
6. Editar um mimo existente.
7. Remover um mimo.
8. Atualizar a página e confirmar que a listagem permanece.

## Observação
Não houve alteração de layout. A correção foi focada em dados, compatibilidade de schema e carregamento seguro do módulo.
