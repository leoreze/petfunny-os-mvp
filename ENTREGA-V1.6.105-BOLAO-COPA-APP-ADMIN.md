# FunnyOS v1.6.105 — Bolão da Copa no App do Tutor e Admin

## O que foi feito

- Criado módulo administrativo **/admin/bolao-copa**.
- Adicionado menu **Bolão da Copa** no admin.
- Criadas migrations para as tabelas `world_cup_games` e `world_cup_predictions`.
- Admin agora pode cadastrar jogos do Brasil com data, horário, adversário, fase, prêmio e status.
- Admin pode lançar o placar oficial e apurar automaticamente os palpites.
- Quem acertar o placar exato fica marcado como ganhador de **Banho grátis PetFunny**.
- Admin pode marcar o prêmio como entregue.
- App do Tutor agora exibe card do **Bolão da Copa** na home.
- Criada página **/app/bolao-copa** para o tutor enviar palpites dos jogos do Brasil.
- O tutor consegue enviar/alterar palpite enquanto o jogo estiver aberto e antes do horário do jogo.
- Após o jogo ser finalizado no admin, o app mostra se o tutor ganhou, perdeu ou teve prêmio entregue.

## Arquivos principais alterados

- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/bolao-copa/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/shell.js`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/js/router.js`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Acesse `/admin/bolao-copa`.
2. Cadastre um jogo do Brasil.
3. Acesse o app do tutor em `/app/home`.
4. Confira o card do Bolão da Copa na home.
5. Entre em `/app/bolao-copa` e envie um palpite.
6. Volte no admin, lance o placar oficial e clique em apurar.
7. Se o palpite bater exatamente, o tutor aparece como ganhador do banho grátis.

## Observações

- A lista oficial dos jogos do Brasil fica sob controle do admin.
- O sistema não depende de API externa da FIFA para funcionar.
- O prêmio é registrado no bolão e pode ser marcado como entregue pelo admin.
