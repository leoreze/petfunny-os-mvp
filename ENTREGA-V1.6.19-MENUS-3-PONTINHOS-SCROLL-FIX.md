# FunnyOS v1.6.19 — Menus 3 Pontinhos Scroll Fix

## Correções

- Menus de 3 pontinhos agora têm altura máxima controlada.
- Itens longos usam rolagem interna dentro do próprio menu.
- A rolagem da página não fecha mais o menu aberto.
- Aplicado para Tutores, Pacotes, Agenda, Dashboard e menus globais compatíveis.
- Sem alterações de banco, migrations ou APIs.

## Como testar

1. Rode `npm start`.
2. Acesse `/admin/tutores`.
3. Abra o menu de 3 pontinhos de um tutor com muitas ações CRM.
4. Role dentro do menu e confirme que todos os itens aparecem.
5. Role a página e confirme que o menu não fecha sozinho.

## Migration

Não precisa rodar migration.
