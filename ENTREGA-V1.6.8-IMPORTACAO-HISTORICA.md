# FunnyOS v1.6.8 — Importação Histórica Agenda e Pacotes

## O que foi feito
- Adicionado botão temporário `Agendamento antigo` em `/admin/agenda`.
- Adicionado botão temporário `Pacote antigo` em `/admin/pacotes`.
- Criados modais próprios para importação histórica sem disparar WhatsApp, push ou notificações ao tutor.
- Criadas rotas administrativas para gravar histórico com financeiro e pagamentos:
  - `POST /api/agenda/historical`
  - `POST /api/pacotes/clientes/historical`

## Agendamento antigo
Permite informar:
- tutor;
- pet;
- data original;
- horário aproximado;
- descrição;
- valor final;
- status de pagamento;
- forma de pagamento;
- observações internas.

Ao salvar:
- cria agendamento com `source = historical_import`;
- status `finalizado`;
- registra item histórico;
- cria lançamento financeiro;
- cria pagamento se estiver pago;
- tenta gerar recibo/comanda histórica.

## Pacote antigo
Permite informar:
- tutor;
- pet;
- pacote;
- data original da venda;
- total de sessões;
- sessões já usadas;
- valor final pago;
- status de pagamento;
- forma de pagamento;
- observações internas.

Ao salvar:
- cria pacote do cliente com `recurrence_rule.historicalImport = true`;
- registra sessões usadas;
- cria lançamento financeiro;
- cria pagamento se estiver pago;
- não gera agenda futura automaticamente.

## Observações
- Não exige migration.
- Recurso pensado como temporário para implantação/importação manual.
- Não altera o fluxo normal de novos agendamentos e pacotes.
