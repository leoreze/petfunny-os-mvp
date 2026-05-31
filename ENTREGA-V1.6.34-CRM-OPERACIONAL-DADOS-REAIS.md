# FunnyOS v1.6.34 — CRM Operacional PetFunny conectado aos dados reais

## O que foi implementado
- Novo endpoint `/api/crm/operational` com visão operacional dos tutores.
- CRM agora cruza dados reais de tutores, pets, agendamentos, pacotes, acessos do app, ossinhos, indicações e financeiro quando disponíveis.
- Página `/admin/crm` redesenhada para gestão de retenção, recorrência e reativação.
- Status CRM automático: Novo lead, Ativo, Recorrente, Cliente VIP, Cliente Ouro, Em atenção, Em risco e Perdido.
- Status de uso do app: Nunca acessou, Acessou hoje, Ativo no app, Inativo 7+ dias e Inativo 30+ dias.
- Ação sugerida por tutor com mensagens prontas de WhatsApp.
- Atalhos para ativar app, reativar cliente, ofertar pacote, Saúde 360, abrir tutor e ver acessos.
- Métricas de retenção, recorrência, app, ossinhos, indicações e pacotes ativos.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/crm/index.html`
- `package.json`
- `backend/package.json`

## Nova rota
- `GET /api/crm/operational`

## Como testar
1. Rode `npm start`.
2. Acesse `http://localhost:3000/admin/crm`.
3. Verifique os cards principais.
4. Filtre por status CRM e status de acesso ao app.
5. Abra o menu de 3 pontinhos de um tutor e teste as mensagens de WhatsApp.
6. Acesse `Acessos do App` pelo botão superior.

## Observações
- A rota usa fallback seguro para tabelas opcionais como `tutor_rewards`, `tutor_referrals`, `app_access_logs` e `financial_transactions`.
- Não cria receita fake e não altera o Financeiro 360.
- Não exige migration nova.
