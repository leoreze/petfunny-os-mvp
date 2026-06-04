# FunnyOS v1.6.74 — Momentos com câmera, legenda IA e exclusão no app

## Entregue

- Admin Agenda: botão para bater foto direto pelo celular no modal Momentos do Atendimento.
- Admin Agenda: campo Legenda preenchido automaticamente com legenda fofa e variável.
- Admin Agenda: botão para gerar outra legenda com IA/fallback local.
- Backend: novo endpoint `POST /api/agenda/:id/media-caption`.
- App Tutor Momentos: botão flutuante de câmera ajustado para ficar mais abaixo e fixo na rolagem.
- App Tutor Momentos: fotos/vídeos agora têm opção `Apagar`.
- Backend: novo endpoint `DELETE /api/app/media/:mediaId` para o tutor apagar mídia própria.

## Banco

Não altera banco.
Não precisa rodar migration.
