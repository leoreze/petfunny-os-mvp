# FunnyOS v1.6.98 — Tutores com mensagens enviadas e CRM com ações no menu

## O que foi feito

- Adicionada coluna **Mensagens** em `/admin/tutores`, mostrando quantas mensagens foram registradas como enviadas para cada tutor.
- A contagem considera interações outbound em `crm_interactions`, vinculadas diretamente ao tutor ou ao lead do tutor.
- Os envios pelo botão de WhatsApp em Tutores agora registram a interação no CRM antes de abrir o WhatsApp.
- Em `/admin/crm`, as ações de cada cliente ficam dentro do menu de 3 pontinhos.
- A coluna **Ação sugerida** agora mostra a mensagem real recomendada para cada cliente.
- O CRM agora permite enviar mensagem sugerida, copiar mensagem, ativar app, reativar cliente, ofertar pacote e Saúde 360 pelo menu.
- Ao enviar pelo CRM, o sistema registra a mensagem enviada e atualiza a contagem.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/tutores/index.html`
- `frontend/pages/crm/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como testar

1. Acesse `/admin/tutores`.
2. Confira a nova coluna **Mensagens** na listagem.
3. Abra o menu de um tutor e envie uma mensagem do app ou CRM.
4. Volte à lista e confira se a contagem aumentou.
5. Acesse `/admin/crm`.
6. Confira se a coluna **Ação sugerida** mostra o texto real da mensagem.
7. Abra o menu de 3 pontinhos e teste **Enviar mensagem sugerida** e **Copiar mensagem sugerida**.

## Validação técnica

- `node --check backend/src/app.js`
- `node --check` nos scripts extraídos de Tutores e CRM
- `unzip -t` no ZIP final
