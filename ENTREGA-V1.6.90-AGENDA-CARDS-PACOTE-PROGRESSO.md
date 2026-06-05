# FunnyOS v1.6.90 — Agenda Cards com Progresso de Pacotes

## O que foi feito

- Corrigida a exibição de sessões de pacote nos cards principais da agenda.
- Agora agendamentos vinculados a pacote exibem badge como `📦 1 de 4`, `📦 2 de 4`, etc.
- O calendário continua exibindo o badge, agora usando a mesma função de fallback dos cards.
- O backend passou a reconstruir `packageSessionLabel` quando registros antigos possuem `customer_package_id`, mas não possuem `package_session_label`.
- O endpoint de detalhe do agendamento também passou a retornar o progresso reconstruído, evitando perda da informação ao editar uma sessão de pacote.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Suba a aplicação.
2. Acesse `/admin/agenda`.
3. Abra uma data com agendamentos gerados por pacote.
4. Confirme se o card da lista/status board mostra `📦 1 de 4`, `📦 2 de 4`, etc.
5. Teste também a visão Dia/Semana/Mês.
6. Clique em um agendamento de pacote e confirme se o modal informa a sessão correta.

## Observação técnica

A correção não altera criação, edição, pagamento ou financeiro dos pacotes. A mudança é segura e focada em exibição/normalização do progresso das sessões.
