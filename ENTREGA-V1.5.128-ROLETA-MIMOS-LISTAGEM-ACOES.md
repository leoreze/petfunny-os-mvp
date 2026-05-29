# Entrega v1.5.128 — Roleta de Mimos: listagem, ações e big numbers

## O que foi ajustado
- A listagem **Mimos configurados** agora renderiza todos os mimos retornados pela API em tabela premium.
- Cada mimo mostra título, descrição, status, vigência, peso, custo estimado e quantidade de sorteios.
- A coluna **Ações** usa menu de três pontinhos com Editar, Ativar/Inativar e Excluir.
- Os big numbers da página foram alinhados ao padrão usado nas demais páginas administrativas.
- A consulta backend de mimos foi reforçada para bancos antigos, evitando falha silenciosa e suportando tabelas legadas `mimos` ou `roleta_mimos` quando `gifts` não existir.
- A listagem não altera o layout global nem interfere nos demais módulos.

## Arquivos alterados
- `frontend/pages/roleta-de-mimos/index.html`
- `frontend/assets/css/app.css`
- `backend/src/app.js`

## Como testar
1. Rodar `npm install` se necessário.
2. Rodar `npm run db:migrate` para garantir colunas/tabelas da roleta.
3. Rodar `npm start`.
4. Entrar em `/admin/roleta-de-mimos`.
5. Cadastrar alguns mimos.
6. Verificar se aparecem em **Mimos configurados**.
7. Usar o menu de três pontinhos para editar, inativar/ativar e excluir.
8. Confirmar que os indicadores superiores atualizam após cada ação.
