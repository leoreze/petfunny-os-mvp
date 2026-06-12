# FunnyOS v1.6.111 — Bolão App UX e Palpite Único

## O que foi feito

- Ajustado o card do Bolão na home do App do Tutor com altura mínima de 120px.
- Ajustado espaçamento inferior do texto no card/área do Bolão para evitar texto colado no rodapé.
- No App do Tutor, cada tutor agora pode enviar apenas 1 palpite por jogo.
- Depois do envio, o palpite fica registrado em campos desabilitados, sem botão de envio.
- O backend bloqueia nova tentativa de palpite para o mesmo tutor/jogo com erro 409.
- O botão de envio fica desabilitado durante o salvamento para evitar clique duplo.

## Arquivos alterados

- backend/src/app.js
- frontend/pages/app/home/index.html
- frontend/assets/css/app.css
- package.json
- backend/package.json
- package-lock.json
- backend/package-lock.json
- DEPLOY_VERSION.txt

## Como testar

1. Rodar `npm install`.
2. Rodar `npm run db:migrate`.
3. Rodar `npm start`.
4. Acessar `/app/home` e conferir o card da Copa com altura mínima.
5. Acessar `/app/bolao-copa`.
6. Enviar um palpite em um jogo aberto.
7. Confirmar que o palpite aparece registrado em campos desabilitados e sem botão.
8. Tentar enviar novamente pelo backend/app e confirmar bloqueio de novo palpite.

## Validação

- `node --check backend/src/app.js`
- `node --check /tmp/apphome-v16111.mjs`
- `unzip -t FunnyOS-v1.6.111-bolao-app-ux-palpite-unico.zip`
