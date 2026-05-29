# PetFunny OS v1.5.96 — App: serviços por tipo e roleta em fluxo normal

## O que foi feito

- No App do Tutor, em **Agendamentos**, os serviços agora aparecem separados por tipo/categoria.
- Ao trocar o pet, a lista continua filtrando pelo porte do pet e agrupando por tipo.
- Quando o agendamento vier da Roleta de Mimos, o mimo ganho agora entra apenas no campo **Observações para a equipe**.
- Removido o destaque especial/banner da roleta dentro do formulário de agendamento.
- O botão voltou ao fluxo normal: **Criar agendamento**.
- O fluxo segue normalmente: selecionar pet, data, horário disponível, serviços, observação e pagamento Pix.
- Atualizado cache do service worker para `petfunny-app-v1.5.96`.

## Arquivos alterados

- `frontend/pages/app/home/index.html`
- `frontend/assets/css/app.css`
- `frontend/service-worker.js`

## Como testar

1. Acesse `/app/roleta`.
2. Gire a roleta e siga para o agendamento.
3. Verifique que o mimo aparece somente em **Observações para a equipe**.
4. Veja se os serviços aparecem agrupados por tipo.
5. Finalize o fluxo normalmente até o Pix.

Não precisa rodar migration.
