# FunnyOS v1.6.30 — Sprint 2 Timeline + Mídia + Momentos

## O que foi implementado
- Timeline detalhada de atendimento no App do Tutor.
- Nova seção/tela `/app/momentos`.
- Estrutura de mídia do atendimento com fotos e vídeos.
- Galeria afetiva com salvar/compartilhar.
- Endpoints seguros para mídia por atendimento e por pet.
- Estado vazio emocional quando não houver mídia.
- Integração com Home Meu Pet e Ossinhos.

## Banco de dados
Nova tabela idempotente:
- `appointment_media`

Campos:
- `id`
- `appointment_id`
- `tutor_id`
- `pet_id`
- `media_type`
- `url`
- `caption`
- `is_featured`
- `created_at`
- `updated_at`
- `deleted_at`

## Novas rotas
- `GET /api/app/appointments/:id/media`
- `GET /api/app/pets/:petId/media`

## Arquivos alterados
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
1. Entrar no App do Tutor.
2. Abrir `/app/home` e verificar card “Momentos do atendimento”.
3. Abrir `/app/momentos`.
4. Com mídia cadastrada em `appointment_media`, validar fotos/vídeos.
5. Sem mídia, validar estado vazio.
6. Conferir Timeline detalhada em agenda/momentos.
7. Clicar em Compartilhar e Salvar.

## Observações
- Upload administrativo completo de mídia pode ser implementado na próxima sprint.
- Esta sprint prepara banco, API e UI do Tutor sem quebrar agenda, pacotes, Saúde 360, Pix/cartão ou Financeiro 360.
