# FunnyOS v1.6.13 — Financeiro Modais e Ações

## Ajustes
- Corrigido modal de Novo lançamento para abrir em overlay premium padronizado.
- Adicionado modo de edição no mesmo modal de lançamento financeiro.
- Adicionado menu 3 pontinhos sempre visível em Consulta financeira.
- Ações: editar, enviar mensagem, dar baixa quando aplicável e excluir lançamento.
- Adicionado menu 3 pontinhos em Clientes inadimplentes com editar, enviar mensagem, dar baixa e excluir.
- Criado endpoint `PUT /api/financeiro/transactions/:id` para edição real.
- Mantido `DELETE /api/financeiro/transactions/:id` como cancelamento/soft delete seguro.

## Como rodar
```bash
npm start
```

## Migration
Não precisa migration.
