# FunnyOS v1.6.46 — Dashboard Gerente IA de Crescimento Diário

## O que foi feito

- Adicionado no Dashboard Admin o bloco **Gerente IA de Crescimento**.
- Criado endpoint `GET /api/dashboard/ai-growth-plan`.
- A IA passa a analisar dados reais de agenda, financeiro, pacotes, clientes inativos, serviços mais demandados e próximos horários.
- O sistema gera todos os dias um plano de ações com tarefas, prioridades, prazos, esforço, KPI e link para o módulo correto.
- Incluídas campanhas prontas para WhatsApp para reativação, venda de pacote e preenchimento de agenda.
- Incluído score diário de crescimento, objetivo do dia, riscos, oportunidades e rotina sugerida para manhã, tarde e fechamento.
- Funciona mesmo sem `OPENAI_API_KEY`: quando a OpenAI não estiver configurada, usa um plano local seguro baseado em regras e dados do banco.
- Quando `OPENAI_API_KEY` estiver configurada, o endpoint tenta gerar uma análise avançada com IA real e mantém fallback automático em caso de falha.

## Arquivos alterados

- `backend/src/app.js`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`
- `package-lock.json`
- `backend/package-lock.json`
- `DEPLOY_VERSION.txt`

## Como rodar

```bash
npm install
npm run db:migrate
npm start
```

## Como testar

1. Entrar no Admin.
2. Abrir `/admin/dashboard`.
3. Verificar o novo painel **Gerente IA de Crescimento** logo abaixo dos big numbers.
4. Clicar em **Atualizar IA**.
5. Clicar em **Copiar plano**.
6. Conferir se as tarefas abrem os módulos corretos: Agenda, CRM, Pacotes, Financeiro e App do Tutor.

## Observações

- A IA não bloqueia o carregamento do dashboard. Se falhar, o sistema mostra um plano local seguro.
- Nenhuma migration nova foi necessária.
- Nenhuma tabela nova foi criada.
- Nenhum DDL foi adicionado em runtime.
