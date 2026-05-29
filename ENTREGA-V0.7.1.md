# PetFunny OS v0.7.1 — Status da agenda configuráveis

## O que foi feito
- Criada tabela `appointment_statuses` para cadastro dos status da agenda.
- Mantidos os status padrão já usados no dashboard: Agendado, Confirmado, Em atendimento, Finalizado, Cancelado e Não compareceu.
- A seção "Distribuição por status / Saúde da agenda de hoje" agora usa os status cadastrados em Configurações.
- Adicionada tela de cadastro/edição/inativação de status da agenda em Configurações.
- Cada status possui código técnico, nome, descrição, cor, ordem, ativo/inativo, finaliza fluxo e bloqueia slot.
- Mantido sem tenant, sem SaaS e sem master admin.

## Arquivos principais alterados
- `backend/src/scripts/migrate.js`
- `backend/src/scripts/seed.js`
- `backend/src/app.js`
- `frontend/pages/configuracoes/index.html`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/css/app.css`

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
1. Acesse `/admin/configuracoes`.
2. Vá até "Status da agenda".
3. Cadastre/edite/inative status.
4. Acesse `/admin/dashboard`.
5. Confira a seção "Distribuição por status cadastrados".

## Observações
- Os agendamentos continuam usando o campo `appointments.status` com o código técnico do status.
- A futura agenda v0.8 deve usar `appointment_statuses` como fonte oficial para filtros, badges e troca de status.
