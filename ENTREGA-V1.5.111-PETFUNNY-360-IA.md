# PetFunny OS v1.5.111 — PetFunny 360 IA

## Versão entregue
`petfunny-os-v1.5.111-petfunny-360-ia.zip`

## O que foi implementado
- Novo módulo **PetFunny 360 IA** no App do Tutor.
- Avaliação de bem-estar, comportamento, rotina, saúde percebida, socialização e resposta ao banho/tosa.
- Diagnóstico responsável com linguagem explícita de que não substitui veterinário.
- Detecção de sinais críticos e recomendação de procurar veterinário quando necessário.
- Diagnóstico com fallback local seguro quando `OPENAI_API_KEY` não estiver configurada.
- Uso opcional de OpenAI quando `OPENAI_API_KEY` existir.
- Timeline do app recebe posts automáticos do PetFunny 360.
- Permissão para responsáveis do mesmo pet: familiar autorizado, responsável temporário, cuidador ou parceiro do tutor.
- Histórico de avaliações por pet no app.
- Novo painel admin `/admin/bem-estar` com layout padrão, hero card, big numbers, filtros, tabela, scroll infinito e modal de detalhes.
- Integração com menu admin e menu do app.

## Novas tabelas
- `pet_caregivers`
- `pet_wellbeing_forms`
- `pet_wellbeing_questions`
- `pet_wellbeing_answers`
- `pet_wellbeing_diagnostics`
- `pet_wellbeing_insights`

## Novos endpoints
### App do Tutor
- `GET /api/app/wellbeing/questions`
- `GET /api/app/pets/:petId/caregivers`
- `POST /api/app/pets/:petId/caregivers/invite`
- `POST /api/app/pets/:petId/wellbeing/assessment`
- `GET /api/app/pets/:petId/wellbeing/history`
- `GET /api/app/pets/:petId/wellbeing/latest`

### Admin
- `GET /api/admin/wellbeing/summary`
- `GET /api/admin/wellbeing/pets`
- `GET /api/admin/wellbeing/pets/:petId`

## Arquivos principais alterados
- `backend/src/app.js`
- `backend/src/scripts/migrate.js`
- `frontend/pages/app/home/index.html`
- `frontend/pages/bem-estar/index.html`
- `frontend/assets/js/client-shell.js`
- `frontend/assets/js/shell.js`
- `frontend/assets/js/router.js`
- `frontend/assets/css/app.css`
- `frontend/service-worker.js`
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
1. Acesse `/app/login` e entre como tutor.
2. Acesse `/app/bem-estar`.
3. Escolha um pet.
4. Responda a avaliação PetFunny 360.
5. Verifique o diagnóstico, insights e recomendações.
6. Volte para `/app/home` e veja o post do PetFunny 360 na timeline.
7. Acesse `/admin/bem-estar` e veja os indicadores, filtros e detalhes do pet.

## Observação responsável
O PetFunny 360 é uma análise de bem-estar e comportamento baseada nas respostas dos tutores. Ele não substitui avaliação veterinária. Quando houver sinais graves, o sistema orienta procurar atendimento veterinário.
