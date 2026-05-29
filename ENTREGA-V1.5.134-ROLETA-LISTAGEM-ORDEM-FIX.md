# FunnyOS v1.5.134 — Roleta: listagem após big numbers e fonte canônica de mimos

## O que foi corrigido

- Em `/admin/roleta-de-mimos`, a seção **Mimos configurados** agora aparece imediatamente depois dos big numbers.
- A API administrativa `/api/roleta/gifts` passou a ler primeiro a tabela canônica `gifts`, que é a mesma fonte usada pelo App do Tutor para exibir os mimos ativos.
- Se a leitura principal falhar em bancos legados, o backend mantém o fallback compatível com tabelas antigas (`mimos`, `roleta_mimos`, `roulette_gifts`, etc.).
- O resumo `/api/roleta/summary` também usa a mesma fonte principal, para os big numbers baterem com a listagem.

## Arquivos alterados

- `frontend/pages/roleta-de-mimos/index.html`
- `backend/src/app.js`

## Como testar

1. Rodar o projeto normalmente.
2. Acessar `/admin/roleta-de-mimos`.
3. Conferir se a ordem ficou:
   - Hero
   - Big numbers
   - Mimos configurados
   - Simulação / Histórico
4. Conferir se os 4 mimos cadastrados aparecem na tabela.
5. Testar menu de 3 pontinhos: editar, ativar/inativar e excluir.

## Observação

Não houve alteração de layout global, CSS global, estrutura do admin, Pix, cartão ou App do Tutor.
