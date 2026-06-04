# FunnyOS v1.6.70 — Dashboard IA Específica + Agenda sem Cards Extras

## O que foi feito

- Melhorado o card **Gerente IA de Crescimento** no dashboard.
- A seção **Ações e tarefas de hoje** agora gera ações mais específicas com base em dados reais:
  - cliente/tutor específico;
  - pet específico;
  - horário do agendamento;
  - pendência financeira específica;
  - oportunidade de venda de pacote;
  - renovação de pacote;
  - mensagem pronta para WhatsApp.
- Cada tarefa pode exibir botão direto de WhatsApp com mensagem automática.
- Removido o card **Calendário** do dashboard.
- Removido o card **Visão por status** do dashboard.
- No card **Agenda do dia**, foram adicionadas duas visualizações:
  - **Lista**;
  - **Cards**.

## Arquivos principais alterados

- `backend/src/app.js`
- `frontend/pages/dashboard/index.html`
- `frontend/assets/css/app.css`

## Banco de dados

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Acesse `http://localhost:3000/admin/dashboard`.
2. Confira o card **Gerente IA de Crescimento**.
3. Verifique se as tarefas aparecem com cliente/pet específico quando houver dados do dia.
4. Clique no botão de WhatsApp da tarefa.
5. Confira se o WhatsApp abre com mensagem pronta.
6. Confira se os cards **Calendário** e **Visão por status** não aparecem mais.
7. No card **Agenda do dia**, alterne entre **Lista** e **Cards**.
