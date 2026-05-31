# FunnyOS v1.6.30 — App do Tutor Engajamento 360° — Sprint 1

## O que foi implementado
- Base de engajamento do App do Tutor.
- Tabelas `tutor_rewards`, `tutor_reward_events` e `tutor_engagement_events`.
- Endpoints `/api/app/rewards/summary`, `/api/app/rewards/events`, `/api/app/rewards/share-event`.
- Endpoint consolidado `/api/app/engagement/summary`.
- Home “Meu Pet” com foco emocional no pet ativo.
- Card de Ossinhos PetFunny com progresso para próxima recompensa.
- Status automático do cliente: Novo lead, Ativo, Recorrente, VIP, Ouro e Em risco.
- CTA WhatsApp direto para a PetFunny.

## Arquivos alterados
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Novas rotas
- `GET /api/app/engagement/summary`
- `GET /api/app/rewards/summary`
- `GET /api/app/rewards/events`
- `POST /api/app/rewards/share-event`

## Novas tabelas
- `tutor_rewards`
- `tutor_reward_events`
- `tutor_engagement_events`

## Como rodar
```bash
npm install
npm run db:migrate
npm start
```

## Como testar
1. Entrar no App do Tutor em `/app`.
2. Verificar a Home “Meu Pet”.
3. Confirmar card do pet, próximo cuidado, pacote ativo, ossinhos e status do tutor.
4. Testar `/api/app/rewards/summary` autenticado.
5. Testar `/api/app/engagement/summary` autenticado.
6. Verificar se Agenda, Financeiro 360, Saúde 360 e Admin continuam abrindo.

## Observações
- A pontuação usa regras iniciais e está preparada para ser alimentada por eventos de agenda, pacotes, avaliações e compartilhamentos.
- A rota de share-event já concede ossinhos, com a estrutura pronta para Momentos/Fotos na próxima sprint.
- Nenhuma receita financeira é criada por ossinhos para evitar duplicidade no Financeiro 360.

## Próxima sprint recomendada
Sprint 2 — Timeline + Mídia: `appointment_media`, Momentos do atendimento, fotos/vídeos e compartilhamento com ossinhos.
