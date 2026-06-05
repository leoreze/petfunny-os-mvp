# FunnyOS v1.6.93 — Agenda calendário e visão por status com progresso de pacote visível

## O que foi feito

- Ajustada a renderização dos cards do calendário da agenda para mostrar o progresso de pacote em linha própria, evitando que o texto seja truncado como `...`.
- Ajustada a renderização dos cards da Visão por status para exibir o progresso do pacote acima do bloco principal.
- Na Visão por status, o nome do pet agora aparece como informação principal do card; o horário foi movido para a linha secundária junto com o tutor.
- Mantido o menu de ações `⋯` sem cobrir o badge `📦 1 de 4`.

## Arquivos principais alterados

- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/agenda`.
2. Abra a visualização Dia, Semana e Mês do calendário.
3. Confira agendamentos vinculados a pacote: deve aparecer `📦 1 de 4`, `📦 2 de 4`, etc., sem virar `...`.
4. Vá até `Visão por status`.
5. Confira se o badge do pacote aparece acima e o nome do pet aparece como título principal.

## Observação

A alteração é visual/frontend. Não muda geração de pacote, recorrência, financeiro ou banco de dados.
