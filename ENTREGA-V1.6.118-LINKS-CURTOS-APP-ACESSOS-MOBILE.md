# FunnyOS v1.6.118 — Links curtos + App Acessos mobile cards

## O que foi feito

- Em `/admin/agenda`, o link de avaliação enviado na mensagem de atendimento finalizado agora usa o domínio principal:
  - `https://agendapetfunny.com.br/avaliacao/...`
- Em `/admin/agenda`, o link de Momentos do Atendimento enviado ao tutor agora é curto:
  - `https://agendapetfunny.com.br/m/...`
- O link curto `/m/:code` resolve o momento no backend e redireciona para o App do Tutor com acesso autorizado.
- Em `/admin/app-acessos`, no mobile, a Lista de acessos passa automaticamente para visualização em cards.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/app-acessos/index.html`
- `frontend/assets/css/app.css`
- `.env.example`
- `package.json`
- `backend/package.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Gere uma mensagem de finalização em `/admin/agenda` e confira se o link começa com `https://agendapetfunny.com.br/avaliacao/`.
2. Gere um link em Momentos do Atendimento e confira se o WhatsApp recebe `https://agendapetfunny.com.br/m/...`.
3. Abra `/admin/app-acessos` em largura mobile e confira a listagem em cards.
