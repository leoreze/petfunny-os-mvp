# PetFunny OS v1.5.92 — App Tutor com horários disponíveis

## Correção
O app do tutor não deve permitir escolher qualquer horário manualmente se esse horário estiver fora do funcionamento configurado no admin.

## O que foi feito
- Criado endpoint `GET /api/app/availability?date=YYYY-MM-DD`.
- O app agora carrega apenas horários com:
  - dia aberto em Configurações;
  - horário dentro do funcionamento;
  - capacidade maior que zero;
  - vaga disponível para o horário.
- O formulário de agendamento do app foi alterado de `datetime-local` livre para:
  - campo de data;
  - combo de horários disponíveis.
- Erros de disponibilidade agora retornam `400` com mensagem amigável, em vez de erro interno.
- Mantido o fluxo Pix Mercado Pago: o pagamento só inicia depois de validar horário, pet e serviços.

## Arquivos alterados
- `backend/src/app.js`
- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`

## Como testar
1. Rode `npm start`.
2. Acesse `/app/login`.
3. Entre no app.
4. Vá para Agenda.
5. Escolha uma data.
6. O combo deve mostrar somente horários disponíveis.
7. Crie um agendamento.

## Observação
Se não aparecer nenhum horário, ajuste em:
`/admin/configuracoes` → Horários de funcionamento e capacidade por horário.

Não há migration obrigatória.
