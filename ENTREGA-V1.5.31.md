# PetFunny OS v1.5.31 — Modais de Mensagem Centralizados

## O que foi ajustado

- Removido o modal de carregamento nas ações de cadastrar/editar agendamento.
- Após salvar ou editar, o sistema exibe apenas um modal de mensagem centralizado com botão OK.
- O modal de sucesso/erro foi reforçado para ficar centralizado na tela.
- Agenda e Dashboard foram ajustados para usar o mesmo padrão de confirmação.

## Arquivos alterados

- frontend/pages/agenda/index.html
- frontend/pages/dashboard/index.html
- frontend/assets/css/app.css
- package.json
- backend/package.json

## Como testar

1. Acesse /admin/agenda.
2. Clique em + Novo agendamento.
3. Cadastre ou edite um agendamento.
4. Confira se aparece apenas o modal de mensagem centralizado.
5. Acesse /admin/dashboard e edite um agendamento pelo modal do painel.
