# FunnyOS v1.6.47 — Admin Menu + Gerente IA Links Fix

## O que foi feito
- Reorganizado o menu principal do Admin: **Acessos do App** agora aparece logo depois de **Notificações**.
- Melhorado o **Gerente IA de Crescimento** no Dashboard.
- Corrigidos os links das tarefas da IA para abrir o módulo correto.
- Adicionado mapeamento seguro de rotas no backend e no frontend.
- A IA agora recebe uma lista oficial de rotas permitidas para não gerar links quebrados.
- O plano local também foi ajustado: ações de App do Tutor agora apontam para `/admin/app-acessos`.

## Arquivos alterados
- `frontend/assets/js/shell.js`
- `frontend/pages/dashboard/index.html`
- `backend/src/app.js`
- `DEPLOY_VERSION.txt`

## Como rodar
```bash
npm install
npm start
```

## Como testar
1. Abrir `/admin/dashboard`.
2. Conferir se o bloco **Gerente IA de Crescimento** carrega.
3. Clicar em **Abrir módulo** nas tarefas.
4. Verificar se cada ação abre Agenda, Financeiro, Pacotes, CRM ou Acessos do App corretamente.
5. Conferir no menu lateral se **Acessos do App** está depois de **Notificações**.

## Observação
- Não foi adicionada migration.
- Não altera dados do banco.
