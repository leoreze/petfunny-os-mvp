# PetFunny OS v1.5.115 — PetFunny 360 funcional e UX

## Ajustes
- App do Tutor: títulos e subtítulos em linhas separadas em cards, menus e áreas.
- PetFunny 360: avaliação funcionando com envio das respostas para o backend.
- PetFunny 360: modal de análise com barra de progresso e timer regressivo antes do diagnóstico.
- PetFunny 360: CRUD de responsáveis do mesmo pet funcionando pelo app.
- Admin Bem-estar: filtros padronizados, tabela com apenas seta preta e menu de 3 pontinhos nas ações.
- Admin Bem-estar: opções Visualizar diagnóstico e Responsáveis cadastrados abrem em modal no padrão das outras páginas.

## Como rodar
```bash
npm run db:migrate
npm start
```

## Observações
- Sem migration nova exclusiva desta versão.
- O diagnóstico usa IA se OPENAI_API_KEY estiver configurada; caso contrário usa análise local segura.
