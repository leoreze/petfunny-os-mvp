# FunnyOS v1.6.50 — Pacotes Horário São Paulo Fix

## Correção

- Corrigida a geração de agendamentos de Pacote Antigo para respeitar o horário selecionado no admin.
- Corrigida a conversão de data/hora local sem timezone para America/Sao_Paulo.
- Pacote Antigo às 09:00 agora gera sessões às 09:00 na agenda, não às 06:00.
- A mesma correção também protege venda de pacote atual, reagendamento e cadastros que enviam `YYYY-MM-DDTHH:mm:ss` sem fuso explícito.

## Banco

- Não altera banco.
- Não precisa rodar migration.

## Como rodar

```bash
npm install
npm start
```

## Como testar

1. Acesse `/admin/pacotes`.
2. Clique em `Pacote Antigo`.
3. Selecione data original e horário `09:00`.
4. Salve.
5. Abra `/admin/agenda`.
6. Confira que as sessões foram geradas às `09:00`.
