# FunnyOS v1.6.104 — Pacotes vendidos com data do cadastro

## O que foi feito

- Adicionada a coluna **Data do cadastro** na listagem **Pacotes vendidos** em `/admin/pacotes`.
- A coluna usa o campo real `createdAt`/`created_at` do pacote vendido.
- A data é exibida no padrão brasileiro `dd/mm/aaaa`, com timezone `America/Sao_Paulo`.
- A coluna permite ordenação por data de cadastro.
- O card de **Pacotes vendidos** também passa a exibir a data de cadastro do contrato.
- Ajustado o `colspan` da tabela para contemplar a nova coluna.

## Arquivos alterados

- `frontend/pages/pacotes/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/pacotes`.
2. Vá até o card/bloco **Pacotes vendidos**.
3. Confira a nova coluna **Data do cadastro**.
4. Clique na seta da coluna para testar ordenação.
5. Alterne para visualização em cards e confira o campo **Cadastro**.

## Observação

A informação já vinha do backend pelo campo `createdAt`, então a correção foi aplicada no frontend sem alterar a estrutura do banco.
