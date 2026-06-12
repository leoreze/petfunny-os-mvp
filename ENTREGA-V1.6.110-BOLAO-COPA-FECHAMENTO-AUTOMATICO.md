# FunnyOS v1.6.110 — Bolão da Copa fechamento automático 10 minutos antes

## O que foi feito

- Em `/admin/bolao-copa`, jogos do Brasil agora encerram automaticamente os palpites 10 minutos antes da data e horário cadastrados.
- No App do Tutor, o formulário de palpite é inabilitado automaticamente quando chega a janela de 10 minutos antes do jogo.
- O backend passou a ser a fonte de verdade: antes de listar jogos, abrir o app ou receber um palpite, ele atualiza jogos vencidos para `closed`.
- A regra de abertura agora considera: jogo aberto somente se `data/hora do jogo > agora + 10 minutos`.
- O status exibido passa a ser `Encerrado para palpites` quando a janela de palpites fecha.
- Admin e App fazem atualização automática a cada 30 segundos quando a tela está aberta e algum jogo cruza o prazo de fechamento.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/bolao-copa/index.html`
- `frontend/pages/app/home/index.html`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Rode `npm run db:migrate` se necessário.
2. Acesse `/admin/bolao-copa`.
3. Cadastre um jogo do Brasil com horário 10 minutos à frente ou menos.
4. Atualize a tela ou aguarde até 30 segundos.
5. O status deve mudar para `Encerrado para palpites`.
6. Acesse o App do Tutor e confira que o formulário de palpite fica bloqueado.
7. Tente enviar o palpite pela API/app após o fechamento: o backend deve responder `Palpites encerrados para este jogo.`

## Validação

- `node --check backend/src/app.js`
- extração e validação dos scripts JS das páginas HTML
- `unzip -t` do pacote final
