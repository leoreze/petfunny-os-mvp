# PetFunny OS v1.5.103 — App instalar PWA, pets com opções do admin e pacote com Pix

## O que foi feito

- Criado modal premium para instalar o App do Tutor no celular antes/ao entrar no app.
- Modal detecta Android/Chrome com prompt nativo de instalação.
- Modal detecta iPhone/Safari e mostra instrução para adicionar à tela de início.
- Se o tutor fechar o modal, ele fica oculto por alguns dias para não incomodar.
- Primeiro acesso do app agora carrega opções cadastradas no admin/configurações:
  - portes;
  - raças;
  - sugestão de porte por raça;
  - sugestão de pelagem por raça;
  - cidade/UF do negócio.
- Cadastro/edição de pets no app também usa raças e portes configurados no admin.
- Listagem de pets no app agora mostra botões Editar/Remover dentro do card, alinhados à direita.
- Contratação de pacote pelo app agora segue o mesmo conceito do agendamento:
  - gera Pix Mercado Pago;
  - abre tela de pagamento Pix;
  - só cria o pacote, transação financeira e agendamentos depois do Pix aprovado.
- Webhook do Mercado Pago agora também reconhece pagamento de pacote.

## Novos endpoints

- `GET /api/app/public-options`
- `GET /api/app/packages/payment/:intentId`

## Nova tabela

- `package_payment_intents`

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-pwa-install.js`
- `frontend/assets/css/app.css`
- `frontend/service-worker.js`
- `package.json`
- `DEPLOY_VERSION.txt`

## Como rodar

```bash
npm install --omit=dev --omit=optional --no-audit --no-fund --legacy-peer-deps --progress=false
npm run db:migrate
npm start
```

## Como testar

1. Acesse `/app/login` pelo celular ou em modo responsivo.
2. O modal de instalação do app deve aparecer.
3. Faça um primeiro acesso novo e confira se porte/raça/pelagem vêm das Configurações do admin.
4. Acesse `/app/pets`, abra novo pet e confira as opções vindas do admin.
5. Acesse `/app/pacotes`, escolha pet e pacote.
6. Ao contratar, deve abrir `/app/pagamento-pix?kind=package`.
7. O pacote e os agendamentos só devem aparecer depois da confirmação do Pix.

## Observações

- Para Pix real, use credenciais de produção do Mercado Pago (`APP_USR-...`).
- Em localhost, o webhook externo não chega sem túnel HTTPS, mas a tela de Pix consulta o status periodicamente pelo backend.
- Rode a migration obrigatoriamente para criar `package_payment_intents`.
