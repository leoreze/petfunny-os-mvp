# PetFunny OS v1.5.72 — App PWA + Push completo

## O que foi feito

- Transformei o App do Tutor em PWA instalável.
- Criei `manifest.webmanifest` com nome, ícones, tema e escopo do app.
- Criei `service-worker.js` com cache básico, recebimento de push e abertura do app ao tocar na notificação.
- Criei ícones `icon-192.png` e `icon-512.png` a partir da logo PetFunny.
- Adicionei botão/área para ativar e desativar notificações no App do Tutor.
- Adicionei endpoint para retornar chave pública VAPID.
- Adicionei endpoint para salvar inscrição do aparelho/celular.
- Adicionei endpoint para desativar inscrição do aparelho.
- Criei envio manual de push pelo admin dentro da página Notificações.
- Criei painel de status com quantidade de aparelhos ativos e logs de envio.
- Criei logs de push no banco para auditoria.
- Adicionei disparos automáticos iniciais para eventos criados pelo App:
  - novo agendamento;
  - contratação de pacote;
  - giro da roleta de mimos.

## Novos arquivos

- `frontend/manifest.webmanifest`
- `frontend/service-worker.js`
- `frontend/assets/js/client-push.js`
- `frontend/assets/img/icon-192.png`
- `frontend/assets/img/icon-512.png`

## Arquivos alterados

- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/scripts/migrate.js`
- `backend/.env.example`
- `backend/package.json`
- `backend/package-lock.json`
- `package.json`
- `frontend/pages/app/login/index.html`
- `frontend/pages/app/primeiro-acesso/index.html`
- `frontend/pages/app/home/index.html`
- `frontend/pages/notificacoes/index.html`
- `frontend/assets/css/app.css`

## Novas tabelas

- `push_subscriptions`
- `push_notification_logs`

## Novos endpoints do App

- `GET /api/app/push/public-key`
- `POST /api/app/push/subscribe`
- `POST /api/app/push/unsubscribe`

## Novos endpoints Admin

- `GET /api/push/status`
- `GET /api/push/logs`
- `POST /api/push/send`
- `POST /api/push/send-tutor/:tutorId`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como gerar chaves VAPID

```bash
npm run push:keys
```

Copie o resultado para o `.env` ou para as variáveis do Render:

```env
VAPID_PUBLIC_KEY=sua_public_key
VAPID_PRIVATE_KEY=sua_private_key
VAPID_SUBJECT=mailto:contato@petfunny.com.br
```

Depois reinicie o servidor.

## Como testar no App do Tutor

1. Acesse `http://localhost:3000/app/login`.
2. Entre no app do tutor.
3. Vá para a Timeline ou Perfil.
4. Toque em `Ativar notificações`.
5. Permita notificações no navegador.
6. No admin, acesse `/admin/notificacoes`.
7. Envie um push manual pelo painel.

## Observações importantes

- Em produção, Web Push exige HTTPS.
- Em Android/Chrome funciona direto pelo navegador/PWA.
- Em iPhone, o tutor precisa instalar o app na tela inicial para liberar push web.
- O sistema não trava se VAPID não estiver configurado; ele mostra aviso no app/admin e registra envio como `skipped`.
- O envio real usa o pacote `web-push`, adicionado às dependências do backend.
