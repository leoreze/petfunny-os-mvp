# FunnyOS v1.6.35 — Tutores WhatsApp Duplicado

## O que foi implementado
- Validação em tempo real do WhatsApp no modal de cadastro/edição de tutor.
- Ao digitar um WhatsApp existente, o sistema informa o tutor já cadastrado.
- Botão para abrir o cadastro existente diretamente pelo alerta.
- Bloqueio de salvamento para evitar duplicidade.
- Endpoint seguro para consulta de WhatsApp.
- POST de tutor deixa de sobrescrever tutor existente por conflito de WhatsApp.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/tutores/index.html`
- `frontend/assets/css/app.css`

## Nova rota
- `GET /api/tutores/check-whatsapp?whatsapp=...&excludeId=...`

## Como testar
1. Acesse `/admin/tutores`.
2. Clique em `+ Novo tutor`.
3. Digite um WhatsApp que já existe.
4. Verifique o aviso “WhatsApp já cadastrado”.
5. Clique em “Abrir cadastro existente”.
6. Tente salvar com WhatsApp duplicado e confirme que o sistema bloqueia.

## Observações
- Sem migration.
- Não altera layout global.
- Não altera App do Tutor.
