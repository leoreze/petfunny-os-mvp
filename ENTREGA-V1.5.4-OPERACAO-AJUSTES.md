# PetFunny OS v1.5.4 — Ajustes operacionais

## Entrega
`petfunny-os-v1.5.4-operacao-ajustes.zip`

## O que foi feito
- Tutores agora possuem ação de histórico por registro.
- Histórico mostra agendamentos, valor, status, comanda e recibo.
- Incluído endpoint `/api/tutores/:id/historico`.
- Copyright do rodapé do menu principal ajustado para branco.
- Financeiro: aba Inadimplentes com clique funcional e baixa de pagamento na própria aba.
- Agenda: campos de pagamento e forma de pagamento movidos para o fim do modal de Novo Agendamento.
- Agenda: calendário e cards passam a exibir status/forma de pagamento.
- Pacotes: ao contratar pacote, cria lançamento financeiro pelo valor total do pacote.
- Pacotes: geração de agendamentos começa após a contratação, respeitando intervalo semanal ou quinzenal.
- Pacotes semanais: sessões geradas a cada 7 dias.
- Pacotes quinzenais: sessões geradas a cada 15 dias.

## Como rodar
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

## Como testar
- `/admin/tutores`: abrir histórico em uma linha de tutor.
- `/admin/financeiro?tab=inadimplentes`: validar aba e baixa de pagamento.
- `/admin/agenda`: criar agendamento e conferir pagamento no calendário.
- `/admin/pacotes`: vender pacote e verificar lançamento financeiro + agendamentos gerados.
