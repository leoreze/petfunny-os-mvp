# FunnyOS v1.6.31 — App Momentos + Upload Admin

## O que foi corrigido

- Corrigidas as rotas internas do App do Tutor para `/app/momentos` e `/app/indique`.
- Agora os menus **Momentos** e **Indique** abrem telas próprias dentro do App do Tutor, em vez de cair na landing page.
- Adicionado ponto de publicação de fotos/vídeos pelo Admin em `/admin/agenda`.
- No menu de 3 pontinhos de cada agendamento foi adicionada a ação **Momentos do atendimento**.
- O admin pode anexar foto/vídeo por arquivo local ou URL.
- O conteúdo publicado aparece nos endpoints já existentes do App do Tutor:
  - `GET /api/app/appointments/:id/media`
  - `GET /api/app/pets/:petId/media`

## Arquivos principais alterados

- `backend/src/app.js`
- `frontend/pages/agenda/index.html`

## Novas/ajustadas rotas

### Frontend

- `/app/momentos`
- `/app/indique`

### API Admin

- `POST /api/agenda/:id/media`
- `DELETE /api/agenda/media/:mediaId`

## Como usar no Admin

1. Acesse `/admin/agenda`.
2. Abra o menu de 3 pontinhos de um agendamento.
3. Clique em **Momentos do atendimento**.
4. Selecione uma foto/vídeo ou informe uma URL.
5. Informe uma legenda.
6. Clique em **Salvar momento**.

## Como testar no App do Tutor

1. Acesse `/app/momentos`.
2. Confira se a tela própria abre dentro do App.
3. Publique uma mídia pelo Admin.
4. Volte ao App do Tutor e confira se o momento aparece na área de Momentos/Home.
5. Acesse `/app/indique` e confirme que a tela de indicação abre corretamente.

## Observações

- Não altera Financeiro 360.
- Não altera fluxo de Pix/cartão.
- Não exige nova tabela se `appointment_media` já existir; a migration atual já cria a estrutura.
- O upload salva arquivos em `frontend/uploads/appointment-media`, servido como estático pelo backend.
