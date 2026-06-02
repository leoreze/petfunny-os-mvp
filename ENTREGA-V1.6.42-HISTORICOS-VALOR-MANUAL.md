# FunnyOS v1.6.42 — Históricos com valor manual

## Ajustes implementados

### Admin Agenda — Agendamento Antigo
- Adicionado bloco de seleção de serviços realizados no modal **Agendamento antigo**.
- Os serviços selecionados são apenas informativos/históricos e **não somam no valor final**.
- O campo **Valor final** permanece aberto para preenchimento manual.
- O agendamento antigo agora grava `created_at` do atendimento com a própria data/hora original do agendamento.
- Itens do agendamento antigo são gravados com valor `R$ 0,00`, preservando o total manual informado no agendamento/financeiro.
- Financeiro e pagamento histórico usam a data original do atendimento como referência.

### Admin Pacotes — Pacote Antigo
- O pacote escolhido no modal histórico passa a ser apenas referência do contrato.
- O select de pacote não exibe preço no histórico.
- Ao escolher o pacote, não preenche preço automaticamente.
- O campo **Valor final pago** fica aberto para preenchimento manual.
- Venda histórica de pacote passa a gravar `created_at` com a data original da venda.
- Financeiro e pagamento histórico usam a data original da venda.

## Como rodar

```bash
npm start
```

Não exige migration nova.
