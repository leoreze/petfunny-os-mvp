# FunnyOS v1.6.9 — Excluir Pacote Vendido

## O que foi feito
- Adicionada opção **Excluir pacote** no menu de 3 pontinhos da listagem **Pacotes vendidos**.
- Incluída confirmação antes da exclusão.
- Criado endpoint `DELETE /api/pacotes/clientes/:id`.
- Exclusão é segura/soft delete: remove o pacote da operação e da listagem, cancela sessões futuras vinculadas e preserva histórico financeiro pago.
- Pagamentos pendentes vinculados são cancelados no financeiro.

## Como testar
1. Acesse `/admin/pacotes`.
2. Em **Pacotes vendidos**, clique no menu `⋯`.
3. Clique em **Excluir pacote**.
4. Confirme.
5. Verifique se o pacote saiu da listagem.

## Observação
- Não requer migration.
