# FunnyOS v1.6.107 — Bolão da Copa data/hora, ordenação e ações

## O que foi corrigido

- Corrigida a data quebrada em `/admin/bolao-copa`, que aparecia como `undefined/undefined/Sat Jun 13 · 19:00`.
- A data dos jogos agora é serializada pelo backend como `YYYY-MM-DD`.
- No card **Jogos do Brasil**, a tabela agora mostra **Data** e **Horário** em colunas separadas.
- No card **Palpites dos tutores**, a tabela agora mostra **Data envio** e **Horário envio** em colunas separadas.
- As setas de ordenação agora funcionam nas duas tabelas.
- A coluna **Ações** agora usa botão de 3 pontinhos nas duas tabelas.
- O menu de ações dos jogos traz: editar, apurar resultado, ver palpites e excluir.
- O menu de ações dos palpites traz: copiar resumo, enviar WhatsApp, marcar prêmio entregue quando aplicável e ver jogo.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/bolao-copa/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Rodar `npm run db:migrate`.
2. Rodar `npm start`.
3. Acessar `/admin/bolao-copa`.
4. Conferir o card **Jogos do Brasil**.
5. Verificar se Data e Horário aparecem separados e sem `undefined`.
6. Clicar nas setas de ordenação das colunas.
7. Abrir o botão `⋯` em **Ações**.
8. Conferir o card **Palpites dos tutores** com os mesmos comportamentos.
