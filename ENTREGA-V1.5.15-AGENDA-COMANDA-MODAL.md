# PetFunny OS v1.5.15 — Agenda com Comanda em Modal

## O que foi feito

- A ação **Comanda** no menu de três pontinhos dos agendamentos da Agenda agora abre em modal, sem sair da página.
- O modal usa o mesmo padrão visual do módulo **Comandas e Recibos**.
- A ação **Recibo** continua aparecendo apenas quando o status de pagamento estiver como **Pago**.
- Quando o recibo for aberto pela Agenda, ele também aparece em modal e mantém opção de copiar link público.
- A comanda exibe serviços, tutor, pet, valores, desconto e total final.
- Mantido o fluxo de Agenda, calendário, cards, slots e drag & drop.

## Arquivos alterados

- `frontend/pages/agenda/index.html`
- `frontend/assets/css/app.css`
- `package.json`
- `backend/package.json`

## Como testar

```bash
npm install
npm run db:migrate
npm start
```

Depois acesse:

```txt
http://localhost:3000/admin/agenda
```

No calendário, clique nos três pontinhos de um agendamento e escolha **Comanda**. A comanda deve abrir em modal, sem navegar para outra página.
