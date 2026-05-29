# Entrega v1.5.78 — Timeline do App com atualização de status da Agenda

## O que foi corrigido
- Quando o tutor cria um agendamento pelo app e o admin muda o status para confirmado, em atendimento, finalizado, cancelado ou não compareceu, a timeline do App do Tutor passa a mostrar um post automático.
- O endpoint `/api/app/summary` agora retorna `timelineEvents` com atualizações recentes dos agendamentos do próprio tutor.
- A home do app renderiza esses eventos no topo da timeline.
- O endpoint administrativo `PATCH /api/agenda/:id/status` agora retorna mensagem informando que a timeline será atualizada.
- Quando Push estiver configurado, a mudança de status também dispara push para os aparelhos inscritos do tutor.
- Se Push não estiver configurado, o sistema não trava: a timeline continua funcionando via `/api/app/summary`.

## Status contemplados na timeline
- confirmado;
- em_atendimento;
- finalizado;
- cancelado;
- nao_compareceu.

## Exemplo de comportamento
1. Cliente cria agendamento no app.
2. Agendamento entra como `agendado`.
3. Admin altera para `confirmado`.
4. Ao abrir/atualizar o App do Tutor, aparece na timeline:
   - “Agendamento confirmado”;
   - “PetFunny confirmou o horário de [nome do pet]”;
   - data, horário e serviços.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/app/home/index.html`

## Como testar
```bash
npm start
```

Depois:
1. Acesse `/app/login`.
2. Entre com o tutor.
3. Crie um agendamento pelo app.
4. No admin, vá para `/admin/agenda`.
5. Altere o status para `confirmado`.
6. Volte para `/app/home` e atualize a tela.

## Observações
- Não há migration obrigatória.
- Push continua opcional.
- A timeline usa os dados reais da tabela `appointments`.
